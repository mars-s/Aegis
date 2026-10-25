# Aegis

A minimal infinite canvas for you and your agents. Brain-dump into the box at the bottom; agents running on [Pi Durable](https://www.npmjs.com/package/@earendil-works/pi-durable) sort it into groups, checklists and links on the board while you watch.

Agents sign in with your own ChatGPT or Claude subscription (Settings). Boards, sign-in tokens and agent history live in `~/Library/Application Support/Aegis`, never in this repository.

## Run

Needs Rust and Node 22.19 or newer.

```sh
npm --prefix agent install
npm run dev        # debug app
npm run build      # Aegis.app in src-tauri/target/release/bundle/macos
npm run check      # board and agent-host checks (uses a scripted local model, no provider calls)
```

Open `web/index.html?bench=5000` against a running host to measure the canvas on 5,000 cards.

## Layout

| Path | What |
| --- | --- |
| `web/board/commands.js` | Board commands: the only way a board changes, shared by the canvas, the agent tools and the checks |
| `web/canvas.js` | The canvas: viewport culling, one transform for pan and zoom, shapes when zoomed far out |
| `web/app.js` | Boards, composer, agents panel, settings |
| `agent/server.mjs` | Agent host: Pi Durable, board tools, ChatGPT and Claude sign-in, loopback HTTP and live events |
| `src-tauri` | Tauri shell: starts the agent host with a per-launch token and stops it on quit |
| `.scratch/aegis-workbench` | Spec and stack notes |

## Credits

Started from [Mochiboard](https://github.com/jessawolfe-ux/mochiboard)'s Tauri setup (MIT, see `LICENSE.mochiboard`). None of Mochiboard's name, character, art, music, fonts or icons are used.
