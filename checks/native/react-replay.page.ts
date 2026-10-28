import { browserConfig, present } from './browser-config.ts';
import { BuildMarkerSchema } from './schemas.ts';
import { z } from 'zod';
import type { TestFacade } from '../../app/src/platform/test-facade.ts';
import type { ReplayStep } from './replay-fixture.ts';
const config = browserConfig();
import { frameStats, replayPasses } from './frame-stats.ts';
import { mixedBoard, replayPlan, BOARD_ID } from './replay-fixture.ts';
import { replayScene } from './replay-driver.ts';

const errors: string[] = [];
const message = (value: unknown) => String(value).replace(/([?&]token=)[^&\s"']+/g, '$1<REDACTED>');
window.addEventListener('error', event => errors.push(message(event.message)));
window.addEventListener('unhandledrejection', event => errors.push(message(event.reason)));
localStorage.setItem('aegis:onboarded', '1');
localStorage.setItem('aegis:orb-hint-seen', '1');
localStorage.setItem('aegis:board', BOARD_ID);

function check(value: unknown, text: string): asserts value { if (!value) throw new Error(text); }
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function ready() {
  const deadline = performance.now() + 25000;
  while (!window.aegis?.canvas?.engine) {
    check(performance.now() < deadline, 'Compiled React test facade did not become ready');
    check(!errors.length, errors.join('\n'));
    await wait(20);
  }
  return window.aegis;
}

function implementationProof(facade: TestFacade, marker: z.output<typeof BuildMarkerSchema>) {
  const root = document.getElementById('app');
  check(root && Object.keys(root).some(key => key.startsWith('__reactContainer$')), 'App root is not managed by React');
  const selectors: Readonly<Record<string, string>> = { note: '.basic-note .body', todo: '.basic-todo .todo-item', doc: '.document-card .doc-page', 'object:sheet': '.sheet tbody td', 'object:plot': '.plot-card svg', 'object:stats': '.object.stats .stat' };
  const bodies: Record<string, number> = Object.fromEntries(Object.keys(selectors).map(kind => [kind, 0]));
  for (const lease of facade.canvas.engine.leases.getSnapshot()) {
    const card = facade.canvas.board.cards.find(card => card.id === lease.cardId);
    if (!card) continue;
    const kind = card.type === 'object' ? `object:${card.kind}` : card.type;
    const child = lease.host.firstElementChild;
    const selector = selectors[kind];
    if (child && selector && lease.host.querySelector(selector) && Object.keys(child).some(key => key.startsWith('__reactFiber$'))) bodies[kind] = (bodies[kind] ?? 0) + 1;
  }
  for (const [kind, count] of Object.entries(bodies)) check(count > 0, `No real React ${kind} body mounted`);
  return { marker, rootManagedByReact: true, bodies, facadeEngine: true, stageClass: document.getElementById('stage')?.className };
}

async function measure() {
  check('__TAURI_INTERNALS__' in window && typeof window.__TAURI_INTERNALS__ === 'object' && window.__TAURI_INTERNALS__ !== null && 'invoke' in window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function', 'Replay must run inside the real Tauri WKWebView');
  check(/AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium/.test(navigator.userAgent), 'Expected WKWebView, not Chromium');
  check(location.pathname === '/ui/index.html', 'Expected the native installed-UI route');
  const marker = BuildMarkerSchema.parse(await fetch('./aegis-build.json').then(response => {
    check(response.ok, 'Missing compiled build marker');
    return response.json();
  }));
  check(marker.implementation === 'react' && marker.facade === true, 'Expected a compiled React facade build');
  const facade = await ready();
  const health = z.object({ ok: z.boolean() }).parse(await fetch('/health').then(response => response.json()));
  const boards = await facade.host.get('/boards');
  check(health.ok && Array.isArray(boards) && boards.some(board => board.id === BOARD_ID), 'Disposable native host board is missing');
  await facade.canvas.loadAsync(mixedBoard());
  facade.canvas.select([]);
  facade.canvas.setView(mixedBoard().view);
  const engine = facade.canvas.engine;
  const warmDeadline = performance.now() + 30000;
  while (engine.inspect().queuedMounts || engine.inspect().releasingLeases || engine.inspect().pendingFrames) {
    check(performance.now() < warmDeadline, 'Scene bodies did not finish mounting before measurement');
    await wait(20);
  }
  if (document.fonts) await document.fonts.ready;
  await wait(config.warmupMs);
  await facade.flush();
  const implementation = implementationProof(facade, marker);
  const stage = document.getElementById('stage');
  check(stage && stage.classList.contains('react-stage'), 'Expected the actual React canvas stage');
  const rect = stage.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2, clientY = rect.top + rect.height / 2;
  check(rect.width >= 1000 && rect.height >= 600, 'Native window is too small for the standard workload');
  const before = engine.inspect();
  const initialCamera = { ...engine.camera() };
  let hidden = document.hidden;
  const visibility = () => { hidden ||= document.hidden; };
  document.addEventListener('visibilitychange', visibility);
  const plan = replayPlan();
  let replay;
  try {
    replay = await replayScene({ engine, plan, dispatch: step => {
      const event = new WheelEvent('wheel', { deltaX: step.dx, deltaY: step.dy, deltaMode: 0, ctrlKey: step.zoom, clientX, clientY, bubbles: true, cancelable: true });
      stage.dispatchEvent(event);
      check(event.defaultPrevented, 'Actual canvas wheel handler did not consume replay input');
    } });
  } finally { document.removeEventListener('visibilitychange', visibility); }
  check(!hidden, 'Webview became hidden during replay');
  check(!errors.length, errors.join('\n'));
  check(facade.canvas.board.id === BOARD_ID && facade.canvas.board.cards.length === 300, 'Replay board changed');
  const samples = replay.samples;
  const stats = frameStats(samples.map(sample => sample.interval));
  const phases = (['pan', 'zoom-out', 'zoom-in'] satisfies readonly ReplayStep['phase'][]).map(phase => {
    const indexed = plan.map((step, index) => ({ step, index })).filter(item => item.step.phase === phase);
    const first = present(indexed[0]).index, last = present(indexed.at(-1)).index;
    const from = first ? present(replay.cameras[first - 1]) : initialCamera, to = present(replay.cameras[last]);
    if (phase === 'pan') check(replay.cameras.slice(first, last + 1).some(camera => Math.hypot(camera.x - from.x, camera.y - from.y) > 10), 'Pan did not move the real camera');
    else check(phase === 'zoom-out' ? to.zoom < from.zoom * 0.8 : to.zoom > from.zoom * 1.5, 'Zoom did not scale the real camera');
    return { phase, ...frameStats(samples.slice(first, last + 1).map(sample => sample.interval)), from, to };
  });
  const report = {
    kind: 'react-scene-replay', ...stats, pass: replayPasses(stats),
    measurement: 'Scene rAF callback intervals, not compositor presentation timestamps',
    droppedDefinition: 'Estimated missed 120 Hz slots: sum(max(0, round(interval / (1000 / 120)) - 1)) / (observed + missed)',
    scheduler: 'CanvasEngine.registerFrameParticipant; microtask wheel dispatch; no additional rAF loop',
    cards: 300, implementation, phases, before, after: engine.inspect(),
    callbackCpu: { p50: present([...samples].sort((a, b) => a.cpu - b.cpu)[Math.ceil(samples.length * 0.5) - 1]).cpu, p95: present([...samples].sort((a, b) => a.cpu - b.cpu)[Math.ceil(samples.length * 0.95) - 1]).cpu },
    hidden, hostConnected: true, tauri: true, userAgent: navigator.userAgent, devicePixelRatio,
    viewport: { width: rect.width, height: rect.height },
    assets: performance.getEntriesByType('resource').filter(entry => /\.(js|css)(\?|$)/.test(entry.name)).map(entry => new URL(entry.name).pathname),
    errors, samples,
  };
  const result = await fetch(config.collector, { method: 'POST', body: JSON.stringify(report) });
  check(result.ok, 'Native collector rejected the replay report');
}

measure().catch(async error => {
  await fetch(config.collector, { method: 'POST', body: JSON.stringify({ error: message(error), errors }) });
});
