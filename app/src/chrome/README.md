# React chrome

`Chrome` renders the board bar, Windows tree, Library view, panels, tool dock, selection actions, command palette, notifications and save state. It receives the frozen `FeatureContext`, the scene engine and explicit feature composition. Import it from `./chrome/index.js` in App's React composition. Do not mount it once per panel.

The scene keeps the camera. Chrome measures the selection toolbar in the scene's read phase and positions it from model geometry in the write phase. It uses the existing scene scheduler and keeps camera frames out of React state. Windows filtering, disclosure state, dialogs and command edits are discrete React updates. Panel gestures write temporary chrome styles and commit preferences once on completion.

Board edits use workspace commands. Deletion Undo restores only the deleted records and their valid links, preserving intervening edits. Menus, popups and the confirmation dialog come from the typed `lib/ui` primitives.

`CoreTools` owns the basic placement tools and body focus after the real scene mounts them. Blank double-click creation uses the same command path after pointer input settles. `InputCommands` repairs raw geometry using the saved preference rules, then validates every command before submission. `CollectionDrop` composes with the document resolver in App and submits movement and collection membership together.

`LibraryService` in `library-model.ts` receives the production host adapter from App. Chrome queues authored Library actions and protects each rename against duplicate Enter/blur completion. Deletion retains the adapter's durable Undo period. Templates use workspace commands for seven frameworks and the real Library service for three starter boards. CanvasDoor uses the typed child-board service, a registered React body, lazy real-board previews and parent breadcrumbs. Empty child boards centre the viewport; populated boards fit their saved content. Library preview menus build only when invoked, so the 200-board home does not generate every destination menu during rendering.

`ToolbarPreferences` and `PanelPreferences` are exported for Settings' toolbar and panel slots. Their changes update the visible chrome and persist on this device. App must wire these slots and `customiseToolbar`. `ChromeGestures` receives the scene-backed resize, rotation and Connect operations.

Run the root checks. Round 2 production-browser evidence is under `/Users/avi/.codex/orchestrate/aegis-react/evidence/fix-chrome-r2`. Cross-slice requests are in the neighbouring `inbox/chrome-r2-*.md` files. The external final report records complete suites and remaining failures separately.
