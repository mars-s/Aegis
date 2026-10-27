# Aegis React integration, round 2

Status: resumed from coordinator-pushed 51018bd. Contracts reconstructed from the committed source, not from the crashed owner's unchecked narrative. The restored draft was reviewed, corrected and pushed as aef14ba. Production parity is running; full parity is not yet claimed. No PR requested or created. No subagent tool was available.

## Merge heads verified after fetch

| Slice | Incoming head | State |
| --- | --- | --- |
| Host | bb7f647b1dfe5212c847a5d5711cf9ba5a05f3d8 | Ancestor of integration |
| Scene | ebc22036527974a77d4fc7a0bfa93f00adcac00a | Ancestor of integration |
| Chrome | 891179b1240b4ed36ac744cdedbb4a58a62abf51 | Ancestor of integration |
| Documents | 5f533e46fd97df2bf8357dad156d4c5bfdca6557 | Ancestor of integration |
| Agents | 504f499540954d18f88e0760a76987553d060d06 | Ancestor of integration |
| Decks | 2857c64a22c8744961d2d64766999cd32e16d56b | Ancestor of integration |
| Objects, final | c93775bbf1ed7c05dc21a22399926991d3100ec9 | Ancestor of integration |
| Creative | 48c070953317c05c29dff5fcffb83bc6d044b24f | Ancestor of integration |
| Host tests | f697d92a9870a939cd490e44baa87acf84acbff9 | Ancestor of integration |
| Data, round 1 | 3a8daa155c2bc6410594e92b9a3490f110ec21a9 | Ancestor of integration |
| Static zoom | ea857f5 | Merged at 4cf67a4 |

The previous owner ran cumulative checks after the merge units. Evidence remains in integration-r2/*-merge-check and the named repair directories. Menu/popup declaration conflicts and the stale font module were resolved explicitly. The resumed clean npm ci passed and npm run check passed with 236 unit tests, 242 host tests, strict types/lint/dependencies, the unchanged gate at 47 remaining findings, and zero Svelte errors/seven existing warnings. The four removed allowances belong to the ported native-files implementation.

## Contract rulings

Each line is a ruling on the named slice request. Accepted means the architecture is approved; pending identifies work not certified by the current implementation.

| Request | Ruling |
| --- | --- |
| Scene, batch author provenance | Accept, implemented in fa77675 with local/agent/sync origin and accepted board events; never infer authorship from card.agent. |
| Scene, continuous pointer/key input | Accept, implemented in 0a21dc3 and 30995c1 through the sole input scheduler with coalesced samples and epoch cancellation. |
| Scene, finite previews and semantic commits | Accept final creative extension, implemented in 30995c1; cached colours and one deferred authored batch. |
| Scene, panel/composer Fit area | Accept, implemented in 556539d and 4455334 with cached area source and scheduled reads. |
| Scene, facade stats/availableArea | Accept, implemented from actual engine leases/area in 4455334. |
| Scene, typed agent bounds | Accept frame-participant fitBounds instead of a second anchor store; general Fit receives candidate-scale fixed-screen bounds. |
| Scene, agent animation/trunks | Accept only agent-origin batches; animation/cue consumer remains pending and requires scene/agents parity evidence. |
| Scene, shared menus | Retain one shared menu implementation through exact declarations; defer its implementation migration until callers can move together. |
| Scene, legacy deletion | Retain default-legacy engine/helpers while their production/test callers exist; no broken default switch. |
| Chrome, App mount/checker discovery | Accept, implemented with full source/type/lint discovery and real Chrome mount. |
| Chrome, semantic Library service | Accept, implemented by validated host methods plus app-owned flush/epoch/deletion/Undo/reload adapter; broad parity still required. |
| Chrome, transform/connection controls | Accept, scene owns capture and the final batch; App supplies real startTransform/startConnection adapters. |
| Chrome, link inspector geometry | Accept actual cached hitTestLink/linkRoute/linkGeometry; inspector UI and full endpoint editing remain pending. |
| Chrome, scheduled overlays/insets | Accept frame participants and cached available area; preserve imperative positioning rather than camera React state. |
| Chrome, shared controls migration | Retain the existing implementation while legacy callers remain; declarations are not a migrated implementation. |
| Chrome, missing panels/customisation | Accept real registrations/slots; remaining toolbar/panel/phone gaps are parity defects, not permission for placeholders. |
| Chrome, WebKit reload | Accept root lifetime/cancellation fix from round 1; repeat original zero-error reload proof in the merged app. |
| Documents, registrations/provider | Accept, implemented in 4455334 with real document bodies/editor/provider/clipboard/context. |
| Documents, semantic rewrite/platform | Accept, implemented with validated HostClient.rewrite and real print/save/open adapters. |
| Documents, live reference charts | Accept shared Plot adapter with canonical source cards; no copied chart renderer. |
| Documents, close/full/keyboard dispatcher | Accept shared controller with flush refusal, camera/selection bookmark and focus return; no second document title row. |
| Documents, scene copy drop | Accept resolver contract, pending scene hit-test/restoration integration; no move transaction when copying. |
| Documents, disposal flush | Accept refusal before deliberate disposal; navigation and conflict lifetime still require composed verification. |
| Documents, test probes/discovery | Accept real-session adapters and the four Word tests; aef14ba compiles production probes without weakening assertions. |
| Documents, static context geometry | Reject obsolete source hiding/repacking; preserve the static-zoom geometry assertions. |
| Agents, scheduler/viewport | Accept read/write/Fit participants, implemented in 556539d; no separate agent rAF loop. |
| Agents, protocol schema relocation | Accept, implemented under protocol /agents and /services; app forwards the authoritative schemas. |
| Agents, semantic service operations | Accept, implemented with decoded list/model/start/message/stop/request Undo; receipts are not full snapshots. |
| Agents, settings/account/MCP services | Accept public-state decoding and platform copy/open; no stored credentials cross the boundary. |
| Agents, AgentShell and settings slots | Accept, real shell is mounted once per workspace board lifetime; slot completeness is a parity obligation. |
| Agents, fixed-screen Fit | Accept candidate-scale bounds through frame participants, implemented. |
| Agents, transient cues/glow | Accept, pending typed scene painter consumer; never animate local Undo of agent-authored content. |
| Agents, Follow controls | Accept, composed in the Chrome bar from the actual AgentShell controls. |
| Agents, static facade/attributes | Accept actual facade aliases; remove semantic-tier DOM attributes rather than recreating adaptive behaviour. |
| Agents, retirement | Retain legacy modules while default controller/tests import them; remove allowances only after last caller migration. |
| Decks, explicit registrations/menu/tests | Accept, implemented through shared composition, services and standard test discovery. |
| Decks, facade selection/aegisCtx | Accept actual workspace selection and facade alias, implemented. |
| Decks, editor return and width | Accept central controller; exact geometry/focus requirements remain asserted. |
| Decks, click placement | Accept exported placeDeck for the central dispatcher; existing centre placement is an open parity gap. |
| Decks, integer ticks/tiny marks | Accept shared-chart repair, pending data/decks implementation and painted-glyph verification. |
| Decks, shared-chart selectors | Accept faithful selector ports retaining every value, fit and glyph assertion; no fake legacy markup. |
| Objects, registration/sandbox/discovery | Accept, implemented with real bodies, semantic sandbox capability and owned tests. |
| Objects, public route geometry | Accept routeLink/LinkRoute exports and actual route reads; linked export callback wiring remains pending. |
| Objects, released identity/measurement | Accept generation-safe identity clearing and scheduled intrinsic measurement, implemented in 556539d; natural-height parity still needs suite proof. |
| Objects, sandbox snapshot handshake | Accept explicit acknowledgement design, pending protocol/view implementation; no claim that task-based snapshots flush synchronously. |
| Objects, Fast Refresh camera | Accept same-board camera retention, implemented in Canvas cleanup/recreation; final dev refresh verification remains required. |
| Objects, svelte alias refresh test | Accept faithful React source mutation and explicit error assertions in 07c690a; production execution cannot certify development HMR. |
| Creative, provider/body/service composition | Accept, implemented in 8bf6b91 with unique body registrations and runtime-stable services. |
| Creative, upload progress/link preview | Accept boundary implementation, implemented in ed6ada3; preserve cancellation argument and decode replies. |
| Creative, captured CSV destination | Accept parser reuse through a temporary destination workspace and real commit, implemented in App; no parser fork or silent cancellation on switch. |
| Creative, pointer arbitration/preview/commit | Accept final finite contract in 30995c1; scene input/write phases and post-frame commit own all gesture work. |
| Creative, link routes and controls | Accept cached real link geometry, implemented; bend/reattach/point-control UI remains pending. |
| Creative, pure wireframe drag hooks | Accept proposed select/expand/snap/finish model hooks, pending scene attachment integration. |
| Creative, click/drag placement | Accept one-shot placement tools, implemented by platform adapters; preserve original click targets and parity assertions. |
| Creative, cached theme/grid | Accept discrete theme source, implemented in ed6ada3 and scene painter; no computed-style reads during painting. |
| Creative, title/section measurement | Accept real hollow title helper and scene measurements; section counter-scaling and full title parity remain pending. |
| Creative, import arrival motion | Accept stable-lease animation only; pending scene implementation and evidence, no cloned shell workaround. |
| Host, build/entry cleanup alternatives | Accept complete cleanup, implemented in 7c7e959/a3bb36b with lockfile, dist/main.js callers, staging and removed compatibility launchers. |
| Host tests, strict discovery | Accept node --test checks/host/*.test.ts via the agent workspace; all 242 cases retained and passing. |
| All slices, legacy deletion/default | Retain still-called legacy code; delete proven unused files and lower allowances only, keep legacy default through this round. |

## Resume unit, production test entries

Reviewed stash r2-uncommitted-docs-test-entries without dropping it. The docs native print mock only gains a saveFile export that throws if used. All existing assertions remain. Document test adapters resolve the actual current session and call the real document exporter. The legacy print fixture permits an implicit doc root, so the adapter supplies that default before full schema validation. Explicit facade builds also compile the retained Svelte deck helper that the unchanged deck suite imports; normal React builds do not enable this extra compiler or test entries.

Verification: resumed-ci, resumed-test-entries-check and resumed-entries-build-fixed. The initial build failure is retained in resumed-entries-build. aef14ba is committed and pushed. Production parity writes one record per suite under evidence/integration-r2/resumed-parity so interruption does not lose completed results. Static-geometry and deck-fit are helpers; standalone exit 0 is never labelled behaviour coverage.
