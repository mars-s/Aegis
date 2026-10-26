# React port baseline

Untouched base: `971d0380b4e9ecd9f1454fa19d7a3c74e4c51d05`. Branch: `codex/react-port`.

The source diff was empty after all runs. Each workspace installed its own dependencies with `npm ci --no-audit --no-fund`. All commands used `AEGIS_PORT_OFFSET=4100`, temporary `AEGIS_DATA` and `AEGIS_VITE_CACHE`, and the Playwright module supplied in the standing orders. No native application or real app data was used.

| Command | Result | Duration |
| --- | --- | --- |
| `node --test agent/checks/*.test.mjs` | 236 passed, 0 failed | 2.951 s |
| `node checks/ui/run.mjs` | 44 suites passed, 0 failed | 1129.585 s |
| `node checks/ui/bench.mjs` | 5,000 notes, 240 intervals | 21.236 s |

Fresh benchmark: p50 8.7 ms, p95 33.5 ms, maximum 13318.8 ms. The supplied main reference was p50 9.3 ms, p95 21.3 ms and maximum 13.8 s. The fresh run uses headless Chromium and CDP sampling. These are frame intervals. The old runner does not measure an engine callback CPU histogram or establish 120 Hz presentation.

The largest sampled costs were `spatialLayout` at 9,416 ms and its `overlaps` helper at 3,064 ms. Sampling is diagnostic evidence, not an exact callback CPU measurement.

Machine-readable results are in `react-port-baseline.json`. Complete logs, per-test host durations, screenshots, dependency versions and machine details are in `/Users/avi/.codex/orchestrate/aegis-react/evidence/baseline`. Those files contain synthetic check output.

## UI suite results

Durations are the existing runner's rounded seconds. Assertions and suite exit behaviour were unchanged.

| Suite | Result | Seconds |
| --- | --- | --- |
| canvas | pass | 25 |
| library | pass | 27 |
| docs | pass | 26 |
| editors | pass | 7 |
| deck | pass | 8 |
| draw | pass | 20 |
| media | pass | 30 |
| imports | pass | 12 |
| wireframe | pass | 23 |
| editing | pass | 55 |
| svelte | pass | 5 |
| genui | pass | 102 |
| parity | pass | 9 |
| agent-types | pass | 8 |
| agents | pass | 43 |
| agent-motion | pass | 21 |
| polish | pass | 63 |
| pan | pass | 30 |
| agent-edges | pass | 17 |
| agent-race | pass | 4 |
| prod-composer | pass | 12 |
| orb-capture | pass | 22 |
| agent-drafts | pass | 11 |
| ask-selection | pass | 4 |
| office | pass | 5 |
| editor-return | pass | 30 |
| editor-context | pass | 65 |
| chart-defaults | pass | 11 |
| deck-studio | pass | 23 |
| data-import | pass | 3 |
| mcp | pass | 4 |
| design-system | pass | 63 |
| controls-polish | pass | 40 |
| fit-finish | pass | 42 |
| canvas-chrome | pass | 14 |
| data-trust | pass | 24 |
| first-minute | pass | 14 |
| semantic-zoom | pass | 12 |
| overview-model | pass | 37 |
| evidence-fidelity | pass | 67 |
| spatial-interaction | pass | 20 |
| spatial-memory | pass | 56 |
| trust-undo | pass | 8 |
| crop-a11y | pass | 11 |
