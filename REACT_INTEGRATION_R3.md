# React integration round 3

Branch: codex/react-port. Worktree: /tmp/aegis-wt/react/integration.
Legacy remains the default. Evidence root: /Users/avi/.codex/orchestrate/aegis-react/evidence/integration-r3.

## Checkpoint review

Reviewed 0f3e614. Retain both changes: document waits observe the active document save label; the MCP import path opens the actual React file chooser. No assert call or expected value changed. The real production MCP suite passes 27 assertions, including imported PDF/PPTX content, handwritten document save, external edits, reload and zero page errors. The docs suite stops earlier at its hidden toolbar action, docs.mjs:42; this is a separate chrome hit-target defect.

Own npm ci passed. checkpoint-check passes the complete npm run check, including 250 unit tests, 242 host tests, strict types/lint/dependencies and the unchanged safe-type gate with 24 legacy findings. Svelte has zero errors and seven existing warnings.

## Incoming reports

The reported agents head 541477b and chrome head b38eae7 are already ancestors of 0f3e614. Their authored code is covered by checkpoint-check. Decks 317593e is also already an ancestor. The explicit merge returns Already up to date; decks-merge-check repeats npm run check successfully. Creative 4b69fe0 remains to merge. WIP heads from other workers are excluded until a fresh report identifies a verified pushed head.

## Editor dispatch and key priority

Accepted the deck double-click/modal requests and object native-control/grid/nested-Escape requests. Board Enter runs in capture; editor keys and Escape run after local handlers. Real modal controls retain keyboard ownership. Double-click resolves the actual scene hit target and still honours the editor flush gate. Native buttons, links, editable content and grid cells retain Enter.

Production editor-keys: office 13/13 and deck-studio 989/989 pass. Deck advances through double-click to its separate Open context-menu label at :180, 245 passing assertions. Editors passes sheet workflows then fails shared width at :94, 25 pass/1 fail. Strict React TypeScript, changed-file lint and whitespace checks pass.

Creative report head 4b69fe0 merged as 502bd5d; creative-merge-check passes the full gate.

## Editor shell and camera return

Accepted the shared inset, transform, presence and title-subscription requests. Open editors remove the fixed-popup containing transform; presence updates before paint; title updates subscribe only to card content. The original document width checks now pass. Editors reaches maths at :140 and design-system reaches Text colour at :123, both document-owned selectors.

Camera diagnostics retained in return-diagnostic and return-diagnostic-focus prove two independent failures: background Escape queued an empty scene selection after bookmark restoration; WebKit closed before the scene refreshed its resized viewport. Background editor Escape now claims that key before scene selection commands. The return participant recomputes its target after scheduled viewport reads, then returns focus only after completion. A real wheel cancels the return even over interactive content. No frame enters React state.

The unchanged production editor-return suite now passes 141/141 assertions across Chromium and WebKit, including resize, wheel interruption, reduced motion, source deletion and board replacement. Strict types, changed-file lint and whitespace pass.

## Shared controls, hidden rails and capture

Accepted hidden-rail hit targets, native Enter ownership, shared button CSS, dropdown pointer focus and finite placement declaration, readonly-menu boundary, real Open availability and text-size defaults. Media tools retain their real actions in a Media group. Plain Cmd+K excludes Shift, leaving capture's own handler in charge. Rail reveal now has sufficient selector specificity and selected cards keep keyboard-discovered chrome available.

Capture opens the actual Unsorted ancestors, temporarily folds competing panels without persisting that fold, gives the full captured batch space and restores the layout when confirmation ends. The tray boundary accepts legacy entries without canvas presentation defaults and validates the completed canonical card. A new real-workspace regression proves old saved entries render and release without rewriting their saved form. Strict React types, changed-file lint and the regression pass.

Production reveal-capture-final passes the complete original idle/reveal/keyboard/reduced-motion chrome section, then stops at chrome.mjs:84's obsolete document-shell selector. Capture-prefs passes 39 assertions, including all four mixed captures, visible count, minimum height, focus and unchanged saved Windows fold in both browsers; it stops at Put on board, trust-undo.mjs:120. The active object owner still reparses every older tray entry as a full card in putCaptured; a precise decoder-reuse patch is in inbox/integration-r3-capture-tray.patch. Orb-capture advances through the real capture/agent workflow to scene-owned result glow at :99. Agent-edges advances to its chooser recovery at :222. Data-trust stops on owned data row fidelity at :54.

The first control attempt was stopped after a hook-order mistake. Its failed evidence is retained; the final implementation passes strict checks and has no browser exceptions in the scoped runs.

## Crop, device controls and nested colour focus

Applied the current complete crop-controls proposal, superseding the separate stepper and tab-order diffs. Unfocused fields display current geometry, consecutive arrow changes use the current crop, pointer steppers retain input focus, and WebKit has the legacy explicit tab stops. Nested media cancellation stops at its own dialogue. Media and Settings devices use the existing controlled ValuePicker; colour controls report real HSV values and retain pointer opener focus.

The complete original production crop-a11y suite passes 1770/1770 across all eight browser/width/theme fixtures. Strict React types, targeted lint and whitespace pass. Controls-polish gets past nested colour dismissal and reaches later shared sidebar control sizing; Fit-finish reaches document header text sizing. Further composition/facade changes are deliberately a separate unit while a WebKit live-update issue is investigated.
