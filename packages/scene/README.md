# Scene

Scene owns the imperative camera, one demand-driven frame scheduler, card and link R-trees, static camera representations, canvas drawing and body-host leases. It imports types from the public domain schema entry and uses RBush at runtime. React and Effect do not enter this package. The foundation slice owns packages/scene, checks/unit/scene and checks/perf/scene. The app owns React bodies and its Workspace implementation.

```ts
import { createCanvas } from '@aegis/scene';

const canvas = createCanvas({ stage, world, backdrop, overlay, workspace });
canvas.navigate({ kind: 'fit', ids: [], motion: 'instant' });
const stop = canvas.leases.subscribe(renderPortals);
const leases = canvas.leases.getSnapshot();
```

The stage must be positioned, focusable and clipped, with touch-action none. Its world is absolute with transform-origin 0 0. Both canvases are absolute and pointer-events none. Place backdrop first, overlay next and world last. The engine draws the dotted grid on backdrop, and links, far rectangles, pending body previews and selection on overlay. Card shells are children of world. The app supplies its existing card styles. canLease defaults to note/title; pass a pure card predicate as more React bodies become available.

The Workspace port has scene.snapshot/subscribe, selection.getSnapshot/subscribe, act(select), and submit(commands). It uses canonical flat Board/Card and op-discriminated Command types. Saved view.z is converted to camera.zoom when attaching. Camera changes are never sent through Workspace or React. Normal wheel pans, Ctrl/Cmd wheel zooms at the pointer, Space or middle button pans, Shift toggles selection, and Cmd/Ctrl drag selects one card and bypasses optional snapGrid. Pointer release submits one move batch. Escape cancels. The 0 key fits visible board content. Navigation accepts instant or glide motion and respects reduced motion.

A lease has key, cardId, generation and host. Render a portal keyed by key into host. The host stays under the same connected shell and world throughout its lease, including its two-second parked period. After the removed portal's whole subtree has finished cleanup, call leases.acknowledgeUnmount(key, generation). Queueing that acknowledgement in a microtask from the portal cleanup avoids acknowledging before descendant cleanup has run. A shell is unavailable until the matching acknowledgement arrives. A stale generation does nothing. Never reparent a live portal target or iframe.

Use pin(cardId, reason, true/false) for dirty sessions and playing media. Focus, IME and pointer capture are pinned automatically. Protected bodies retain their detail representation in a crowded far view. Call requestMeasurement(key, generation) after body content changes. Height reads run in the scheduler's read phase, with epoch, card identity, generation and base-height guards. Height changes submit normal measure commands outside the frame callback. New bodies are admitted two per task/frame and use canvas previews until admitted. The default warm target is 400, configurable with warmLeases. Visible detail bodies and pinned bodies can exceed that retention target; it never hides a real body just to enforce the warm limit.

inspect(), camera(), representations() and samples() are on-demand reads. recordMetrics(true) starts a bounded ring of callback-start intervals, callback CPU and per-phase durations. No measurement requestAnimationFrame runs beside the engine. Idle stops scheduling. dispose() cancels frames, disconnects observers/listeners and retires all leases. Keep the world connected until React has unmounted its portals and acknowledged cleanup.

Build with npm --workspace @aegis/scene run build, typecheck source and scene checks with npm --workspace @aegis/scene run check, and run npx vitest run checks/unit/scene. Build domain first. The browser checks use the supplied Playwright installation, temporary data/cache folders and the assigned AEGIS_PORT_OFFSET (4100 by default). Headless timing is diagnostic and cannot certify native 120 Hz presentation.

Standing order 18 supersedes the earlier summary/cluster design. Windows keep real content, true world positions and dimensions at every zoom. Only a crowded view with more than LIVE_LIMIT (400) visible cards below FAR (0.4) draws exact card rectangles on canvas. There is no summary packing, per-kind readability threshold or cluster tier. The layout subpath exports static projection, the two crowded-view constants and a Fit helper. The former summary-layout benchmark is historical evidence for work that the ruling removed, not an equivalent current workload.

The foundation renders note/title bodies through leases and other bodies as previews until the app registers their React views. Editor sessions and continuous tools belong to their later owners. Lease keys are ephemeral strings; generation checks and cleanup acknowledgements protect their reuse. Shells are allocated on demand rather than preallocated. This foundation does not implement full obstacle routing or native presentation calibration.
