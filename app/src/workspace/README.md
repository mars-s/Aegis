# Workspace

`createWorkspace({ board })` owns the confirmed board, ordered pending commands, optimistic projection, selection, and local Undo history. The workspace worker owns this folder, `packages/host-client`, and `checks/unit/workspace`.

`submit(commands)` applies the complete batch synchronously. Success returns `{ kind: 'applied', batchId, created, ids }`. Rejection returns `{ kind: 'rejected', errors }`, including command indexes, paths, and the domain's exact reasons. Rejection leaves the board, save queue, and history unchanged. One successful submit adds one queue entry and one Undo transaction. `undo()` and `redo()` each submit one restore transaction, following the legacy history semantics.

The canonical board keeps the domain's flat format, including `cards`, `links`, `rev`, and `view: { x, y, z }`. It is replaced rather than mutated by views. Commands keep their existing `op` names. The store allocates create and link IDs before saving and copies retained command payloads.

`scene.snapshot()` returns the cached optimistic board. `scene.subscribe(listener)` publishes domain change sets with `kind: 'change'` or `kind: 'replace'`. Replacement also includes the new board. The scene owns its rendering indexes and camera. A camera frame does not update the workspace.

`card(id)` returns a stable source of the domain's `CardContent | null`. Content contains the named payload and presentation fields, with geometry excluded. Geometry-only moves preserve the content snapshot and send no body notification. `record(id)` supplies the full card for inspection. Metadata, saving, selection, history, UI, and agent status have separate sources. Source snapshots update before any transaction subscriber runs.

The React hooks use `useSyncExternalStore`: `useSource`, `useCard`, `useSaveState`, `useSelection`, `useWorkspaceMetadata`, and `useAgent`. Their snapshots are cached. They contain no Effect code.

`retry()` clears a transport block and replays pending intents. A conflicting intent stays queued with visible field errors. `replaceBoard(board)` refuses while unsaved batches remain. Otherwise, replacement increments the epoch, clears board history and selection, and cancels old work through the connection adapter. `dispose()` closes the workspace and its attached connection.

Transactions stabilise unchanged card records outside camera frames. The current domain reducer clones board arrays, so transaction and snapshot work still scales with board size. The store does not claim constant-time editing or worker-based large-snapshot decoding.
