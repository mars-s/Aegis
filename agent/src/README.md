# Agent host

`main.ts` is the loopback HTTP entry. It compiles to `agent/dist/main.js`.
Native, browser and test callers launch `agent/dist/main.js`, built from `agent/src/main.ts`.
It contains no host implementation.

The host keeps Pi Durable as the conversation and run engine. `lifetime.ts` gives
the process an Effect 4 scope. That scope owns provider calls, helper waits, SSE
connections and update subprocesses. Shutdown interrupts that work and releases
its listeners and timers. SSE clients with more than 1 MiB of pending output
disconnect and can reload a board snapshot.

`boards.ts` is the serial board writer. User and agent commands use the public
domain reducer and publish committed revisions. `history.ts` preserves the
per-request field ledger and conflict-aware Undo. Optional values are serialised
at the durable JSON boundary in the same way as disk writes and SSE output.

Request bodies, disk records and SDK replies enter as unknown values and use
the public schemas or local adapter schemas. Pi conversation identifiers come
from Pi records. No internal package source imports or unchecked casts are needed.

For the isolated wave 3 checkout:

```sh
npx tsc -p agent/src/tsconfig.json
npx tsc -p checks/host/tsconfig.json
npx oxlint --deny-warnings agent/src checks/host checks/mcp
npm run check
npm run check:runtime
```

Runtime and browser checks must use disposable `AEGIS_DATA` and
`AEGIS_VITE_CACHE` directories. Provider checks use the fake model. They do not
read a real account or establish live provider sessions.

Integration must add the direct Effect dependency, compile `src/**/*.ts` from
the workspace build, and include the new checks in the workspace type and lint
commands. The worker report supplies the exact configuration patch. Until that
patch lands, explicitly compile this directory before invoking the compatibility
launcher. Test launchers under `agent/checks` import the converted tests from
`checks/host`, preserving the shared test command during the integration window.
