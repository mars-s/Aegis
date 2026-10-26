# React port foundation status

Status: blocked at foundation step 1. Branch: `codex/react-port`. No PR.

Step 0 passed and was committed separately as `b635afe`. See `REACT_PORT_BASELINE.md` for all 44 suite results, the 236 host checks and the fresh 5,000-note benchmark.

Step 1 adds root npm workspaces, one lockfile, local nested dependency installs, TypeScript 7.0.2, Oxlint 1.89.0, Vitest 5.0.5, Oxc 0.95.0, strict compiler defaults and React 19.3.1 dependencies. The package folders contain metadata and ownership READMEs only. They have no production exports. The legacy Svelte checker retains its existing TypeScript 5.9.3 dependency during this partial migration. React Compiler is not enabled.

The Oxc gate scans all tracked and unignored authored TS, TSX, MTS and CTS files, including declaration shims. It rejects explicit any, casts other than as const, non-null and definite assignment assertions, compiler suppression directives, invalid syntax, forbidden package dependencies, private and cross-owner imports, unchecked dynamic imports and extra scene frame owners. Negative fixtures live as strings in the gate test, so invalid source is never accepted by the production gate. No legacy exclusion or boundary-cast exception was added.

## Verified work

| Command | Result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passed from the single root lockfile, 371 packages installed |
| `npm ls --workspaces --depth=0` | Passed |
| `npm run check:types` | Passed with TypeScript 7.0.2 |
| `npm run check:lint` | Passed |
| `npm run check:unit` | 58 passed |
| `node --test agent/checks/*.test.mjs` | 236 passed, matching baseline |
| `npm --workspace @aegis/app run check` | Passed with the existing legacy checker |
| `npm --workspace @aegis/app run build` | Passed, frontend build only |
| `npm run check` | Failed at the gate with 54 pre-existing findings |

The full legacy UI matrix passed on the untouched base. It was not repeated after the root dependency installation. No domain code was ported, so this is not the post-domain parity result requested for step 2.

## Blocker

The brief requires each step to be verified before the next. The design requires the gate to scan authored TypeScript throughout the repository. The base has 50 unsafe syntax constructs, including the controller's whole-file suppression, plus four Node imports in a build-only PDF helper stored under app/src. These cannot pass the new gate unchanged. They overlap the later domain, entry-point, chart, document and creative slices.

Fixing this requires a coordinated change to the wave order or ownership so those sources can be migrated or the build helper can be moved before step 1 becomes green. Skipping files, changing their extensions to evade the gate or permitting their unsafe constructs would weaken the requirement. The gate remains strict and npm run check remains visibly red. Following the brief's stop rule, steps 2 to 5 were not started.

| Existing source | Findings |
| --- | --- |
| `app/src/controller.ts` | 1 |
| `app/src/features/docs/index.ts` | 2 |
| `app/src/features/imports/pdf-resources.ts` | 4 |
| `app/src/features/registry.ts` | 2 |
| `app/src/lib/host.ts` | 6 |
| `app/src/lib/native-files.ts` | 4 |
| `app/src/main.ts` | 1 |
| `app/src/objects/chart/chart.ts` | 3 |
| `app/src/objects/chart/geometry.ts` | 19 |
| `app/src/objects/chart/plan.ts` | 6 |
| `app/src/objects/kinds/diagram.ts` | 5 |
| `app/src/objects/kinds/inline.ts` | 1 |

Exact findings and source locations are in `react-port-gate-blocker.json`. Complete verification output is in `/Users/avi/.codex/orchestrate/aegis-react/evidence/step1`.

## Remaining work and limits

Domain and protocol implementations, differential fidelity tests, removal of legacy domain JS, runtime staging, React entry and store, Effect host-client, scene engine, native connection proof and React canvas/pan checks are pending. No React benchmark was run. contracts.md was not created because there are no verified interfaces to freeze. Feature workers must wait for those contracts. No final design files were changed.

The supplied main benchmark was p50 9.3 ms, p95 21.3 ms and maximum 13.8 s. The fresh untouched-base run was p50 8.7 ms, p95 33.5 ms and maximum 13,318.8 ms. The old runner uses headless Chromium with CPU sampling and does not provide callback CPU histograms or native display-pacing proof.
