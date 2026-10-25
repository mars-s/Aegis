// Canvas benchmark: open index.html?bench=5000 to fill a scratch board (never saved) and measure frames.
export async function bench(canvas, count) {
  const cards = [];
  for (let i = 0; i < count; i++) cards.push({ id: 'p' + i.toString(36).padStart(7, '0'), type: 'note', x: (i % 100) * 260, y: Math.floor(i / 100) * 130, w: 220, h: 96, text: 'Card ' + i, color: 'plain' });
  canvas.setBoard({ id: 'bench', name: 'Bench', cards, links: [], rev: 1, view: { x: 0, y: 0, z: 1 } });
  const frame = () => new Promise(r => requestAnimationFrame(r));
  await frame(); await frame();
  const stage = document.getElementById('stage');
  const times = []; let last = performance.now();
  const tick = async () => { await frame(); const now = performance.now(); times.push(now - last); last = now; };
  const t0 = performance.now();
  for (let i = 0; i < 150; i++) { stage.dispatchEvent(new WheelEvent('wheel', { deltaX: 40, deltaY: 25, bubbles: true, cancelable: true })); await tick(); }
  const mountedNear = canvas.stats().mounted;
  for (let i = 0; i < 90; i++) { stage.dispatchEvent(new WheelEvent('wheel', { deltaY: 30, ctrlKey: true, clientX: 600, clientY: 400, bubbles: true, cancelable: true })); await tick(); }
  times.sort((a, b) => a - b);
  const result = { cards: count, frames: times.length, seconds: ((performance.now() - t0) / 1000).toFixed(2), mountedNear, mountedFar: canvas.stats().mounted, zoom: +canvas.stats().z.toFixed(2),
    p50ms: +times[times.length >> 1].toFixed(1), p95ms: +times[Math.floor(times.length * 0.95)].toFixed(1), maxms: +times.at(-1).toFixed(1) };
  document.body.dataset.bench = JSON.stringify(result);
  return result;
}
