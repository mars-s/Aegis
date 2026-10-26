export const CHART_STROKE = 1.5, CHART_POINT = 2.5, CHART_LABEL = 12;

// SVG units include the slide fit and canvas zoom. Keep the drawing in screen pixels.
// Charts measure their own fit once (ResizeObserver) and follow canvas zoom from the camera,
// so panning and zooming never force a layout per chart per frame.
const charts = new Set();
let queued = 0, lastZoom = NaN;
const zoom = () => (globalThis.aegisCtx ?? globalThis.aegis)?.canvas?.view?.z ?? 1;

function flush() {
  queued = 0;
  const z = zoom();
  for (const chart of charts) chart.apply(z);
}
function queue() { if (!queued) queued = requestAnimationFrame(flush); }
// canvaspaint fires after the engine has read its geometry for the frame, so writing here never forces a layout.
let lastTier = '';
function onCanvasPaint() {
  const z = zoom(), tier = document.getElementById('stage')?.dataset.zoomTier || '';
  if (tier !== lastTier) { lastTier = tier; lastZoom = z; for (const chart of charts) chart.apply(z, true); return; }
  if (z !== lastZoom) { lastZoom = z; for (const chart of charts) chart.apply(z); }
}
let listening = null;
function listen() {
  const stage = document.getElementById('stage');
  if (!stage || listening === stage) return;
  listening?.removeEventListener('canvaspaint', onCanvasPaint);
  listening = stage; stage.addEventListener('canvaspaint', onCanvasPaint);
  window.addEventListener('resize', queue);
}

export function chartScreen(svg) {
  // Fit scale: rendered size over viewBox size, excluding the canvas zoom (inside the world) once measured.
  let fit = 1, inWorld = false, last = ''; // last applied label and point size
  function measure() {
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    inWorld = !!svg.closest('#world');
    const scale = Math.hypot(matrix.a, matrix.b);
    if (!scale) return;
    fit = inWorld ? scale / zoom() : scale;
    chart.apply(zoom(), true);
  }
  const chart = {
    apply(z, force = false) {
      // Behind a semantic summary the chart is not read, so it waits until detail returns.
      if (inWorld && svg.closest('.card.semantic-hidden')) { last = ''; return; }
      const scale = inWorld ? fit * z : fit;
      // Quantise to whole label pixels so continuous zoom does not relayout chart text on every frame.
      const label = Math.round(Math.max(CHART_LABEL, CHART_LABEL / scale) * 2) / 2;
      const r = Math.round(CHART_POINT / scale * 100) / 100;
      const key = `${label}:${r}`;
      if (!force && key === last) return;
      last = key;
      svg.style.setProperty('--chart-label-size', `${label}px`);
      svg.querySelectorAll('.dot, .pt').forEach(dot => dot.setAttribute('r', String(r)));
    },
  };
  charts.add(chart); listen(); queueMicrotask(listen);
  // Only a real change in the chart's layout box re-measures; label size writes do not feed back.
  let box = '';
  const resize = new ResizeObserver(([entry]) => {
    const size = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
    if (size === box) return; box = size; measure();
  }); resize.observe(svg);
  const frame = requestAnimationFrame(measure);
  return { paint: measure, destroy() { cancelAnimationFrame(frame); resize.disconnect(); charts.delete(chart); } };
}
