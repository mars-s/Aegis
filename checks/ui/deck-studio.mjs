// Shipped UI, disposable data and actual screenshot pixels in both browser engines.
import { chromium, webkit } from './playwright.mjs';
import { out } from './out.mjs';
import { assertSlideFits } from './deck-fit.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `deck-studio-${process.pid}`;
const data = mkdtempSync(tmpdir() + '/aegis-deck-studio-');
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: {
  ...process.env, AEGIS_DATA: data, AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1',
}, stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((resolve, reject) => {
  host.stdout.on('data', bytes => { const m = /"port":(\d+)/.exec(String(bytes)); if (m) resolve(m[1]); });
  host.once('exit', code => reject(Error(`Host exited ${code}`)));
});
const evidence = { data, paints: [], layouts: [] };
const slides = [
  { id: 'title', layout: 'title', background: 'plain', title: 'A clearer week', sub: 'Small changes, measured over time' },
  { id: 'chart', layout: 'chart', title: 'Focus hours per day', sub: 'Fictional data. Dashed line: 3 hour target', chart: { values: [2, 4, 3, 2, 3], labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], target: 3, unit: 'hours' } },
  { id: 'ideas', layout: 'three', title: 'What helps', sub: 'Three independent ideas', body: 'Earlier nights\nLess coffee\nA steady routine' },
  { id: 'close', layout: 'text', title: 'Try one change', body: 'Take a small step.\nSee what changes.' },
];

// DOM bounds alone passed with invisible Blink labels. Decode the browser's own
// screenshot and require foreground glyph ink across its expected width and height.
async function paintedText(page, selector, minimum, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const labels = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect(), css = getComputedStyle(node), matrix = node.getScreenCTM();
    return { text: node.textContent, x: r.x, y: r.y, width: r.width, height: r.height,
      fontPixels: parseFloat(css.fontSize) * Math.hypot(matrix.a, matrix.b),
      fill: css.fill.match(/[\d.]+/g).slice(0, 3).map(Number) };
  }));
  assert.ok(labels.length >= 3, `${name}: expected multiple real labels`);
  const path = out(`${name}.png`), screenshot = await page.screenshot({ path });
  const painted = await page.evaluate(async ({ png, labels }) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + png; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
    const bg = luminance([8, 9, 10]), pixelRatio = image.width / innerWidth;
    return labels.map(label => {
      const left = Math.max(0, Math.floor(label.x * pixelRatio)), top = Math.max(0, Math.floor(label.y * pixelRatio));
      const w = Math.min(canvas.width - left, Math.ceil(label.width * pixelRatio) + 2), h = Math.min(canvas.height - top, Math.ceil(label.height * pixelRatio) + 2);
      const { data } = ctx.getImageData(left, top, w, h);
      let x1 = w, x2 = -1, y1 = h, y2 = -1, ink = 0, peakContrast = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const rgb = [...data.slice((y * w + x) * 4, (y * w + x) * 4 + 3)];
        const contrast = (luminance(rgb) + .05) / (bg + .05);
        if (contrast < 4.5 || rgb.some((v, i) => Math.abs(v - label.fill[i]) > 42)) continue;
        ink++; peakContrast = Math.max(peakContrast, contrast);
        x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y);
      }
      return { ...label, pixelRatio, ink: ink / pixelRatio ** 2, inkWidth: (x2 - x1 + 1) / pixelRatio, inkHeight: (y2 - y1 + 1) / pixelRatio, peakContrast,
        specifiedContrast: (luminance(label.fill) + .05) / (bg + .05) };
    });
  }, { png: screenshot.toString('base64'), labels });
  for (const label of painted) {
    assert.ok(label.fontPixels >= minimum, `${name}: rendered font is at least ${minimum}px: ${JSON.stringify(label)}`);
    assert.ok(label.specifiedContrast >= 4.5 && label.peakContrast >= 4.5, `${name}: actual foreground reaches 4.5:1: ${JSON.stringify(label)}`);
    // Screenshot bounds and contrast edges quantise to raster pixels in both engines.
    const rasterPixel = 1 / label.pixelRatio;
    assert.ok(label.inkHeight + rasterPixel >= label.fontPixels * .6 && label.inkWidth + rasterPixel >= label.width * .65 && label.ink + rasterPixel ** 2 >= label.fontPixels,
      `${name}: glyph pixels cover the expected label rather than a missing or tiny raster: ${JSON.stringify(label)}`);
  }
  evidence.paints.push({ name, path, labels: painted });
}

try {
  for (const [engineName, engine, deviceScaleFactor] of [['chromium', chromium, 1], ['webkit', webkit, 1], ['chromium-2x', chromium, 2], ['webkit-2x', webkit, 2]]) {
    const browser = await engine.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor, colorScheme: 'dark' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    try {
      await page.addInitScript(() => {
        localStorage.setItem('aegis:introduction-complete', '1'); localStorage.setItem('aegis:orb-hint-seen', '1');
        localStorage.setItem('aegis:theme', 'dark'); localStorage.setItem('aegis:follow', 'off');
      });
      await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
      await page.waitForFunction(() => window.aegis?.canvas?.board);
      await page.evaluate(async () => {
        const board = await aegis.host.post('/boards', { name: 'Deck studio check' }); localStorage.setItem('aegis:board', board.id);
      });
      await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
      await page.evaluate(slides => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, model: { provider: 'fake', modelId: 'fake' },
        brief: 'FAKE ' + JSON.stringify([{ op: 'create', type: 'deck', newId: 'studio', text: 'A clearer week', x: 100, y: 100, props: { slides, current: 0 } }]),
      }), slides);
      await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.id === 'studio'));
      await page.waitForFunction(async () => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).every(a => !a.running));
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id: 'studio', viaKey: true } })));
      const panel = page.locator('.deck-panel'), stage = panel.locator('.deck-stage'), film = panel.locator('.deck-film');
      await panel.waitFor();
      const select = async i => { await page.getByRole('tab', { name: `Go to slide ${i + 1}`, exact: true }).click(); };
      const save = () => page.waitForFunction(() => document.querySelector('.deck-panel [data-saved]')?.textContent === 'Saved');
      const active = () => stage.locator('.deck-slide-wrap:visible');
      const plain = await stage.locator('.bg-plain').first().evaluate(el => {
        const copy = getComputedStyle(el.querySelector('.s-copy'));
        return { title: getComputedStyle(el.querySelector('.s-title')).fontSize, subtitle: getComputedStyle(el.querySelector('.s-sub')).fontSize, left: copy.left };
      });
      assert.deepEqual(plain, { title: '48px', subtitle: '20px', left: '48px' });
      assert.equal(await active().count(), 1); assert.equal(await active().locator('.deck-ridge').count(), 0);
      for (const [width, height] of [[1440, 900], [1586, 992], [390, 844], [1440, 600]]) {
        await page.setViewportSize({ width, height }); await select(1);
        await page.waitForFunction(() => !document.querySelector('.deck-stage').getAnimations({ subtree: true }).some(a => a.playState === 'running'));
        const fit = await assertSlideFits(active().locator(':scope > .deck-fit'), { label: `${engineName} editor ${width}x${height}`, points: 5, viewport: stage });
        const geometry = await panel.evaluate(el => {
          const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
          const thumb = el.querySelector('.deck-film-item.on');
          return { ribbon: rect(el.querySelector('.deck-ribbon')), film: rect(el.querySelector('.deck-film')), stage: rect(el.querySelector('.deck-stage')),
            thumb: rect(thumb.querySelector('.deck-fit')), caption: rect(thumb.querySelector('.deck-film-caption')),
            add: rect(el.querySelector('.deck-film-add')), addLineHeight: parseFloat(getComputedStyle(el.querySelector('.deck-film-add')).lineHeight) };
        });
        assert.equal(geometry.ribbon.height, 40); assert.equal(geometry.film.height, 104);
        assert.ok(geometry.thumb.width >= 96 && geometry.thumb.height >= 54);
        assert.ok(geometry.caption.y >= geometry.thumb.bottom && geometry.caption.bottom <= geometry.film.y + geometry.film.height);
        assert.ok(Math.abs(fit.slide.left + fit.slide.width / 2 - geometry.stage.x - geometry.stage.width / 2) < 1);
        assert.ok(Math.abs(fit.slide.top + fit.slide.height / 2 - geometry.stage.y - geometry.stage.height / 2) < 1);
        assert.ok(await panel.locator('.deck-film-add').evaluate(el => { const range = new Range(); range.selectNodeContents(el); return range.getClientRects().length === 1; }), 'Add slide stays on one line');
        evidence.layouts.push({ engineName, width, height, geometry });
        await page.screenshot({ path: out(`${engineName}-deck-studio-editor-${width}x${height}.png`) });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await select(0); await page.keyboard.press('ArrowRight');
      assert.equal(await active().getAttribute('data-i'), '1');
      assert.equal(await stage.evaluate(el => el.getAnimations({ subtree: true }).length), 0, 'keyboard slide changes are immediate');
      await page.keyboard.press('End'); assert.equal(await active().getAttribute('data-i'), '3');
      await page.keyboard.press('Home'); assert.equal(await active().getAttribute('data-i'), '0');
      await page.getByRole('button', { name: 'Slide overview', exact: true }).click();
      assert.equal(await active().count(), 4);
      await stage.hover(); await page.mouse.wheel(0, 460);
      await page.waitForFunction(() => Number(document.querySelector('.deck-film-item.on')?.dataset.i) >= 1);
      await select(2); assert.ok(await stage.evaluate(el => el.scrollTop > 400));
      await page.screenshot({ path: out(`${engineName}-deck-studio-overview.png`) });
      await page.getByRole('button', { name: 'Slide overview', exact: true }).click();
      assert.equal(await active().count(), 1); assert.equal(await active().getAttribute('data-i'), '2');
      assert.equal(await stage.locator('.deck-ideas .deck-idea').count(), 3); assert.equal(await stage.locator('.deck-three').count(), 0);
      await page.getByRole('textbox', { name: 'Slide 3 idea 2', exact: true }).fill('Earlier coffee'); await save();
      assert.equal(await film.locator('[data-i="2"] [data-idea="1"]').textContent(), 'Earlier coffee');
      await page.screenshot({ path: out(`${engineName}-deck-studio-columns.png`) });
      await page.getByRole('button', { name: 'Idea arrangement', exact: true }).click();
      await page.getByRole('menuitemradio', { name: 'Overlapping circles', exact: true }).click(); await save();
      assert.equal(await active().locator('.deck-three').count(), 1);
      // Pointer changes cancel rather than queue. Observe during the animation in a
      // single browser task, so the result is independent of automation latency.
      const interrupted = await film.evaluate(el => {
        const buttons = el.querySelectorAll('.deck-film-item');
        for (const i of [0, 1, 2, 1]) { buttons[i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); buttons[i].click(); }
        const stage = document.querySelector('.deck-stage');
        return { index: Number(el.querySelector('.on').dataset.i), running: stage.getAnimations({ subtree: true }).filter(a => a.playState === 'running').map(a => a.effect.getTiming().duration) };
      });
      assert.equal(interrupted.index, 1); assert.deepEqual(interrupted.running, [160]);
      await page.waitForTimeout(200);
      for (const mode of ['reduced', 'off']) {
        if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
        else await page.evaluate(() => document.body.classList.add('motion-off'));
        await select(0); await select(1);
        assert.equal(await stage.evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length), 0);
        await page.getByRole('button', { name: 'Present', exact: true }).click();
        assert.equal(await page.locator('.deck-present').evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length), 0);
        await page.keyboard.press('Escape');
        await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.evaluate(() => document.body.classList.remove('motion-off'));
      }
      // Start on a different slide, then navigate after the thumbnail and fitting
      // transforms have already painted. This reproduces the original Blink bug.
      for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        await select(0); await page.getByRole('button', { name: 'Present', exact: true }).click();
        await page.keyboard.press('ArrowRight');
        for (const [width, height] of [[960, 540], [1586, 992]]) {
          await page.setViewportSize({ width, height });
          await paintedText(page, '.deck-present .deck-chart .axis', width >= 1440 ? 18 : 12, `${engineName}-deck-studio-${theme}-chart-${width}`);
          await page.keyboard.press('ArrowRight');
          await paintedText(page, '.deck-present .deck-three text', 14, `${engineName}-deck-studio-${theme}-circles-${width}`);
          await page.keyboard.press('ArrowLeft');
        }
        await page.keyboard.press('Escape');
      }
      await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
      await page.setViewportSize({ width: 1440, height: 900 }); await select(0);
      await page.getByRole('button', { name: 'Slide background', exact: true }).click();
      await page.getByRole('menuitemradio', { name: 'Sci-fi wave', exact: true }).click(); await save();
      assert.equal(await active().locator('.deck-ridge').count(), 9);
      await page.getByRole('button', { name: 'Present', exact: true }).click();
      assert.equal(await page.locator('.deck-present .deck-ridge').count(), 9); await page.keyboard.press('Escape');
      await page.keyboard.press('Escape'); await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
      const stored = await page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(b => b.cards.find(c => c.id === 'studio')));
      assert.equal(stored.props.slides[2].relationship, 'overlap');
      assert.equal(stored.props.slides[2].body, 'Earlier nights\nEarlier coffee\nA steady routine');
      assert.equal(stored.props.slides[0].background, 'sci-fi-wave');
      assert.deepEqual(errors, []);
      console.log(`PASS ${engineName}: active slide, fixed ribbon/filmstrip, captions, keyboard, overview scroll, editable columns, explicit circles, interruptible motion, reduced motion, painted text in two themes/sizes, wave and save/reload`);
    } catch (error) { await page.screenshot({ path: out(`${engineName}-deck-studio-failure.png`) }); throw error; }
    finally { await browser.close(); }
  }
} finally { host.kill(); writeFileSync(out('deck-studio-evidence.json'), JSON.stringify(evidence, null, 2)); }
