use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{menu::MenuItem, Manager, Url};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

const RELEASE_BASE: &str = "https://github.com/mars-s/Aegis/releases";
const PUBLIC_KEY: &str = include_str!("../updater/pubkey.txt");
const CHECK_INTERVAL: u64 = 6 * 60 * 60;
static BUSY: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Channel {
    #[default]
    Stable,
    Nightly,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct Settings {
    #[serde(default)]
    channel: Channel,
    #[serde(default)]
    last_check: u64,
}

fn read_settings(path: &Path) -> Settings {
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn endpoint(channel: Channel, override_url: Option<&str>) -> Result<Url, String> {
    let suffix = match channel {
        Channel::Stable => "latest/download/latest.json",
        Channel::Nightly => "download/nightly/latest.json",
    };
    let url = Url::parse(override_url.unwrap_or(&format!("{RELEASE_BASE}/{suffix}")))
        .map_err(|e| format!("Invalid update endpoint: {e}"))?;
    validate_url(&url, override_url.is_some())?;
    Ok(url)
}

// HTTP is solely for an explicitly selected local test feed.
fn validate_url(url: &Url, local_override: bool) -> Result<(), String> {
    match (url.scheme(), url.host_str()) {
        ("https", Some(_)) => Ok(()),
        ("http", Some("127.0.0.1" | "localhost")) if local_override => Ok(()),
        _ => Err("Update URLs must use HTTPS, except a localhost or 127.0.0.1 HTTP override.".into()),
    }
}

fn key_configured(key: &str) -> bool {
    let key = key.trim();
    !key.is_empty() && key != "REPLACE_WITH_TAURI_SIGNER_PUBLIC_KEY"
}

fn local_override() -> Option<String> {
    std::env::var("AEGIS_UPDATE_ENDPOINT").ok()
}

// The plugin deserialises its config before applying builder overrides. Supply the
// required field in memory, with the actual key supplied by the plugin builder.
fn plugin_config(context: &mut tauri::Context<impl tauri::Runtime>, allow_http: bool) {
    context.config_mut().plugins.0.insert(
        "updater".into(),
        serde_json::json!({ "pubkey": "", "dangerousInsecureTransportProtocol": allow_http }),
    );
}

pub fn register(
    builder: tauri::Builder<tauri::Wry>,
    context: &mut tauri::Context<tauri::Wry>,
) -> tauri::Builder<tauri::Wry> {
    if !key_configured(PUBLIC_KEY) {
        eprintln!("aegis: updater disabled (no release key)");
        return builder;
    }
    let allow_http = endpoint(Channel::Stable, local_override().as_deref())
        .is_ok_and(|url| url.scheme() == "http");
    plugin_config(context, allow_http);
    builder.plugin(tauri_plugin_updater::Builder::new().pubkey(PUBLIC_KEY.trim()).build())
}

fn backups_dir() -> PathBuf {
    super::data_dir().join("updates/previous")
}

// Newest means the time the backup was made, not the version number.
fn backups(dir: &Path) -> io::Result<Vec<PathBuf>> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };
    let mut paths = Vec::new();
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir()
            && path.extension().is_some_and(|ext| ext == "app")
            && path.file_name().is_some_and(|name| name.to_string_lossy().starts_with("Aegis-"))
        {
            paths.push((entry.metadata()?.modified()?, path));
        }
    }
    paths.sort_by(|a, b| b.cmp(a));
    Ok(paths.into_iter().map(|(_, path)| path).collect())
}

#[cfg(any(target_os = "macos", test))]
fn prune_backups(dir: &Path) -> io::Result<()> {
    for path in backups(dir)?.into_iter().skip(2) {
        fs::remove_dir_all(path)?;
    }
    Ok(())
}

// A failed second rename restores the original bundle. Paths must share a filesystem.
#[cfg(any(target_os = "macos", test))]
fn rollback_swap(running: &Path, backup: &Path, aside: &Path) -> io::Result<()> {
    if !running.is_dir() || !backup.is_dir() || aside.exists() || running == backup {
        return Err(io::Error::other("Invalid rollback paths or an unfinished rollback exists."));
    }
    fs::rename(running, aside)?;
    if let Err(error) = fs::rename(backup, running) {
        fs::rename(aside, running).map_err(|restore| {
            io::Error::other(format!("Rollback failed: {error}. Could not restore {}: {restore}", aside.display()))
        })?;
        return Err(error);
    }
    fs::remove_dir_all(aside)
}

#[cfg(any(target_os = "macos", test))]
fn bundle_from_exe(exe: &Path) -> Option<PathBuf> {
    let bundle = exe.ancestors().nth(3)?;
    (bundle.extension()? == "app").then(|| bundle.to_path_buf())
}

#[cfg(target_os = "macos")]
fn running_bundle() -> Result<PathBuf, String> {
    bundle_from_exe(&std::env::current_exe().map_err(|e| e.to_string())?)
        .ok_or_else(|| "This executable is not inside a macOS .app bundle.".into())
}

#[cfg(target_os = "macos")]
fn backup_current(version: &str) -> Result<(), String> {
    let bundle = running_bundle()?;
    let dir = backups_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let backup = dir.join(format!("Aegis-{version}.app"));
    let staging = dir.join(format!("Aegis-{version}.pending"));
    if staging.exists() {
        fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
    }
    let output = std::process::Command::new("/usr/bin/ditto")
        .arg(&bundle).arg(&staging).output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!("Could not back up Aegis: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    fs::File::open(&staging).and_then(|f| f.set_modified(SystemTime::now()))
        .map_err(|e| e.to_string())?;
    if backup.exists() {
        fs::remove_dir_all(&backup).map_err(|e| e.to_string())?;
    }
    fs::rename(&staging, &backup).map_err(|e| e.to_string())?;
    prune_backups(&dir).map_err(|e| e.to_string())
}

fn message(app: &tauri::AppHandle, text: impl Into<String>) {
    app.dialog().message(text).title("Aegis Updates").blocking_show();
}

fn confirm(app: &tauri::AppHandle, text: impl Into<String>) -> bool {
    app.dialog().message(text).title("Aegis Updates")
        .buttons(MessageDialogButtons::OkCancel).blocking_show()
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

fn utc_stamp(seconds: u64) -> String {
    let mut days = seconds / 86_400;
    let mut year = 1970;
    let leap = |year| year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    loop {
        let year_days = if leap(year) { 366 } else { 365 };
        if days < year_days { break; }
        days -= year_days;
        year += 1;
    }
    let months = [31, if leap(year) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1;
    for month_days in months {
        if days < month_days { break; }
        days -= month_days;
        month += 1;
    }
    let time = seconds % 86_400;
    format!("{year:04}{month:02}{:02}{:02}{:02}{:02}", days + 1, time / 3600, time / 60 % 60, time % 60)
}

#[derive(Debug, PartialEq)]
pub enum UiVersionChange {
    Unchanged,
    Recorded,
    Moved(PathBuf),
}

// Any app version change, including a downgrade, gives the bundled UI precedence.
pub fn prepare_ui(ui: &Path, version: &str) -> io::Result<UiVersionChange> {
    let marker = ui.join("app-version");
    match fs::read_to_string(&marker) {
        Ok(recorded) if recorded == version => return Ok(UiVersionChange::Unchanged),
        Ok(_) => (),
        Err(e) if e.kind() == io::ErrorKind::NotFound => (),
        Err(e) => return Err(e),
    }
    fs::create_dir_all(ui)?;
    let current = ui.join("current");
    let change = if current.try_exists()? {
        let previous = ui.join(format!("previous-{}-appupd", utc_stamp(now())));
        fs::rename(current, &previous)?;
        UiVersionChange::Moved(previous)
    } else {
        UiVersionChange::Recorded
    };
    // Record only after a successful move so a failed move is retried next launch.
    fs::write(marker, version)?;
    Ok(change)
}

fn check_due(last_check: u64, time: u64) -> bool {
    last_check == 0 || time.saturating_sub(last_check) >= CHECK_INTERVAL
}

async fn check(app: &tauri::AppHandle, manual: bool) -> Result<(), String> {
    let path = super::data_dir().join("updater.json");
    let mut settings = read_settings(&path);
    let time = now();
    if !manual && !check_due(settings.last_check, time) {
        return Ok(());
    }
    let override_url = local_override();
    let url = endpoint(settings.channel, override_url.as_deref())?;
    // Record attempts, including failed requests, so a broken feed is not polled on every launch.
    settings.last_check = time;
    fs::create_dir_all(super::data_dir()).map_err(|e| e.to_string())?;
    let staging = path.with_extension("json.tmp");
    fs::write(&staging, serde_json::to_vec(&settings).map_err(|e| e.to_string())?)
        .and_then(|_| fs::rename(staging, &path)).map_err(|e| e.to_string())?;
    let update = app.updater_builder().timeout(Duration::from_secs(60))
        .endpoints(vec![url]).map_err(|e| e.to_string())?
        .build().map_err(|e| e.to_string())?
        .check().await.map_err(|e| e.to_string())?;
    let Some(update) = update else {
        if manual { message(app, "You're up to date"); }
        return Ok(());
    };
    // The plugin only warns about HTTP artifact URLs, so enforce our rule here too.
    validate_url(&update.download_url, override_url.is_some())?;
    let notes = update.body.as_deref().unwrap_or("").trim();
    let prompt = format!("Aegis {} is available (you have {}). Install and restart?\n\n{notes}", update.version, update.current_version);
    if !confirm(app, prompt.trim()) { return Ok(()); }
    #[cfg(target_os = "macos")]
    {
        backup_current(&update.current_version)?;
        let _ = app.state::<MenuItem<tauri::Wry>>().set_enabled(true);
    }
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    super::stop_agent(app);
    app.restart();
}

#[cfg(target_os = "macos")]
fn restore(app: &tauri::AppHandle) -> Result<(), String> {
    let backup = backups(&backups_dir()).map_err(|e| e.to_string())?
        .into_iter().next().ok_or("No previous version is available.")?;
    if !confirm(app, format!("Restore {} and restart Aegis?", backup.file_name().unwrap().to_string_lossy())) {
        return Ok(());
    }
    let running = running_bundle()?;
    let aside = running.with_extension("app.restoring");
    rollback_swap(&running, &backup, &aside).map_err(|e| e.to_string())?;
    super::stop_agent(app);
    app.restart();
}

fn launch(app: &tauri::AppHandle, manual: bool, rollback: bool) {
    if BUSY.swap(true, Ordering::SeqCst) { return; }
    let app = app.clone();
    std::thread::spawn(move || {
        let result = if rollback {
            #[cfg(target_os = "macos")]
            { restore(&app) }
            #[cfg(not(target_os = "macos"))]
            { Err("Restoring a bundle is only available on macOS.".into()) }
        } else {
            tauri::async_runtime::block_on(check(&app, manual))
        };
        if let Err(error) = result {
            eprintln!("aegis: updater: {error}");
            if manual { message(&app, error); }
        }
        BUSY.store(false, Ordering::SeqCst);
    });
}

pub fn setup(app: &tauri::AppHandle) -> tauri::Result<()> {
    let enabled = key_configured(PUBLIC_KEY);
    let check = MenuItem::with_id(app, "check-updates",
        if enabled { "Check for Updates…" } else { "Updates are not configured" }, enabled, None::<&str>)?;
    let can_restore = cfg!(target_os = "macos") && backups(&backups_dir()).is_ok_and(|paths| !paths.is_empty());
    let restore = MenuItem::with_id(app, "restore-update", "Restore Previous Version…", can_restore, None::<&str>)?;
    app.manage(restore.clone());
    let menu = tauri::menu::Menu::default(app)?;
    #[cfg(target_os = "macos")]
    if let Some(tauri::menu::MenuItemKind::Submenu(app_menu)) = menu.items()?.first() {
        app_menu.insert_items(&[&check, &restore], 1)?;
    }
    #[cfg(not(target_os = "macos"))]
    menu.append(&tauri::menu::Submenu::with_items(app, "Updates", true, &[&check, &restore])?)?;
    app.set_menu(menu)?;
    app.on_menu_event(move |app, event| match event.id().as_ref() {
        "check-updates" if enabled => launch(app, true, false),
        "restore-update" => launch(app, true, true),
        _ => (),
    });
    if enabled {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(10));
            launch(&app, false, false);
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use std::{io::{Read, Write}, net::TcpListener, sync::Arc, thread};
    use tempfile::tempdir;

    #[test]
    fn ui_first_run_records_version_without_moving_anything() {
        let dir = tempdir().unwrap();
        let ui = dir.path().join("ui");
        assert_eq!(prepare_ui(&ui, "0.3.0").unwrap(), UiVersionChange::Recorded);
        assert_eq!(fs::read_to_string(ui.join("app-version")).unwrap(), "0.3.0");
        assert_eq!(fs::read_dir(&ui).unwrap().count(), 1);
    }

    #[test]
    fn ui_same_version_keeps_current() {
        let dir = tempdir().unwrap();
        let ui = dir.path();
        fs::create_dir(ui.join("current")).unwrap();
        fs::write(ui.join("current/index.html"), "hot-swapped UI").unwrap();
        fs::write(ui.join("app-version"), "0.3.0").unwrap();
        assert_eq!(prepare_ui(ui, "0.3.0").unwrap(), UiVersionChange::Unchanged);
        assert_eq!(fs::read_to_string(ui.join("current/index.html")).unwrap(), "hot-swapped UI");
        assert_eq!(fs::read_to_string(ui.join("app-version")).unwrap(), "0.3.0");
        assert_eq!(fs::read_dir(ui).unwrap().count(), 2);
    }

    #[test]
    fn ui_version_change_moves_current_and_records_version() {
        // Restoring an older app version must set the hot-swapped UI aside too.
        for recorded in [Some("0.2.0"), Some("0.4.0"), None] {
            let dir = tempdir().unwrap();
            let ui = dir.path();
            fs::create_dir(ui.join("current")).unwrap();
            fs::write(ui.join("current/index.html"), "hot-swapped UI").unwrap();
            if let Some(version) = recorded {
                fs::write(ui.join("app-version"), version).unwrap();
            }
            let UiVersionChange::Moved(previous) = prepare_ui(ui, "0.3.0").unwrap() else {
                panic!("expected the hot-swapped UI to be moved");
            };
            let name = previous.file_name().unwrap().to_str().unwrap();
            let stamp = name.strip_prefix("previous-").unwrap().strip_suffix("-appupd").unwrap();
            assert_eq!(stamp.len(), 14);
            assert!(stamp.bytes().all(|byte| byte.is_ascii_digit()));
            assert_eq!(previous.parent(), Some(ui));
            assert_eq!(fs::read_to_string(previous.join("index.html")).unwrap(), "hot-swapped UI");
            assert!(!ui.join("current").exists());
            assert_eq!(fs::read_to_string(ui.join("app-version")).unwrap(), "0.3.0");
            assert_eq!(fs::read_dir(ui).unwrap().count(), 2);
        }
    }

    #[test]
    fn utc_stamps_use_calendar_dates() {
        assert_eq!(utc_stamp(0), "19700101000000");
        assert_eq!(utc_stamp(1_793_533_001), "20261101113641");
        assert_eq!(utc_stamp(951_782_400), "20000229000000");
        assert_eq!(utc_stamp(4_107_542_400), "21000301000000");
    }

    #[test]
    fn placeholder_or_empty_key_disables_updates() {
        for key in ["", " \n", "REPLACE_WITH_TAURI_SIGNER_PUBLIC_KEY", " REPLACE_WITH_TAURI_SIGNER_PUBLIC_KEY\n"] {
            assert!(!key_configured(key));
        }
        // Other key text still has to pass the plugin's verification before installation.
        assert!(key_configured("configured key"));
    }

    #[test]
    fn endpoints_and_transport() {
        assert_eq!(endpoint(Channel::Stable, None).unwrap().as_str(), format!("{RELEASE_BASE}/latest/download/latest.json"));
        assert_eq!(endpoint(Channel::Nightly, None).unwrap().as_str(), format!("{RELEASE_BASE}/download/nightly/latest.json"));
        for url in ["http://127.0.0.1:9000/latest.json", "http://localhost:9000/latest.json", "https://updates.example/latest.json"] {
            assert_eq!(endpoint(Channel::Nightly, Some(url)).unwrap().as_str(), url);
        }
        for url in ["http://updates.example/feed", "http://localhost.example/feed", "http://127.0.0.2/feed", "http://[::1]/feed", "ftp://localhost/feed", "broken"] {
            assert!(endpoint(Channel::Stable, Some(url)).is_err(), "{url}");
        }
        assert!(validate_url(&Url::parse("http://localhost/feed").unwrap(), false).is_err());
    }

    #[test]
    fn channel_settings_default_and_persist() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("updater.json");
        assert_eq!(read_settings(&path).channel, Channel::Stable);
        for contents in ["", "not json", "{}", r#"{"channel":"unknown"}"#, r#"{"channel":1}"#] {
            fs::write(&path, contents).unwrap();
            assert_eq!(read_settings(&path).channel, Channel::Stable);
        }
        fs::write(&path, r#"{"channel":"nightly"}"#).unwrap();
        assert_eq!(read_settings(&path).channel, Channel::Nightly);
        assert_eq!(read_settings(&path).last_check, 0);
        let settings = Settings { channel: Channel::Nightly, last_check: 123 };
        fs::write(&path, serde_json::to_vec(&settings).unwrap()).unwrap();
        assert_eq!(read_settings(&path).last_check, 123);
        assert_eq!(read_settings(&path).channel, Channel::Nightly);
    }

    #[test]
    fn passive_checks_are_throttled() {
        assert!(check_due(0, 10));
        assert!(!check_due(100, 100 + CHECK_INTERVAL - 1));
        assert!(check_due(100, 100 + CHECK_INTERVAL));
        assert!(!check_due(100, 99));
    }

    #[test]
    fn prune_keeps_two_newest_backups() {
        let dir = tempdir().unwrap();
        assert!(backups(&dir.path().join("missing")).unwrap().is_empty());
        for (index, version) in ["9.0.0", "2.0.0", "1.0.0"].iter().enumerate() {
            let path = dir.path().join(format!("Aegis-{version}.app"));
            fs::create_dir(&path).unwrap();
            fs::File::open(path).unwrap().set_modified(UNIX_EPOCH + Duration::from_secs(index as u64 + 1)).unwrap();
        }
        let unrelated = dir.path().join("Other.app");
        fs::create_dir(&unrelated).unwrap();
        let pending = dir.path().join("Aegis-4.0.0.pending");
        fs::create_dir(&pending).unwrap();
        prune_backups(dir.path()).unwrap();
        let kept = backups(dir.path()).unwrap();
        assert_eq!(kept.len(), 2);
        assert!(kept[0].ends_with("Aegis-1.0.0.app"));
        assert!(kept[1].ends_with("Aegis-2.0.0.app"));
        assert!(!dir.path().join("Aegis-9.0.0.app").exists());
        assert!(unrelated.exists() && pending.exists());
    }

    #[test]
    fn rollback_swaps_bundles_and_refuses_unsafe_paths() {
        let dir = tempdir().unwrap();
        let running = dir.path().join("Aegis.app");
        let backup = dir.path().join("previous.app");
        let aside = dir.path().join("Aegis.app.restoring");
        fs::create_dir(&running).unwrap();
        fs::create_dir(&backup).unwrap();
        fs::write(running.join("version"), "new").unwrap();
        fs::write(backup.join("version"), "old").unwrap();
        fs::create_dir(&aside).unwrap();
        assert!(rollback_swap(&running, &backup, &aside).is_err());
        assert_eq!(fs::read_to_string(running.join("version")).unwrap(), "new");
        fs::remove_dir(&aside).unwrap();
        assert!(rollback_swap(&running, &running, &aside).is_err());
        rollback_swap(&running, &backup, &aside).unwrap();
        assert_eq!(fs::read_to_string(running.join("version")).unwrap(), "old");
        assert!(!backup.exists() && !aside.exists());
        assert!(rollback_swap(&running, &backup, &aside).is_err());
    }

    #[test]
    fn rollback_restores_running_bundle_after_failed_move() {
        let dir = tempdir().unwrap();
        let running = dir.path().join("Aegis.app");
        // Moving the running bundle also moves this backup, so the second rename fails.
        let backup = running.join("nested.app");
        fs::create_dir_all(&backup).unwrap();
        fs::write(running.join("version"), "original").unwrap();
        let aside = dir.path().join("aside");
        assert!(rollback_swap(&running, &backup, &aside).is_err());
        assert_eq!(fs::read_to_string(running.join("version")).unwrap(), "original");
        assert!(backup.exists());
        assert!(!aside.exists());
    }

    #[test]
    fn bundle_resolution() {
        assert_eq!(bundle_from_exe(Path::new("/Applications/Aegis.app/Contents/MacOS/aegis")), Some(PathBuf::from("/Applications/Aegis.app")));
        assert!(bundle_from_exe(Path::new("/tmp/target/debug/aegis")).is_none());
    }

    #[test]
    fn signature_verification_without_network() {
        let keys = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        let wrong = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        let artifact = b"Signed test artifact";
        let signature = minisign::sign(Some(&keys.pk), &keys.sk, &artifact[..],
            Some("version:999.0.0"), None).unwrap();
        for (key, valid) in [(&keys.pk, true), (&wrong.pk, false)] {
            let mut context = tauri::test::mock_context(tauri::test::noop_assets());
            plugin_config(&mut context, false);
            let app = tauri::test::mock_builder()
                .plugin(tauri_plugin_updater::Builder::new()
                    .pubkey(STANDARD.encode(key.to_box().unwrap().into_string())).build())
                .build(context).unwrap();
            let updater = app.updater_builder().target("test-target")
                .endpoints(vec!["https://example.invalid/latest.json".parse().unwrap()])
                .unwrap().build().unwrap();
            let mut manifest = serde_json::json!({
                "version": "999.0.0",
                "platforms": { "test-target": {
                    "url": "https://example.invalid/Aegis.app.tar.gz",
                    "signature": STANDARD.encode(signature.to_string())
                } }
            });
            let update = updater.restore_update(manifest.clone()).unwrap().unwrap();
            if valid {
                update.verify(artifact).unwrap();
            } else {
                assert!(matches!(update.verify(artifact), Err(tauri_plugin_updater::Error::Minisign(_))));
            }
            assert!(matches!(update.verify(b"tampered"), Err(tauri_plugin_updater::Error::Minisign(_))));
            manifest["version"] = serde_json::json!(app.package_info().version.to_string());
            assert!(updater.restore_update(manifest.clone()).unwrap().is_none());
            manifest["version"] = serde_json::json!("0.0.1");
            assert!(updater.restore_update(manifest).unwrap().is_none());
        }
    }

    struct Feed {
        url: String,
        stop: Arc<AtomicBool>,
        server: Option<thread::JoinHandle<()>>,
    }

    impl Feed {
        fn start(version: &str, signature: &str, artifact: Vec<u8>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0")
                .expect("The local HTTP update test requires permission to bind a loopback socket");
            listener.set_nonblocking(true).unwrap();
            let base = format!("http://{}", listener.local_addr().unwrap());
            let manifest = serde_json::to_vec(&serde_json::json!({
                "version": version, "notes": " Test release notes ",
                "platforms": { "test-target": { "url": format!("{base}/Aegis.app.tar.gz"), "signature": signature } }
            })).unwrap();
            let stop = Arc::new(AtomicBool::new(false));
            let stopped = stop.clone();
            let server = thread::spawn(move || {
                while !stopped.load(Ordering::SeqCst) {
                    let (mut stream, _) = match listener.accept() {
                        Ok(connection) => connection,
                        Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(5));
                            continue;
                        }
                        Err(e) => panic!("Mock feed failed: {e}"),
                    };
                    stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
                    let mut request = Vec::new();
                    let mut byte = [0];
                    while !request.ends_with(b"\r\n\r\n") {
                        if stream.read(&mut byte).unwrap() == 0 { break; }
                        request.push(byte[0]);
                    }
                    let json = request.starts_with(b"GET /latest.json ");
                    let body = if json { &manifest } else { &artifact };
                    write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", if json { "application/json" } else { "application/octet-stream" }, body.len()).unwrap();
                    stream.write_all(body).unwrap();
                }
            });
            Self { url: format!("{base}/latest.json"), stop, server: Some(server) }
        }
    }

    impl Drop for Feed {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::SeqCst);
            self.server.take().unwrap().join().unwrap();
        }
    }

    #[test]
    fn signed_update_check_and_download_end_to_end() {
        let keys = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        let wrong_keys = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        let artifact = b"A throwaway signed updater artifact";
        let signature = minisign::sign(Some(&keys.pk), &keys.sk, &artifact[..], None, None).unwrap();
        let signature = STANDARD.encode(signature.to_string());
        let key = STANDARD.encode(keys.pk.to_box().unwrap().into_string());
        let wrong_key = STANDARD.encode(wrong_keys.pk.to_box().unwrap().into_string());
        for (tamper, wrong, same_version) in [(false, false, false), (true, false, false), (false, true, false), (false, false, true)] {
            let mut context = tauri::test::mock_context(tauri::test::noop_assets());
            let version = if same_version { context.package_info().version.to_string() } else { "999.0.0".into() };
            let feed = Feed::start(&version, &signature, if tamper { b"tampered".to_vec() } else { artifact.to_vec() });
            let url = endpoint(Channel::Stable, Some(&feed.url)).unwrap();
            plugin_config(&mut context, url.scheme() == "http");
            let app = tauri::test::mock_builder()
                .plugin(tauri_plugin_updater::Builder::new().pubkey(if wrong { &wrong_key } else { &key }).build())
                .build(context).unwrap();
            let updater = app.updater_builder().target("test-target").no_proxy()
                .timeout(Duration::from_secs(5)).endpoints(vec![url]).unwrap().build().unwrap();
            let update = tauri::async_runtime::block_on(updater.check()).unwrap();
            if same_version {
                assert!(update.is_none());
                continue;
            }
            let update = update.expect("newer version should be found");
            assert_eq!(update.version, "999.0.0");
            let downloaded = tauri::async_runtime::block_on(update.download(|_, _| {}, || {}));
            if tamper || wrong {
                let error = downloaded.unwrap_err();
                assert!(matches!(error, tauri_plugin_updater::Error::Minisign(_)), "Expected signature error, got {error:?}");
            } else {
                assert_eq!(downloaded.unwrap(), artifact);
            }
        }
        assert!(endpoint(Channel::Stable, Some("http://example.com/latest.json")).is_err());
    }
}
