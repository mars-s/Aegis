import type { CanvasEngine, CameraState, Point } from '@aegis/scene';

/** Touch queues navigation on the existing engine. Mouse and trackpad input keep their normal path. */
export function attachTouch({ stage, engine, activeTool, localPoint }: {
  readonly stage: HTMLElement; readonly engine: CanvasEngine; readonly activeTool: () => boolean; readonly localPoint: (point: Point) => Point;
}): () => void {
  const points = new Map<number, Point>(), lifetime = new AbortController();
  let origin: { point: Point; view: CameraState; target: Element } | null = null;
  let pinch: { distance: number; zoom: number; world: Point } | null = null;
  let hold: ReturnType<typeof setTimeout> | null = null, owned = false, held = false;
  const cancelHold = (): void => { if (hold) clearTimeout(hold); hold = null; };
  const cancelGesture = (): void => { stage.dispatchEvent(new PointerEvent('pointercancel', { pointerId: -1, pointerType: 'touch' })); };
  const stop = (event: PointerEvent): void => { event.preventDefault(); event.stopImmediatePropagation(); };
  const down = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' || !(event.target instanceof Element) || event.target.closest('input, textarea, button, a, video, [contenteditable]:focus')) return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY }); cancelHold();
    if (points.size === 1) {
      cancelGesture(); held = false; owned = !activeTool() && !event.target.closest('.card, .editing-outline');
      origin = { point: { x: event.clientX, y: event.clientY }, view: engine.camera(), target: event.target };
      hold = setTimeout(() => { if (points.size !== 1 || !origin) return; owned = held = true; cancelGesture(); origin.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: origin.point.x, clientY: origin.point.y, button: 2 })); }, 520);
    } else if (!pinch) {
      cancelGesture(); owned = true;
      const [a, b] = points.values(); if (!a || !b) return;
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: engine.camera().zoom, world: engine.screenToWorld(localPoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) };
    }
    if (owned) { stage.setPointerCapture(event.pointerId); stop(event); }
  };
  const move = (event: PointerEvent): void => {
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (origin && Math.hypot(event.clientX - origin.point.x, event.clientY - origin.point.y) > 8) cancelHold();
    if (pinch && points.size >= 2) {
      const [a, b] = points.values(); if (!a || !b) return;
      const zoom = Math.min(4, Math.max(.05, pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance));
      const centre = localPoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      engine.navigate({ kind: 'restore', camera: { x: centre.x - pinch.world.x * zoom, y: centre.y - pinch.world.y * zoom, zoom }, motion: 'instant' });
    } else if (owned && !held && origin && !pinch) engine.navigate({ kind: 'restore', camera: { x: origin.view.x + event.clientX - origin.point.x, y: origin.view.y + event.clientY - origin.point.y, zoom: origin.view.zoom }, motion: 'instant' });
    if (owned) stop(event);
  };
  const end = (event: PointerEvent): void => { if (!points.delete(event.pointerId)) return; cancelHold(); if (owned) stop(event); if (!points.size) { pinch = origin = null; owned = held = false; } };
  const options = { capture: true, passive: false, signal: lifetime.signal };
  stage.addEventListener('pointerdown', down, options); stage.addEventListener('pointermove', move, options); stage.addEventListener('lostpointercapture', end, options);
  window.addEventListener('pointerup', end, options); window.addEventListener('pointercancel', end, options);
  return () => { lifetime.abort(); cancelHold(); points.clear(); origin = pinch = null; };
}
