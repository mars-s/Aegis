import { assertCameraScale } from './static-geometry.mjs';
// Production browser checks, isolated host data and no real model providers.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from './playwright.mjs';
import { out } from './out.mjs';
import { demoBatch } from '../demo-batch.mjs';
import { documentWordCount } from '@aegis/domain/words';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `fit-finish-${process.pid}`, data = mkdtempSync(join(tmpdir(), 'aegis-fit-finish-'));
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: {
  ...process.env, AEGIS_DATA: data, AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1',
}, stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((resolve, reject) => {
  let output = '';
  host.stdout.on('data', bytes => { output += bytes; const match = /"port":(\d+)/.exec(output); if (match) resolve(match[1]); });
  host.once('exit', code => reject(Error(`Host exited ${code}`)));
});
const audit = process.env.AEGIS_FIT_AUDIT === '1', captures = [], measurements = [], errors = [];
const style = locator => locator.evaluate(el => {
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, colour: s.color, bg: s.backgroundColor, font: parseFloat(s.fontSize), outline: s.outlineStyle, outlineWidth: parseFloat(s.outlineWidth), outlineColour: s.outlineColor, appearance: s.appearance };
});
let page;
try {
  for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await launcher.launch();
    try {
      for (const theme of ['dark', 'light']) {
        page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme });
        page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(theme => {
          if (window.top !== window) return;
          localStorage.setItem('aegis:theme', theme); localStorage.setItem('aegis:introduction-complete', '1');
          Object.defineProperty(window, 'MediaRecorder', { value: undefined });
        }, theme);
        const shot = async name => {
          await page.waitForTimeout(220);
          const path = out(`fit-finish-${engine}-${theme}-${name}.png`); captures.push(path); await page.screenshot({ path });
        };
        const inspect = async (name, root) => {
          const findings = await root.evaluate(root => {
            const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width && r.height && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]'); };
            const small = [...root.querySelectorAll('*')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => ({ tag: el.tagName, cls: el.className, text: el.textContent.trim().slice(0, 70), font: getComputedStyle(el).fontSize }));
            const native = [...root.querySelectorAll('select,input[type=range],input[type=checkbox]')].filter(visible).filter(el => getComputedStyle(el).appearance !== 'none').map(el => ({ tag: el.tagName, type: el.type, name: el.getAttribute('aria-label'), appearance: getComputedStyle(el).appearance }));
            return { small, native };
          });
          measurements.push({ engine, theme, name, ...findings });
          if (!audit) { assert.deepEqual(findings.small, [], `${name}: chrome text is at least 12px`); assert.deepEqual(findings.native, [], `${name}: controls are themed`); }
        };
        const select = async id => {
          await page.evaluate(id => { aegis.canvas.select([id]); aegis.canvas.frameIds([id], 1, false, true); document.getElementById('stage').focus(); }, id);
          await page.waitForTimeout(350);
        };
        const open = async id => { await select(id); await page.locator('#selectionBar').getByRole('button', { name: 'Open', exact: true }).click(); };
        await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
        await page.waitForFunction(() => window.aegis?.canvas?.board && document.documentElement.dataset.bridge === 'browser');
        assert.equal(await page.locator('.toast:not([hidden])').count(), 0, 'browser startup is quiet');
        await shot('launch'); await page.keyboard.press('Escape');
        await page.evaluate(() => aegis.apply([{ op: 'restore', cards: [], links: [] }]));
        await page.mouse.move(1400, 20); await page.locator('#settingsBtn').click();
        const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
        for (const [width, height] of [[1440, 900], [1586, 992]]) {
          await page.setViewportSize({ width, height });
          for (const name of ['General', 'Board', 'Panels', 'Accounts', 'Integrations', 'About']) {
            await settings.getByRole('tab', { name, exact: true }).click();
            await inspect(`settings-${name}-${width}`, settings);
            if (width === 1440) await shot(`settings-${name.toLowerCase()}`);
          }
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await settings.getByRole('tab', { name: 'General', exact: true }).click();
        await settings.locator('.settings-appearance > summary').click();
        const trigger = settings.getByRole('button', { name: 'App board background', exact: true }); await trigger.click();
        const colour = page.getByRole('dialog', { name: 'Colour editor', exact: true });
        const hex = colour.getByRole('textbox', { name: 'Hex', exact: true });
        await hex.fill('#000000'); await hex.dispatchEvent('change');
        const wheel = colour.getByRole('slider', { name: 'Hue and saturation', exact: true });
        const pixel = await wheel.evaluate(el => [...el.getContext('2d').getImageData(200, 110, 1, 1).data]);
        assert.ok(pixel[0] > 240 && pixel[1] < 80 && pixel[3] === 255, 'black selection retains a bright hue field');
        assert.equal(await wheel.getAttribute('aria-valuemin'), '0'); assert.equal(await wheel.getAttribute('aria-valuemax'), '359');
        await wheel.focus(); await wheel.press('ArrowRight'); await wheel.press('Shift+ArrowUp');
        assert.match(await wheel.getAttribute('aria-valuetext'), /Hue 3 degrees, saturation 2%, brightness 0%/);
        assert.equal(await hex.inputValue(), '#000000');
        const box = await wheel.boundingBox(); await page.mouse.click(box.x + box.width - 18, box.y + box.height / 2);
        assert.equal(await hex.inputValue(), '#000000', 'pointer preserves the separate brightness setting');
        for (const [name, min, max, text] of [['Hue', '0', '359', /degrees/], ['Saturation', '0', '100', /% saturation/], ['Brightness', '0', '100', /% brightness/]]) {
          const input = colour.getByRole('slider', { name, exact: true });
          assert.equal(await input.getAttribute('min'), min); assert.equal(await input.getAttribute('max'), max); assert.match(await input.getAttribute('aria-valuetext'), text);
        }
        const hue = colour.getByRole('slider', { name: 'Hue', exact: true }); await hue.fill('359'); await hue.dispatchEvent('change');
        assert.equal(await hue.getAttribute('aria-valuetext'), '359 degrees');
        assert.ok(await colour.locator('.colour-instructions').isVisible());
        assert.equal(await colour.getByLabel('Selected colour', { exact: true }).textContent(), '#000000');
        await wheel.focus(); await wheel.press('ArrowRight'); const focus = await style(wheel); assert.ok(focus.outlineWidth >= 2 && focus.outline === 'solid');
        await inspect('colour-editor', colour); await shot('black-colour-wheel');
        const brightness = colour.getByRole('slider', { name: 'Brightness', exact: true }); await brightness.fill('100'); await brightness.dispatchEvent('change');
        assert.notEqual(await hex.inputValue(), '#000000');
        await page.keyboard.press('Escape'); assert.equal(await settings.isVisible(), true); assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
        await settings.getByRole('button', { name: 'Reset colours for this mode', exact: true }).click();
        await settings.getByRole('button', { name: 'Done', exact: true }).click();

        await page.mouse.move(720, 20); await page.locator('#boardName').click();
        await inspect('library-sidebar', page.locator('#side')); await shot('library-sidebar'); await page.locator('#boardName').click();
        await page.evaluate(commands => aegis.apply(commands), demoBatch);
        await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.type === 'doc'));
        const ids = await page.evaluate(() => Object.fromEntries(aegis.canvas.board.cards.map(c => [c.kind || c.type, c.id])));
        const count = () => page.locator('.docs-footer [data-count]').textContent();
        const expectedCount = `${documentWordCount({ type: 'doc', text: demoBatch[0].text, props: demoBatch[0].props })} words`;
        await page.evaluate(() => aegis.apply([{ op: 'create', type: 'note', newId: 'finishnote', text: 'A clear thought', x: 100, y: 100, w: 320, h: 200 }]));
        await select('finishnote');
        await inspect('selection-bar', page.locator('#selectionBar'));
        await page.getByLabel('More selection controls', { exact: true }).click();
        await page.getByLabel('Format selection', { exact: true }).click();
        const format = page.getByRole('dialog', { name: 'Format selection controls', exact: true });
        await inspect('format-menu', format); await shot('format-menu'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
        await assertCameraScale(page, [ids.doc, ids.sheet]);
        await open(ids.doc); assert.equal(await count(), expectedCount);
        assert.ok((await page.locator('.editor-context-source').textContent()).includes(expectedCount));
        await inspect('editor-header', page.locator('.side-editor-head')); await inspect('document-ribbon', page.locator('.docs-ribbon')); await inspect('document-footer', page.locator('.docs-footer')); await shot('document-before-save');
        await page.locator('.docs-prose').press('ControlOrMeta+End'); await page.keyboard.type(' More words.');
        await page.waitForFunction(() => document.querySelector('.docs-panel [data-saved]')?.textContent === 'Saved');
        const after = await count();
        const stored = await page.evaluate(async id => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).cards.find(c => c.id === id), ids.doc);
        assert.equal(after, `${documentWordCount(stored)} words`);
        assert.ok((await page.locator('.editor-context-source').textContent()).includes(after));
        await page.locator('.docs-footer [data-back]').click(); await open(ids.doc); assert.equal(await count(), after);
        await shot('document-after-save'); await page.locator('.docs-footer [data-back]').click();
        await open(ids.deck);
        const present = page.getByRole('button', { name: 'Present', exact: true });
        const primary = await style(present);
        const neutral = await present.evaluate(el => { const probe = document.createElement('i'); probe.style.background = 'var(--accent)'; probe.style.color = 'var(--on-accent)'; el.append(probe); const s = getComputedStyle(probe), result = { bg: s.backgroundColor, colour: s.color }; probe.remove(); return result; });
        assert.equal(primary.bg, neutral.bg); assert.equal(primary.colour, neutral.colour);
        await page.keyboard.press('Tab'); await present.focus(); const presentFocus = await style(present); assert.ok(presentFocus.outlineWidth >= 2, JSON.stringify(presentFocus));
        await inspect('deck-ribbon', page.locator('.deck-ribbon')); await inspect('deck-footer', page.locator('.deck-film')); await shot('deck');
        await present.click(); await shot('presentation'); await page.keyboard.press('Escape');
        await page.locator('.deck-panel [data-close]').click();
        await open(ids.sheet); await inspect('sheet-header', page.locator('.react-editor-toolbar')); await inspect('sheet-ribbon', page.locator('.sheet-editor .office-ribbon')); await shot('sheet'); await page.keyboard.press('Escape');
        await page.evaluate(() => aegis.apply([{ op: 'create', type: 'audio', newId: 'recorder', x: 100, y: 100, w: 440, h: 320, text: 'Recording' }]));
        await select('recorder'); await page.getByRole('button', { name: 'Start recording', exact: true }).click();
        const notice = page.locator('.media-status'); assert.match(await notice.textContent(), /Recording is unavailable.*Import a file instead/);
        await shot('requested-capability-unavailable');
        measurements.push({ engine, theme, wordCountBefore: expectedCount, wordCountSaved: after, pixel, focus, present: primary });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.mouse.move(1400, 20); await page.locator('#settingsBtn').click(); await page.waitForTimeout(220);
        const moving = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.target?.closest?.('#settings, .side-editor, .aegis-surface')).length);
        assert.equal(moving, 0, 'reduced motion leaves no running chrome animation');
        await page.close(); console.log(`PASS ${engine} ${theme}: colour, words, neutral actions, launch, capability notice and chrome sweep`);
      }
    } finally { await browser.close(); }
  }
  assert.deepEqual(errors, []);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: out('fit-finish-failure.png') });
  throw error;
} finally {
  writeFileSync(out('fit-finish-results.json'), JSON.stringify({ data, audit, captures, measurements, errors }, null, 2)); host.kill();
}
