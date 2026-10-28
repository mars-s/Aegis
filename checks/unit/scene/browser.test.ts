import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { chromium, webkit } from 'playwright';
import type { Browser, CDPSession, Page } from 'playwright';
import type {} from '../../perf/scene/browser-fixture.js';

declare global { interface Window { arrivalShells: Element[]; resumeSceneFrames: () => void; touchMenuEvents: { readonly id: string | null; readonly x: number; readonly y: number }[]; touchReleases: number } }

const scenePort = Number(process.env.AEGIS_PORT_OFFSET ?? 4100);
const url = `http://127.0.0.1:${scenePort}/checks/perf/scene/index.html`;
const output = process.env.AEGIS_CHECK_OUT ?? mkdtempSync(join(tmpdir(), 'aegis-scene-evidence-'));
mkdirSync(output, { recursive: true });
const data = mkdtempSync(join(tmpdir(), 'aegis-scene-data-')), cache = mkdtempSync(join(tmpdir(), 'aegis-scene-vite-'));
let server: ViteDevServer | null = null, browser: Browser | null = null;
async function page(motion: boolean | 'system' = false, insets = false, attachmentBrowser = browser): Promise<Page> {
  if (!attachmentBrowser) throw new Error('Browser not started');
  const result = await attachmentBrowser.newPage({ viewport: { width: 1440, height: 900 } });
  await result.goto(url + `?motion=${motion === 'system' ? 'system' : motion ? 'on' : 'off'}${insets ? '&insets=1' : ''}`);
  await result.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4);
  await idle(result);
  return result;
}
async function idle(page: Page): Promise<void> { await page.waitForFunction(() => window.sceneHarness.engine.inspect().pendingFrames === 0); await page.waitForTimeout(35); }
async function observeTouch(p: Page): Promise<CDPSession> {
  await p.evaluate(() => {
    window.touchMenuEvents = []; window.touchReleases = 0;
    document.addEventListener('contextmenu', event => {
      event.preventDefault();
      if (!event.isTrusted) window.touchMenuEvents.push({ id: event.target instanceof Element ? event.target.closest('.card')?.getAttribute('data-id') ?? null : null, x: event.clientX, y: event.clientY });
    });
    document.addEventListener('pointerup', () => { window.touchReleases++; }, true);
  });
  return p.context().newCDPSession(p);
}
async function touch(client: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: readonly { readonly id: number; readonly x: number; readonly y: number }[]): Promise<void> {
  await client.send('Input.dispatchTouchEvent', { type, touchPoints: [...points] });
}

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
  test.each(['chromium', 'webkit'] as const)('window actions avoid individual agent arrows in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.locator('[data-id="note-2"]').hover(); await idle(p);
      const action = p.locator('.window-actions button'), box = await action.boundingBox();
      if (!box) throw new Error('Missing actual floating Open action');
      await p.evaluate(box => {
        const host = document.createElement('div'), arrow = document.createElement('button');
        host.className = 'aegis-agents'; arrow.className = 'agent-edge'; arrow.textContent = 'Agent';
        Object.assign(arrow.style, { position: 'fixed', left: `${box.x}px`, top: `${box.y}px`, width: '44px', height: '44px', zIndex: '50' });
        host.append(arrow); document.body.append(host); window.sceneHarness.engine.invalidate();
      }, box); await idle(p);
      const actionBox = await action.boundingBox(), arrowBox = await p.locator('.agent-edge').boundingBox();
      if (!actionBox || !arrowBox) throw new Error('Missing pointer target');
      expect(actionBox.x < arrowBox.x + arrowBox.width && actionBox.x + actionBox.width > arrowBox.x && actionBox.y < arrowBox.y + arrowBox.height && actionBox.y + actionBox.height > arrowBox.y).toBe(false);
      await action.click(); expect(await p.evaluate(() => window.sceneHarness.opened())).toBe(1); await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('preferences draw real grid shapes and retain saved modes in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.goto(url + '?motion=off&appearance=1&wireframe=1'); await p.waitForFunction(() => !!window.sceneHarness); await idle(p);
      const pixels = () => p.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#backdrop'), context = canvas?.getContext('2d');
        if (!context) throw new Error('Missing real grid canvas');
        const data = context.getImageData(0, 0, 200, 200).data;
        let hash = 2166136261, count = 0, maxRow = 0;
        for (let y = 0; y < 200; y++) { let row = 0; for (let x = 0; x < 200; x++) { const alpha = data[(y * 200 + x) * 4 + 3] ?? 0; hash = Math.imul(hash ^ alpha, 16777619); if (alpha) { row++; count++; } } maxRow = Math.max(maxRow, row); }
        return { hash, count, maxRow };
      });
      const dots = await pixels(); expect(dots.count).toBeGreaterThan(0);
      await p.evaluate(() => window.sceneHarness.preference('gridShape', 'lines')); await idle(p);
      const lines = await pixels(); expect(lines.maxRow).toBeGreaterThan(180); expect(lines.hash).not.toBe(dots.hash);
      const modes = ['dots', 'cross', 'x', 'heart', 'tri', 'square', 'sparkle', 'lines'] as const;
      const hashes = new Set<number>();
      for (const mode of modes) { await p.evaluate(mode => window.sceneHarness.preference('gridShape', mode), mode); await idle(p); hashes.add((await pixels()).hash); }
      expect(hashes.size).toBe(modes.length);
      await p.evaluate(() => { window.sceneHarness.preference('gridShape', 'heart'); window.sceneHarness.preference('gridVisible', 'off'); }); await idle(p);
      expect((await pixels()).count).toBe(0);
      await p.reload(); await p.waitForFunction(() => !!window.sceneHarness); await idle(p); expect((await pixels()).count).toBe(0);
      await p.evaluate(() => window.sceneHarness.preference('gridVisible', 'on')); await idle(p);
      const hearts = await pixels(); expect(hearts.count).toBeGreaterThan(dots.count);
      await p.reload(); await p.waitForFunction(() => !!window.sceneHarness); await idle(p); expect((await pixels()).hash).toBe(hearts.hash);
      await p.evaluate(() => { localStorage.removeItem('aegis:grid-shape'); localStorage.setItem('aegis:grid', 'cross'); });
      await p.reload(); await p.waitForFunction(() => !!window.sceneHarness); await idle(p); const cross = await pixels(); expect(cross.count).toBeGreaterThan(dots.count * 3);
      await p.evaluate(() => localStorage.setItem('aegis:grid-shape', 'crosses'));
      await p.reload(); await p.waitForFunction(() => !!window.sceneHarness); await idle(p); expect((await pixels()).hash).toBe(cross.hash);
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('loose tilt changes real geometry without changing authored rotation in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.goto(url + '?motion=off&appearance=1&wireframe=1'); await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4); await idle(p);
      await p.frameLocator('iframe[title="Lifetime fixture"]').getByLabel('Sandbox text').fill('retained tilt value');
      await p.evaluate(() => window.sceneHarness.preference('tilt', 'on')); await idle(p);
      const rotation = () => p.evaluate(() => window.sceneHarness.engine.representations().find(rep => rep.id === 'note-2')?.rotation);
      expect(await rotation()).toBeCloseTo(-.8, 8);
      expect(await p.locator('[data-id="note-2"]').evaluate(node => node.style.transform)).toContain('rotate(-0.8deg)');
      expect(await p.evaluate(() => window.sceneHarness.engine.hitTest({ x: 958, y: 79 }))).toBe('note-2');
      expect(await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'note-2')?.rot ?? 0)).toBe(0);
      expect(await p.frameLocator('iframe[title="Lifetime fixture"]').getByLabel('Sandbox text').inputValue()).toBe('retained tilt value');
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
      await p.reload(); await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4); await idle(p); expect(await rotation()).toBeCloseTo(-.8, 8);
      await p.evaluate(() => { window.sceneHarness.batch([{ op: 'update', id: 'note-2', set: { rot: 30 } }], 'local'); window.sceneHarness.select(['note-2']); }); await idle(p);
      expect(await rotation()).toBeCloseTo(29.2, 8);
      const box = await p.locator('[data-id="note-2"]').boundingBox(), handle = await p.getByRole('button', { name: 'Rotate fixture' }).boundingBox();
      if (!box || !handle) throw new Error('Missing native rotation control');
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }, start = { x: Math.round(handle.x + handle.width / 2), y: Math.round(handle.y + handle.height / 2) };
      const x = start.x - centre.x, y = start.y - centre.y, angle = Math.PI / 4;
      await p.keyboard.down('Meta'); await p.mouse.move(start.x, start.y); await p.mouse.down();
      const end = { x: Math.round(centre.x + x * Math.cos(angle) - y * Math.sin(angle)), y: Math.round(centre.y + x * Math.sin(angle) + y * Math.cos(angle)) };
      const expected = 30 + (Math.atan2(end.y - centre.y, end.x - centre.x) - Math.atan2(start.y - centre.y, start.x - centre.x)) * 180 / Math.PI;
      await p.mouse.move(end.x, end.y, { steps: 8 });
      await p.mouse.up(); await p.keyboard.up('Meta'); await idle(p);
      const authored = await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'note-2')?.rot);
      expect(authored).toBeCloseTo(expected, 4); expect(await rotation()).toBeCloseTo(expected - .8, 4);
      await p.evaluate(() => window.sceneHarness.batch([{ op: 'update', id: 'note-2', set: { group: 'flat-group' } }], 'local')); await idle(p); expect(await rotation()).toBeCloseTo(expected, 4);
      await p.evaluate(() => window.sceneHarness.batch([{ op: 'update', id: 'note-2', set: { group: '' } }], 'local')); await idle(p); expect(await rotation()).toBeCloseTo(expected - .8, 4);
      await p.evaluate(() => window.sceneHarness.preference('tilt', 'off')); await idle(p); expect(await rotation()).toBeCloseTo(expected, 4);
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(1);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('import arrival follows actual recycled shell identity only once in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.goto(url + '?motion=on&arrival=1&wireframe=1'); await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4); await idle(p);
      await p.evaluate(() => { window.arrivalShells = [...document.querySelectorAll<HTMLElement>('#world > .card')]; window.sceneHarness.replace(0); }); await idle(p);
      await p.evaluate(() => { window.sceneHarness.rememberArrival(['arrivalone'], false); window.sceneHarness.batch([{ op: 'create', newId: 'arrivalone', type: 'note', x: 100, y: 100, w: 240, h: 160 }], 'local'); });
      await p.waitForFunction(() => !!document.querySelector('[data-id="arrivalone"]'));
      expect(await p.locator('[data-id="arrivalone"]').evaluate(node => window.arrivalShells.includes(node))).toBe(true);
      expect(await p.locator('[data-id="arrivalone"]').evaluate(node => node.getAnimations().some(animation => animation.effect?.getTiming().duration === 240))).toBe(true);
      await p.waitForTimeout(270);
      await p.evaluate(() => { window.sceneHarness.replace(0); }); await idle(p);
      await p.evaluate(() => { window.sceneHarness.batch([{ op: 'create', newId: 'arrivalone', type: 'note', x: 100, y: 100, w: 240, h: 160 }], 'local'); }); await idle(p);
      expect(await p.locator('[data-id="arrivalone"]').evaluate(node => node.getAnimations().length)).toBe(0);
      await p.evaluate(() => { window.sceneHarness.rememberArrival(['arrivalkeys'], true); window.sceneHarness.batch([{ op: 'create', newId: 'arrivalkeys', type: 'note', x: 400, y: 100, w: 240, h: 160 }], 'local'); }); await idle(p);
      expect(await p.locator('[data-id="arrivalkeys"]').evaluate(node => node.getAnimations().length)).toBe(0);
      await p.evaluate(() => { window.sceneHarness.rememberArrival(['arrivalstale'], false); window.sceneHarness.replace(0); }); await idle(p);
      await p.evaluate(() => window.sceneHarness.batch([{ op: 'create', newId: 'arrivalstale', type: 'note', x: 100, y: 100 }], 'local')); await idle(p);
      expect(await p.locator('[data-id="arrivalstale"]').evaluate(node => node.getAnimations().length)).toBe(0);
      await p.evaluate(() => { window.sceneHarness.rememberArrival(['arrivaldispose'], false); window.sceneHarness.disposeArrival(); window.sceneHarness.batch([{ op: 'create', newId: 'arrivaldispose', type: 'note', x: 400, y: 100 }], 'local'); }); await idle(p);
      expect(await p.locator('[data-id="arrivaldispose"]').evaluate(node => node.getAnimations().length)).toBe(0);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('native release publishes one move before painting in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.goto(url + '?motion=off&wireframe=1'); await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4); await idle(p);
      const box = await p.locator('[data-id="note-2"]').boundingBox();
      if (!box) throw new Error('Missing native move source');
      const transform = await p.locator('[data-id="note-2"]').evaluate(el => el.style.transform);
      await p.evaluate(() => { window.requestAnimationFrame = () => 123456; });
      await p.mouse.move(box.x + 12, box.y + 110); await p.mouse.down();
      await p.mouse.move(box.x + 72, box.y + 150, { steps: 4 }); await p.mouse.up();
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(1);
      expect(await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'note-2'))).toMatchObject({ x: 780, y: 120 });
      expect(await p.locator('[data-id="note-2"]').evaluate(el => el.style.transform)).toBe(transform);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('native takeover cancels live agent motion before painting in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(true, false, alternate ?? browser);
      await p.evaluate(() => { window.sceneHarness.batch([{ op: 'move', id: 'note-2', x: 880, y: 120 }], 'agent'); });
      await p.waitForFunction(() => document.querySelector('[data-id="note-2"]')?.getAnimations().some(animation => animation.id === 'aegis-agent-card'));
      await p.evaluate(() => {
        for (const animation of document.querySelector('[data-id="note-2"]')?.getAnimations() ?? []) if (animation.id === 'aegis-agent-card') animation.effect?.updateTiming({ duration: 10000 });
        window.requestAnimationFrame = () => 123456;
      });
      const box = await p.locator('[data-id="note-2"]').boundingBox();
      if (!box) throw new Error('Missing animated source');
      await p.mouse.move(box.x + 12, box.y + 110); await p.mouse.down();
      expect(await p.locator('[data-id="note-2"]').evaluate(el => el.getAnimations().filter(animation => animation.id === 'aegis-agent-card').length)).toBe(0);
      await p.mouse.up(); await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('replacement keeps the new epoch discrete input when old input is queued in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.goto(url + '?motion=off&wireframe=1'); await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4); await idle(p);
      const box = await p.locator('[data-id="note-2"]').boundingBox();
      if (!box) throw new Error('Missing epoch move source');
      await p.evaluate(() => {
        const stage = document.getElementById('stage');
        if (!stage) throw new Error('Missing pointer stage');
        stage.addEventListener('pointerdown', event => { if (event instanceof PointerEvent) stage.dataset.nativePointer = String(event.pointerId); }, { once: true });
        window.requestAnimationFrame = () => 123456;
      });
      await p.mouse.move(box.x + 12, box.y + 110); await p.mouse.down();
      const result = await p.evaluate(async point => {
        const h = window.sceneHarness, stage = document.getElementById('stage'), node = document.querySelector('[data-id="note-2"]');
        if (!stage?.dataset.nativePointer || !node) throw new Error('Missing captured pointer');
        const pointerId = Number(stage.dataset.nativePointer);
        const fire = (type: 'pointerdown' | 'pointerup', x: number, y: number) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
        fire('pointerup', point.x + 30, point.y + 20);
        h.load({ ...h.board(), id: 'epoch-replacement' });
        fire('pointerdown', point.x, point.y); fire('pointerup', point.x + 60, point.y + 40);
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        return { board: h.board().id, calls: h.calls.length, card: h.board().cards.find(card => card.id === 'note-2') };
      }, { x: box.x + 12, y: box.y + 110 });
      expect(result.board).toBe('epoch-replacement'); expect(result.calls).toBe(1);
      expect(result.card).toMatchObject({ x: 780, y: 120 });
      await p.mouse.up(); await p.close();
    } finally { await alternate?.close(); }
  });

  test.each([
    { engine: 'chromium', insets: true }, { engine: 'webkit', insets: true },
    { engine: 'chromium', insets: false }, { engine: 'webkit', insets: false },
  ] as const)('active Fit follows measured area changes and yields to restore in $engine (source=$insets)', async ({ engine, insets }) => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, insets, alternate ?? browser);
      await p.evaluate(() => {
        const h = window.sceneHarness;
        h.load({ ...h.board(), cards: h.board().cards.slice(0, 2), links: [] });
        h.engine.navigate({ kind: 'fit', ids: [], motion: 'instant' });
      });
      await idle(p);
      if (insets) await p.setViewportSize({ width: 390, height: 844 });
      await p.evaluate(source => {
        const h = window.sceneHarness, stage = document.getElementById('stage');
        if (!stage) throw new Error('Missing resized stage');
        if (source) {
          const stop = h.engine.registerFrameParticipant({ read: () => {
            const rect = stage.getBoundingClientRect(); h.setArea({ x: 0, y: 0, width: rect.width, height: rect.height }); stop();
          } });
        } else { stage.style.width = '390px'; stage.style.height = '844px'; }
        h.engine.navigate({ kind: 'fit', ids: [], motion: 'instant' });
      }, insets);
      await idle(p);
      const result = await p.evaluate(() => {
        const h = window.sceneHarness, camera = h.engine.camera();
        return { area: h.engine.availableArea(), camera, cards: h.board().cards.map(card => ({ x: card.x * camera.zoom + camera.x, y: card.y * camera.zoom + camera.y, right: (card.x + card.w) * camera.zoom + camera.x, bottom: (card.y + card.h) * camera.zoom + camera.y })) };
      });
      const expectedWidth = insets ? 350 : 390, expectedHeight = insets ? 804 : 844;
      expect(result.area).toEqual({ x: 0, y: 0, width: expectedWidth, height: expectedHeight });
      expect(result.camera.zoom).toBeLessThan(0.6);
      for (const card of result.cards) {
        expect(card.x).toBeGreaterThanOrEqual(0); expect(card.y).toBeGreaterThanOrEqual(0);
        expect(card.right).toBeLessThanOrEqual(expectedWidth); expect(card.bottom).toBeLessThanOrEqual(expectedHeight);
      }
      await p.evaluate(source => {
        const h = window.sceneHarness;
        h.engine.navigate({ kind: 'restore', camera: { x: 13, y: 17, zoom: 0.75 }, motion: 'instant' });
        if (source) h.setArea({ x: 20, y: 20, width: 300, height: 700 });
        else { const stage = document.getElementById('stage'); if (stage) { stage.style.width = '500px'; stage.style.height = '900px'; } }
      }, insets);
      await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual({ x: 13, y: 17, zoom: 0.75 });
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('global snap composes with wireframe grid, bypass and Option-copy in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.goto(url + '?motion=off&wireframe=1');
      await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4); await idle(p);
      await p.evaluate(() => { localStorage.setItem('aegis:snap', 'on'); });
      const drag = async (dx: number, dy: number, bypass = false): Promise<void> => {
        const box = await p.locator('[data-id="note-2"]').boundingBox();
        if (!box) throw new Error('Missing snap source');
        if (bypass) await p.keyboard.down('Meta');
        await p.mouse.move(box.x + 12, box.y + 110); await p.mouse.down();
        await p.mouse.move(box.x + 12 + dx, box.y + 110 + dy, { steps: 4 }); await p.mouse.up();
        if (bypass) await p.keyboard.up('Meta');
        await idle(p);
      };
      await drag(67, 39);
      expect(await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'note-2'))).toMatchObject({ x: 792, y: 120 });
      await drag(31, 17, true);
      expect(await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'note-2'))).toMatchObject({ x: 823, y: 137 });
      await p.evaluate(() => { localStorage.setItem('aegis:snap', 'off'); localStorage.setItem('aegis:wireframe-grid', 'on'); });
      await drag(39, 49);
      expect(await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'note-2'))).toMatchObject({ x: 858, y: 182 });
      await p.evaluate(() => { localStorage.setItem('aegis:snap', 'on'); });
      await drag(39, 49);
      expect(await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'note-2'))).toMatchObject({ x: 912, y: 240 });
      await p.keyboard.down('Alt'); await drag(60, 40); await p.keyboard.up('Alt');
      const cards = await p.evaluate(() => window.sceneHarness.board().cards);
      expect(cards.find(card => card.id === 'note-2')).toMatchObject({ x: 912, y: 240 });
      expect(cards.find(card => card.id !== 'note-2' && card.text === 'Note 2')).toMatchObject({ x: 972, y: 280 });
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(5);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('Cmd-click selects a group member before the next frame in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.goto(url + '?motion=off&wireframe=1');
      await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4); await idle(p);
      await p.evaluate(() => {
        const h = window.sceneHarness;
        h.batch(['note-1', 'note-2'].map(id => ({ op: 'update', id, set: { group: 'click-group' } })), 'local');
      });
      await idle(p);
      const box = await p.locator('[data-id="note-2"]').boundingBox();
      if (!box) throw new Error('Missing grouped card');
      await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
      await p.keyboard.down('Meta'); await p.mouse.click(box.x + 12, box.y + 110); await p.keyboard.up('Meta');
      expect(await p.evaluate(() => window.sceneHarness.selection())).toEqual(['note-2']);
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('Option-drag retains originals through preview, copy and cancellation in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.goto(url + '?motion=off&wireframe=1');
      await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4); await idle(p);
      const source = await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'note-2'));
      const box = await p.locator('[data-id="note-2"]').boundingBox();
      if (!source || !box) throw new Error('Missing copy source');
      const transform = await p.locator('[data-id="note-2"]').evaluate(el => el.style.transform);
      await p.keyboard.down('Alt'); await p.mouse.move(box.x + 12, box.y + 110); await p.mouse.down();
      await p.mouse.move(box.x + 72, box.y + 150); await idle(p);
      expect(await p.locator('[data-id="note-2"]').evaluate(el => el.style.transform)).toBe(transform);
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
      expect(await p.locator('#stage').evaluate(el => el.style.cursor)).toBe('copy');
      expect(await p.evaluate(({ x, y }) => document.querySelector<HTMLCanvasElement>('#overlay')?.getContext('2d')?.getImageData((x + 70) * devicePixelRatio, (y + 40) * devicePixelRatio, 1, 1).data[3] ?? 0, { x: source.x, y: source.y })).toBeGreaterThan(0);
      await p.mouse.up(); await p.keyboard.up('Alt'); await idle(p);
      const copied = await p.evaluate(() => window.sceneHarness.board().cards);
      expect(copied).toHaveLength(11);
      expect(copied.find(card => card.id === source.id)).toEqual(source);
      expect(copied.find(card => card.id !== source.id && card.text === source.text)).toMatchObject({ x: source.x + 60, y: source.y + 40 });
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(1);
      await p.locator('#stage').focus();
      await p.keyboard.down('Alt'); await p.mouse.move(box.x + 12, box.y + 110); await p.mouse.down();
      await p.mouse.move(box.x + 42, box.y + 130); await idle(p);
      await p.keyboard.press('Escape'); await p.mouse.up(); await p.keyboard.up('Alt'); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.board().cards)).toEqual(copied);
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(1);
      await p.locator('#stage').focus(); await p.keyboard.down('Alt');
      await p.mouse.click(box.x + 12, box.y + 110); await p.keyboard.up('Alt'); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(1);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('a queued click cannot steal newer editable focus in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.evaluate(() => {
        const first = document.querySelector<HTMLElement>('[data-body="note-2"]'), next = document.querySelector<HTMLElement>('[data-body="note-3"]');
        if (!first || !next) throw new Error('Missing editable focus targets');
        let released = false;
        first.addEventListener('pointerup', () => { released = true; }, { once: true });
        const stop = window.sceneHarness.engine.registerFrameParticipant({ write: () => {
          if (!released) return;
          next.focus({ preventScroll: true }); stop();
        } });
      });
      await p.locator('[data-body="note-2"]').click(); await idle(p);
      expect(await p.locator('[data-body="note-3"]').evaluate(el => el === document.activeElement)).toBe(true);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['stage', 'card'] as const)('a touch hold opens the actual %s context path and consumes its release', async target => {
    const p = await page(), client = await observeTouch(p);
    const box = target === 'card' ? await p.locator('[data-id="note-2"]').boundingBox() : null;
    const point = { id: 1, x: box ? box.x + 30 : 1000, y: box ? box.y + 30 : 700 };
    const camera = await p.evaluate(() => window.sceneHarness.engine.camera());
    await touch(client, 'touchStart', [point]); await p.waitForTimeout(570);
    expect(await p.evaluate(() => window.touchMenuEvents)).toEqual([{ id: target === 'card' ? 'note-2' : null, x: point.x, y: point.y }]);
    await touch(client, 'touchEnd', []); await idle(p);
    expect(await p.evaluate(() => window.touchReleases)).toBe(0);
    expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual(camera);
    expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
    await p.close();
  });

  test.each(['movement', 'second-touch', 'early-release', 'focused-text', 'active-tool', 'board-replacement', 'dispose'] as const)('touch hold yields to %s', async reason => {
    const p = await page(), client = await observeTouch(p);
    const box = reason === 'focused-text' ? await p.locator('[data-body="note-2"]').boundingBox() : null;
    if (reason === 'focused-text') await p.locator('[data-body="note-2"]').focus();
    if (reason === 'active-tool') await p.evaluate(() => {
      const harness = window.sceneHarness, card = harness.board().cards[0];
      if (!card) throw new Error('Missing connection source');
      harness.engine.startConnection(card.id);
    });
    const point = { id: 1, x: box ? box.x + 10 : 1000, y: box ? box.y + 10 : 700 };
    await touch(client, 'touchStart', [point]);
    if (reason === 'movement') {
      await touch(client, 'touchMove', [{ ...point, x: point.x + 20 }]);
      await touch(client, 'touchMove', [point]);
    } else if (reason === 'second-touch') await touch(client, 'touchStart', [point, { id: 2, x: 1200, y: 700 }]);
    else if (reason === 'early-release') await touch(client, 'touchEnd', []);
    else if (reason === 'board-replacement') await p.evaluate(() => window.sceneHarness.replace(10));
    else if (reason === 'dispose') await p.evaluate(() => window.sceneHarness.engine.dispose());
    await p.waitForTimeout(570);
    if (reason !== 'early-release') await touch(client, 'touchEnd', []);
    expect(await p.evaluate(() => window.touchMenuEvents)).toEqual([]);
    if (reason === 'focused-text') {
      expect(await p.locator('[data-body="note-2"]').evaluate(el => el === document.activeElement)).toBe(true);
      await p.locator('[data-body="note-2"]').fill('Native editing retained');
    }
    await p.close();
  });

  test.each(['chromium', 'webkit'] as const)('retains an editor source lifetime while hiding its offscreen shell in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      const before = await p.evaluate(() => {
        const harness = window.sceneHarness, id = harness.board().cards[1]?.id;
        if (!id) throw new Error('Missing editor source');
        harness.select([id]);
        harness.engine.pin(id, 'editor', true);
        harness.engine.pin(id, 'ime', true);
        return harness.engine.leases.getSnapshot().find(lease => lease.cardId === id)?.key;
      });
      await p.locator('[data-id="note-1"] iframe').contentFrame().getByRole('textbox', { name: 'Sandbox text' }).fill('Retained editor state');
      await p.evaluate(() => window.sceneHarness.engine.navigate({ kind: 'restore', camera: { x: -10000, y: -10000, zoom: .2 }, motion: 'instant' }));
      await idle(p);
      expect(await p.locator('[data-id="note-1"]').evaluate(el => el instanceof HTMLElement && el.hidden)).toBe(false);
      await p.evaluate(() => {
        const harness = window.sceneHarness, card = harness.board().cards[1];
        if (!card) throw new Error('Missing editor source');
        harness.engine.pin(card.id, 'ime', false);
      });
      await idle(p);
      expect(await p.locator('[data-id="note-1"]').evaluate(el => el instanceof HTMLElement && el.hidden && el.inert)).toBe(true);
      expect(await p.evaluate(() => window.sceneHarness.engine.leases.getSnapshot().find(lease => lease.cardId === 'note-1')?.key)).toBe(before);
      await p.evaluate(() => window.sceneHarness.engine.navigate({ kind: 'restore', camera: { x: 0, y: 0, zoom: 1 }, motion: 'instant' }));
      await idle(p);
      expect(await p.locator('[data-id="note-1"]').evaluate(el => el instanceof HTMLElement && !el.hidden && !el.inert)).toBe(true);
      expect(await p.locator('[data-id="note-1"] iframe').contentFrame().getByRole('textbox', { name: 'Sandbox text' }).inputValue()).toBe('Retained editor state');
      expect(await p.evaluate(() => window.sceneHarness.engine.leases.getSnapshot().find(lease => lease.cardId === 'note-1')?.key)).toBe(before);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('a drop resolver receives movement and submits one semantic batch in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.goto(url + '?motion=off&drop=1');
      await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4);
      await idle(p);
      const box = await p.locator('[data-id="note-2"]').boundingBox();
      if (!box) throw new Error('Missing dragged card');
      await p.mouse.move(box.x + 12, box.y + 110); await p.mouse.down();
      await p.mouse.move(box.x + 108, box.y + 158); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
      await p.mouse.up(); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.calls)).toEqual([[{ op: 'move', id: 'note-2', x: 816, y: 120 }, { op: 'update', id: 'note-2', set: { text: 'Dropped into collection' } }]]);
      expect(await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'note-2'))).toMatchObject({ x: 816, y: 120, text: 'Dropped into collection' });
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('connector controls follow the painted obstacle route at rest and during a drag in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.evaluate(() => {
        const harness = window.sceneHarness, board = harness.board();
        harness.load({ ...board, cards: board.cards.slice(0, 3).map((card, index) => ({ ...card, x: index === 0 ? 80 : index === 1 ? 450 : 900, y: index === 1 ? 80 : 100, w: 240, h: index === 1 ? 220 : 160 })), links: [{ id: 'routed-connector', a: 'note-0', b: 'note-2', bend: 0 }] });
      });
      await idle(p);
      const verify = async () => {
        const result = await p.evaluate(() => {
          const engine = window.sceneHarness.engine, id = window.sceneHarness.board().links[0]?.id;
          const route = id ? engine.linkRoute(id) : null;
          if (!route) throw new Error('Missing connector route');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', route.d);
          const camera = engine.camera(), context = document.querySelector<HTMLCanvasElement>('#overlay')?.getContext('2d');
          const samples = [.25, .5, .75].map(fraction => {
            const world = path.getPointAtLength(path.getTotalLength() * fraction);
            const screen = { x: world.x * camera.zoom + camera.x, y: world.y * camera.zoom + camera.y };
            const pixel = context?.getImageData(Math.floor(screen.x * devicePixelRatio), Math.floor(screen.y * devicePixelRatio), 1, 1).data;
            return { hit: engine.hitTestLink(screen), alpha: pixel?.[3] ?? 0 };
          });
          return { d: route.d, id, samples };
        });
        expect(result.d).toMatch(/ L/);
        for (const sample of result.samples) { expect(sample.hit).toBe(result.id); expect(sample.alpha).toBeGreaterThan(0); }
        return result.d;
      };
      const before = await verify();
      const source = await p.locator('[data-id="note-0"]').boundingBox();
      if (!source) throw new Error('Missing source card');
      const x = source.x + 8, y = source.y + 100;
      await p.mouse.move(x, y); await p.mouse.down();
      await p.mouse.move(x + 80, y + 80); await idle(p);
      const dragged = await verify();
      expect(dragged).not.toBe(before);
      expect(await p.evaluate(() => window.sceneHarness.board().cards[0]?.x)).toBe(80);
      await p.mouse.up(); await idle(p);
      expect(await verify()).toBe(dragged);
      expect(await p.evaluate(() => window.sceneHarness.board().cards[0]?.x)).toBeGreaterThan(80);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('retains one selected formatting body at real offscreen geometry in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.evaluate(() => {
        const harness = window.sceneHarness;
        harness.select(['note-9']);
        harness.engine.navigate({ kind: 'restore', camera: { x: -10000, y: -10000, zoom: .2 }, motion: 'instant' });
      });
      await p.locator('[data-body="note-9"]').waitFor({ state: 'attached' });
      await idle(p);
      expect(await p.locator('[data-id="note-9"]').evaluate(el => { if (!(el instanceof HTMLElement)) throw new Error('Missing formatting card'); return { hidden: el.hidden, inert: el.inert, left: el.getBoundingClientRect().left, text: el.textContent }; })).toMatchObject({ hidden: false, inert: false, text: 'Note 9' });
      expect(await p.locator('[data-id="note-9"]').evaluate(el => el.getBoundingClientRect().right)).toBeLessThan(0);
      await p.evaluate(() => { window.sceneHarness.select([]); });
      await idle(p);
      expect(await p.locator('[data-id="note-9"]').evaluate(el => el instanceof HTMLElement && el.hidden)).toBe(true);
      await p.evaluate(() => {
        window.sceneHarness.replace(5000);
        window.sceneHarness.select(window.sceneHarness.board().cards.map(card => card.id));
        window.sceneHarness.engine.navigate({ kind: 'restore', camera: { x: -100000, y: -100000, zoom: .05 }, motion: 'instant' });
      });
      await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.engine.inspect().activeLeases)).toBeLessThanOrEqual(32);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('uses the current motion preference when navigation starts in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page('system', false, alternate ?? browser);
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.emulateMedia({ reducedMotion: 'no-preference' });
      const frames = await p.evaluate(() => new Promise<readonly number[]>(resolve => {
        const engine = window.sceneHarness.engine, frames: number[] = [];
        const release = engine.registerFrameParticipant({ write: () => { frames.push(engine.camera().x); if (!engine.busy()) { release(); resolve(frames); } } });
        engine.navigate({ kind: 'restore', camera: { x: 200, y: 100, zoom: .8 }, motion: 'glide', duration: 420 });
      }));
      expect(frames.length).toBeGreaterThanOrEqual(5);
      expect(frames.at(-1)).toBe(200);
      await p.emulateMedia({ reducedMotion: 'reduce' });
      expect(await p.evaluate(() => {
        const engine = window.sceneHarness.engine;
        engine.navigate({ kind: 'restore', camera: { x: 20, y: 30, zoom: 1 }, motion: 'glide' });
        return { busy: engine.busy(), camera: engine.camera() };
      })).toEqual({ busy: false, camera: { x: 20, y: 30, zoom: 1 } });
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('agent cues follow provenance, real origins and lease retirement in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.evaluate(() => {
        const h = window.sceneHarness, card = h.board().cards[0]; if (!card) throw new Error('Missing card');
        h.engine.ring([card.id], '#ff0000', 4000, 'Agent test', { x: 25, y: 40 }, 'dashed');
      });
      expect(await p.locator('.agent-line .origin').getAttribute('cx')).toBe('25');
      expect(await p.locator('.agent-line .origin').getAttribute('cy')).toBe('40');
      expect(await p.locator('.agent-line path, .agent-line .station').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).stroke))).toEqual(['rgb(63, 141, 253)', 'rgb(63, 141, 253)', 'rgb(63, 141, 253)', 'rgb(63, 141, 253)']);
      expect(await p.locator('.agent-line .origin').evaluate(node => getComputedStyle(node).fill)).toBe('rgb(63, 141, 253)');
      expect(await p.locator('.card.glow').evaluate(node => getComputedStyle(node, '::after').borderTopColor)).toBe('rgb(63, 141, 253)');
      expect(await p.locator('.card.glow').count()).toBe(1);
      await p.evaluate(() => window.sceneHarness.batch([{ op: 'move', id: 'note-0', x: 100, y: 80 }], 'local'));
      await idle(p);
      expect(await p.locator('.agent-line .origin').count()).toBe(0);
      await p.waitForFunction(() => !document.querySelector('.card.glow'));
      await p.evaluate(() => window.sceneHarness.batch([{ op: 'move', id: 'note-0', x: 110, y: 80 }], 'sync'));
      await idle(p);
      expect(await p.locator('.card.glow').count()).toBe(0);
      await p.evaluate(() => window.sceneHarness.batch([{ op: 'move', id: 'note-0', x: 120, y: 80 }], 'agent'));
      await idle(p);
      expect(await p.locator('.card.glow').getAttribute('data-id')).toBe('note-0');
      await p.evaluate(() => window.sceneHarness.batch([{ op: 'delete', id: 'note-0' }], 'local'));
      await idle(p);
      expect(await p.locator('.card.glow').count()).toBe(0);
      await p.evaluate(() => { const h = window.sceneHarness, card = h.board().cards[0]; if (!card) throw new Error('Missing card'); h.engine.glow([card.id]); h.replace(10); });
      await idle(p);
      expect(await p.locator('.card.glow').count()).toBe(0);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('agent presentation retargets, yields to a drag and releases exits in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(true, false, alternate ?? browser);
      const batch = async (commands: unknown) => { await p.evaluate(commands => window.sceneHarness.batch(commands, 'agent'), commands); await idle(p); };
      await batch([{ op: 'move', id: 'note-2', x: 780, y: 130 }]);
      const before = await p.locator('[data-id="note-2"]').evaluate(el => {
        const animation = el.getAnimations().find(animation => animation.id === 'aegis-agent-card'); if (!animation) throw new Error('Missing move animation'); animation.pause(); animation.currentTime = 90;
        return getComputedStyle(el).transform;
      });
      await batch([{ op: 'move', id: 'note-2', x: 550, y: 180 }]);
      expect(await p.locator('[data-id="note-2"]').evaluate(el => el.getAnimations().find(animation => animation.id === 'aegis-agent-card')?.effect?.getTiming().duration)).toBe(320);
      expect(await p.locator('[data-id="note-2"]').evaluate(el => { const animation = el.getAnimations().find(animation => animation.id === 'aegis-agent-card'); if (!(animation?.effect instanceof KeyframeEffect)) throw new Error('Missing effect'); animation.pause(); animation.currentTime = 0; return animation.effect.getKeyframes()[0]?.transform; })).toBe(before);
      await idle(p);
      const box = await p.locator('[data-id="note-2"]').boundingBox(); if (!box) throw new Error('Missing animated card');
      expect(await p.evaluate(point => document.elementFromPoint(point.x, point.y)?.closest('.card')?.getAttribute('data-id'), { x: box.x + 8, y: box.y + 90 })).toBe('note-2');
      await p.mouse.move(box.x + 8, box.y + 90); await p.mouse.down(); await p.mouse.move(box.x + 58, box.y + 110); await p.mouse.up(); await idle(p);
      expect(await p.locator('[data-id="note-2"]').evaluate(el => el.getAnimations().filter(animation => animation.id === 'aegis-agent-card').length)).toBe(0);
      const dragged = await p.locator('[data-id="note-2"]').boundingBox();
      expect(Math.abs((dragged?.x ?? Infinity) - box.x - 50)).toBeLessThanOrEqual(13);
      await batch([{ op: 'create', type: 'note', newId: 'agententer', text: 'New result', x: 80, y: 600 }, { op: 'delete', id: 'note-3' }]);
      expect(await p.evaluate(() => document.getAnimations().filter(animation => animation.id === 'aegis-agent-card').map(animation => animation.effect?.getTiming().duration).sort())).toEqual([180, 240]);
      await p.evaluate(() => document.getAnimations().filter(animation => animation.id === 'aegis-agent-card').forEach(animation => animation.finish())); await idle(p);
      expect(await p.locator('.card[aria-hidden="true"]').count()).toBe(0);
      await batch([{ op: 'move', id: 'agententer', x: 120, y: 600 }]);
      await p.evaluate(() => document.body.classList.add('motion-off'));
      expect(await p.evaluate(() => document.getAnimations().filter(animation => animation.id === 'aegis-agent-card').length)).toBe(0);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('wireframe policies snap with live guides and submit parenting atomically in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.goto(url + '?wireframe=1'); await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4); await idle(p);
      await p.evaluate(() => {
        const h = window.sceneHarness;
        h.load({ ...h.board(), cards: [{ id: 'snapone', type: 'box', text: 'First', color: 'plain', x: 80, y: 80, w: 160, h: 100 }, { id: 'snaptwo', type: 'box', text: 'Second', color: 'plain', x: 380, y: 80, w: 160, h: 100 }], links: [] });
      }); await idle(p);
      const box = await p.locator('[data-id="snapone"]').boundingBox(); if (!box) throw new Error('Missing snap source');
      await p.mouse.move(box.x + 20, box.y + 70); await p.mouse.down(); await p.mouse.move(box.x + 157, box.y + 70, { steps: 4 }); await idle(p);
      expect(await p.locator('.drag-guides line').count()).toBeGreaterThan(0);
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
      await p.mouse.up(); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'snapone')?.x)).toBe(220);
      expect(await p.locator('.drag-guides line').count()).toBe(0);
      await p.evaluate(() => {
        const h = window.sceneHarness;
        h.load({ ...h.board(), cards: [{ id: 'dropframe', type: 'frame', text: 'Frame', color: 'plain', x: 500, y: 80, w: 300, h: 300 }, { id: 'dropbox', type: 'box', text: 'Loose', color: 'plain', x: 80, y: 80, w: 160, h: 100 }], links: [] });
      }); await idle(p);
      const loose = await p.locator('[data-id="dropbox"]').boundingBox(); if (!loose) throw new Error('Missing drop source');
      await p.mouse.move(loose.x + 20, loose.y + 70); await p.mouse.down(); await p.mouse.move(loose.x + 520, loose.y + 70, { steps: 4 }); await p.mouse.up(); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.calls.at(-1))).toEqual([{ op: 'move', id: 'dropbox', x: 580, y: 80 }, { op: 'update', id: 'dropbox', set: { parent: 'dropframe' } }]);
      expect(await p.evaluate(() => window.sceneHarness.board().cards.find(card => card.id === 'dropbox')?.parent)).toBe('dropframe');
      const name = p.locator('[data-id="dropframe"] .wf-frame-name'), header = await name.boundingBox(); if (!header) throw new Error('Missing overflow name');
      await p.mouse.move(header.x + 10, header.y + 6); await p.mouse.down(); await p.mouse.move(header.x + 83, header.y + 47, { steps: 4 }); await p.mouse.up(); await idle(p);
      const cards = await p.evaluate(() => window.sceneHarness.board().cards.map(card => ({ id: card.id, x: card.x, y: card.y })));
      expect(cards).toEqual([{ id: 'dropframe', x: 573, y: 121 }, { id: 'dropbox', x: 653, y: 121 }]);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('unselected section glass starts a marquee and an unmoved tap selects the section in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.goto(url + '?wireframe=1'); await p.waitForFunction(() => window.sceneHarness?.engine.inspect().activeLeases >= 4); await idle(p);
      await p.evaluate(() => {
        const h = window.sceneHarness;
        h.load({ ...h.board(), cards: [{ id: 'glassone', type: 'box', text: 'First', color: 'plain', x: 200, y: 200, w: 100, h: 80 }, { id: 'glasstwo', type: 'box', text: 'Second', color: 'plain', x: 400, y: 220, w: 100, h: 80 }, { id: 'glass', type: 'section', text: 'Glass', color: 'plain', x: 100, y: 100, w: 600, h: 300 }], links: [] });
      }); await idle(p);
      await p.mouse.move(160, 190); await p.mouse.down(); await p.mouse.move(550, 350, { steps: 4 }); await p.mouse.up(); await idle(p);
      expect(await p.locator('.card.selected').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')).sort())).toEqual(['glassone', 'glasstwo']);
      expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
      await p.mouse.click(150, 180); await idle(p);
      expect(await p.locator('.card.selected').getAttribute('data-id')).toBe('glass');
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('a deferred Escape clear cannot overwrite a newer explicit selection in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.evaluate(async () => {
        const h = window.sceneHarness, stage = document.getElementById('stage');
        h.select(['note-0']);
        stage?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        h.select(['note-2']);
        await new Promise<void>(resolve => h.engine.afterInput(resolve));
      }); await idle(p);
      expect(await p.locator('.card.selected').getAttribute('data-id')).toBe('note-2');
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('hidden ancestors immediately retire real descendant leases and selection decorations in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser);
      await p.evaluate(() => {
        const h = window.sceneHarness;
        h.load({ ...h.board(), cards: [{ id: 'hideparent', type: 'note', text: 'Parent', color: 'plain', x: 80, y: 80, w: 240, h: 160 }, { id: 'hidechild', type: 'note', text: 'Child', parent: 'hideparent', color: 'plain', x: 400, y: 80, w: 240, h: 160 }, { id: 'hidegrandchild', type: 'note', text: 'Grandchild', parent: 'hidechild', color: 'plain', x: 720, y: 80, w: 240, h: 160 }], links: [] });
        h.select(['hideparent']);
      });
      await p.locator('[data-id="hidegrandchild"]').waitFor(); await idle(p);
      await p.evaluate(() => window.sceneHarness.batch([{ op: 'update', id: 'hideparent', set: { props: { hidden: true } } }], 'local')); await idle(p);
      expect(await p.locator('.card[data-id]').count()).toBe(0);
      expect(await p.locator('.card.selected').count()).toBe(0);
      expect(await p.evaluate(() => window.sceneHarness.engine.leases.getSnapshot().length)).toBe(0);
      await p.evaluate(() => window.sceneHarness.batch([{ op: 'update', id: 'hideparent', set: { props: { hidden: false } } }], 'local'));
      await p.locator('[data-id="hidegrandchild"]').waitFor(); await idle(p);
      expect(await p.locator('.card[data-id]').count()).toBe(3);
      expect(await p.locator('.card.selected').count()).toBe(1);
      await p.close();
    } finally { await alternate?.close(); }
  });

  test.each(['chromium', 'webkit'] as const)('new agent bodies get bounded temporary offscreen measurement residency in %s', async engine => {
    const alternate = engine === 'webkit' ? await webkit.launch({ headless: true }) : null;
    try {
      const p = await page(false, false, alternate ?? browser), camera = await p.evaluate(() => window.sceneHarness.engine.camera());
      await p.evaluate(() => window.sceneHarness.batch(Array.from({ length: 40 }, (_, index) => ({ op: 'create', newId: `warm${String(index).padStart(2, '0')}`, type: 'note', text: `Offscreen ${index}`, x: 5000 + index * 300, y: 5000, w: 240, h: 160 })), 'agent'));
      await p.waitForFunction(() => document.querySelectorAll('.card[data-id^="warm"]').length === 12); await idle(p);
      expect(await p.locator('.card[data-id^="warm"]').evaluateAll(nodes => nodes.every(node => node instanceof HTMLElement && !node.hidden && !node.inert && node.textContent?.startsWith('Offscreen') && node.getBoundingClientRect().left > innerWidth))).toBe(true);
      expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual(camera);
      expect(await p.evaluate(() => window.sceneHarness.engine.inspect().activeLeases)).toBeLessThanOrEqual(17);
      await p.waitForFunction(() => !document.querySelector('.card[data-id^="warm"]'), undefined, { timeout: 7000 });
      expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual(camera);
      await p.close();
    } finally { await alternate?.close(); }
  }, 10000);

  test('Connect consumes target card text and button presses instead of activating their content', async () => {
    for (const target of ['[data-body="note-2"]', '[data-id="note-2"] .win-open']) {
      const p = await page();
      await p.evaluate(() => {
        const harness = window.sceneHarness, source = harness.board().cards[0];
        if (!source) throw new Error('Missing connection source');
        harness.engine.startConnection(source.id);
      });
      const before = await p.locator('[data-body="note-2"]').textContent();
      await p.locator(target).click(); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.calls.flat().filter(command => command.op === 'connect'))).toEqual([{ op: 'connect', a: 'note-0', b: 'note-2' }]);
      expect(await p.locator('[data-body="note-2"]').textContent()).toBe(before);
      expect(await p.locator('[data-body="note-2"]').evaluate(element => element === document.activeElement)).toBe(false);
      expect(await p.evaluate(() => window.sceneHarness.opened())).toBe(0);
      await p.close();
    }
  });

  test('Escape and pan cancel Connect without rearming it on the next pointer move', async () => {
    const p = await page();
    for (const cancel of ['escape', 'space', 'middle'] as const) {
      await p.locator('[data-body="note-2"]').focus();
      await p.evaluate(() => {
        const harness = window.sceneHarness, source = harness.board().cards[0];
        if (!source) throw new Error('Missing connection source');
        harness.engine.startConnection(source.id);
      });
      await p.mouse.move(1100, 700); await idle(p);
      expect(await p.locator('#stage').evaluate(element => element.style.cursor)).toBe('crosshair');
      if (cancel === 'escape') await p.keyboard.press('Escape');
      else if (cancel === 'space') await p.keyboard.press('Space');
      else { await p.mouse.down({ button: 'middle' }); await p.mouse.up({ button: 'middle' }); }
      await idle(p);
      await p.mouse.move(1120, 720); await idle(p);
      expect(await p.locator('#stage').evaluate(element => element.style.cursor)).toBe('');
      await p.locator('[data-id="note-2"]').click({ position: { x: 10, y: 100 } }); await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.calls.flat().filter(command => command.op === 'connect'))).toEqual([]);
    }
    await p.close();
  });

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

  test('Fit includes late intrinsic measurements and yields to subsequent camera input', async () => {
    const p = await page();
    await p.evaluate(() => {
      const harness = window.sceneHarness, card = harness.board().cards.find(card => card.id === 'note-2');
      if (!card) throw new Error('Missing measured card');
      harness.update({ ...card, props: { contentFit: true } });
      harness.engine.navigate({ kind: 'fit', ids: [card.id], motion: 'instant' });
      const lease = harness.engine.leases.getSnapshot().find(lease => lease.cardId === card.id);
      if (!lease) throw new Error('Missing measured lease');
      lease.host.style.minHeight = '1100px';
      harness.engine.requestMeasurement(lease.key, lease.generation);
    });
    await p.waitForFunction(() => (window.sceneHarness.board().cards.find(card => card.id === 'note-2')?.h ?? 0) >= 1100);
    await idle(p);
    const fitted = await p.locator('[data-id="note-2"]').boundingBox();
    const stage = await p.locator('#stage').boundingBox();
    expect(fitted && stage && fitted.y >= stage.y && fitted.y + fitted.height <= stage.y + stage.height).toBe(true);
    await p.mouse.move(1100, 700); await p.mouse.wheel(80, 40); await idle(p);
    const camera = await p.evaluate(() => window.sceneHarness.engine.camera());
    await p.evaluate(() => {
      const harness = window.sceneHarness, lease = harness.engine.leases.getSnapshot().find(lease => lease.cardId === 'note-2');
      if (!lease) throw new Error('Missing measured lease');
      lease.host.style.minHeight = '1200px';
      harness.engine.requestMeasurement(lease.key, lease.generation);
    });
    await p.waitForFunction(() => (window.sceneHarness.board().cards.find(card => card.id === 'note-2')?.h ?? 0) >= 1200);
    await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual(camera);
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

  test('notifies semantic navigation once outside the frame and drops notices from old boards', async () => {
    const p = await page(true);
    const during = await p.evaluate(() => new Promise<number>(resolve => {
      const harness = window.sceneHarness;
      const release = harness.engine.registerFrameParticipant({ write: () => { release(); resolve(harness.navigationNotifications()); } });
      harness.engine.navigate({ kind: 'restore', camera: { x: 120, y: 80, zoom: .8 }, motion: 'glide', duration: 120 });
    }));
    expect(during).toBe(0);
    await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.navigationNotifications())).toBe(1);
    await p.evaluate(() => window.sceneHarness.engine.navigate({ kind: 'fit', ids: [], motion: 'instant' }));
    await p.waitForFunction(() => window.sceneHarness.navigationNotifications() === 2);
    await p.evaluate(() => {
      const harness = window.sceneHarness;
      harness.engine.navigate({ kind: 'fit', ids: [], motion: 'instant' }); harness.replace(10);
    }); await idle(p);
    expect(await p.evaluate(() => window.sceneHarness.navigationNotifications())).toBe(2);
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
    await p.locator('.card[data-id="note-1"]').click({ position: { x: 8, y: 8 } }); await idle(p);
    expect(await p.locator('.card.selected').count()).toBe(1);
    await p.evaluate(() => {
      const harness = window.sceneHarness;
      for (const lease of harness.engine.leases.getSnapshot()) lease.host.dataset.originalGeneration = `${lease.generation}`;
      harness.holdCleanup(true); harness.replace(20);
    }); await idle(p);
    await p.waitForFunction(() => window.sceneHarness.cleanups.length >= 4);
    expect(await p.locator('.card[data-id="note-1"]').count()).toBe(1);
    expect(await p.locator('.card.selected').count()).toBe(1);
    expect(await p.locator('.card.selected').getAttribute('data-id')).toBe('note-1');
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

  test('Space and middle pan reach agent windows outside the stage subtree', async () => {
    const p = await page();
    await p.evaluate(() => {
      const overlay = document.createElement('section'); overlay.className = 'agent-window';
      overlay.style.cssText = 'position:fixed;left:600px;top:650px;width:250px;height:44px;z-index:200;background:#151517';
      overlay.innerHTML = '<header>Agent window</header>'; document.body.append(overlay);
      const controls = document.createElement('div'); controls.className = 'editing-outline';
      controls.style.cssText = 'position:fixed;left:900px;top:650px;z-index:200';
      controls.innerHTML = '<button class="selection-resize" style="width:44px;height:44px;cursor:nwse-resize">Resize</button>'; document.body.append(controls);
    });
    for (const selector of ['.agent-window header', '.editing-outline .selection-resize']) for (const button of ['left', 'middle'] as const) {
      const before = await p.evaluate(() => window.sceneHarness.engine.camera());
      const target = p.locator(selector), box = await target.boundingBox();
      if (!box) throw new Error('Missing external canvas affordance');
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await p.locator('#outside').focus(); await p.mouse.move(x, y);
      if (button === 'left') await p.keyboard.down('Space');
      if (button === 'left') expect(await target.evaluate(el => getComputedStyle(el).cursor)).toBe('grab');
      await p.mouse.down({ button });
      expect(await target.evaluate(el => getComputedStyle(el).cursor)).toBe('grabbing');
      await p.mouse.move(x + 40, y + 30, { steps: 4 }); await p.mouse.up({ button });
      if (button === 'left') await p.keyboard.up('Space');
      await idle(p);
      expect(await p.evaluate(() => window.sceneHarness.engine.camera())).toEqual({ ...before, x: before.x + 40, y: before.y + 30 });
    }
    expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
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

  test('keeps both Shift clicks when their pointer pairs arrive before a scene frame', async () => {
    const p = await page();
    await p.evaluate(() => {
      const request = window.requestAnimationFrame, callbacks: FrameRequestCallback[] = [];
      window.requestAnimationFrame = callback => callbacks.push(callback);
      window.resumeSceneFrames = () => { window.requestAnimationFrame = request; for (const callback of callbacks) callback(performance.now()); };
    });
    await p.keyboard.down('Shift');
    await p.mouse.click(430, 104); await p.mouse.click(430, 104);
    await p.keyboard.up('Shift');
    await p.evaluate(() => window.resumeSceneFrames()); await idle(p);
    expect(await p.locator('.scene-card.selected').count()).toBe(0);
    expect(await p.evaluate(() => window.sceneHarness.calls.length)).toBe(0);
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
