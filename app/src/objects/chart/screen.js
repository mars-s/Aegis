export const CHART_STROKE = 1.5, CHART_POINT = 2.5, CHART_LABEL = 12;

// SVG units include the slide fit and canvas zoom. Keep the drawing in screen pixels.
export function chartScreen(svg) {
  function paint() {
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const scale = Math.hypot(matrix.a, matrix.b);
    if (!scale) return;
    svg.style.setProperty('--chart-label-size', `${CHART_LABEL / scale}px`);
    svg.querySelectorAll('.dot, .pt').forEach(dot => dot.setAttribute('r', String(CHART_POINT / scale)));
  }
  const stage = document.getElementById('stage');
  const resize = new ResizeObserver(paint); resize.observe(svg);
  stage?.addEventListener('canvaspaint', paint);
  window.addEventListener('resize', paint);
  const frame = requestAnimationFrame(paint);
  return { paint, destroy() { cancelAnimationFrame(frame); resize.disconnect(); stage?.removeEventListener('canvaspaint', paint); window.removeEventListener('resize', paint); } };
}
