// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
// Touch capture leaves mouse and trackpad events on the canvas's existing path.
export function mountTouch({ stage, getView, setView, getTool }) {
  const points = new Map();
  let pinch = null, hold = 0, origin = null, owned = false, held = false;
  const cancelHold = () => { clearTimeout(hold); hold = 0; };
  // Let drawing and other feature tools clear their previews through the usual cancellation path.
  const cancelGesture = () => stage.dispatchEvent(new PointerEvent('pointercancel', { pointerId: -1, pointerType: 'touch' }));
  const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  stage.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || e.target.closest('input, textarea, button, a, video, [contenteditable]:focus')) return;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY }); cancelHold();
    if (points.size === 1) {
      cancelGesture();
      held = false; owned = !getTool() && !e.target.closest('.card, .editing-outline');
      origin = { x: e.clientX, y: e.clientY, view: { ...getView() } };
      const target = e.target;
      hold = setTimeout(() => {
        if (points.size !== 1) return;
        held = owned = true; cancelGesture();
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: origin.x, clientY: origin.y, button: 2 }));
      }, 520);
    } else {
      cancelGesture(); owned = true;
      const [a, b] = [...points.values()], v = getView(), x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: v.z, wx: (x - v.x) / v.z, wy: (y - v.y) / v.z };
    }
    if (owned) { stage.setPointerCapture(e.pointerId); stop(e); }
  }, true);
  stage.addEventListener('pointermove', e => {
    if (!points.has(e.pointerId)) return;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 8) cancelHold();
    if (pinch && points.size >= 2) {
      const [a, b] = [...points.values()], z = Math.min(4, Math.max(.05, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance));
      setView({ x: (a.x + b.x) / 2 - pinch.wx * z, y: (a.y + b.y) / 2 - pinch.wy * z, z });
    } else if (owned && !held && origin && !pinch) {
      setView({ x: origin.view.x + e.clientX - origin.x, y: origin.view.y + e.clientY - origin.y, z: origin.view.z });
    }
    if (owned) stop(e);
  }, true);
  const end = e => {
    if (!points.delete(e.pointerId)) return;
    cancelHold();
    if (owned) stop(e);
    // After a pinch, wait for both fingers to lift before starting another gesture.
    if (!points.size) { pinch = origin = null; owned = held = false; }
  };
  addEventListener('pointerup', end, true);
  addEventListener('pointercancel', end, true);
  stage.addEventListener('lostpointercapture', e => { if (points.has(e.pointerId)) end(e); });
}
