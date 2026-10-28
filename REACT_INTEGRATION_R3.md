# React integration round 3

Status: round 3 integration and evidence handoff complete. React parity remains incomplete.

Branch: codex/react-port. Tested source: fd10e98be60e27f58ce0807d1ef81c74ec9e68d6. Worktree: /tmp/aegis-wt/react/integration. No PR was requested or opened. Every code unit and merge was committed and pushed. The final publication commit changes this report only.

## Final results

| Implementation | Passing suites | Passing / invoked assertion calls | Failed calls |
| --- | --- | --- | --- |
| legacy | 44 / 44 | 19,612 / 19,614 | 2 |
| react | 19 / 44 | 13,400 / 13,419 | 19 |

Both complete matrices ran at the same clean committed source. Coverage is the original declared Chromium/WebKit matrix, and a failing suite can stop before its later browser fixtures. Counts are actual assertion calls. Each semantic-zoom run intentionally catches two negative geometry assertions; these account for both failed calls in the fully passing legacy matrix. Timeouts can fail a suite without invoking a failing assert. The two helper modules are covered through parents, not counted as extra passing suites.

The full root npm run check passes: 262 unit tests, 242 host tests, strict root/React/host types, lint, dependencies and import ownership. The safe-type ratchet is unchanged at 24 legacy findings. Svelte has zero errors and seven existing warnings. Evidence: context-final-check and chrome-ancestry-check.

The final normal build ran with AEGIS_UI_IMPL and AEGIS_TEST_FACADE unset. Its aegis-build.json records implementation legacy and facade false. None of the eight explicit browser test-entry outputs exists. Legacy remains the default. This is local build and browser evidence; native 120 Hz and deployment are unverified.

## Reported heads integrated

| Slice | Reported head | Integration outcome |
| --- | --- | --- |
| agents | 541477b | Already inherited at checkpoint |
| chrome | b38eae7 | Exact report head merged as fd10e98; no source-tree change |
| decks | 317593e | Already inherited; explicit merge and full root check repeated |
| creative | 4b69fe0 | Merged as 502bd5d |
| data | 96609c4 | Merged as c8d45af |
| documents | f8b6f85 | Merged as 4af4d43 |
| objects | 68b6064 | Merged as 345f371 |
| scene | eab41a5 | Merged as b237abb |
| host | e4048f9 | Verified no-change report; head already inherited |
| legacy-green | 5084cd0 | Merged as dd3cd45 |

All ten heads are verified ancestors in final-source-audit.json. Every actual merge received the full root gate and was pushed. The final legacy merge follows its owner's two consecutive 44/44 runs at the same reported head, then integration's own final 44/44 run.

The ancestry audit corrected an earlier reporting mistake: Chrome's authored changes were inherited, but b38eae7 itself was not yet an ancestor. Its exact merge changed no source code. The partial r3-final-react run was cancelled and excluded; both authoritative matrices were restarted at fd10e98. The older r3-full-react result is historical evidence only. No targeted pass replaces a failure in the final matrix.

## Request rulings and remaining work

Every open request has a one-line ruling in /Users/avi/.codex/orchestrate/aegis-react/integration-log.md. Accepted integration changes include real double-click/Enter editor dispatch; native key and Escape ownership; camera, selection and focus return; available-area editor fitting; hidden-rail discovery; Shift+Cmd+K capture and preference restoration; the real fetch-SSE race observer; first-minute flush/disposal; shared controls, typography, device and colour pickers; document/reference composition; pointer and crop ownership; canonical chart/preview decoding; notifications; guarded synchronous board replacement; scoped deletion Undo; typed nested-canvas creation; one-shot deck placement; and discrete wireframe carry policies. The unit evidence below records actual checks and limitations.

Open belongs to registered full editors. Inline notes retain Edit, which focuses the actual contenteditable. The added focus assertion preserves all 47 original context-related assertion calls and their arguments. Original expectations and timeouts remain intact.

CreativeConnections stays unmounted under inbox/integration-connection-contract.md because it rebuilds all-link SVG hit paths during busy camera frames. The creative follow-up requires bounded cached picking and selected-link controls before an exact mount proposal. Snapping, guides and atomic wireframe parenting remain scene work. Explicit asynchronous sandbox snapshot acknowledgement remains an object/protocol follow-up; current synchronous state tests do not prove it.

Important remaining failures:

- WebKit first-update delivery: editor-return stops at :54 and deck-studio at :96. Diagnostics show a committed host update and an unchanged UI revision; a common cause is plausible but unproven. No-store and stream-identity experiments failed and were removed.
- Editor selection return: the final editor-context run fails at :65, called by the Chromium source-alone scenario at :400. The camera is exact, but contextdoc selection becomes empty after closing. Earlier 1037-assertion passes are retained as history, not substituted for this final failure.
- Selected-card culling: WebKit data-trust stops at :109. Its visible and saved text size is 25, but the selected title body is absent. A bounded active-formatting visibility policy is still required.
- Other original feature/control failures remain in the ledger below, including connection inspection, focus mode, nested Canvas UI, hidden Settings discovery, reference recovery, typography, icon creation and agent motion/cues.

The proposed facade glide-completion rewrite was discarded: engine.busy already includes queued input, and that rewrite did not repair overview's painted-route failure. No adaptive zoom, test/gate weakening, fake adapter, real-data operation, default switch, force-push or PR was introduced. Main PRODUCT.md and .scratch remain present and untouched by this work. Three unrelated pre-existing stashes are retained. The reconciled integration draft was exported before its own stash was removed.

## Fresh follow-up briefs

- /Users/avi/.codex/orchestrate/aegis-react/briefs/fix-agents-r2.md: agents, agent-motion, agent-edges.
- /Users/avi/.codex/orchestrate/aegis-react/briefs/fix-chrome-r2.md: canvas, library, imports, parity, polish, design-system, canvas-chrome, first-minute.
- /Users/avi/.codex/orchestrate/aegis-react/briefs/fix-creative-r2.md: draw, media, wireframe.
- /Users/avi/.codex/orchestrate/aegis-react/briefs/fix-documents-r2.md: editor-context, fit-finish, spatial-interaction, spatial-memory.
- /Users/avi/.codex/orchestrate/aegis-react/briefs/fix-objects-r2.md: editing.
- /Users/avi/.codex/orchestrate/aegis-react/briefs/fix-replication-r2.md: editor-return, deck-studio.
- /Users/avi/.codex/orchestrate/aegis-react/briefs/fix-scene-r2.md: pan, orb-capture, data-trust, overview-model.

The seven published briefs assign all 25 failing suites exactly once, with 33 validated helper/action and scenario source locations. Previous briefs are backed up under evidence/integration-r3/briefs-before-r3. Contracts are updated to v3. publication-audit.json verifies the published files against the audited drafts and official ledger.

## Authoritative ledger snapshot

| Suite | Legacy | React | Owner | Passing / invoked calls (legacy; React) | First React failure |
| --- | --- | --- | --- | --- | --- |
| canvas | PASS | FAIL | chrome | 196/196 (0 failed calls); 15/16 (1 failed calls) | checks/ui/canvas.mjs:26 (scenario checks/ui/canvas.mjs:101) |
| library | PASS | FAIL | chrome | 202/202 (0 failed calls); 91/91 (0 failed calls) | checks/ui/library.mjs:38 (scenario checks/ui/library.mjs:208) |
| docs | PASS | PASS | documents | 122/122 (0 failed calls); 122/122 (0 failed calls) | None |
| editors | PASS | PASS | documents | 51/51 (0 failed calls); 51/51 (0 failed calls) | None |
| deck | PASS | PASS | decks | 257/257 (0 failed calls); 257/257 (0 failed calls) | None |
| draw | PASS | FAIL | creative | 127/127 (0 failed calls); 5/5 (0 failed calls) | checks/ui/draw.mjs:114 |
| media | PASS | FAIL | creative | 66/66 (0 failed calls); 63/63 (0 failed calls) | checks/ui/media.mjs:327 |
| imports | PASS | FAIL | chrome | 143/143 (0 failed calls); 112/113 (1 failed calls) | checks/ui/imports.mjs:185 |
| wireframe | PASS | FAIL | creative | 129/129 (0 failed calls); 16/17 (1 failed calls) | checks/ui/wireframe.mjs:79 |
| editing | PASS | FAIL | objects | 147/147 (0 failed calls); 11/12 (1 failed calls) | checks/ui/editing.mjs:60 |
| svelte | PASS | PASS | objects | 15/15 (0 failed calls); 15/15 (0 failed calls) | None |
| genui | PASS | PASS | objects | 652/652 (0 failed calls); 652/652 (0 failed calls) | None |
| parity | PASS | FAIL | chrome | 47/47 (0 failed calls); 5/5 (0 failed calls) | checks/ui/parity.mjs:47 |
| agent-types | PASS | PASS | agents | 18/18 (0 failed calls); 18/18 (0 failed calls) | None |
| agents | PASS | FAIL | agents | 121/121 (0 failed calls); 41/41 (0 failed calls) | checks/ui/agents.mjs:151 |
| agent-motion | PASS | FAIL | agents | 163/163 (0 failed calls); 9/10 (1 failed calls) | checks/ui/agent-motion.mjs:106 |
| polish | PASS | FAIL | chrome | 384/384 (0 failed calls); 10/10 (0 failed calls) | checks/ui/chrome.mjs:93 (scenario checks/ui/polish.mjs:50) |
| pan | PASS | FAIL | scene | 177/177 (0 failed calls); 167/168 (1 failed calls) | checks/ui/pan.mjs:50 (scenario checks/ui/pan.mjs:140) |
| agent-edges | PASS | FAIL | agents | 127/127 (0 failed calls); 83/84 (1 failed calls) | checks/ui/agent-edges.mjs:222 |
| agent-race | PASS | PASS | replication | 24/24 (0 failed calls); 24/24 (0 failed calls) | None |
| prod-composer | PASS | PASS | agents | 37/37 (0 failed calls); 37/37 (0 failed calls) | None |
| orb-capture | PASS | FAIL | scene | 87/87 (0 failed calls); 24/25 (1 failed calls) | checks/ui/orb-capture.mjs:12 (scenario checks/ui/orb-capture.mjs:99) |
| agent-drafts | PASS | PASS | agents | 17/17 (0 failed calls); 17/17 (0 failed calls) | None |
| ask-selection | PASS | PASS | agents | 10/10 (0 failed calls); 10/10 (0 failed calls) | None |
| office | PASS | PASS | data | 13/13 (0 failed calls); 13/13 (0 failed calls) | None |
| editor-return | PASS | FAIL | replication | 141/141 (0 failed calls); 71/71 (0 failed calls) | checks/ui/editor-return.mjs:54 |
| editor-context | PASS | FAIL | documents | 613/613 (0 failed calls); 515/516 (1 failed calls) | checks/ui/editor-context.mjs:65 (scenario checks/ui/editor-context.mjs:400) |
| chart-defaults | PASS | PASS | data | 105/105 (0 failed calls); 105/105 (0 failed calls) | None |
| deck-studio | PASS | FAIL | replication | 989/989 (0 failed calls); 248/248 (0 failed calls) | checks/ui/deck-studio.mjs:96 |
| data-import | PASS | PASS | data | 12/12 (0 failed calls); 12/12 (0 failed calls) | None |
| mcp | PASS | PASS | host | 27/27 (0 failed calls); 27/27 (0 failed calls) | None |
| design-system | PASS | FAIL | chrome | 288/288 (0 failed calls); 90/90 (0 failed calls) | checks/ui/design-system.mjs:127 |
| controls-polish | PASS | PASS | chrome | 514/514 (0 failed calls); 514/514 (0 failed calls) | None |
| fit-finish | PASS | FAIL | documents | 738/738 (0 failed calls); 163/164 (1 failed calls) | checks/ui/fit-finish.mjs:55 (scenario checks/ui/fit-finish.mjs:126) |
| canvas-chrome | PASS | FAIL | chrome | 361/361 (0 failed calls); 16/17 (1 failed calls) | checks/ui/canvas-chrome.mjs:88 |
| data-trust | PASS | FAIL | scene | 188/188 (0 failed calls); 219/219 (0 failed calls) | checks/ui/data-trust.mjs:109 |
| first-minute | PASS | FAIL | chrome | 130/130 (0 failed calls); 108/109 (1 failed calls) | checks/ui/first-minute.mjs:154 |
| semantic-zoom | PASS | PASS | scene | 1348/1350 (2 failed calls); 1348/1350 (2 failed calls) | None |
| overview-model | PASS | FAIL | scene | 6313/6313 (0 failed calls); 3619/3620 (1 failed calls) | checks/ui/overview-model.mjs:189 |
| evidence-fidelity | PASS | PASS | data | 2333/2333 (0 failed calls); 2333/2333 (0 failed calls) | None |
| spatial-interaction | PASS | FAIL | documents | 108/108 (0 failed calls); 97/100 (3 failed calls) | checks/ui/spatial-interaction.mjs:137 (scenario checks/ui/spatial-interaction.mjs:196) |
| spatial-memory | PASS | FAIL | documents | 242/242 (0 failed calls); 217/218 (1 failed calls) | checks/ui/spatial-memory.mjs:157 |
| trust-undo | PASS | PASS | replication | 60/60 (0 failed calls); 60/60 (0 failed calls) | None |
| crop-a11y | PASS | PASS | objects | 1770/1770 (0 failed calls); 1770/1770 (0 failed calls) | None |

Official ledger: /Users/avi/.codex/orchestrate/aegis-react/parity-ledger.tsv. It retains the original six-column schema: 44 suite rows and two VIA PARENTS helper rows. Helper calls are already included above.

## Reproduction and evidence

The complete evidence root is /Users/avi/.codex/orchestrate/aegis-react/evidence/integration-r3. Every suite directory retains command.json, run.log, source.diff and observed assertion events, plus any original screenshots/metrics. command.json records source SHA, clean/dirty state, isolated data/cache locations, implementation, command, exit, duration and actual call counts. Hosts and browser invocations used disposable AEGIS_DATA and AEGIS_VITE_CACHE within the assigned physical port block 4100-4119. No provider credential files or real app data were used.

Final commands:

- python3 /Users/avi/.codex/orchestrate/aegis-react/evidence/integration-r3/run.py chrome-ancestry-check legacy -- npm run check
- python3 /Users/avi/.codex/orchestrate/aegis-react/evidence/integration-r3/run.py r3-verified-react react
- python3 /Users/avi/.codex/orchestrate/aegis-react/evidence/integration-r3/run.py r3-verified-legacy legacy
- python3 /Users/avi/.codex/orchestrate/aegis-react/evidence/integration-r3/write-ledger.py r3-verified-react r3-verified-legacy
- python3 /Users/avi/.codex/orchestrate/aegis-react/evidence/integration-r3/write-briefs.py --publish
- npm --workspace @aegis/app run build, with both implementation/facade overrides unset, recorded in normal-default-build/command.json.

Machine-readable results: final-summary.json, final-evidence.json, final-source-audit.json, publication-audit.json and normal-default-build/command.json. Earlier failed experiments and partial runs are retained and excluded from final totals.

## Earlier verified units

The following is the historical unit record. Final results above take precedence over earlier targeted results.

Branch: codex/react-port. Worktree: /tmp/aegis-wt/react/integration.
Legacy remains the default. Evidence root: /Users/avi/.codex/orchestrate/aegis-react/evidence/integration-r3.

## Checkpoint review

Reviewed 0f3e614. Retain both changes: document waits observe the active document save label; the MCP import path opens the actual React file chooser. No assert call or expected value changed. The real production MCP suite passes 27 assertions, including imported PDF/PPTX content, handwritten document save, external edits, reload and zero page errors. The docs suite stops earlier at its hidden toolbar action, docs.mjs:42; this is a separate chrome hit-target defect.

Own npm ci passed. checkpoint-check passes the complete npm run check, including 250 unit tests, 242 host tests, strict types/lint/dependencies and the unchanged safe-type gate with 24 legacy findings. Svelte has zero errors and seven existing warnings.

## Incoming reports

The reported agents head 541477b and decks head 317593e are already ancestors of 0f3e614. The explicit decks merge returns Already up to date; decks-merge-check repeats npm run check successfully. Chrome's authored changes were present, but the final ancestry audit corrected the initial claim that b38eae7 was already an ancestor. The explicit merge of that exact reported head has no source-tree changes. Its verification is recorded in chrome-ancestry-check. Creative 4b69fe0 merged as 502bd5d. WIP heads from other workers are excluded until a fresh report identifies a verified pushed head.

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

## Immediate deletion with scoped Undo

Accepted immediate deletion, keyboard selection restoration and a five-second Undo notice. Keyboard Undo uses the deletion transaction only while it is still the latest state; otherwise normal history keeps ownership. The toast's scoped Undo retains the existing card/link merge so later unrelated edits survive. Two real-workspace regressions verify Undo/Redo selection and preservation of later edits. Strict app/root types and targeted lint pass.

Production data-trust completes all Chromium cases, including deletion/Undo, and advances to 219 passing assertions. It repeats the data owner's WebKit Text size polling timeout at :109. No wait or assertion has been relaxed.

## Nested-canvas service capability

Accepted the Chrome createChild request as a typed semantic HostClient operation. The existing host route receives boardParent and placement coordinates and decodes the resulting board. A real-host regression creates a nested board, reloads both boards, and verifies the persisted canvas link, position and parent relationship. Ten boundary/real-host tests, root and React strict types, targeted lint and whitespace pass. The missing Canvas UI/body/breadcrumb remains Chrome/basic work, not a no-op service placeholder.

## Deck placement and motion

The central deck action now arms the real one-shot scene placement tool instead of creating at the viewport centre. Preview and input stay in the scene scheduler; creation and editor opening occur after input. Keyboard entry and Motion off stay instant. OS reduced motion uses opacity-only pointer fade while the scene's camera preference still disables travel.

The complete production deck suite passes 257/257, including B click placement, keyboard/pointer opening, both motion settings, persistence and zero browser errors. Editors remains 51/51. Editor-return completes Chromium 71 assertions and still stops on WebKit's initial agent-update timeout at :54. Strict React types, targeted lint and whitespace pass.

## Discrete wireframe policies

Accepted the exact selectForDrag/expandDrag attachment proposal, retaining document-drop and camera callbacks. The policies run on gesture start and reuse the owned wireframe helpers. Original wireframe advances from five to 22 passing assertions, through group/frame carry, before its colour helper attempts to fill the real controlled picker button at :89/:29. No selector or assertion was changed in this unit. Snapping, guides and atomic drop parenting remain scene follow-ups.

The full CreativeConnections consumer remains deferred under the existing integration-connection-contract.md ruling: its participant rebuilds SVG hit paths for every link during busy camera frames. The requested bounded cached picker/selected-link consumer is feature work that must preserve the single scene scheduler. Link placement is already registered separately.

## Final legacy recovery and context actions

Merged the final reported legacy head 5084cd0 as dd3cd45 after its worker recorded two consecutive 44/44 runs at that exact head. Its final diff refreshes existing legacy mounts before publication and restores WebKit slide-picture containment. Integration's legacy-merge-check passes the full root gate: 262 unit tests, 242 host tests, strict types, lint and dependency checks, with the unchanged 24-finding safe-type ratchet. Svelte retains zero errors and seven warnings.

Context actions now follow the actual editing capability. Registered full editors offer Open; inline text offers Edit and focuses the real contenteditable. Unsupported cards no longer offer a no-op Open. The added focus check preserves every original assertion and expected value. The AST audit records all 47 original assertion calls unchanged, with one additional static assertion.

The Chrome check discovers the actual React document panel while retaining the legacy selector and all saved/source-furniture assertions. React design-system reaches 90 passing calls before the document Text colour control at :127 in both Chromium and WebKit. React polish reaches the quiet-source lifecycle at chrome.mjs:93; deck passes 257/257. Legacy design-system passes 288/288, including a separate WebKit run, and polish passes 384/384. The authoritative complete matrices are recorded above at a clean committed source.

The final context unit passes the complete root npm run check in context-final-check, including all 262 unit and 242 host tests, strict types, lint, dependencies and the unchanged safe-type gate. No original UI assertion was removed or relaxed.
