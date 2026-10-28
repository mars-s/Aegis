# Native refresh

Aegis now disables WebKit's separate near-60-fps preference before creating its
WKWebView. The display still controls the maximum refresh rate. There is no
permanent display link, timer or JavaScript animation added to the application.

`tauri.conf.json` sets `main.create` to false. The setup callback rebuilds that
same window with `WebviewWindowBuilder::from_config`, supplying
`with_webview_configuration` on macOS before `build()`. This reaches wry before
`WKWebView.initWithFrame:configuration:` and the first navigation. A late setter
or reload is unnecessary and was not tested.

`native_refresh.rs` uses `+[WKPreferences _features]`, finds the key
`PreferPageRenderingUpdatesNear60FPSEnabled`, then calls
`-[WKPreferences _setEnabled:NO forFeature:]`. Every SPI selector and optional
result is checked before use. A missing selector, feature or key leaves the
default configuration intact and writes one stderr line naming the missing
piece. There is no macOS version gate. Dependencies match the lockfile:
objc2 0.6.5, objc2-foundation/objc2-web-kit 0.3.2, Tauri 2.12.5 and wry 0.57.1.
The Objective-C messages follow [WebKit's implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/Cocoa/WKPreferences.mm).

## Measurement

Measured on 27 October 2026, M4 Pro MacBook, macOS 26.6.2, built-in 120 Hz
ProMotion display, battery power, normal power mode. Base main was
`6036a792c147687aa79f87af3a7d18032adb6909`. Work is on `codex/react-native-fps`.

The committed probe launches the real Aegis executable. Each run has fresh
`AEGIS_DATA` and `AEGIS_VITE_CACHE` folders. Its standalone page loads through
the existing host's installed-UI route in the same configured Tauri window.
The page checks `/health`, makes an authenticated `/boards` request, checks the
Tauri bridge and page visibility, then animates a dot for 600 rAF intervals.
It reports through a temporary loopback collector and stops scheduling frames.
No application frontend or host source changes are needed.

FPS is 1000 divided by the mean interval. p50, p95 and max are milliseconds,
computed by nearest rank from the actual rAF timestamps. WebKit quantises these
timestamps, so 8 ms is the observed median, not a claim of sub-millisecond timing.

| Build | Run | FPS | p50 ms | p95 ms | Max ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Main release executable | 1 | 59.99 | 17 | 18 | 19 |
| Main release executable | 2 | 60.00 | 17 | 18 | 19 |
| Main release executable | 3 | 59.70 | 17 | 18 | 85 |
| Changed release executable | 1 | 119.95 | 8 | 10 | 11 |
| Changed release executable | 2 | 119.88 | 8 | 10 | 14 |
| Changed release executable | 3 | 119.78 | 8 | 10 | 16 |
| Final Aegis.app, after 10 s idle | 1 | 119.78 | 8 | 10 | 17 |
| Final Aegis.app, after 10 s idle | 2 | 119.88 | 8 | 10 | 13 |
| Final Aegis.app, after 10 s idle | 3 | 119.71 | 8 | 10 | 20 |

The baseline failed `--min-fps 100` as intended. All changed runs passed.
All pages reported `hidden: false`, `hostConnected: true` and `tauri: true`.
The baseline's 85 ms maximum was retained rather than excluded.
A temporary build with a deliberately missing feature key launched at 60.02 fps
and wrote exactly one fallback diagnostic. The real key was restored before the
final build. Evidence: `/tmp/aegis-native-fps-fallback-evidence`.

## Reproduce and evidence

Run from the repository root. Setup used `npm ci --prefix app` and
`npm ci --prefix agent`, creating only ignored dependency folders.

```sh
AEGIS_DATA=$(mktemp -d) AEGIS_VITE_CACHE=$(mktemp -d) npm --prefix app run build
AEGIS_DATA=$(mktemp -d) AEGIS_VITE_CACHE=$(mktemp -d) cargo build --release --locked --manifest-path src-tauri/Cargo.toml
node checks/native/fps.mjs --app src-tauri/target/release/aegis --runs 3 --min-fps 100 --screenshot --out /tmp/aegis-native-fps-after
AEGIS_DATA=$(mktemp -d) AEGIS_VITE_CACHE=$(mktemp -d) npm run build
node checks/native/fps.mjs --app src-tauri/target/release/bundle/macos/Aegis.app/Contents/MacOS/aegis --runs 3 --warmup-ms 10000 --min-fps 100 --screenshot --out /tmp/aegis-native-fps-final
```

The baseline was built before native changes, then copied to
`/tmp/aegis-native-fps-main`. Its probe used the same arguments with that path
and output directory `/tmp/aegis-native-fps-before`. Each evidence folder
contains `summary.json`, per-run JSON, redacted logs and window screenshots.
Baseline executable SHA-256: `4b1a3d6d9df669dc8a410ba3f7c4a4a29882371f0760aff809be779a310fd789`.
Final bundled executable SHA-256: `b6dea5cb8d55a60c99d84ecadafc00b514f8734f812b39508b90507cf5831bd6`.
Optional screenshots need macOS screen recording access and use only the
launched PID's window. The runner terminates only its own app process; the host
exits when its parent pipe closes.

`cargo build --release --locked` and `npm run build` succeeded. Existing Vite
accessibility/chunk warnings remain. JavaScript syntax checks, rustfmt for the
new Rust module and `git diff --check` passed. The bundled factory canvas also
launched with fresh data and `AEGIS_SAFE=1`. The host returned `ok: true`, and the
canvas created its first board. Screenshot:
`/tmp/aegis-native-fps-canvas/canvas.png`; details in that folder's `smoke.json`.
The launched app and host PIDs were confirmed gone after the smoke check.

## Power, displays and limits

This changes only the near-60 preference. WebKit still handles power, thermal
and visibility throttling, as its [frame-rate calculation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/AnimationFrameRate.cpp)
shows. With a 60 Hz display it uses 60 Hz; Low Power Mode can halve the selected
rate, for example 120 to 60 or 60 to 30. These cases are source-based expectations,
not hardware measurements from this run. No display or system power settings
were changed. Use a suitable `--min-fps` threshold, or omit it, on those systems.

The private SPI remains a compatibility and App Store review risk while
[WebKit issue 294338](https://bugs.webkit.org/show_bug.cgi?id=294338) is open.
Missing methods/features fall back to defaults; an incompatible future ABI is
still a risk. Only macOS was built and measured. The probe proves the native
webview's frame scheduling, not the performance of the React canvas under load.
No source changes were made to `app/src`, `agent/` or `checks/ui`, and the
installed `~/Applications/Aegis.app` was not replaced. No PR was opened.
