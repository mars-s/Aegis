# Aegis stack proposal

Status: proposal, needs owner decision
Created: 2026-10-25
Relates to: spec.md in this folder

## Summary

| Layer | Pick | Instead of |
| --- | --- | --- |
| Desktop shell | Electron 45 (Chromium 156, Node 24.22) | Tauri 2 |
| Browser tabs | `WebContentsView` per live tab, driven through `webContents.debugger` (DevTools protocol) | iframes, Tauri child webviews |
| Agent host | Pi Durable 1.3.0 (same pin as Mars) in an Electron `utilityProcess` | a separate Node sidecar binary |
| UI | Svelte 5 or React 19 (see below), TypeScript, Vite through electron-vite | Mochiboard's single plain script |
| Canvas | Custom: DOM cards in one transformed layer, viewport culling with an R-tree (rbush), PixiJS v8 layer for grid, connectors, selection and far-zoom shapes | Mochiboard canvas, tldraw, Excalidraw |
| Board data | Loro CRDT document per board, one peer per author | JSON file rewritten on each save |
| Hot reload | Vite dev server on the live app worktree. One more Vite server per lane preview | rebuild and relaunch |
| Lanes | Git worktrees through dugite (bundled Git) | the live checkout |
| Smart merge | Git `ort` merge, then mergiraf for structure-aware retries, then a Pi merge agent, then full checks | manual conflict fixing |
| Checks | `tsc --noEmit`, Vitest, headless boot and Playwright smoke screenshot through Electron | none (Mochiboard has no tests) |
| Voice | whisper.cpp in the utility process | whisper-rs in the Rust shell |

## Why Electron over Tauri

I'd switch. Four requirements push the same way.

1. **Real browser tabs.** The owner wants browser tabs, not iframes. Electron's `WebContentsView` is stable and can host many real Chromium views in one window. Tauri's version (`Window::add_child`) is still behind the `unstable` Cargo flag. Its docs warn that it deadlocks on Windows when called from a synchronous command, and there are open layout bugs on Linux.
2. **Agents driving tabs.** Electron exposes the DevTools protocol for every view through `webContents.debugger`. That lets an agent click and type in the same tab the owner is watching. Tauri on macOS uses WKWebView, which has no DevTools protocol, so agent browsing would need a second, hidden browser.
3. **Pi Durable needs Node.** Pi Durable 1.3.0 requires Node 22.19 or later and stores runs through Node's SQLite module. Electron 45 already contains Node 24.22, so the agent host runs in a utility process with nothing extra to ship. With Tauri we would bundle a separate Node binary of about the same size, which cancels most of Tauri's size advantage.
4. **One rendering engine.** Mochiboard's code has workarounds for Safari zoom and repaint bugs, because WKWebView renders it on Mac and WebView2 on Windows. Electron is Chromium everywhere, so canvas tuning happens once and the speed budgets mean the same thing on every platform.

Costs: a larger download (roughly 100 to 150 MB), more memory, and a Chromium security update to track every few weeks. For a local power-user workbench that runs many agents and live browser tabs, I think that's worth it.

## Zephium: borrow the design, don't fork the code

Zephium (`zephium-browser/Zephium`, MPL-2.0, checked at `0eaad6d` on 2026-10-24) is an Arc-style browser with an agent canvas called Work.

What it has:

- A Rust core on Tauri and Wry, with Zephium's own forks of both, and a Svelte 5 interface. It runs on macOS (WebKit) and Windows (WebView2). There's no Linux build yet.
- Work: an agent canvas built on Svelte Flow (`@xyflow/svelte`). Helpers run in parallel, and results land as cards (tables, charts, diagrams, plans, code, notes). The canvas only renders visible cards once a board gets large.
- Tab cards on the Work canvas are still pictures. Live pages open in a browser pane tiled beside the canvas. The architecture doc explains why: on macOS, overlapping native web views fight over the cursor, so Zephium tiles them and never overlaps them.
- Vertical tabs, spaces, profiles, split view, a launcher, sleeping tabs, native ad blocking (Brave's adblock-rust), Chrome Web Store extensions, tasks, notes and an "Ask" sidebar.
- Agents use bring-your-own API keys or Zephium AI, and anything that posts or changes something waits for approval.

Why not fork it as the Aegis base:

1. **It fights self-modification.** Its core is a large Rust crate set with a strict trust model, and the interface is a bundled, built Svelte app. Most real changes would need a Rust rebuild. Aegis's main promise is an agent that changes the app while it runs.
2. **Wrong agent stack.** Its agents run in its own Rust runtime with API keys. Aegis wants Pi Durable with ChatGPT and Claude subscription sign-in, which would mean bundling Node beside it anyway.
3. **Same browser limits as Tauri.** macOS uses WebKit, so there's no DevTools protocol for agents to drive the tab you're watching. Zephium wrote its own page observation instead.
4. **Fork upkeep.** One maintainer, very active, with pre-production forks of Tauri and Wry. Keeping a heavily changed fork in sync would be a constant job.
5. **Not a freeform board.** Work lays out agent results. It isn't a brain-dump whiteboard with drawing, wireframes and free placement.

What to borrow:

- The browser chrome design: vertical tab sidebar, spaces, profiles, pinned tabs and folders, split view, launcher, sleeping tabs, Ask sidebar.
- The Work canvas patterns: parallel helper cards, result card types, and the page pane beside the canvas.
- The "tile, don't overlap" lesson. The page pane is the fallback if live-on-card views misbehave.
- Ad blocking: in Electron, use `@ghostery/adblocker-electron` (MPL-2.0, version 2.20.1 on npm), which uses the same EasyList and EasyPrivacy lists.
- MPL-2.0 is file-level copyleft. Copied Zephium files stay MPL with their notice, and changes to those files must be shared if Aegis is distributed. The rest of Aegis is unaffected. The Zephium name and logo aren't licensed.

Chrome extensions are a gap. Electron supports only part of the Chrome extension API, so extension support is a later, best-effort feature, not day one.

### UI framework: Svelte 5 is now worth considering

I picked React above. Zephium is a reason to look at Svelte 5 again:

- Svelte 5 updates only what changed (fine-grained reactivity), which fits the per-card update rule without extra memoisation work.
- Zephium's card and chrome components are Svelte 5, so their presentational parts could be adapted (staying MPL) instead of redrawn.
- Against: models write React more reliably, and Aegis's own agents will write much of its code. The React ecosystem is also larger.

My lean is Svelte 5, mainly for speed and the Zephium head start. Either works with the rest of this stack.

## Why rebuild the canvas instead of keeping Mochiboard's

Mochiboard feels laggy because of how it renders, not because of the browser. From its `web/app.js` at `2474cd6`:

- `renderAll()` clears the whole card layer (`cardsEl.innerHTML = ''`) and rebuilds every card. Nothing culls cards outside the viewport.
- Every `save()` runs `layoutAll()` over the board, then rewrites the whole board as JSON 400 ms later. It's called from 112 places.
- About 450 ms after you stop zooming, it switches from a CSS transform to CSS `zoom`, which lays out the whole board again. That's the jump and pause after zooming.
- The canvas is one 4,751-line file. Parallel lanes editing one file would conflict on almost every change.

Keep Mochiboard's card types, interactions, shortcuts and look as the reference. Rebuild the code as small modules: one card type per module, one contribution manifest per feature.

## Canvas design

- **Two layers.** HTML cards (text editing, rich content, extension renderers) sit in one layer moved by a single `transform: translate() scale()`. Under it, a PixiJS layer draws the dot grid, connectors, selection boxes, snapping guides and simplified far-zoom cards.
- **Culling.** An rbush R-tree holds card bounds. Only cards in the viewport plus a margin are mounted. Off-screen cards cost nothing.
- **Pan and zoom** update one transform and the GPU layer's camera in `requestAnimationFrame`. No React render, no layout.
- **Sharp text.** Cards render crisp at rest. While zooming, the layer scales as a bitmap. On settle, only the visible cards re-rasterise. No board-wide `zoom` switch.
- **Level of detail.** Below about 0.4x zoom, HTML cards unmount and the GPU layer draws shapes with titles.
- **Fine-grained updates.** Each card subscribes to its own entry in the Loro document, so a change re-renders only that card.
- **Off the UI thread.** Layout algorithms (cluster, timeline, kanban), search indexing and snapshot encoding run in a worker.
- **Measured.** A built-in frame-time overlay and the benchmark from the spec keep the budgets honest.

Why not a library: tldraw is source-available, not open source. Since SDK 4.0 it needs a licence key in production, and commercial use needs a paid licence. That conflicts with the owner's licensing rule. Excalidraw (MIT) is a drawing tool. Its scene model fits shapes and freehand, not rich HTML cards and live browser tabs. Either one would also have to be bent around Board Commands, Loro and extensions.

## Why Loro for board data

The user and several agents edit the same board at the same time. Loro (MIT, Rust compiled to WebAssembly):

- merges concurrent edits from many peers with no lost writes, replacing the hand-written revision and rebase rules in the current spec;
- has per-peer undo, which matches "undo this agent's batch without touching the others";
- has a movable tree, which fits groups, collections and folders;
- saves incremental updates, so a save writes a few bytes instead of the whole board;
- scored best of Yjs and Automerge in published benchmarks for applying edits and loading documents.

Each agent run is a Loro peer. Board Command batches turn into Loro transactions. The agent host keeps its own replica and syncs with the window over the shell's message channel, so agents edit boards even while the window is closed. Boards are saved as Loro snapshots plus update logs, with a readable JSON export next to each, so the data stays open.

## Hot reload, lanes and smart merge

- The live app layer is a Git repository in the app data folder. A Vite dev server in the utility process serves it to the main window. A landed self-change hot reloads modules and keeps board, camera and selection. A change that needs a full reload gets one, followed by the verify step.
- Each lane is a Git worktree with its own Vite server. "Preview lane" opens a separate window against a scratch copy of the current board.
- Merge order: Git `ort`, then mergiraf on conflicted TypeScript, CSS and JSON files, then a Pi merge agent limited to the files still conflicted, then the full check. Mars's protected-file and "checks come from live, not from the lane" rules carry over.
- Mergiraf is GPL-3.0. Aegis calls it as a separate program (a Git merge driver), never links it. Shipping it inside a distributed build means following the GPL for that binary. For a personal build that's fine. For a public release, download it on first use or leave it out.

## Rough repository layout

- `apps/desktop`: Electron main process, window and browser tab management, safe mode, preload bridge.
- `apps/canvas`: the React app that becomes the live app layer (canvas, chrome, themes, contribution points).
- `packages/board`: Loro document model, Board Command validator and applier, layout algorithms. No DOM. Seam 1 lives here.
- `packages/lanes`: worktrees, merge queue, checks runner, self-change records. Seam 2 lives here.
- `packages/agent-host`: Pi Durable host, sign-in, run events, board tools, browser tools. Seam 3 lives here.
- `extensions/*`: built-in features written as extensions, so the factory app uses the same contribution points as agent-made features.

## Risks to prototype first

1. **Live and still browser tabs over a moving canvas.** Make sure the `WebContentsView` switch has no visible pop at 120 Hz on macOS.
2. **Node SQLite inside Electron's utility process.** Pi Durable must boot and keep runs across restarts there. If it can't, fall back to a plain bundled Node child process.
3. **Canvas budget.** Pan and zoom a 5,000-card generated board at display refresh before building features on it.
4. **Merge agent quality.** Script two conflicting lanes (theme plus toolbar button both editing chrome) and check the merged app boots with both features.

## Decisions needed from the owner

1. Electron instead of Tauri (recommended).
2. Rebuild the canvas and use Mochiboard as a design reference, instead of editing its code (recommended).
3. Loro board documents with a JSON export next to each, instead of plain JSON as the saved file (recommended).
4. Mergiraf as an optional download, not bundled (recommended).
5. Zephium as a design reference, not the code base (recommended).
6. Svelte 5 or React for the interface (lean: Svelte 5).
