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

## Next integration unit

Scene 7fc4fc0 and workspace a032070 are verified on their worker branches. React entry, portal bodies, runner switch, focused browser proof, benchmark and composition contracts are drafted. Their integration, browser/performance results and final contracts remain pending at this checkpoint.

The supplied main benchmark was p50 9.3 ms, p95 21.3 ms, maximum 13.8 s. The untouched foundation baseline was p50 8.7 ms, p95 33.5 ms, maximum 13,318.8 ms. No React app benchmark is claimed at this checkpoint.
