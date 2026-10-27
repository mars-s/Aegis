import config from './fps.config.mjs';
import { frameStats } from './frame-stats.mjs';

const result = document.querySelector('#result');
const dot = document.querySelector('#dot');
const params = new URLSearchParams(location.search);

async function measure() {
  const health = await fetch('/health').then(response => response.json());
  const boards = await fetch('/boards', {
    headers: { authorization: `Bearer ${params.get('token')}` },
  }).then(response => {
    if (!response.ok) throw new Error(`Host connection failed: ${response.status}`);
    return response.json();
  });
  if (!health.ok || !Array.isArray(boards)) throw new Error('Invalid host response');
  result.textContent = 'Host connected. Warming up...';
  await new Promise(resolve => setTimeout(resolve, config.warmupMs));
  const samples = [];
  let previous;
  let hidden = document.hidden;
  document.addEventListener('visibilitychange', () => { hidden ||= document.hidden; });
  await new Promise(resolve => {
    function frame(now) {
      if (previous !== undefined) samples.push(now - previous);
      previous = now;
      dot.style.transform = `translateX(${(now / 4) % 600}px)`;
      if (samples.length < config.frames) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
  const report = {
    ...frameStats(samples),
    hidden,
    hostConnected: true,
    tauri: typeof window.__TAURI_INTERNALS__?.invoke === 'function',
    userAgent: navigator.userAgent,
    devicePixelRatio,
  };
  result.textContent = JSON.stringify(report, null, 2);
  await fetch(config.collector, { method: 'POST', body: JSON.stringify(report) });
  // No further animation is scheduled after the finite measurement.
}

measure().catch(async error => {
  result.textContent = String(error);
  await fetch(config.collector, { method: 'POST', body: JSON.stringify({ error: String(error) }) });
});
