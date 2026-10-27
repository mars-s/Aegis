# Host test TypeScript migration

Status: complete for the assigned test conversion. The full check passes with the host integration patch and test discovery patch applied locally. The committed branch still needs those integration-owned configuration changes before a clean checkout can use `npm run check`.

Branch: `codex/react-host-tests`.
Base: `bb7f647b1dfe5212c847a5d5711cf9ba5a05f3d8` from `origin/codex/react-host`.
The final pushed head SHA is recorded in the worker's final handoff.
Worktree: `/private/tmp/aegis-wt/react/host-tests`.
PR: none requested.

## Result

All 115 remaining JavaScript cases in 11 suites now live in strict TypeScript under `checks/host`. All 31 host test files are TypeScript. The old JavaScript implementations and the existing one-line test launchers are removed from `agent/checks`. No host `.test.mjs` file remains. The separate `genui-fixtures.mjs` compatibility fixture remains because it contains no cases and has integration-owned callers.

There are 242 cases before and after the conversion. All pass. Case names and test declarations match the base. No case loses an explicit assertion. The converted suites retain all 441 original assertion call sites and add seven narrowing assertions, for 448. Across the full host suite, assertion call sites increase from 1,061 to 1,068. Presence guards in `required` also assert at runtime and are additional to these explicit test-file call-site totals.

- `migration-cases.tsv` records all 242 before/after case names and implementation paths, including the 115 newly converted cases.
- `migration-assertions.tsv` records suite totals. `migration-audit.ts` also checks assertion counts inside each original test declaration, including declarations expanded by device and component loops.
- `migration-mutations.tsv` records three temporary faults and their expected failures. Every fault was removed, then all 242 host cases passed again.

The legacy frontend helpers are still the subjects of these tests. Fixture adapters under `legacy/` execute the same functions and validate their results with schemas. They preserve the original partial fixture inputs, including old deck cards with absent geometry and incomplete summary records. The drag adapter preserves object identity, so the original `includes` membership check remains meaningful. The document archive adapter binds JSZip methods to their actual objects. No frontend implementation was copied into the tests.

The preview fixture uses Node's real HTTP request and response streams over an in-memory socket. The DNS pin assertion, redirect host check and one-megabyte body limit remain. The recording fixture retains upload progress, delayed completion, exact returned asset URL, server failure and reconnect checks. Browser globals are restored through their original property descriptors.

The existing host fixture now inherits `AEGIS_PORT_OFFSET`, falling back to this worker's assigned 4600. Host processes bind port zero. Every runtime launch used disposable `AEGIS_DATA` and `AEGIS_VITE_CACHE` paths, offset 4600 and fake models. No real app data or provider credentials were used.

## Commands and evidence

All commands ran in this worktree.

| Command | Result | Evidence |
| --- | --- | --- |
| `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, then `npm ci --no-audit --no-fund` | Passed after the local integration patch | Own worktree dependencies, regenerated local lockfile |
| `npm run build:shared` | Passed | Built public package declarations and `agent/dist/main.js` |
| `AEGIS_DATA=$(mktemp -d) AEGIS_VITE_CACHE=$(mktemp -d) AEGIS_PORT_OFFSET=4600 node --test --test-reporter=tap agent/checks/*.test.mjs` | Baseline 242 passed, zero failed, skipped or cancelled | `/tmp/aegis-host-tests-before.tap` |
| `npx tsc -p checks/host/tsconfig.json` | Passed under strict, unchecked-index and exact-optional checking | `/tmp/aegis-host-tests-types.log` |
| `npx oxlint --deny-warnings checks/host checks/mcp` | Passed | `/tmp/aegis-host-tests-lint.log` |
| `npm run check:safe-types` | Passed with 51 existing findings elsewhere | `/tmp/aegis-host-tests-safe.log`, full check log |
| Direct `inspectRepository` filtered to `agent/checks`, `checks/host` and `checks/mcp` | Zero findings | Explicit local gate inspection, no manifest changes |
| `node --test --test-reporter=./checks/host/migration-reporter.ts` over baseline and converted files | Both 242 passed | `/tmp/aegis-host-tests-before.jsonl`, `/tmp/aegis-host-tests-after.jsonl` |
| `node checks/host/migration-audit.ts /tmp/aegis-host-tests-before.jsonl /tmp/aegis-host-tests-after.jsonl` | 242 to 242 cases, 115 converted; names and per-case assertion counts retained | Committed TSV files |
| Temporary wrong world coordinate, missing drag descendants and wrong upload URL | Detected by one, four and one failing cases respectively | `migration-mutations.tsv`, `/tmp/aegis-host-tests-mutation-*.tap` |
| Host reporter run after removing every temporary fault | 242 passed | `/tmp/aegis-host-tests-after.jsonl` |
| `AEGIS_DATA=$(mktemp -d) AEGIS_VITE_CACHE=$(mktemp -d) AEGIS_PORT_OFFSET=4600 npm run check` | Passed: 169 unit tests, 242 host tests, strict types, lint and dependency checks; Svelte zero errors and seven existing warnings | `/tmp/aegis-host-tests-full-check.log` |
| `git diff --check`, `git diff --cached --check` | Passed | Final staging review |

## Exact local integration changes

Applied `/Users/avi/.codex/orchestrate/aegis-react/evidence/host/integration-config.patch` exactly. It changes:

1. `agent/tsconfig.json` to build the host's `src` tree into `dist`.
2. `agent/package.json` to start the built host and declare `effect@4.0.6` and `undici-types@6.21.0`.
3. Root `package.json` to include the host type and lint checks.
4. `agent/link-preview.ts`, deleting the duplicate root implementation.
5. `scripts/stage-runtime.ts` to require the built host entry.

Regenerated `package-lock.json` locally with npm, then ran a clean `npm ci`.

Also applied the local equivalent of `integration-test-discovery.patch`, committed beside this report. It changes only the agent check command from `node --test checks/*.test.mjs` to `node --test ../checks/host/*.test.ts`. Apply this patch after the host integration patch. This is necessary because the brief requires zero `.test.mjs` files while manifests remain outside the worker's commit scope.

The first full check found the integration patch's deleted `agent/link-preview.ts` through Git's cached file inventory. The existing domain unit gate reads that inventory without filtering absent files. Staging just that local deletion removed the stale path from the inventory and allowed the unchanged gate to pass. This deletion and all other integration-owned changes were excluded from the final commit and restored after verification. A real integration commit deleting the duplicate does not have that inventory issue.

No manifest, lockfile, host implementation, gate, legacy-findings manifest or frontend source change is included in this branch.

## Deviations and remaining integration work

The only extra local configuration change beyond the supplied build patch is the required test discovery command. Its exact diff is provided for the integration owner. Removing the old launchers without that change would leave npm looking for files that no longer exist.

The tested configuration must therefore include both patches and a regenerated lockfile. The TypeScript test conversion itself has no remaining failing case or safe-type finding. Browser parity, native rendering and provider calls were outside this test-only assignment.
