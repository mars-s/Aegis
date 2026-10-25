# Aegis

A minimal infinite canvas for you and your agents. Brain-dump into the box at the bottom; agents running on [Pi Durable](https://www.npmjs.com/package/@earendil-works/pi-durable) sort it into groups, checklists and links on the board while you watch.

Agents sign in with your own ChatGPT or Claude subscription (Settings). Boards, sign-in tokens and agent history live in `~/Library/Application Support/Aegis`, never in this repository.

## Run

Needs Rust and Node 22.19 or newer.

```sh
npm --prefix agent install
npm --prefix app install
npm run dev        # the app with live UI updates (Vite dev server inside the Tauri window)
npm run build      # Aegis.app in src-tauri/target/release/bundle/macos
npm run check      # board and agent-host checks (scripted local model, no provider calls) and svelte-check
```

Open the Vite dev page with `?port=<host port>&token=<token>&bench=5000` to measure the canvas on 5,000 cards.

### The UI updates itself

The window loads `~/Library/Application Support/Aegis/ui/current` when one is installed, otherwise the UI bundled in the app. `POST /ui-update` on the host type-checks and builds `app/`, checks the build, then swaps it in beside the old one (three previous versions are kept). `POST /ui-update/rollback` puts the last one back. `AEGIS_SAFE=1` always loads the bundled UI.

## Layout

| Path | What |
| --- | --- |
| `app/src/lib/board/commands.js` | Board commands: the only way a board changes, shared by the canvas, the agent tools and the checks |
| `app/src/lib/board/objects.js` | Object kinds (reply, plot, sheet, diagram, plan, list, code): shapes, limits, and checks that name the exact bad field |
| `app/src/objects/` | Svelte object cards; `chart/` is Zephium's chart (MPL-2.0) |
| `app/src/canvas/engine.js` | The canvas: viewport culling, one transform for pan and zoom, shapes when zoomed far out |
| `app/src/controller.ts`, `app/src/chrome/` | Boards, library, layers, tools, cursor, composer, agents panel, settings |
| `agent/server.mjs` | Agent host: Pi Durable, board and object tools, parts (lead and helpers), skills, sign-in, loopback HTTP and live events |
| `agent/skills/` | How to do a kind of job (analyse data, explain a flow and so on); your own skills in the data folder override them |
| `agent/ui-update.mjs` | Build, check, swap and roll back the installed UI |
| `src-tauri` | Tauri shell: starts the agent host with a per-launch token and stops it on quit |
| `.scratch/aegis-workbench` | Spec and stack notes |

## Credits

Started from [Mochiboard](https://github.com/jessawolfe-ux/mochiboard)'s Tauri setup (MIT, see `LICENSE.mochiboard`). None of Mochiboard's name, character, art, music, fonts or icons are used.

The chart in `app/src/objects/chart/` and parts of the object cards come from [Zephium](https://github.com/zephium-browser/Zephium) at `0eaad6d` under the Mozilla Public License 2.0 (`LICENSE.zephium`). Each such file says so at the top, and those files stay under MPL-2.0. The object kinds, the agent workflow and the skills follow Zephium's Work design, written for Aegis.
