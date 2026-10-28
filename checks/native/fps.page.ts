import { browserConfig, present } from './browser-config.ts';
import { z } from 'zod';
import type {} from '../../app/src/platform/test-facade.ts';
const config = browserConfig();
import { frameStats } from './frame-stats.ts';

const result = present(document.querySelector('#result'));
function display(value: string): void { result.textContent = value; }
const dot = document.querySelector('#dot');
if (!(dot instanceof HTMLElement)) throw new Error('Missing refresh probe dot');
const probeDot = dot;
const params = new URLSearchParams(location.search);

async function measure() {
  const health = z.object({ ok: z.boolean() }).parse(await fetch('/health').then(response => response.json()));
  const boards = await fetch('/boards', {
    headers: { authorization: `Bearer ${params.get('token')}` },
  }).then(response => {
    if (!response.ok) throw new Error(`Host connection failed: ${response.status}`);
    return response.json();
  });
  if (!health.ok || !Array.isArray(boards)) throw new Error('Invalid host response');
  display('Host connected. Warming up...');
  await new Promise(resolve => setTimeout(resolve, config.warmupMs));
  const samples: number[] = [];
  let previous: number | undefined;
  let hidden = document.hidden;
  document.addEventListener('visibilitychange', () => { hidden ||= document.hidden; });
  await new Promise<void>(resolve => {
    function frame(now: number) {
      if (previous !== undefined) samples.push(now - previous);
      previous = now;
      probeDot.style.transform = `translateX(${(now / 4) % 600}px)`;
      if (samples.length < (config.frames ?? 600)) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
  const report = {
    ...frameStats(samples),
    hidden,
    hostConnected: true,
    tauri: '__TAURI_INTERNALS__' in window && typeof window.__TAURI_INTERNALS__ === 'object' && window.__TAURI_INTERNALS__ !== null && 'invoke' in window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function',
    userAgent: navigator.userAgent,
    devicePixelRatio,
  };
  display(JSON.stringify(report, null, 2));
  await fetch(config.collector, { method: 'POST', body: JSON.stringify(report) });
  // No further animation is scheduled after the finite measurement.
}

measure().catch(async error => {
  display(String(error));
  await fetch(config.collector, { method: 'POST', body: JSON.stringify({ error: String(error) }) });
});
