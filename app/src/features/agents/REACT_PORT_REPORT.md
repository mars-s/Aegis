# Wave 3 agent and shell handoff

Status: partial, blocked on shared integration. Branch codex/react-agents, based on origin/codex/react-port at 1cffeda. No PR requested. The final pushed SHA is recorded in the external report under /Users/avi/.codex/orchestrate/aegis-react/evidence/agents/report.md.

The React implementation is exported from react.tsx. AgentShell owns the board lifetime, composer, activity, Settings, onboarding and first-minute actions. It consumes semantic service interfaces and a scheduler adapter. It does not mount itself, change composition, access private replication, or start a scene animation loop.

Implemented in the assigned folders:

- Morphing orb, keyboard composer, conversation Markdown, provider-grouped model and status-model choices, all counts 1 through 8, pinned selection context, follow-ups, Stop, scoped request Undo and compact history disclosures.
- Fixed-size agent windows, persistent positions/collapse/close, pointer dragging, collision placement including rotated cards, edge targets with a crowded chooser, distant identity, drafts and result framing. Geometry uses read/write callbacks on the existing scene scheduler. Dedicated agent hosts remain stable and do not reparent editors or reuse scene card leases. No heavy card/editor body was added by this slice.
- General/Board/account/MCP/about Settings, persisted preferences and media-device choices. Toolbar, Panels and Appearance are explicit integration slots. Real OAuth and physical media permissions were not exercised.
- First-minute actions with a real weekly request, a real document command and a board-captured CSV import callback. The actual editor and importer remain with their owners. Native-dialog onboarding and shortcut reference, modal-gated first-use hint, mobile sheet with supplied views, and typed touch navigation.
- Static-zoom guidance only in overview. No adaptive React overview, summary renderer, repacking or return control was introduced.

Nothing outside the six assigned production folders was changed. The main checkout's PRODUCT.md and scratch files were untouched. No real data, provider credential files, installed application or shared branch was changed. No subagents were spawned.

## Verification

`npm ci --no-audit --no-fund` and `npm run build:shared` completed in this worktree.

`npm run check` passed: the existing 169 unit tests, all 236 host checks, strict shared/app checks, lint, and Svelte checking with zero errors and seven existing warnings. The safe-type manifest remains at its existing 51 findings; new files have zero findings and no allowances were added.

`npx tsc --noEmit -p app/src/features/agents/tsconfig.json` checks every new owned TS/TSX file. It passed. Explicit Oxlint over all new owned source passed. The own config is necessary because the frozen React root config has no feature include and the legacy checker does not parse JSX imports from .ts entries. The React entries use .tsx rather than changing that shared configuration.

`npx vitest run --config app/src/features/agents/vitest.config.ts` passed 9 tests. Temporarily disabling revision rejection made the delayed-GET test fail, and the source was restored. The fractional-width test caught and fixed the floating-point edge case before release.

All 15 owned unchanged legacy suites passed via direct `node checks/ui/<suite>.mjs` runs, with fresh data/cache and offset 4560. This proves compatibility with the still-default legacy source in this branch. It does not claim that the unmerged static-zoom legacy implementation was tested here.

The external fixture mounts the actual exported React components on the real foundation workspace and engine, using the actual local fake-model host. It injects the requested scene read/write hooks in memory. It is additional component/integration proof, not production composition or full-suite acceptance:

- Development and built production smoke passed in Chromium and WebKit: composer geometry, Escape/draft focus, notes, Markdown/XSS, fixed agent size at 5%, 30%, 50%, 75%, 100% and 200%, models, MCP Settings, phone width and reduced motion.
- Extended checks passed in both engines: selection context payload, pinned marks, scoped Undo preserving unrelated work, streamed drafts saving nothing, Stop clearing drafts, edge recovery, real onboarding note.
- Built first-use and full three-step guide passed in both engines. A modal blocks Ask and hint expiry; discovery persists; the real request creates nine scripted result windows and keeps the original thought.
- Chromium Profiler recorded zero agent-tree commits across 30 steady camera frames. Real CDP touch input panned 60px/40px and preserved the world anchor through a two-finger zoom from 1 to 2.
- Impeccable's detector returned no findings. Paired Chromium screenshots at 1440x900 were opened and inspected. The dark composer surface, send affordance and options icon match the incumbent. Agent status and hints have a 12px floor; the newer Settings groups media choices with General. The remaining global canvas/chrome tone belongs to integration.

No native React presentation, native 120 Hz, high-density agent-stream benchmark, real provider sign-in or physical camera/microphone proof is claimed.

## Suite ledger

These are static assertion call-site counts, before/after in the unchanged checkout, not the number executed inside loops. The static-reference column is e88fe1c. Orb-capture additionally has 39 check-wrapper call sites; its own runtime assertion count remains in its full log. All source test files remain unchanged.

| Suite | Assertions before / after | Static reference | Legacy | Unwired React audit |
| --- | --- | --- | --- | --- |
| agents | 105 / 105 | 105 | PASS | FAIL |
| agent-motion | 59 / 59 | 55 | PASS | FAIL |
| polish | 79 / 79 | 79 | PASS | FAIL |
| agent-edges | 28 / 28 | 30 | PASS | FAIL |
| prod-composer | 4 / 4 | 4 | PASS | FAIL |
| orb-capture | 2 / 2 | 2 | PASS | FAIL |
| agent-drafts | 17 / 17 | 17 | PASS | FAIL |
| ask-selection | 10 / 10 | 10 | PASS | FAIL |
| first-minute | 42 / 42 | 43 | PASS | FAIL |
| semantic-zoom | 45 / 45 | 33 | PASS | FAIL |
| overview-model | 67 / 67 | 45 | PASS | FAIL |
| spatial-interaction | 37 / 37 | 39 | PASS | FAIL |
| spatial-memory | 25 / 25 | 24 | PASS | TIMEOUT |
| agent-race | 14 / 14 | 14 | PASS | FAIL |
| trust-undo | 24 / 24 | 24 | PASS | FAIL |

The React audit is 0/15 complete suite passes. Most stop at absent production agent/composer/empty-state mounting. The four rewritten static suites were loaded verbatim from e88fe1c, including static-geometry.mjs, with an external Node loader. They stop at missing facade or other-slice functions. Spatial-memory exceeded an external 100-second limit after repeated missing-view failures. No assertion was removed, skipped, softened or replaced by a stand-in UI.

Exact first failures include agents.mjs:45, agent-motion.mjs:58, polish.mjs:49, agent-edges.mjs:52, prod-composer.mjs:44, orb-capture.mjs:32, agent-drafts.mjs:33, ask-selection.mjs:27, first-minute.mjs:45, rewritten semantic-zoom.mjs:37, rewritten overview-model.mjs:127, rewritten spatial-interaction.mjs:64, agent-race.mjs:50 and trust-undo.mjs:159. See the raw logs for stacks and individual browser results. Shared chrome/editor/generated/import assertions are still required after mounting; they were not stubbed.

## Integration and deletion

The concrete API requests and exact proposed diffs are in the external contract-requests.md and requested-*.patch files. Required work is App/composition mounting, the semantic host-client services, read/write scheduler registration, fixed-screen agent bounds in general Fit, transient agent lines/glow, Follow placement and focus return in chrome, real settings slots/CSV/editor implementations, and faithful React test-facade/selector ports. The foundation must also stop emitting semantic-tier DOM attributes for the static helper.

Legacy files deleted: none. They are still imported by the default controller, and deleting them here would break the verified legacy UI. Their retirement and manifest removal must happen together with integration. Only the integration owner may edit the safe-type manifest. This is an explicit acceptance gap, not a completed migration or a waiver of deletion.

## Evidence

Everything below is under /Users/avi/.codex/orchestrate/aegis-react/evidence/agents/:

- check-release.log, types-release.log, lint-release.log, unit-release.log, unit-mutation.log/json, design-detector.json.
- legacy-suite-results.json, legacy-suite-logs/, react-suite-results.json, react-suite-logs/, suite-ledger.tsv, assertion-counts-before.json and assertion-counts-final.json.
- fixture.config.mjs, build.config.mjs, fixture.tsx, components-fixture.tsx, fixture-build-release.log, react-built/ and the fake-host logs. These are test-only adapters, not shipped production transport.
- smoke-shell.log, smoke-built-release.log, extended-shell.log, hint-onboarding.log, schedule-touch-r2.log/json.
- pair-legacy-idle.png and pair-react-idle.png; pair-legacy-composer.png and pair-react-composer.png; pair-legacy-settings.png and pair-react-settings.png; pair-legacy-desktop.png and pair-react-desktop.png; pair-metadata.json.
- react-built-<engine>-phone.png, react-built-<engine>-first-hint.png, react-built-<engine>-onboarding.png, react-<engine>-selection.png and react-<engine>-drafts.png.

Initial failures remain in the evidence. They include external fixture module resolution/HMR issues, the composer focus bug, fixed-width placement arithmetic, the initial ID-receipt/snapshot mismatch, and the first Profiler attempt while another fake request was completing. Later named release logs identify the passing results.
