import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { chromium, webkit } from '/Users/avi/.npm/_npx/6301df25ace19226/node_modules/playwright/index.js';
import type { Browser, Page } from '/Users/avi/.npm/_npx/6301df25ace19226/node_modules/playwright/index.js';
import type {} from '../../perf/scene/browser-fixture.js';

const url = 'http://127.0.0.1:4140/checks/perf/scene/index.html';
const data = mkdtempSync(join(tmpdir(), 'aegis-scene-data-')), cache = mkdtempSync(join(tmpdir(), 'aegis-scene-vite-'));
let server: ViteDevServer | null = null, browser: Browser | null = null;
async function page(): Promise<Page> {
  if (!browser) throw new Error('Browser not started');
  const result = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await result.goto(url);
  await result.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4);
  await idle(result);
  return result;
}
async function idle(page: Page): Promise<void> { await page.waitForFunction(() => window.sceneHarness.engine.inspect().pendingFrames === 0); await page.waitForTimeout(35); }

beforeAll(async () => {
  process.env.AEGIS_DATA = data; process.env.AEGIS_VITE_CACHE = cache; process.env.AEGIS_PORT_OFFSET = '4140';
  const resolveApp = createRequire(join(process.cwd(), 'app/package.json'));
  server = await createServer({ root: process.cwd(), configFile: false, cacheDir: cache, resolve: { alias: [
    { find: 'react-dom/client', replacement: resolveApp.resolve('react-dom/client') },
    { find: 'react-dom', replacement: resolveApp.resolve('react-dom') },
    { find: 'react', replacement: resolveApp.resolve('react') },
  ] }, server: { port: 4140, strictPort: true, host: '127.0.0.1', fs: { allow: [process.cwd(), '/tmp/aegis-wt/react/foundation-domain/packages/domain'] } }, optimizeDeps: { include: ['react', 'react-dom/client', 'react-dom', 'zod/v4'] } });
  await server.listen(); browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); await server?.close(); rmSync(data, { recursive: true, force: true }); rmSync(cache, { recursive: true, force: true }); });

describe('real scene attachment', () => {
  test('renders note/title React portals, then stops requesting idle frames', async () => {
    const p = await page();
    expect(await p.locator('.scene-card.title').innerText()).toContain('Thinking table');
    expect(await p.locator('[data-body="note-1"]').innerText()).toBe('Note 1');
    const first = await p.evaluate(() => window.sceneHarness.engine.inspect().frameCount);
    await p.waitForTimeout(120);
    expect(await p.evaluate(() => window.sceneHarness.engine.inspect().frameCount)).toBe(first);
    await p.screenshot({ path: '/Users/avi/.codex/orchestrate/aegis-react/evidence/worker-scene-browser.png' });
    await p.close();
  });

  test('pans and anchored zooms without notifying body leases or submitting commands', async () => {
    const p = await page();
    const before = await p.evaluate(() => ({ notifications: window.sceneHarness.notifications(), camera: window.sceneHarness.engine.camera(), keys: window.sceneHarness.engine.leases.getSnapshot().map(lease => lease.key) }));
    await p.locator('#stage').dispatchEvent('wheel', { clientX: 600, clientY: 400, deltaX: 8, deltaY: 4 }); await idle(p);
    const pan = await p.evaluate(() => window.sceneHarness.engine.camera());
    expect(pan.x).toBe(before.camera.x - 8); expect(pan.y).toBe(before.camera.y - 4);
    const anchor = await p.evaluate(() => window.sceneHarness.engine.screenToWorld({ x: 580, y: 380 }));
    await p.locator('#stage').dispatchEvent('wheel', { clientX: 600, clientY: 400, deltaY: -4, ctrlKey: true }); await idle(p);
    const after = await p.evaluate(() => ({ anchor: window.sceneHarness.engine.screenToWorld({ x: 580, y: 380 }), notifications: window.sceneHarness.notifications(), keys: window.sceneHarness.engine.leases.getSnapshot().map(lease => lease.key), calls: window.sceneHarness.calls.length }));
    expect(after.anchor.x).toBeCloseTo(anchor.x); expect(after.anchor.y).toBeCloseTo(anchor.y);
    expect(after.notifications).toBe(before.notifications); expect(after.keys).toEqual(before.keys); expect(after.calls).toBe(0);
    await p.close();
  });

  test('drag uses one command batch and Cmd bypasses the configured grid', async () => {
    const p = await page();
    await p.keyboard.down('Meta');
    await p.mouse.move(430, 104); await p.mouse.down(); await p.mouse.move(467, 133, { steps: 5 }); await p.mouse.up(); await p.keyboard.up('Meta'); await idle(p);
    const result = await p.evaluate(() => ({ calls: window.sceneHarness.calls, card: window.sceneHarness.board().cards.find(card => card.id === 'note-1') }));
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toEqual([{ op: 'move', id: 'note-1', x: 437, y: 109 }]);
    expect(result.card?.x).toBe(437); expect(result.card?.y).toBe(109);
    await p.close();
  });

  test('Space takes pan ownership and grouped grid snapping preserves spacing', async () => {
    const p = await page();
    await p.keyboard.down('Space'); await p.mouse.move(500, 500); await p.mouse.down(); await p.mouse.move(540, 530, { steps: 4 }); await p.mouse.up(); await p.keyboard.up('Space'); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual({ x: 40, y: 30, zoom: 1 });
    expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
    await p.evaluate(() => window.sceneHarness.engine.navigate({ kind: 'restore', camera: { x: 0, y: 0, zoom: 1 }, motion: 'instant' })); await idle(p);
    await p.keyboard.down('Shift'); await p.mouse.click(430, 104); await idle(p); await p.mouse.click(750, 104); await idle(p); await p.keyboard.up('Shift');
    await p.mouse.move(430, 104); await p.mouse.down(); await p.mouse.move(467, 133, { steps: 4 }); await p.mouse.up(); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.calls)).toEqual([[{ op: 'move', id: 'note-1', x: 432, y: 120 }, { op: 'move', id: 'note-2', x: 752, y: 120 }]]);
    await p.close();
  });

  test('parking preserves an iframe document and host parent for the lease lifetime', async () => {
    const p = await page();
    const iframe = p.frameLocator('iframe'); await iframe.locator('p').waitFor();
    const first = await p.evaluate(() => {
      const lease = window.sceneHarness.engine.leases.getSnapshot().find(lease => lease.cardId === 'note-1');
      if (!lease) throw new Error('Missing note lease');
      lease.host.dataset.parentIdentity = 'original';
      return { key: lease.key, generation: lease.generation };
    });
    const identity = await p.frames()[1]?.evaluate(() => Reflect.get(window, 'frameIdentity'));
    await p.evaluate(() => window.sceneHarness.engine.navigate({ kind: 'restore', camera: { x: -10000, y: -10000, zoom: 1 }, motion: 'instant' })); await idle(p);
    await p.evaluate(() => window.sceneHarness.engine.navigate({ kind: 'restore', camera: { x: 0, y: 0, zoom: 1 }, motion: 'instant' })); await idle(p);
    expect(await p.evaluate(() => { const lease = window.sceneHarness.engine.leases.getSnapshot().find(lease => lease.cardId === 'note-1'); return lease && { key: lease.key, generation: lease.generation, parent: lease.host.parentElement?.parentElement?.id, original: lease.host.dataset.parentIdentity }; })).toEqual({ ...first, parent: 'world', original: 'original' });
    expect(await p.frames()[1]?.evaluate(() => Reflect.get(window, 'frameIdentity'))).toBe(identity);
    await p.close();
  });

  test('pins focused IME bodies, rejects stale measurements and disposes frames', async () => {
    const p = await page();
    await p.locator('[data-body="note-1"]').focus(); await p.locator('[data-body="note-1"]').dispatchEvent('compositionstart');
    await p.evaluate(() => window.sceneHarness.engine.navigate({ kind: 'restore', camera: { x: 0, y: 0, zoom: 0.45 }, motion: 'instant' })); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.representations().find(rep => rep.id === 'note-1')?.kind)).toBe('detail');
    expect(await p.locator('[data-body="note-1"]').isVisible()).toBe(true);
    await p.evaluate(() => {
      const lease = window.sceneHarness.engine.leases.getSnapshot()[0];
      if (lease) window.sceneHarness.engine.requestMeasurement(lease.key, lease.generation + 1);
    }); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.inspect().discardedMeasurements)).toBe(1);
    await p.evaluate(() => { window.sceneHarness.engine.dispose(); window.sceneHarness.removePortals(); });
    expect(await p.evaluate(() => window.sceneHarness.engine.inspect().pendingFrames)).toBe(0);
    await p.waitForFunction(() => document.querySelectorAll('.scene-card').length === 0);
    await p.close();
  });

  test('waits for exact cleanup acknowledgement before shell reuse', async () => {
    const p = await page();
    await p.evaluate(() => {
      const harness = window.sceneHarness;
      for (const lease of harness.engine.leases.getSnapshot()) lease.host.dataset.originalGeneration = `${lease.generation}`;
      harness.holdCleanup(true); harness.replace(20);
    }); await idle(p);
    await p.waitForFunction(() => window.sceneHarness.cleanups.length >= 4);
    expect(await p.evaluate(() => window.sceneHarness.engine.leases.getSnapshot().every(lease => !lease.host.dataset.originalGeneration))).toBe(true);
    const releasing = await p.evaluate(() => window.sceneHarness.engine.inspect().releasingLeases);
    expect(releasing).toBeGreaterThan(0);
    await p.evaluate(() => window.sceneHarness.acknowledgeReleased(true)); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.inspect().releasingLeases)).toBe(releasing);
    await p.evaluate(() => window.sceneHarness.acknowledgeReleased(false)); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.inspect().releasingLeases)).toBe(0);
    await p.evaluate(() => window.sceneHarness.replace(30)); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.leases.getSnapshot().some(lease => lease.host.dataset.originalGeneration === '0' && lease.generation === 1))).toBe(true);
    await p.close();
  });

  test('reads queued geometry before the first scene write in a frame', async () => {
    const p = await page();
    await p.evaluate(() => {
      const lease = window.sceneHarness.engine.leases.getSnapshot().find(lease => lease.cardId === 'note-1');
      const world = document.getElementById('world');
      if (!lease || !world) throw new Error('Missing measurement target');
      const events: string[] = [];
      Object.defineProperty(lease.host, 'scrollHeight', { configurable: true, get: () => { events.push('read'); return 160; } });
      Object.defineProperty(world.style, 'transform', { configurable: true, set: (value: string) => { events.push('write'); world.style.setProperty('transform', value); }, get: () => world.style.getPropertyValue('transform') });
      world.dataset.phaseEvents = '';
      window.sceneHarness.engine.requestMeasurement(lease.key, lease.generation);
      setTimeout(() => { world.dataset.phaseEvents = events.join(','); }, 60);
    });
    await p.waitForFunction(() => document.getElementById('world')?.dataset.phaseEvents?.includes('write'));
    expect(await p.locator('#world').getAttribute('data-phase-events')).toBe('read,write');
    await p.close();
  });

  test('supports the same attachment in WebKit', async () => {
    const wk = await webkit.launch({ headless: true });
    try {
      const p = await wk.newPage({ viewport: { width: 1440, height: 900 } }); await p.goto(url);
      await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4);
      await p.evaluate(() => window.sceneHarness.engine.navigate({ kind: 'fit', ids: [], motion: 'instant' })); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.engine.inspect().visibleCards)).toBe(10);
    } finally { await wk.close(); }
  });

  test('records a 5000-note scene replay from the engine callback', async () => {
    const p = await page();
    await p.evaluate(() => window.sceneHarness.replace(5000)); await idle(p);
    const results = [];
    for (let repetition = 0; repetition < 3; repetition++) {
      for (const scenario of ['detail-pan', 'summary-pan', 'cluster-pan'] as const) {
        const report = await p.evaluate(scenario => window.sceneHarness.replay(scenario, 120), scenario);
        expect(report.samples.length).toBeGreaterThan(90);
        expect(report.samples.every(sample => sample.cpu >= 0 && sample.phases.reads >= 0 && sample.phases.writes >= 0)).toBe(true);
        results.push({ repetition, ...report });
      }
    }
    writeFileSync('/Users/avi/.codex/orchestrate/aegis-react/evidence/worker-scene-replay.json', `${JSON.stringify({ browser: browser?.version(), runtime: 'headless-chromium', viewport: { width: 1440, height: 900 }, pacing: 'unavailable', displayGoal: 'blocked', results }, null, 2)}\n`);
    await p.close();
  }, 30000);
});
