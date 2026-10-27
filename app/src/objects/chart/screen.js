export const CHART_STROKE = 1.5, CHART_POINT = 2.5, CHART_LABEL = 12;

// Keep the chart's drawing in its own window units. The camera scales the whole window.
// Slide editors can still supply a fitted label size through labelPixels.
export function chartScreen(svg, { labelPixels } = {}) {
  function measure() {
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const world = svg.closest('#world'), style = world && getComputedStyle(world);
    const worldMatrix = style && new DOMMatrixReadOnly(style.transform);
    // The model can already hold the next zoom while the DOM still has the previous transform.
    const zoom = worldMatrix ? Math.hypot(worldMatrix.a, worldMatrix.b) * (Number(style.zoom) || 1) : 1;
    const scale = Math.hypot(matrix.a, matrix.b) / zoom;
    if (!scale) return;
    const label = labelPixels ? labelPixels() / scale : Math.round(Math.max(CHART_LABEL, CHART_LABEL / scale) * 2) / 2;
    const r = Math.round(CHART_POINT / scale * 100) / 100;
    svg.style.setProperty('--chart-label-size', `${label}px`);
    svg.querySelectorAll('.dot, .pt').forEach(dot => dot.setAttribute('r', String(r)));
  }
  let box = '';
  const resize = new ResizeObserver(([entry]) => {
    const size = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
    if (size === box) return; box = size; measure();
  });
  resize.observe(svg);
  const frame = requestAnimationFrame(measure);
  return { paint: measure, destroy() { cancelAnimationFrame(frame); resize.disconnect(); } };
}
