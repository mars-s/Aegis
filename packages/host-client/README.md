# Host client

This package owns the browser connection to the existing Aegis HTTP and SSE host. Effect 4 scopes close request resources and the connection lifetime. Domain and protocol packages own data types and wire validation. The workspace worker owns this package, the app workspace, and workspace unit tests.

`createHostClient({ baseUrl, token })` returns semantic Promise methods: `boards`, `board`, `createBoard`, `commit`, `saveCamera`, and `events`. Results discriminate with `kind: 'ok'` or `kind: 'error'`. The client also resolves asset URLs and exposes `dispose()`.

`connectWorkspace({ client, workspace, onError? })` starts replication and returns a plain lifecycle handle. App bootstrap does not import Effect. `settled()` waits for current writes and reconciliation. `resynchronise()` requests a snapshot. `dispose()` cancels board reads, the event reader, and reconnect delays. The client has its own lifetime and is disposed separately.

Only the adapter receives `workspace.replication`. Feature components use workspace sources and `submit`. The board epoch rejects late results after a permitted board replacement. Board patches run in order. Agent status publishes independently of board saves and reconciliation.

A revision gap, reconnect, or queue overflow pauses patches until a snapshot reaches the known revision. The default queue holds at most 256 events and 4 MiB. Overflow closes the slow event connection and requests a snapshot. Individual SSE messages are limited to 2 MiB.

Each write gets one POST attempt. A failed write and later edits remain queued until `workspace.retry()`. A successful POST leaves the queue before the following snapshot read. A failed read can retry without sending the POST again. The legacy host has no durable batch deduplication, so the client never retries POST automatically.

The host still uses the legacy routes and payloads. A batch response contains `rev` and created IDs, so the adapter reads a confirmed snapshot after each successful batch before sending the next one. Batch IDs identify local queue entries. They do not claim server deduplication.

Build with `npm run build --workspace @aegis/host-client` after domain and protocol. The public exports load built ESM from `dist`. `@aegis/host-client/result` contains plain failure helpers without importing Effect into the workspace store.
