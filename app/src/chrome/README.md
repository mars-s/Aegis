# React chrome

`Chrome` renders the board bar, Windows tree, Library view, panels, tool dock, selection actions, command palette, notifications and save state. It receives the frozen `FeatureContext`, the scene engine and explicit feature composition. Import it from `./chrome/index.js` in App's React composition. Do not mount it once per panel.

The scene keeps the camera. Chrome positions the selection toolbar from model geometry after world-transform changes. It does not read scene layout, start an animation loop or publish React state during pan. Windows filtering, disclosure state, dialogs and command edits are discrete React updates. Panel gestures write temporary chrome styles and commit preferences once on completion.

Board edits use workspace commands. Deletion Undo restores only the deleted records and their valid links, preserving intervening edits. The existing shared menus, popups and confirmation dialog are reused through `shared-ui.d.ts`. That declaration describes their current JavaScript API; it does not replace their implementation or grant an unsafe-type allowance.

`LibraryService` in `library-model.ts` is a proposed semantic adapter for the host-client owner. Its views have real-host browser checks through an external verification-only adapter. Production Library operations still need integration. `ChromeGestures` in `Selection.tsx` must be backed by the scene scheduler before resize, rotation and Connect are available. Supplying no-op callbacks would hide a missing feature and is not supported.

Legacy `idle.js`, `menu.js`, `panels.js`, `layers.js` and `library.js` remain because the default Svelte entry and other legacy callers still import them. Removing those callers belongs to integration. New React modules deliberately avoid their filenames, since macOS resolves names without case sensitivity.

Run the root checks, plus `npx tsc --noEmit -p app/src/chrome/tsconfig.json` and `npx oxlint --deny-warnings app/src/chrome/*.ts app/src/chrome/*.tsx`. The integrator's proposed App, checker and lint patch is in `/Users/avi/.codex/orchestrate/aegis-react/evidence/chrome/integration.patch`. This slice is not a completed parity migration. The full handoff and remaining requests are in that evidence directory.
