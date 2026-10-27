# React chrome

`Chrome` renders the board bar, Windows tree, Library view, panels, tool dock, selection actions, command palette, notifications and save state. It receives the frozen `FeatureContext`, the scene engine and explicit feature composition. Import it from `./chrome/index.js` in App's React composition. Do not mount it once per panel.

The scene keeps the camera. Chrome measures the selection toolbar in the scene's read phase and positions it from model geometry in the write phase. It uses the existing scene scheduler and keeps camera frames out of React state. Windows filtering, disclosure state, dialogs and command edits are discrete React updates. Panel gestures write temporary chrome styles and commit preferences once on completion.

Board edits use workspace commands. Deletion Undo restores only the deleted records and their valid links, preserving intervening edits. The existing shared menus, popups and confirmation dialog are reused through `shared-ui.d.ts`. That declaration describes their current JavaScript API; it does not replace their implementation or grant an unsafe-type allowance.

`LibraryService` in `library-model.ts` receives the production host adapter from App. Chrome queues authored Library actions and protects each rename against duplicate Enter/blur completion. Deletion retains the adapter's durable Undo period. Templates use workspace commands for seven frameworks and the real Library service for three starter boards. Nested-canvas creation and previews still need a semantic host operation and card registration.

`ToolbarPreferences` and `PanelPreferences` are exported for Settings' toolbar and panel slots. Their changes update the visible chrome and persist on this device. App must wire these slots and `customiseToolbar`. `ChromeGestures` receives the scene-backed resize, rotation and Connect operations.

Legacy `idle.js`, `menu.js`, `panels.js`, `layers.js` and `library.js` remain because the default Svelte entry and other legacy callers still import them. Removing those callers belongs to integration. New React modules deliberately avoid their filenames, since macOS resolves names without case sensitivity.

Run the root checks, plus `npx tsc --noEmit -p app/src/chrome/tsconfig.json` and `npx oxlint --deny-warnings app/src/chrome/*.ts app/src/chrome/*.tsx`. Current production-browser evidence is under `/Users/avi/.codex/orchestrate/aegis-react/evidence/fix-chrome`. Cross-slice requests are in `/Users/avi/.codex/orchestrate/aegis-react/inbox/fix-chrome-integration.md`. The broad parity suites remain incomplete until those dependencies are fixed.
