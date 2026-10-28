# React port foundation contracts

Integration contract v2, cumulative round 2 implementation. Legacy remains the default until the parity ledger is green. Foundation verification and remaining broad-suite blockers are recorded in REACT_PORT_STATUS.md and the external foundation-v2-report.md. Source declarations are authoritative. The design sketches under ~/.codex/orchestrate/aegis-react/design/final are planning material where they differ from these implemented exports.

## Round 2 integration amendment

All wave 3 slices are merged. App composes Chrome, basic/generated/data/document/deck/creative bodies, their editors, AgentShell, Library and creative imports. Registrations are explicit and reject duplicate keys. Feature completeness is recorded by the parity ledger rather than inferred from registration.

HostClient extends the narrower BoardClient used by replication. It adds semantic agents, accounts, authentication public state, MCP, rewrite, Library, link preview and sandbox operations. Protocol subpaths /agents and /services own their schemas. Components receive Promise/callback services and never generic production get/post or Effect. Upload preserves its second AbortSignal argument and adds an optional third progress callback. Every response is decoded. Writes are not retried automatically.

SceneChange carries origin local, agent or sync. Local submit, Undo, Redo and derived measurements are local. Accepted agent board events are agent; acknowledgements and reconciliation are sync. Accepted board events also reach workspace.events. A card's stored agent field never establishes batch provenance. Agent animation and change-cue consumption remain separate parity obligations.

Only scene engine.ts schedules scene frames. FrameParticipant supplies optional read, write and candidate-scale fitBounds callbacks. Reads precede scene writes; participant writes follow them. Fixed-size agent windows contribute bounds at the candidate camera scale. CanvasAttachment.availableArea is a discrete Source<Rect>; engine.viewport() and availableArea() are cached on-demand reads. App measures panels, editors and the composer during scene reads. Camera frames never enter React state.

Continuous tools use ToolPointer, ToolKey, SceneTool, ToolPreview and ToolCommit from the public scene package. DOM adapters arbitrate capture and pan; tool callbacks run in the input phase. Coalesced samples preserve ordering, pressure and timestamps. Previews are finite typed path/rectangle/circle lists with world/screen coordinates, opacity and theme/hex colours. Scene paints them using cached theme values. commitTool queues one semantic batch for onToolCommit after the frame, discarding stale board epochs. Feature callbacks cannot synchronously submit commands, publish React state or access a canvas context inside a scene frame. Escape claimed by a tool is delivered to that tool. Space and middle-button pan retain priority.

Scene exposes startTransform, startConnection, hitTestLink, linkRoute, linkGeometry and public routeLink/geometry exports. They use the actual scene geometry. Document-drop callbacks, pure wireframe drag hooks, transient agent cues and the explicit sandbox snapshot handshake are accepted work requests but are not implemented public capabilities in v2.

The shared editor dispatcher owns Enter, aegis:open-card, Open, close and side/full-width actions. FeatureContext.openEditor accepts an optional keyboard flag. The controller flushes the active registration and honours false, pins the opened body, retains its camera/selection bookmark and returns focus after navigation completes. Session-specific conflict and IME behaviour remains the editor owner's obligation.

The app ends its host lifetime on beforeunload, with pagehide fallback and a fresh lifetime on persisted pageshow. Disposed requests cannot start, cancellation remains cancellation through decoding, and late SSE results cannot mutate the old board epoch. This addresses the WebKit stale-fetch reload error without suppressing errors.

Canvas chart text and points scale with the camera. DeckChart viewScale describes only the containing slide fit. Deck owners supply the containing presentation height. Camera inverse-scaling, summaries and cluster repacking remain forbidden.

The real test facade supplies setBoard/load, created-ID callbacks, selection, stats, availableArea, mountedEl, coordinate conversions, navigation/completion and history. It exists only in development or explicit AEGIS_TEST_FACADE=1 builds. Production browser checks serve compiled assets and verify the implementation/facade build marker. Explicit test module entries share the same compiled document session instances and real exporters. Retained legacy helper modules remain test subjects and are not evidence of migrated React implementations.

## Shared models and package exports

Import runtime values and types from public @aegis package exports. Never import another package's src or dist directory, or cross its boundary with a relative path. Node imports built ESM. Run npm ci in your own worktree, then npm run build:shared before host or browser checks.

@aegis/domain owns Zod schemas, branded identifiers, the closed card/object catalog and pure board functions. Public subpaths include /schema, /commands, /objects, /dataset, /deck, /document, /markdown, /summary, /words, /collection, /catalog, /charts, /content and /link-preview. @aegis/protocol owns /storage, /http, /events, /sandbox and /html-theme. Read their package.json exports and emitted declarations for the complete export list.

The real Board retains id, name, rev, cards, links and view. Cards retain type, x, y, w, h, text and their existing feature fields. view stores {x,y,z}. This preserves existing files and HTTP payloads. Object cards discriminate on kind and retain schema-derived data. The scene engine alone builds its mutable indexes. Do not add a second canonical board or independently define Card or Command.

Commands discriminate on op. applyBatch(board, {commands}) remains the pure atomic reducer with the legacy result and exact field error messages. Existing command aliases and cleanup remain at this compatibility boundary. CardContent is a schema-derived projection of the named payload fields without x/y/w/h/rot. It has no generic index signature. Parse unknown JSON at a protocol/schema boundary, then trust the typed result.

Storage decoding preserves the current board and library files. decodeStoredBoard and decodeStoredLibrary return parsed values and throw on invalid boundary input. HTTP exports decodeBoardList, decodeBatchResponse, decodeHostEvent and decodeHostError. JSON Schema export rejects unrepresentable schemas. The retained legacy props payload is JSON, with schemas for recognised fields. Malformed reserved fields (for example a non-boolean fixedHeight) are now refused atomically, an intentional stricter boundary than the former generic JSON acceptance. It is not permission to introduce untyped dictionaries into new feature APIs.

## Workspace and host connection

Import createWorkspace, Workspace and hooks from app/src/workspace/index.ts. The workspace is a stable external store. It owns optimistic state, pending commands, history, selection and discrete UI state.

```ts
const client = createHostClient({ baseUrl, token });
const loaded = await client.board(boardId);
if (loaded.kind === 'ok') {
  const workspace = createWorkspace({ board: loaded.value });
  const connection = connectWorkspace({ client, workspace });
  // On teardown: connection.dispose(); workspace.dispose(); client.dispose();
}
```

createHostClient and connectWorkspace come from @aegis/host-client. They expose plain Promise/callback APIs; Effect remains inside that package. HostResult discriminates on kind, either ok with value or error with a HostFailure. BoardClient implements boards, board, createBoard, commit, saveCamera, events, upload, assetUrl and dispose. HostClient adds the semantic services described above. Untyped production get/post APIs remain forbidden.

workspace.submit(commands) is synchronous. An applied LocalResult contains batchId, created and ids. A rejected result contains field errors with index, path and reason. One authored submit call is one Undo transaction. Derived measure/initialise_html commands do not create another Undo entry; they fold into the preceding authored result. Ignore unchanged text before submitting editor input. Use branded constructors for IDs. submit allocates IDs before queuing so optimistic and confirmed records agree.

Sources cache their snapshots and stable subscribe/getSnapshot functions. Use useSource, useCard, useWorkspaceMetadata, useSaveState and useSelection. workspace.card(id) returns payload content. workspace.record(id) returns the whole card for inspection outside body rendering. Moving geometry must not notify card content listeners. Metadata is {id,name,rev}. SaveState is saved, saving or blocked. A blocked save stays visible until retry(). There is no automatic POST retry without durable server deduplication.

workspace.scene.snapshot() returns Board. subscribe receives a ChangeSet with kind change, or kind replace and the replacement Board. Changes identify boardId, baseRevision, revision, upserted, removed, links and order. Scene must read snapshot metadata when needed. Scene owns its render graph and R-trees.

workspace.replication is a private adapter port for host-client. Feature components do not call it. The connection keeps ordered board events, reconciles revision gaps and reconnects from a snapshot, and drops late work from a previous board epoch. Agent status sources remain independent. replaceBoard(board) refuses while unsaved writes remain. undo(), redo(), retry() and dispose() are explicit operations.

UI intents select cards, open an editor on the side or full width, close an editor, and open/close a side panel. Components submit commands for data edits and UI intents for discrete interface state. Camera frames never enter workspace or React state.

## Scene, camera and portals

Import createCanvas, CanvasEngine and the public scene types from @aegis/scene. Only packages/scene/src/engine.ts owns scene requestAnimationFrame calls. Scene imports domain types and RBush, with no React, Effect, Zod or Node runtime dependency.

```ts
const engine = createCanvas({ stage, world, backdrop, overlay, workspace, canLease });
engine.navigate({ kind: 'fit', ids: [], motion: 'instant' });
engine.navigate({ kind: 'restore', camera: { x: 0, y: 0, zoom: 1 }, motion: 'glide' });
```

canLease is a pure predicate admitting kinds with registered React bodies. The app composition adapter supplies it. The stage is positioned and clipped. The world has transform-origin 0 0. The two canvases cover the stage. Scene owns shell geometry, world transforms, canvas backing stores, grid, links and displayed representations. Standing order 18 is binding: cards keep real content, true positions and world dimensions times zoom. There are no summary/cluster tiers, readability thresholds or repacking. Only more than 400 visible cards below zoom 0.4 use canvas rectangles at exact geometry. Focus/IME/dirty/media/capture pins retain live bodies. ZoomTier is detail or far, and the layout subpath exports FAR, LIVE_LIMIT, representationMode, projectRepresentations and fitSpatial. It uses x/y/zoom, converting the stored camera's z at the boundary.

engine.camera(), inspect(), representations() and hitTest(point) are on-demand reads. screenToWorld converts stage-local screen coordinates. pin(id, reason, pinned) protects focus, IME, dirty sessions, pointer capture or media. requestMeasurement(key,generation) queues reads in the scene frame. invalidate requests work. No feature starts a parallel scene animation loop or measures layout after frame writes.

engine.leases is an external source of {key,cardId,generation,host}. Render each body with a React portal keyed by lease.key into lease.host. The target and connected parent stay fixed through the lease. CardPortals acknowledges unmount after passive cleanup with acknowledgeUnmount(key,generation). A releasing shell cannot be reused earlier. Editor views are separate hosts, not reparented live portals or iframes.

recordMetrics(true) starts the fixed-size scene recorder. samples() returns interval, callback CPU, phase CPU, input-to-write latency and scene counts. inspect reports pending frames, visible cards/links and lease state. The benchmark attaches to this recorder and does not start another rAF loop. Headless Chromium timings do not certify native 120 Hz presentation.

## Registering a feature

The integration owner edits app/src/composition.tsx. Workers export their implementations from their owned paths and supply registrations in their report. No module mutates a global registry.

CardRegistration binds a CardBodyKind to a React Body component. Non-object keys are Card.type. Object keys are object:kind, for example object:plot. Bodies receive CardBodyProps with cardId, workspace and engine. Its FeatureWorkspace is Omit<Workspace, "replication" | "dispose">; feature components cannot access the private connection or tear down the workspace. Read content through useCard and write through submit. The note/title foundation body is app/src/cards/basic/Note.tsx.

ActionRegistration has id, label, optional shortcut and run(context). Tools are composed through tools. Menu items use menus. shortcut is registration metadata; the chrome owner wires keyboard dispatch once through the shared tool handler. FeatureContext exposes FeatureWorkspace, engine(), openEditor(id,full?) and closeEditor(). Editor methods return boolean. Opening a different card flushes the current editor first; false retains the current session. Continuous drawing and resize extensions use the scene contracts described above.

PanelRegistration has id, side and Body({context}). Panels follow workspace UI intents. EditorRegistration has kind, Body and flush(context,id), which returns false to refuse close if pending edits cannot be retained. App supplies the side/full editor shell. Keep document/sheet/deck content sessions separate from individual view leases.

The built-in composition is an immutable explicit value validated for duplicate registration keys. Do not fork shared controls, App, the host transport, or package contracts in a feature slice.

## Running checks and using the test facade

```sh
npm ci --no-audit --no-fund
npm run check
AEGIS_UI_IMPL=legacy node checks/ui/run.mjs
AEGIS_UI_IMPL=react node checks/ui/run.mjs canvas pan
node checks/ui/run.mjs --impl=react canvas pan
npm run check:react
AEGIS_BROWSER_BUILD=production npm run check:react # after building React with AEGIS_TEST_FACADE=1
AEGIS_UI_IMPL=react npm run bench
npm run bench:react
npm run check:runtime
```

Legacy remains the default until wave 4. The runner preserves the 44-suite manifest and accepts additional existing suite names such as deck-fit. Assertions are not skipped when React lacks a later feature. Record those failures explicitly.

Every run must set fresh AEGIS_DATA and AEGIS_VITE_CACHE and its assigned AEGIS_PORT_OFFSET. Do not reuse real app data or another worker's dependencies. The foundation integration block is 4100-4119. The initial domain, scene and replication worker blocks are 4120-4139, 4140-4159 and 4160-4179. Later workers must receive explicit blocks before launching servers.

The React window.aegis facade is enabled in development or an explicit AEGIS_TEST_FACADE=1 build. It is typed in app/src/platform/test-facade.ts and derived from the real workspace and engine. It exposes apply, undo, redo, flush, canvas and benchmark. Test-only host get/post return unknown JSON. They are not production feature APIs. canvas.board is the real optimistic snapshot, and canvas.view reads the engine camera. Benchmark snapshots are synthetic and disconnected from replication before loading.

## Exclusive wave 3 write sets

| Owner | Production paths | Checks and obligations |
| --- | --- | --- |
| Integration | Root manifests/lock/configs, domain/protocol public contracts, App.tsx, main.tsx, composition.tsx, platform, shared controls/styles, runner, runtime staging, src-tauri | Cumulative check, parity ledger, native/runtime proof, contracts and cross-owner changes |
| 1 scene | packages/scene, app/src/canvas | checks/perf, checks/unit/scene; scheduler, graph, representations, gestures, measurements, leases and portal adapter |
| 2 replication | packages/host-client, app/src/workspace | checks/unit/workspace; agent-race, trust-undo, data-trust; saves, reconciliation and source identity |
| 3 host | agent/src, agent/skills | checks/host; mcp, agent-types; full host migration, providers, assets, MCP and updater. Legacy agent/*.mjs replacements require coordinated deletion |
| 4 chrome | app/src/chrome | canvas and chrome assertions in design-system; controls-polish, fit-finish, canvas-chrome; library, layers, toolbar and menus |
| 5 documents | app/src/editors/document, app/src/cards/document | docs, editors, editor-context; rich/plain agreement, document sessions and export |
| 6 data/charts | app/src/charts, app/src/editors/sheet, app/src/editors/dataset, app/src/cards/data, app/src/features/data | office, chart-defaults, data-import, evidence-fidelity; sources, query fidelity and MPL notices |
| 7 decks | app/src/editors/deck, app/src/cards/deck | deck, deck-fit, deck-studio, editor-return; slide identities, chart models and presentation |
| 8 basic/generated | app/src/cards/basic, app/src/cards/objects, app/src/editors/object, app/src/features/editing | svelte HMR equivalent, genui, parity, editing, crop-a11y; object bodies, clipboard and sandbox view adapter |
| 9 creative/import/media | app/src/features/draw, wireframe, colours, media, imports; app/src/cards/creative | draw, wireframe, media, imports, dropdown; drawings, capture/import workers and licensed resources |
| 10 agents/recovery | app/src/features/agents, overview, settings, mobile, onboarding, first-minute | agents, agent-motion, polish, pan, agent-edges, prod-composer, orb-capture, agent-drafts, ask-selection, first-minute, semantic-zoom, overview-model, spatial-interaction, spatial-memory |

Shortened feature names in rows 9 and 10 are sibling directories under app/src/features. Legacy features/colors is the predecessor of target colours; coordinate deletion with its owner. Each suite has one editing owner. The integrator owns design-system overall. packages/domain and packages/protocol remain integration-owned; workers request a coordinated contract patch rather than racing on them.

Only the integration owner edits scripts/safe-types-legacy.json, and only to reduce counts or remove entries. New and ported files have zero findings and stay absent. The manifest must be empty before the final wave 5 PR.
