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

## Fresh reported branches

Merged data 96609c4 as c8d45af, documents f8b6f85 as 4af4d43, objects 68b6064 as 345f371, and scene eab41a5 as b237abb. Each complete npm run check passes and each unit was pushed. Documents merge resolves the shared editor check by keeping the data owner's first mounted column-A cell and the real Open label. Its check began during conflict resolution, so its metadata is retained as transitional evidence and a clean-head final gate is still required. Host reports no code change and verified e4048f9, already inherited.

The experimental no-store and stream-identity transport changes both failed the original WebKit fixture and were discarded. They are absent from the branch. Their failed evidence remains under integration-r3, without a recovery claim.

## Document and reference composition

Applied the current document integration and Chrome proposals, adapting the scene seam to retain the reported navigation callback and SceneTool. Card copy uses the real document resolver through the single scene scheduler and preserves source positions. All registered editors receive the existing references component. Available-area changes refit only until manual navigation; returned focus retains a real invoking control, with source-card fallback for stage/body programmatic opens. Shared Underline hints use the existing formatter and orb.

Production shared-editor-confirm docs passes 122/122. Shared-editor editors passes 51/51, editor-context passes 1037/1037 across Chromium and WebKit. The first document run used stale built scene exports and is excluded; the clean rebuilt repeat passes. Editor-return passes all Chromium 71 assertions, then retains the unrelated WebKit initial agent-update timeout at :54. This is not full return-suite parity. Overview advances to 3619 passing calls before :189's glide sample count. Spatial interaction advances to 89 passing calls, with legend/recovery/import-notice failures; spatial memory advances to 217, with Show references recovery missing in all fixtures. These remain genuine follow-ups.

## Object controls, capture and pointer ownership

Applied the final object scene/data proposals and the capture tray consumer fix. Ordinary drags retain their actual pointer target; tools and pan retain stage capture. Resting editable text drags, while an unmoved click focuses it and places the native caret at the clicked point before the next key. Hidden measurement requests are ignored, iframe blur clears stale hover ownership, and exposed window actions take pointer priority over agent edges. Chart content receives actual keyboard focus. Stamp resize keeps a square and the external resize target no longer covers a small icon.

Settings now uses real controlled pickers for note colour, model choices and grid shape, avoiding detached native-select React handlers. Cmd+K listens in capture, while Shift+Cmd+K remains capture-owned.

Generated UI passes the complete unchanged production suite, 652/652. Trust-undo passes 60/60 across both browsers, including all four mixed captures, Put on board, Undo and restored Windows preferences. Generated focus diagnostics identified retired shells retaining selected classes; retirement now clears identity decorations and the existing cleanup regression verifies one live selected card. The root browser suite additionally caught native caret placement after a resting click; the input adapter restores the actual point range rather than moving text or changing assertions.

Canvas advances through colour picker keyboard save/focus and menu motion, then stops at the font picker arrow choice at :101. Editing advances through real group drag to the missing Focus mode at :60. Pan advances past typing and Cmd+K to the agent header cursor at :140/:50. These remain slice-owned follow-ups.

## Derived chart and optional preview boundaries

Accepted the data chart JSON proposal and creative optional link metadata proposal. Bound charts omit the independent headline key instead of emitting undefined. Optional image and favicon strings default to empty strings; title and description remain required and invalid types still fail decoding. Four new boundary cases cover live/missing/saved chart sources and partial previews. The pre-fix JSON probe fails at the actual JSON boundary and the same probe passes after the fix.

All 55 domain tests pass. The pre-existing compatibility case still asserts that an old in-memory explicit undefined headline remains editable; its fixture now creates that legacy field explicitly, while the new cases prove new derived charts are valid JSON. Root and React strict types, targeted lint, safe types and whitespace pass. Production evidence-fidelity passes 2333/2333 and chart-defaults passes 105/105, both full declared engine matrices.

## Notifications and synchronous board replacement

The real import/error pipeline now renders a bounded 480px notification above editors, with the test facade calling that same pipeline. CSV imports report their actual filename after successful commit. Controls-polish passes 514/514 across both engines and themes. The spatial import-notice cases now pass, advancing that suite from 89 to 97 assertions; legend/recovery remain.

Accepted real controlled colour values, inherited title typography, 12px editor hints and the existing 32px sidebar button variables. Registered the existing Link placement tool. Media advances from 24 to 61 assertions, covering links, real recording/upload/playback, outgoing row disconnection and original-board save. Its next failure showed setBoard did not persist the selected board ID; the facade now mirrors real board opening after successful guarded replacement. The subsequent repeat stalled earlier in portrait recording and is not a green media claim.

The facade flushes React's actual board replacement synchronously while retaining schema validation and editor flush refusal. It does not substitute rows or workspace state. Strict React types, targeted lint and whitespace pass.

The original Effect host boundary test rejects an invalid-only preview reply. Full-default preview strings were too broad, so title and description stay required. The original boundary and all new partial-preview tests pass with this narrower contract.
