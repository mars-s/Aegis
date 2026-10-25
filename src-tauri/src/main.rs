// Aegis shell: one window over the web canvas, plus the Pi Durable agent host as a child process.
// The host listens on 127.0.0.1 with a random port and a per-launch token; the canvas asks for both.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_opener::OpenerExt;

struct Agent {
    child: Mutex<Option<Child>>,
    info: Mutex<Option<Value>>,
}

#[tauri::command]
fn agent_info(state: tauri::State<'_, Agent>) -> Option<Value> {
    state.info.lock().unwrap().clone()
}

#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) {
    if url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:") {
        let _ = app.opener().open_url(url, None::<&str>);
    }
}

// The webview's clipboard API needs focus and permissions; pbcopy always works on macOS.
#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    use std::io::Write;
    let mut child = Command::new("/usr/bin/pbcopy").stdin(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    child.stdin.take().unwrap().write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    child.wait().map_err(|e| e.to_string())?;
    Ok(())
}

fn data_dir() -> PathBuf {
    std::env::var_os("AEGIS_DATA").map(PathBuf::from)
        .unwrap_or_else(|| dirs::data_dir().unwrap_or_else(std::env::temp_dir).join("Aegis"))
}

// Node 22.19+ is needed for Pi Durable. GUI apps get a bare PATH, so look in the usual places.
fn find_node() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("AEGIS_NODE") { return Some(PathBuf::from(p)); }
    let home = dirs::home_dir().unwrap_or_default();
    let mut spots: Vec<PathBuf> = vec![
        "/opt/homebrew/opt/node@24/bin/node".into(),
        "/opt/homebrew/bin/node".into(),
        "/usr/local/bin/node".into(),
        home.join(".volta/bin/node"),
    ];
    for dir in ["installs/node", ""] {
        let base = home.join(".local/share/mise").join(dir);
        if let Ok(rd) = std::fs::read_dir(&base) {
            let mut v: Vec<PathBuf> = rd.flatten().map(|e| e.path().join("bin/node")).collect();
            v.sort(); v.reverse(); spots.extend(v);
        }
    }
    spots.into_iter().find(|p| p.exists() && node_ok(p))
}
fn node_ok(p: &Path) -> bool {
    let Ok(out) = Command::new(p).arg("-p").arg("process.versions.node").output() else { return false };
    let v = String::from_utf8_lossy(&out.stdout);
    let mut it = v.trim().split('.').map(|x| x.parse::<u32>().unwrap_or(0));
    let (maj, min) = (it.next().unwrap_or(0), it.next().unwrap_or(0));
    maj > 22 || (maj == 22 && min >= 19)
}

// In development the host runs from the repository; in a bundle, from Resources.
fn host_script(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(dir) = app.path().resource_dir() {
        let p = dir.join("agent/server.mjs");
        if p.exists() { return p; }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../agent/server.mjs")
}

fn start_agent(app: &tauri::AppHandle) -> Result<(), String> {
    let node = find_node().ok_or("Node 22.19 or newer is needed for agents. Install it with Homebrew (brew install node).")?;
    let script = host_script(app);
    let data = data_dir();
    std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    // A fresh 256-bit token each launch, from the OS random source.
    let token: String = {
        let mut buf = [0u8; 32];
        let mut f = std::fs::File::open("/dev/urandom").map_err(|e| e.to_string())?;
        std::io::Read::read_exact(&mut f, &mut buf).map_err(|e| e.to_string())?;
        buf.iter().map(|b| format!("{:02x}", b)).collect()
    };
    let mut child = Command::new(node)
        .arg("--no-warnings")
        .arg(&script)
        .current_dir(script.parent().unwrap())
        .env("AEGIS_DATA", &data)
        .env("AEGIS_PORT", "0")
        .env("AEGIS_TOKEN", &token)
        // The host watches this pipe and exits when it closes, so it never outlives the app.
        .env("AEGIS_PARENT_PIPE", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("couldn't start the agent host: {e}"))?;
    let stdout = child.stdout.take().unwrap();
    let state = app.state::<Agent>();
    *state.child.lock().unwrap() = Some(child);
    let handle = app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(v) = serde_json::from_str::<Value>(&line) {
                if v.get("aegis").and_then(|x| x.as_str()) == Some("ready") {
                    let port = v.get("port").cloned().unwrap_or(Value::Null);
                    *handle.state::<Agent>().info.lock().unwrap() = Some(json!({ "port": port, "token": token }));
                    // An installed UI in the data folder replaces the bundled one, so the app can update itself
                    // without a rebuild. AEGIS_SAFE=1 always keeps the bundled factory UI.
                    if v.get("ui").and_then(|x| x.as_bool()) == Some(true) && std::env::var_os("AEGIS_SAFE").is_none() {
                        if let (Some(p), Some(win)) = (port.as_u64(), handle.get_webview_window("main")) {
                            let target = format!("http://127.0.0.1:{p}/ui/index.html?port={p}&token={token}");
                            if let Ok(url) = tauri::Url::parse(&target) { let _ = win.navigate(url); }
                        }
                    }
                    continue;
                }
            }
            println!("[agent] {line}");
        }
    });
    Ok(())
}

fn stop_agent(app: &tauri::AppHandle) {
    if let Some(mut child) = app.state::<Agent>().child.lock().unwrap().take() {
        #[cfg(unix)]
        unsafe { libc_kill(child.id() as i32, 15); }
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        while std::time::Instant::now() < deadline {
            if let Ok(Some(_)) = child.try_wait() { return; }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        let _ = child.kill();
    }
}
#[cfg(unix)]
extern "C" { #[link_name = "kill"] fn libc_kill(pid: i32, sig: i32) -> i32; }

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Agent { child: Mutex::new(None), info: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![agent_info, open_url, copy_text])
        .setup(|app| {
            if let Err(e) = start_agent(app.handle()) { eprintln!("aegis: {e}"); }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Aegis couldn't start")
        .run(|app, event| {
            if let RunEvent::Exit = event { stop_agent(app); }
        });
}
