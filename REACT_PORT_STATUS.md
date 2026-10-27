# React port foundation status

Branch: codex/react-port. No PR. Legacy Svelte remains the default.

The original baseline and tooling commits are retained. The amended legacy-limit gate is implemented and pushed. Only the integration owner reduces scripts/safe-types-legacy.json. Deleting chart.ts reduced the manifest from 54 findings to 51. All new and ported source is clean.

## Verified domain and runtime unit

The shared domain and protocol are strict TypeScript with built public ESM exports. Production/test callers and native resources use them. The old board JS, shared chart model, sandbox/theme builders and document/link-preview implementations were removed after caller migration. Zod is the schema source, including agent JSON Schema export with unrepresentable values rejected.

The root uses one lockfile. A clean root npm ci is sufficient. UI snapshots copy the real workspace dependency layout rather than assuming a nested Vite install. Their original behaviour assertions remain. The controls-polish check now awaits the actual transition before its unchanged exact matrix assertion.

Verification evidence is in /Users/avi/.codex/orchestrate/aegis-react/evidence/step2:

- npm run check: dependency integrity, AST/import gate, strict source and package-consumer checking, Oxlint, unit tests, all 236 host tests and Svelte checking passed. The added malformed-reserved-prop fixture is included in check-final.log.
- All 44 legacy suites have passing integration results. The full run passed 43/44. controls-polish initially observed an unfinished animation by one millionth; its settlement fix passed the one-suite rerun. Both runs and ui-ledger.json remain available.
- The staged runtime launched outside the checkout with fresh data and outbound network denied, then created, saved and reloaded a note.
- A release Aegis.app built under /tmp/aegis-wt/react/native-build-target. Its actual bundled host/plugin passed MCP document save/readback with disposable data. No installed application was touched.

Native compilation used an isolated frontend output and external Tauri config so it could not race app/dist writes from the browser suites. This is host/runtime and native bundle proof, not a new 120 Hz measurement or deployment.

## Compatibility decisions

The actual flat Board/Card, op commands and existing file/wire layout are retained. Workspace and scene own their projections and indexes. The closed catalogue replaces mutable built-in registration; every original kind, size and guide remains.

Known presentation props now have explicit schema types. Malformed reserved values such as a string fixedHeight are rejected atomically, where legacy code accepted arbitrary JSON. This stricter invalid-input behaviour is documented and tested. The differential tests cover generated and real supported fixtures; they are not a claim of unrestricted equivalence on malformed metadata.

## React foundation verification

Scene and workspace worker branches are merged. React entry, note/title portal bodies, real-store test facade, implementation selector and explicit feature composition are implemented. The contracts in REACT_PORT_CONTRACTS.md are frozen and mirrored at /Users/avi/.codex/orchestrate/aegis-react/contracts.md.

The full check passes 169 unit tests and 236 host tests, with zero Svelte errors and seven existing warnings. Both development and built production React pass the focused browser proof: optimistic IDs, note/title bodies, camera save, pan/zoom, drag, growing text, measurement-aware Undo/Redo, reload and idle. Screenshots were opened and visually checked. The production selector now runs before HTML entry analysis, so it builds the actual React entry.

Standing order 18 supersedes adaptive zoom. Cards retain true geometry and content at every scale. Only more than 400 visible cards below zoom 0.4 use exact canvas rectangles. Summary packing/cluster algorithms were removed, and their tests now assert the user's static-geometry contract. final/synthesis.md, modules.md, migration.md and the historical types.ts sketch explicitly identify the implemented contracts and these deviations.

The React 5,000-note wheel replay in headless Chromium 148.0.7778.96 at 1440x900, DPR 1, recorded 241 scene frames. Positive frame intervals: p50 8.3 ms, p95 9.0 ms, maximum 16.734 ms. Callback CPU: p50 0.7 ms, p95 1.7 ms, maximum 2.0 ms. The supplied main intervals were 9.3 / 21.3 / 13,800 ms; untouched foundation intervals were 8.7 / 33.5 / 13,318.8 ms. Raw samples and histograms are in evidence/react/artifacts/react-benchmark.json. This is a development build and headless timing, not native 120 Hz proof.

The unchanged canvas/pan suites against both implementations remain the next acceptance gate. They also exercise later feature UIs that this foundation brief forbids porting. No assertion will be skipped to conceal a missing feature. The final verdict will be recorded after that gate.
