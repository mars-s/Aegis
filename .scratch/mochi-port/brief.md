# Brief for feature agents porting Mochiboard into Aegis

Repo: /Users/avi/Documents/ChatGPT/aegis (git, branch main). Mochiboard source (MIT, Jessa Wolfe): /tmp/aegis-ref/mochiboard
(web/app.js, web/index.html, web/style.css, web/bridge.js). Inventory with line ranges: .scratch/mochi-port/inventory.md.
The goal is feature parity one to one with Mochiboard, ported into Aegis's own architecture. Design polish comes later;
make it work properly and look tidy and minimal.

## Rules
- Licence: Mochiboard code is MIT, so you may port its code directly. Put this line at the top of any file with ported code:
  `// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.`
  NEVER port Mochi (the character), goo.js, web/stamps/, web/music/, outfits, pixel art, or the name "Mochiboard"/"Mochi" in UI text.
  Where Mochiboard says "Mochi does X", Aegis uses its agents (Pi Durable host) or leaves a clear hook.
  Material Icons font (web/icons) is Apache-2.0: fine to copy with its LICENSE. DM Sans / Caveat fonts are OFL: fine with OFL.txt.
- Only edit files inside YOUR feature area (listed in your task) plus one import line in app/src/features/index.ts and one in
  app/src/lib/board/types/index.js. If you need a change in shared files (canvas/engine.js, controller.ts, commands.js,
  registry.ts, App.svelte, styles/app.css, agent/server.mjs), keep it tiny, additive and generic, and list it in your final reply.
  Other agents are editing other features at the same time; never revert or reformat code you did not write.
- Do NOT run `git add -A` or commit `.scratch/aegis-redesign/` or `PRODUCT.md` (another task's files). Do not commit at all;
  the lead commits. Do not touch ~/Library/Application Support/Aegis (the user's real data).
- Australian English in UI text and comments. No em dashes anywhere.

## How features plug in (read app/src/features/README.md and these files first)
- Card types: `registerCardType(type, { size })` in app/src/lib/board/types/<feature>.js (imported by host and app).
  Type data goes in `card.props` (JSON, merged by `{op:'update', id, set:{props:{...}}}`; null deletes a key).
  Cards also have `x y w h text color(named or #hex) rot(deg) parent(card id)`. Board commands in app/src/lib/board/commands.js.
- Rendering: `registerRenderer(type, { render(el, card, api), drop?(el), open?(card, api), interactive?: 'css selector', resizable? })`
  from app/src/canvas/engine.js. el is the positioned .card div. api: apply(cmds, done), setProps(id, partial), resolveUrl,
  openUrl, open(card), board, view. Selectors in `interactive` keep pointer events for the card's own controls.
- UI: app/src/features/registry.ts: registerTool (with place() or pointer {down,move,up} for drag tools, key, icon, group),
  registerPanel (side bar box), registerCommand (keys like 'mod+z', 'shift+mod+z', 'f'), registerCardMenu / registerBoardMenu (right-click).
  ctx = { apply, canvas, host, toast, selection }. canvas has screenToWorld, worldToScreen, setView, glideTo, frameIds,
  select(ids), selection(), board, view, redraw(), mountedEl(id), fit().
- Media files: host.upload(file) -> { url: 'asset:...' }; host.assetUrl(url) to display. Host API in agent/server.mjs.
- Styles: put feature CSS in a .css file in your feature folder and import it from your feature's index.ts. Use the
  existing variables (--card, --line, --text, --muted, --faint, --hover, --focus, --accent, --color-* tokens).
- Svelte 5 is available for complex UI (runes: $state, $derived, $props; mount() from 'svelte'). Plain DOM is fine too.

## Verify before you finish (required)
1. `cd app && npx svelte-check --threshold error` shows 0 errors; `npm --prefix agent run check` passes (run from repo root).
2. Add host/board checks in agent/checks/<feature>.test.mjs for new commands or card types where it makes sense.
3. Exercise the feature in a real browser: write a Playwright script under /tmp/aegis-check/<feature>-smoke.mjs modelled on
   /tmp/aegis-check/svelte-smoke.mjs (it starts a throwaway host with AEGIS_FAKE_MODEL=1 and temp AEGIS_DATA, plus the Vite
   dev server on a port you choose; pick a port 5180-5199 unique to you). Drive the feature like a user (clicks, typing,
   drags, shortcuts), assert the saved board data, take screenshots, and look at them. Fix what is broken.
4. Reply with: what you ported (inventory ids), what you could not and why, files changed, shared-file edits, and the
   evidence (commands run, results, screenshot paths).
