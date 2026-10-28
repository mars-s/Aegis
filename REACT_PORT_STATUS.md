# Round 2 resume status

Resumed at 51018bd. All wave 3 branch heads are merged. The reviewed production test-entry unit is pushed as aef14ba. A clean npm ci and the full check pass with 236 unit tests, 242 host tests and 47 remaining legacy findings. Production React/legacy parity is in progress; React remains opt-in. Contract v2 and every slice-request ruling are recorded in REACT_PORT_CONTRACTS.md and REACT_PORT_R2_RULINGS.md. The external integration log retains exact evidence paths and historical failures.

The prior status below is historical, not the current merge state.

# React port integration status

Round 1 integration is complete on codex/react-port. The verified implementation is ed8399d5dc09612c612f0617f40a2f56cb0353cc. Legacy remains the default; React is opt-in while the remaining feature slices are unmerged.

Merged static zoom e88fe1c as 5c461f0, then the data slice 3a8daa1 as 7c7cd2d. Static zoom keeps real card geometry and content. Data cards and editors are registered with runtime assetUrl. Shared Enter, Open, close and width actions respect editor flush refusal. The facade restores setBoard and the optional created-IDs callback. HostClient.upload validates its response and supports cancellation; CSV/TSV drops use the actual data importer. Root checks now discover the data regressions and type/lint all data workers and editors.

npm run check passes: 180 unit tests, 236 host tests, strict types, lint, dependency integrity and the unchanged 51-finding legacy gate. Svelte reports zero errors and seven existing warnings. The full legacy UI invocation passes 43/44. An unchanged overview-model retry passes all eight browser/viewport/theme combinations, providing cumulative 44/44 passing coverage. The full-run failure at overview-model.mjs:182 is retained, with a scene-owner timing fix recorded in the integration log. Evidence-fidelity also passed a focused eight-combination run; the earlier WebKit tick overlap did not reproduce on the merged static branch. Real-card values, full document content and actual diagram topology replace the obsolete semantic assertions.

The production React app passes 12 composed-data checks per browser, including sheet conflict and IME refusal, save flushing, real CSV upload bytes and dataset source loading. Navigation passes 12 navigations and two returns per browser with saved content and no page errors. WebKit failed every navigation before the repair, and pagehide alone was too late. Host disposal now starts at beforeunload, with pagehide fallback and fresh lifetime on persisted pageshow. Both new cancellation regressions pass.

The standard React suites still stop on unmerged UI:

| Suite | Passing assertion invocations | First stop | Owner |
| --- | ---: | --- | --- |
| office | 7 | office.mjs:59, deck ribbon | Decks |
| chart-defaults | 32 | chart-defaults.mjs:57, deck chart, after six plot scales and smoothing save | Decks |
| data-import | 1 | data-import.mjs:29, model selector | Chrome/agents |
| evidence-fidelity | 1 | evidence-fidelity.mjs:48 called at 130, deck editor | Decks |

Counts include each build assertion. No behaviour assertion or wait was skipped. Later document-reference and object-topology sections also need their owners. The per-assertion table, full 44-suite table, merge conflicts, commands, retained failures, exact follow-up changes and final delivery head are in /Users/avi/.codex/orchestrate/aegis-react/integration-log.md and evidence/integration-r1/. No running slice branch was merged, no PR was requested, and no native or frame-rate claim is added by this round.

The foundation report below records the earlier checkpoint and its stop decision.

## Foundation report at 1cffeda

Status: blocked at the unchanged React canvas/pan acceptance gate in step 4. Verified foundation and frozen worker contracts are committed. Branch: codex/react-port. No PR. Legacy Svelte remains the default.

The original baseline and tooling commits are retained. The amended legacy-limit gate is implemented and pushed. Only the integration owner reduces scripts/safe-types-legacy.json. Deleting chart.ts reduced the manifest from 54 findings to 51. All new and ported source is clean.

### Verified domain and runtime unit

The shared domain and protocol are strict TypeScript with built public ESM exports. Production/test callers and native resources use them. The old board JS, shared chart model, sandbox/theme builders and document/link-preview implementations were removed after caller migration. Zod is the schema source, including agent JSON Schema export with unrepresentable values rejected.

The root uses one lockfile. A clean root npm ci is sufficient. UI snapshots copy the real workspace dependency layout rather than assuming a nested Vite install. Their original behaviour assertions remain. The controls-polish check now awaits the actual transition before its unchanged exact matrix assertion.

Verification evidence is in /Users/avi/.codex/orchestrate/aegis-react/evidence/step2:

- npm run check: dependency integrity, AST/import gate, strict source and package-consumer checking, Oxlint, unit tests, all 236 host tests and Svelte checking passed. The added malformed-reserved-prop fixture is included in check-final.log.
- All 44 legacy suites have passing integration results. The full run passed 43/44. controls-polish initially observed an unfinished animation by one millionth; its settlement fix passed the one-suite rerun. Both runs and ui-ledger.json remain available.
- The staged runtime launched outside the checkout with fresh data and outbound network denied, then created, saved and reloaded a note.
- A release Aegis.app built under /tmp/aegis-wt/react/native-build-target. Its actual bundled host/plugin passed MCP document save/readback with disposable data. No installed application was touched.

Native compilation used an isolated frontend output and external Tauri config so it could not race app/dist writes from the browser suites. This is host/runtime and native bundle proof, not a new 120 Hz measurement or deployment.

### Compatibility decisions

The actual flat Board/Card, op commands and existing file/wire layout are retained. Workspace and scene own their projections and indexes. The closed catalogue replaces mutable built-in registration; every original kind, size and guide remains.

Known presentation props now have explicit schema types. Malformed reserved values such as a string fixedHeight are rejected atomically, where legacy code accepted arbitrary JSON. This stricter invalid-input behaviour is documented and tested. The differential tests cover generated and real supported fixtures; they are not a claim of unrestricted equivalence on malformed metadata.

### React foundation verification

Scene and workspace worker branches are merged. React entry, note/title portal bodies, real-store test facade, implementation selector and explicit feature composition are implemented. The contracts in REACT_PORT_CONTRACTS.md are frozen and mirrored at /Users/avi/.codex/orchestrate/aegis-react/contracts.md.

The full check passes 169 unit tests and 236 host tests, with zero Svelte errors and seven existing warnings. Both development and built production React pass the focused browser proof: optimistic IDs, note/title bodies, camera save, pan/zoom, drag, growing text, measurement-aware Undo/Redo, reload and idle. Screenshots were opened and visually checked. The production selector now runs before HTML entry analysis, so it builds the actual React entry.

Standing order 18 supersedes adaptive zoom. Cards retain true geometry and content at every scale. Only more than 400 visible cards below zoom 0.4 use exact canvas rectangles. Summary packing/cluster algorithms were removed, and their tests now assert the user's static-geometry contract. final/synthesis.md, modules.md, migration.md and the historical types.ts sketch explicitly identify the implemented contracts and these deviations.

The React 5,000-note wheel replay in headless Chromium 148.0.7778.96 at 1440x900, DPR 1, recorded 241 scene frames. Positive frame intervals: p50 8.3 ms, p95 9.0 ms, maximum 16.734 ms. Callback CPU: p50 0.7 ms, p95 1.7 ms, maximum 2.0 ms. The supplied main intervals were 9.3 / 21.3 / 13,800 ms; untouched foundation intervals were 8.7 / 33.5 / 13,318.8 ms. Raw samples and histograms are in evidence/react/artifacts/react-benchmark.json. This is a development build and headless timing, not native 120 Hz proof.

The final unchanged canvas/pan run passed 2/2 on legacy and 0/2 on React at implementation commit dbed30e2bbddfea0bb84166b823982178089b1e7. React canvas fails at canvas.mjs:44 because #selectionBar and rotation chrome are absent. React pan fails at pan.mjs:48 because the Space-pan hit target reports cursor auto instead of grab. That cursor defect remains open; later assertions also need document/generated/group/agent and selection chrome that this brief forbids porting.

No canvas/pan assertion or selector was changed. Both logs and command records are preserved in evidence/legacy-final and evidence/react-final. The focused proof is not a substitute for these failing suites. Following the brief's explicit stop rule, no feature UI was added to conceal the gate failure. The branch does not meet all foundation acceptance criteria. Wave 3 workers can consume the frozen contracts, but React must remain opt-in until parity is complete.

Initial integration failures remain in evidence, including the note's repeated unchanged input events (fixed at the editor boundary), measurement/read-phase fixture alignment, strict compiler diagnostics, and the production HTML hook order (fixed to pre). The final passing checks are step3/check-release.log, react/vertical-static.log and react-production/vertical.log. Old failed logs have not been overwritten.

Open limits: 51 pre-existing ratchet findings remain for later owners; no native React presentation or 120 Hz calibration was performed; full feature editor sessions, continuous tools, obstacle routing and semantic host services are unfinished. The historical PNG export issue was not investigated in this foundation. The separate legacy static-zoom work was not merged here.
