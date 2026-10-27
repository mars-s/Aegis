import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { chromium, webkit } from 'playwright';
import type { Browser, Page } from 'playwright';
import type {} from '../../perf/scene/browser-fixture.js';

const scenePort = Number(process.env.AEGIS_PORT_OFFSET ?? 4100);
const url = `http://127.0.0.1:${scenePort}/checks/perf/scene/index.html`;
const output = process.env.AEGIS_CHECK_OUT ?? mkdtempSync(join(tmpdir(), 'aegis-scene-evidence-'));
mkdirSync(output, { recursive: true });
const data = mkdtempSync(join(tmpdir(), 'aegis-scene-data-')), cache = mkdtempSync(join(tmpdir(), 'aegis-scene-vite-'));
let server: ViteDevServer | null = null, browser: Browser | null = null;
async function page(motion = false, insets = false): Promise<Page> {
  if (!browser) throw new Error('Browser not started');
  const result = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await result.goto(url + `?motion=${motion ? 'on' : 'off'}${insets ? '&insets=1' : ''}`);
  await result.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4);
  await idle(result);
  return result;
}
async function idle(page: Page): Promise<void> { await page.waitForFunction(() => window.sceneHarness.engine.inspect().pendingFrames === 0); await page.waitForTimeout(35); }

beforeAll(async () => {
  process.env.AEGIS_DATA = data; process.env.AEGIS_VITE_CACHE = cache; process.env.AEGIS_PORT_OFFSET = String(scenePort);
  const resolveApp = createRequire(join(process.cwd(), 'app/package.json'));
  server = await createServer({ root: process.cwd(), configFile: false, cacheDir: cache, resolve: { alias: [
    { find: 'react-dom/client', replacement: resolveApp.resolve('react-dom/client') },
    { find: 'react-dom', replacement: resolveApp.resolve('react-dom') },
    { find: 'react', replacement: resolveApp.resolve('react') },
  ] }, server: { port: scenePort, strictPort: true, host: '127.0.0.1', fs: { allow: [process.cwd()] } }, optimizeDeps: { include: ['react', 'react-dom/client', 'react-dom', 'zod/v4'] } });
  await server.listen(); browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); await server?.close(); rmSync(data, { recursive: true, force: true }); rmSync(cache, { recursive: true, force: true }); });

describe('real scene attachment', () => {
  test('discards a deferred tool batch when its board epoch changes', async () => {
    const p = await page();
    await p.evaluate(() => {
      window.sceneHarness.engine.commitTool({ commands: [{ op: 'create', type: 'note', text: 'Stale tool result' }], selection: [] });
      window.sceneHarness.replace(10);
    });
    await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
    expect(await p.evaluate(() => window.sceneHarness.board().cards.some(card => card.text === 'Stale tool result'))).toBe(false);
    await p.close();
  });

  test('paints tool previews in the scene frame and commits one batch after its input callback', async () => {
    const p = await page();
    await p.mouse.move(1100, 700);
    const report = p.evaluate(() => new Promise<{ readonly events: readonly string[]; readonly samples: number; readonly pixel: readonly number[]; readonly before: number; readonly after: number; readonly batches: number }>(resolve => {
      const engine = window.sceneHarness.engine, events: string[] = [];
      let samples = 0;
      engine.tool({
        accepts: point => point.button === 0,
        down: () => { events.push('down'); engine.preview({ cursor: 'crosshair', primitives: [{ kind: 'rect', opacity: 1, space: 'screen', bounds: { x: 20, y: 20, width: 30, height: 30 }, radius: 0, fill: { kind: 'hex', value: '#0044ff' }, stroke: null }] }); },
        move: points => { if (events.includes('down')) samples += points.length; },
        up: () => {
          events.push('up'); const before = engine.inspect().frameCount;
          engine.commitTool({ commands: [{ op: 'create', type: 'note', text: 'One tool batch' }], selection: [] });
          engine.afterInput(() => {
            const canvas = document.querySelector<HTMLCanvasElement>('#overlay');
            const pixel = canvas?.getContext('2d')?.getImageData(25, 25, 1, 1).data;
            resolve({ events, samples, pixel: pixel ? [...pixel] : [], before, after: engine.inspect().frameCount, batches: window.sceneHarness.calls.length });
          });
        },
        acceptsKey: key => key.key === 'Enter', key: key => { events.push(key.key); }, cancel: reason => { events.push(reason); },
      });
    }));
    await p.mouse.down(); await p.mouse.move(1150, 740, { steps: 4 }); await p.mouse.up();
    const result = await report;
    expect(result.events).toEqual(['down', 'up']);
    expect(result.samples).toBeGreaterThanOrEqual(4);
    expect(result.pixel).toEqual([0, 68, 255, 255]);
    expect(result.after).toBeGreaterThan(result.before);
    expect(result.batches).toBe(1);
    await p.close();
  });

  test('runs frame participants around scene writes and fits fixed-size windows inside the supplied area', async () => {
    const p = await page(false, true);
    await p.evaluate(() => {
      const events: string[] = [], engine = window.sceneHarness.engine;
      const world = document.getElementById('world');
      if (!world) throw new Error('The world is missing');
      Object.defineProperty(world.style, 'transform', { configurable: true, set: (value: string) => { events.push('world'); world.style.setProperty('transform', value); }, get: () => world.style.getPropertyValue('transform') });
      engine.registerFrameParticipant({
        read: () => { events.push('read'); }, write: () => { events.push('write'); world.dataset.participantOrder = events.join(','); },
        fitBounds: zoom => [{ x: 2500, y: 1000, width: 340 / zoom, height: 300 / zoom }],
      });
      engine.navigate({ kind: 'fit', ids: [], motion: 'instant' });
    });
    await idle(p);
    const result = await p.evaluate(() => {
      const engine = window.sceneHarness.engine, camera = engine.camera();
      return { area: engine.availableArea(), camera, order: document.getElementById('world')?.dataset.participantOrder,
        bounds: [...window.sceneHarness.board().cards.map(card => ({ x: card.x * camera.zoom + camera.x, y: card.y * camera.zoom + camera.y, width: card.w * camera.zoom, height: card.h * camera.zoom })), { x: 2500 * camera.zoom + camera.x, y: 1000 * camera.zoom + camera.y, width: 340, height: 300 }] };
    });
    expect(result.area).toEqual({ x: 240, y: 68, width: 800, height: 600 });
    expect(result.order).toMatch(/^(read,world,write)(,read,world,write)*$/);
    for (const rect of result.bounds) {
      expect(rect.x).toBeGreaterThanOrEqual(result.area.x - 0.01);
      expect(rect.y).toBeGreaterThanOrEqual(result.area.y - 0.01);
      expect(rect.x + rect.width).toBeLessThanOrEqual(result.area.x + result.area.width + 0.01);
      expect(rect.y + rect.height).toBeLessThanOrEqual(result.area.y + result.area.height + 0.01);
    }
    await p.close();
  });

  test('an early frame timestamp holds the glide at its start before moving monotonically', async () => {
    const p = await page(true);
    const result = await p.evaluate(() => {
      const engine = window.sceneHarness.engine;
      const from = engine.camera(), to = { x: -360, y: 180, zoom: 0.1 };
      const request = window.requestAnimationFrame, cancel = window.cancelAnimationFrame;
      const callbacks = new Map<number, FrameRequestCallback>();
      let serial = 0;
      window.requestAnimationFrame = callback => { const id = ++serial; callbacks.set(id, callback); return id; };
      window.cancelAnimationFrame = id => { callbacks.delete(id); };
      const advance = (timestamp: number) => {
        const next = callbacks.entries().next();
        if (next.done) throw new Error('The glide stopped before reaching its target');
        const [id, callback] = next.value;
        callbacks.delete(id); callback(timestamp);
        return engine.camera();
      };
      try {
        engine.navigate({ kind: 'restore', camera: to, motion: 'glide' });
        const start = advance(100);
        // A frame timestamp can precede the clock that started the animation.
        const early = advance(80);
        const samples = [early, advance(100), advance(120), advance(240), advance(400), advance(520)];
        for (let i = 0; callbacks.size && i < 8; i++) advance(1000);
        return { from, to, start, early, samples, pending: engine.inspect().pendingFrames };
      } finally {
        window.requestAnimationFrame = request; window.cancelAnimationFrame = cancel;
      }
    });
    expect(result.start).toEqual(result.from);
    expect(result.early).toEqual(result.from);
    let previous = result.from;
    for (const sample of result.samples) {
      expect(sample.x).toBeLessThanOrEqual(previous.x);
      expect(sample.x).toBeGreaterThanOrEqual(result.to.x);
      expect(sample.y).toBeGreaterThanOrEqual(previous.y);
      expect(sample.y).toBeLessThanOrEqual(result.to.y);
      expect(sample.zoom).toBeLessThanOrEqual(previous.zoom);
      expect(sample.zoom).toBeGreaterThanOrEqual(result.to.zoom);
      previous = sample;
    }
    expect(previous).toEqual(result.to);
    expect(result.pending).toBe(0);
    await p.close();
  });

  test('renders note/title React portals, then stops requesting idle frames', async () => {
    const p = await page();
    expect(await p.locator('.scene-card.title').innerText()).toContain('Thinking table');
    expect(await p.locator('[data-body="note-1"]').innerText()).toBe('Note 1');
    const first = await p.evaluate(() => window.sceneHarness.engine.inspect().frameCount);
    await p.waitForTimeout(120);
    expect(await p.evaluate(() => window.sceneHarness.engine.inspect().frameCount)).toBe(first);
    await p.screenshot({ path: join(output, 'scene-browser.png') });
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

  test('keeps static geometry and content until the crowded far exception', async () => {
    const p = await page();
    for (const zoom of [0.45, 0.05]) {
      await p.evaluate(zoom => window.sceneHarness.engine.navigate({ kind: 'restore', camera: { x: 11, y: 17, zoom }, motion: 'instant' }), zoom);
      await idle(p);
      const rep = await p.evaluate(() => window.sceneHarness.engine.representations().find(rep => rep.id === 'note-1'));
      expect(rep?.kind).toBe('detail');
      expect(rep?.bounds).toMatchObject({ x: 400 * zoom + 11, y: 80 * zoom + 17, width: 240 * zoom, height: 160 * zoom });
      expect(await p.locator('[data-body="note-1"]').isVisible()).toBe(true);
    }
    await p.evaluate(() => { window.sceneHarness.replace(5000); window.sceneHarness.engine.navigate({ kind: 'restore', camera: { x: 11, y: 17, zoom: 0.05 }, motion: 'instant' }); });
    await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.inspect().tier)).toBe('far');
    expect(await p.evaluate(() => window.sceneHarness.engine.representations().every(rep => rep.kind === 'far'))).toBe(true);
    const far = await p.evaluate(() => window.sceneHarness.engine.representations().find(rep => rep.id === 'note-1'));
    expect(far?.bounds).toMatchObject({ x: 31, y: 21, width: 12, height: 8 });
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
    expect(await p.locator('.card[data-id="note-1"]').count()).toBe(1);
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
      const card = window.sceneHarness.board().cards.find(card => card.id === 'note-1');
      if (!card) throw new Error('Missing measurement card');
      window.sceneHarness.update({ ...card, props: { ...card.props, contentFit: true } });
    });
    await idle(p);
    await p.evaluate(() => {
      const lease = window.sceneHarness.engine.leases.getSnapshot().find(lease => lease.cardId === 'note-1');
      const world = document.getElementById('world');
      if (!lease || !world) throw new Error('Missing measurement target');
      const events: string[] = [];
      Object.defineProperty(lease.host, 'scrollHeight', { configurable: true, get: () => { events.push('read'); return 158; } });
      Object.defineProperty(world.style, 'transform', { configurable: true, set: (value: string) => { events.push('write'); world.style.setProperty('transform', value); }, get: () => world.style.getPropertyValue('transform') });
      world.dataset.phaseEvents = '';
      window.sceneHarness.engine.requestMeasurement(lease.key, lease.generation);
      setTimeout(() => { world.dataset.phaseEvents = events.join(','); }, 60);
    });
    await p.waitForFunction(() => document.getElementById('world')?.dataset.phaseEvents?.includes('write'));
    expect(await p.locator('#world').getAttribute('data-phase-events')).toBe('read,write');
    await p.close();
  });

  test('Space and middle pan win over controls and iframe content, with immediate cursor feedback', async () => {
    const p = await page();
    for (const selector of ['[data-body="note-1"]', '[data-id="note-2"] .win-open', '[data-id="note-1"] .resize', 'iframe']) {
      await p.locator('#outside').focus();
      const box = await p.locator(selector).boundingBox();
      if (!box) throw new Error(`Missing pan target ${selector}`);
      const x = box.x + box.width / 2, y = box.y + Math.min(box.height / 2, 40);
      await p.mouse.move(x, y);
      const before = await p.evaluate(() => ({ board: window.sceneHarness.board(), camera: window.sceneHarness.engine.camera() }));
      await p.keyboard.down('Space');
      expect(await p.evaluate(([x, y]) => { const target = document.elementFromPoint(x ?? 0, y ?? 0); return target ? getComputedStyle(target).cursor : null; }, [x, y])).toBe('grab');
      await p.mouse.down();
      expect(await p.locator('#stage').evaluate(el => getComputedStyle(el).cursor)).toBe('grabbing');
      await p.mouse.move(x + 20, y + 10, { steps: 4 }); await p.mouse.up(); await p.keyboard.up('Space'); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.board())).toEqual(before.board);
      expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual({ ...before.camera, x: before.camera.x + 20, y: before.camera.y + 10 });
    }
    expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
    await p.locator('[data-body="note-1"]').click(); await p.keyboard.press('End'); await p.keyboard.press('Space'); await p.keyboard.type('typed');
    expect(await p.locator('[data-body="note-1"]').textContent()).toBe('Note 1 typed');
    expect(await p.locator('#stage').evaluate(el => el.classList.contains('pan-ready'))).toBe(false);
    const frameInput = p.frameLocator('iframe').getByRole('textbox', { name: 'Sandbox text' });
    await frameInput.click(); await frameInput.press('End');
    const iframeCamera = await p.evaluate(() => window.sceneHarness.engine.camera());
    await p.keyboard.press('Space'); await p.keyboard.type('two');
    expect(await frameInput.inputValue()).toBe('one two');
    expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual(iframeCamera);
    expect(await p.locator('#stage').evaluate(el => el.classList.contains('pan-ready'))).toBe(false);
    await p.locator('#outside').focus();
    const control = await p.locator('[data-id="note-2"] .win-open').boundingBox();
    if (!control) throw new Error('Missing control pan target');
    await p.mouse.move(control.x + 8, control.y + 8); await p.mouse.down({ button: 'middle' });
    await p.mouse.move(control.x + 38, control.y + 28, { steps: 3 }); await p.mouse.up({ button: 'middle' }); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual({ ...iframeCamera, x: iframeCamera.x + 30, y: iframeCamera.y + 20 });
    await p.locator('#outside').focus(); await p.keyboard.down('Space');
    await p.evaluate(() => dispatchEvent(new Event('blur')));
    expect(await p.locator('#stage').evaluate(el => el.classList.contains('pan-ready'))).toBe(false);
    await p.keyboard.up('Space'); await p.close();
  });

  test('marquee includes intersecting windows and group drags retain descendant spacing', async () => {
    const p = await page();
    await p.mouse.move(400, 80); await p.mouse.down(); await p.mouse.move(430, 120, { steps: 4 }); await p.mouse.up(); await idle(p);
    expect(await p.locator('.scene-card.selected').getAttribute('data-id')).toBe('note-1');
    expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
    await p.evaluate(() => {
      const board = window.sceneHarness.board();
      window.sceneHarness.load({ ...board, cards: board.cards.map(card => card.id === 'note-2' ? { ...card, type: 'template-group' } : card.id === 'note-3' ? { ...card, parent: 'note-2' } : card) });
    }); await idle(p);
    await p.keyboard.down('Meta'); await p.mouse.move(750, 104); await p.mouse.down(); await p.mouse.move(787, 133, { steps: 4 }); await p.mouse.up(); await p.keyboard.up('Meta'); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.calls)).toEqual([[{ op: 'move', id: 'note-2', x: 757, y: 109 }, { op: 'move', id: 'note-3', x: 1077, y: 109 }]]);
    await p.close();
  });

  test('Shift deselection releases its pointer capture lease pin', async () => {
    const p = await page();
    await p.keyboard.down('Shift'); await p.mouse.click(430, 104); await idle(p);
    expect(await p.locator('.scene-card.selected').count()).toBe(1);
    await p.mouse.click(430, 104); await p.keyboard.up('Shift'); await idle(p);
    expect(await p.locator('.scene-card.selected').count()).toBe(0);
    expect(await p.evaluate(() => window.sceneHarness.engine.inspect().pinnedLeases)).toBe(0);
    await p.close();
  });

  test('resize previews geometry, commits one fixed-height batch, and Escape cancels it', async () => {
    const p = await page(), grip = p.locator('[data-id="note-2"] .resize');
    const box = await grip.boundingBox(); if (!box) throw new Error('Missing resize grip');
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await p.mouse.move(start.x, start.y); await p.mouse.down(); await p.mouse.move(start.x + 37, start.y + 29, { steps: 5 }); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
    expect(await p.locator('[data-id="note-2"]').evaluate(el => ({ width: el.style.width, height: el.style.height }))).toEqual({ width: '277px', height: '189px' });
    await p.mouse.up(); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.calls)).toEqual([[{ op: 'update', id: 'note-2', set: { w: 277, h: 189, props: { fixedHeight: true } } }]]);
    const saved = await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'note-2'));
    expect(saved).toMatchObject({ w: 277, h: 189, props: { fixedHeight: true } });
    const again = await grip.boundingBox(); if (!again) throw new Error('Missing resized grip');
    await p.mouse.move(again.x + 8, again.y + 8); await p.mouse.down(); await p.mouse.move(again.x + 80, again.y + 80); await p.keyboard.press('Escape'); await p.mouse.up(); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'note-2'))).toEqual(saved);
    expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(1);
    await p.close();
  });

  test('pinch keeps the world anchor and waits for both fingers before another pan', async () => {
    const p = await page(), client = await p.context().newCDPSession(p);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 900, y: 500, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 900, y: 500, id: 1 }, { x: 1100, y: 500, id: 2 }] }); await idle(p);
    const anchor = await p.evaluate(() => window.sceneHarness.engine.screenToWorld({ x: 980, y: 480 }));
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 850, y: 500, id: 1 }, { x: 1150, y: 500, id: 2 }] }); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.camera().zoom)).toBeCloseTo(1.5);
    const after = await p.evaluate(() => window.sceneHarness.engine.screenToWorld({ x: 980, y: 480 }));
    expect(after.x).toBeCloseTo(anchor.x); expect(after.y).toBeCloseTo(anchor.y);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 850, y: 500, id: 1 }] }); await idle(p);
    const camera = await p.evaluate(() => window.sceneHarness.engine.camera());
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 950, y: 580, id: 1 }] }); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual(camera);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 950, y: 580, id: 1 }, { x: 1150, y: 600, id: 4 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 950, y: 580, id: 1 }, { x: 1200, y: 680, id: 4 }] }); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual(camera);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 950, y: 580, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 950, y: 580, id: 3 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 990, y: 610, id: 3 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual({ ...camera, x: camera.x + 40, y: camera.y + 30 });
    await p.close();
  });

  test('screen-sized Open action keeps focus through source updates and scales its anchor only', async () => {
    const p = await page();
    await p.locator('[data-id="note-2"] .win-open').hover();
    const action = p.locator('.window-actions button'); await action.waitFor();
    await action.focus();
    await p.evaluate(() => { const card = window.sceneHarness.board().cards.find(card => card.id === 'note-2'); if (card) window.sceneHarness.update({ ...card, text: 'Updated source' }); }); await idle(p);
    expect(await action.evaluate(el => el === document.activeElement)).toBe(true);
    const before = await action.boundingBox();
    await p.evaluate(() => window.sceneHarness.engine.navigate({ kind: 'restore', camera: { x: 100, y: 100, zoom: .5 }, motion: 'instant' })); await idle(p);
    const after = await action.boundingBox();
    expect(after?.width).toBe(before?.width); expect(after?.height).toBe(before?.height);
    expect(after?.x).not.toBe(before?.x);
    await action.click(); expect(await p.evaluate(() => window.sceneHarness.opened())).toBe(1);
    await p.close();
  });

  test('far orientation stays opt-in, uses true rectangles, and gives keyboard ownership to the aid', async () => {
    const p = await page();
    await p.evaluate(() => {
      const board = window.sceneHarness.board();
      window.sceneHarness.load({ ...board, cards: Array.from({ length: 40 }, (_, i) => ({ id: `orientation${i}`, type: 'note', heading: `Research window ${i + 1}`, text: 'Overview fixture', color: 'plain', x: 10000 + i % 8 * 1400, y: 10000 + Math.floor(i / 8) * 1200, w: 500 + i * 5, h: 300 + i * 3 })), links: [], view: { x: -400, y: -400, z: .05 } });
    });
    await p.locator('#outside').focus(); await p.mouse.move(1000, 700); await idle(p);
    const orientation = p.locator('.canvas-orientation'); expect(await orientation.isVisible()).toBe(false);
    await p.mouse.move(24, 450); await orientation.waitFor({ state: 'visible' });
    const labels = orientation.locator('span');
    expect(await labels.count()).toBeGreaterThan(0); expect(await labels.count()).toBeLessThanOrEqual(30);
    expect(await labels.evaluateAll(nodes => nodes.every(el => Number(el.dataset.cardId?.slice(11)) >= 10 && getComputedStyle(el).pointerEvents === 'auto' && parseFloat(getComputedStyle(el).fontSize) >= 11))).toBe(true);
    const label = labels.first(); await label.hover();
    const aid = orientation.locator('.orientation-aid'); await aid.waitFor({ state: 'visible' });
    expect(await aid.evaluate(el => {
      const rep = window.sceneHarness.engine.representations().find(rep => rep.id === el.dataset.cardId), rect = el.querySelector('rect');
      return !!rep && !!rect && Number(rect.getAttribute('x')) === rep.bounds.x && Number(rect.getAttribute('width')) === rep.bounds.width && getComputedStyle(rect).stroke === 'rgb(63, 141, 253)' && getComputedStyle(el).pointerEvents === 'none';
    })).toBe(true);
    const labelId = await label.getAttribute('data-card-id');
    await label.click(); await p.keyboard.press('Tab'); await idle(p);
    expect(await aid.getAttribute('data-card-id')).not.toBe(labelId);
    expect(await orientation.evaluate(el => el.querySelector('.orientation-aid')?.getAttribute('data-card-id') === document.activeElement?.getAttribute('data-card-id'))).toBe(true);
    await p.keyboard.press('Shift+Tab'); await idle(p); expect(await aid.getAttribute('data-card-id')).toBe(labelId);
    await p.locator('#outside').focus(); await p.mouse.move(1000, 700); await orientation.waitFor({ state: 'hidden' });
    await p.keyboard.press('Tab'); await p.locator('#stage').focus(); await orientation.waitFor({ state: 'visible' }); expect(await orientation.isVisible()).toBe(true);
    await p.evaluate(() => window.sceneHarness.engine.navigate({ kind: 'restore', camera: { x: 0, y: 0, zoom: .2 }, motion: 'instant' })); await idle(p);
    expect(await orientation.isVisible()).toBe(false);
    await p.close();
  });

  test('colliding far names offer every omitted name through the shared menu at all widths', async () => {
    const p = await page();
    for (const width of [1440, 1586, 390]) {
      await p.setViewportSize({ width, height: 900 });
      await p.evaluate(() => {
        const board = window.sceneHarness.board();
        window.sceneHarness.load({ ...board, cards: Array.from({ length: 9 }, (_, i) => ({ id: `supporting${i}`, type: 'note', heading: `Supporting window ${i + 1}`, text: 'Collision fixture', color: 'plain', x: 100000 + i * 40, y: 100000 + i * 40, w: 600, h: 400 })), links: [], view: { x: -4900, y: -4900, z: .05 } });
      });
      await p.locator('#outside').focus(); await p.mouse.move(width - 100, 600); await idle(p);
      const orientation = p.locator('.canvas-orientation'), chip = orientation.locator('.orientation-more');
      expect(await orientation.isVisible()).toBe(false);
      await p.mouse.move(width - 24, 450); await orientation.waitFor({ state: 'visible' });
      const labelled = await orientation.locator('span').allTextContents();
      expect(labelled.length).toBeGreaterThan(0); expect(labelled.length).toBeLessThan(9);
      expect(await chip.textContent()).toBe(`+${9 - labelled.length} more`);
      const box = await chip.boundingBox(); expect(box?.width).toBeGreaterThanOrEqual(44); expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box && box.x >= 20 && box.x + box.width <= width - 20).toBe(true);
      await chip.focus(); await p.keyboard.press('Enter');
      const menu = p.getByRole('menu', { name: 'More window names', exact: true }); await menu.waitFor();
      expect((await menu.getByRole('menuitem').allTextContents()).sort()).toEqual(Array.from({ length: 9 }, (_, i) => `Supporting window ${i + 1}`).filter(name => !labelled.includes(name)).sort());
      expect(await menu.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(36, 39, 43)');
      await p.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' }); expect(await chip.evaluate(el => el === document.activeElement)).toBe(true);
      await p.keyboard.press('Enter'); await menu.waitFor(); await p.keyboard.press('ArrowDown');
      expect(await menu.getByRole('menuitem').nth(1).evaluate(el => el === document.activeElement)).toBe(true);
      await p.keyboard.press('Enter'); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.engine.camera().zoom)).toBeGreaterThan(.2);
      expect(await orientation.isVisible()).toBe(false);
    }
    await p.close();
  });

  test('supports the same attachment in WebKit', async () => {
    const wk = await webkit.launch({ headless: true });
    try {
      const p = await wk.newPage({ viewport: { width: 1440, height: 900 } }); await p.goto(url);
      await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4);
      await p.evaluate(() => window.sceneHarness.engine.navigate({ kind: 'fit', ids: [], motion: 'instant' })); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.engine.inspect().visibleCards)).toBe(10);
      await p.keyboard.down('Space');
      expect(await p.locator('#stage').evaluate(el => getComputedStyle(el).cursor)).toBe('grab');
      const before = await p.evaluate(() => window.sceneHarness.engine.camera());
      await p.mouse.move(600, 500); await p.mouse.down(); await p.mouse.move(640, 530, { steps: 4 });
      expect(await p.locator('#stage').evaluate(el => getComputedStyle(el).cursor)).toBe('grabbing');
      await p.mouse.up(); await p.keyboard.up('Space'); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual({ ...before, x: before.x + 40, y: before.y + 30 });
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
    } finally { await wk.close(); }
  });

  test('records a 5000-note scene replay from the engine callback', async () => {
    const p = await page();
    await p.evaluate(() => window.sceneHarness.replace(5000)); await idle(p);
    const results = [];
    for (let repetition = 0; repetition < 3; repetition++) {
      for (const scenario of ['detail-pan', 'scaled-pan', 'far-pan'] as const) {
        const report = await p.evaluate(scenario => window.sceneHarness.replay(scenario, 120), scenario);
        expect(report.samples.length).toBeGreaterThan(90);
        expect(report.samples.every(sample => sample.cpu >= 0 && sample.phases.reads >= 0 && sample.phases.writes >= 0)).toBe(true);
        results.push({ repetition, ...report });
      }
    }
    writeFileSync(join(output, 'scene-replay.json'), `${JSON.stringify({ browser: browser?.version(), runtime: 'headless-chromium', viewport: { width: 1440, height: 900 }, pacing: 'unavailable', displayGoal: 'blocked', results }, null, 2)}\n`);
    await p.close();
  }, 30000);
});
