// Exercise the shipped crop dialog using only the keyboard, then check pointer targets.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from './playwright.mjs';
import { out } from './out.mjs';
import { waitForAsync } from './poll.mjs';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
writeFileSync(out('crop-build.log'), build.stdout + build.stderr);
const token = `crop-a11y-${process.pid}`, data = mkdtempSync(join(tmpdir(), 'aegis-crop-a11y-'));
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], {
  cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: repo + '/app/dist', AEGIS_FAKE_MODEL: '1', AEGIS_PORT: '0', AEGIS_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'],
});
host.stderr.on('data', bytes => process.stderr.write(bytes));
const measurements = [], failures = [];
try {
  const port = await new Promise((resolve, reject) => {
    let output = '';
    host.stdout.on('data', bytes => { output += bytes; const m = /"port":(\d+)/.exec(output); if (m) resolve(m[1]); });
    host.once('exit', code => reject(Error(`Host exited ${code}`)));
  });
  for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await launcher.launch();
    try {
      for (const [width, height] of [[1440, 900], [1586, 992]]) for (const theme of ['dark', 'light']) {
        const key = `${engine}-${width}-${theme}`, errors = [];
        const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
        page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
        try {
          // Fixture setup is separate from the keyboard-only crop workflow below.
          const response = await fetch(`http://127.0.0.1:${port}/boards`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: `Crop ${key}` }) });
          assert.ok(response.ok); const board = await response.json();
          await page.addInitScript(({ theme, boardId }) => {
            if (window.top !== window) return;
            localStorage.setItem('aegis:board', boardId);
            localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:theme', theme);
          }, { theme, boardId: board.id });
          await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
          await page.waitForFunction(() => window.aegis?.canvas?.board);
          const buffer = Buffer.from(await page.evaluate(() => {
            const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
            const g = canvas.getContext('2d'); g.fillStyle = '#27292b'; g.fillRect(0, 0, 1000, 600);
            g.fillStyle = '#ededeb'; g.fillRect(150, 100, 260, 400); g.fillStyle = '#bd6b45'; g.beginPath(); g.arc(680, 300, 180, 0, Math.PI * 2); g.fill();
            return canvas.toDataURL().split(',')[1];
          }), 'base64');
          await page.locator('#mediaFile').setInputFiles({ name: 'crop-fixture.png', mimeType: 'image/png', buffer });
          await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.type === 'image'));
          const imageId = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'image').id);
          await page.evaluate(id => new Promise(resolve => aegisCtx.apply([{ op: 'update', id, set: { props: { tagText: 'Two forms, one piece of evidence' } } }], resolve)), imageId);
          await page.evaluate(id => { aegis.canvas.select([id]); aegis.canvas.frameIds([id], 1, false, true); }, imageId);
          const trigger = page.locator(`.card[data-id="${imageId}"]`).getByRole('button', { name: 'Crop', exact: true });
          const dialog = page.getByRole('dialog', { name: 'Crop image', exact: true });
          const active = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || (document.activeElement?.tagName === 'BUTTON' ? document.activeElement.textContent : document.activeElement?.tagName));
          const geometry = () => dialog.locator('.crop-fields input').evaluateAll(inputs => inputs.map(input => Number(input.value)));
          const expectGeometry = async expected => {
            assert.deepEqual(await geometry(), expected);
            assert.equal(await dialog.getByRole('status').textContent(), `X ${expected[0]}, Y ${expected[1]}, width ${expected[2]}, height ${expected[3]} pixels.`);
            const box = await dialog.locator('.crop-box').evaluate(el => [el.style.left, el.style.top, el.style.width, el.style.height].map(parseFloat));
            for (const [i, dimension] of [1000, 600, 1000, 600].entries()) assert.ok(Math.abs(box[i] * dimension / 100 - expected[i]) < .001, 'box and fields agree in original image pixels');
          };
          const tab = async (count = 1, backwards = false) => { for (let i = 0; i < count; i++) await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab'); };
          const type = async value => {
            const name = await active(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a'); await page.keyboard.type(String(value));
            assert.equal(await dialog.getByRole('spinbutton', { name, exact: true }).inputValue(), String(value), `${name}: keyboard entry before committing`);
          };
          const open = async () => {
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await trigger.focus(); assert.equal(await active(), 'Crop'); await page.keyboard.press('Enter'); await dialog.waitFor();
            await page.waitForFunction(() => document.querySelector('.crop-frame > img')?.complete);
            await page.waitForFunction(() => document.getElementById('crop-w')?.value === '1000' || Number(document.getElementById('crop-w')?.value) > 0);
            assert.equal(await active(), 'Crop area');
          };
          const saved = async () => {
            await waitForAsync(page, async () => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).rev === aegis.canvas.board.rev);
            return page.evaluate(async id => (await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).cards.find(c => c.id === id), imageId);
          };
          const pixels = card => card.props.crop ? [card.props.crop.x * 1000, card.props.crop.y * 600, card.props.crop.w * 1000, card.props.crop.h * 600].map(Math.round) : [0, 0, 1000, 600];
          const shot = async name => { const path = out(`crop-${key}-${name}.png`); await page.screenshot({ path }); return path; };

          await saved();
          await open(); await expectGeometry([0, 0, 1000, 600]);
          const original = await saved(), tabOrder = [await active()];
          for (let i = 0; i < 11; i++) { await tab(); tabOrder.push(await active()); }
          assert.deepEqual(tabOrder, ['Crop area', 'Top-left crop handle', 'Top-right crop handle', 'Bottom-left crop handle', 'Bottom-right crop handle', 'X', 'Y', 'Width', 'Height', 'Reset', 'Cancel', 'Done']);
          await tab(11, true);
          const focus = await dialog.locator('.crop-box').evaluate(el => {
            const s = getComputedStyle(el); return { visible: el.matches(':focus-visible'), width: s.outlineWidth, colour: s.outlineColor, style: s.outlineStyle };
          });
          assert.equal(focus.visible, true); assert.equal(focus.width, '2px'); assert.equal(focus.style, 'solid');
          const areaScreenshot = await shot('area');
          await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowUp'); await expectGeometry([0, 0, 1000, 600]);
          for (const [name, keys, single, shifted] of [
            ['Top-left crop handle', ['ArrowRight', 'ArrowDown'], [1, 1, 999, 599], [11, 11, 989, 589]],
            ['Top-right crop handle', ['ArrowLeft', 'ArrowDown'], [11, 12, 988, 588], [11, 22, 978, 578]],
            ['Bottom-left crop handle', ['ArrowRight', 'ArrowUp'], [12, 22, 977, 577], [22, 22, 967, 567]],
            ['Bottom-right crop handle', ['ArrowLeft', 'ArrowUp'], [22, 22, 966, 566], [22, 22, 956, 556]],
          ]) {
            await tab(); assert.equal(await active(), name);
            for (const key of keys) await page.keyboard.press(key); await expectGeometry(single);
            for (const key of keys) await page.keyboard.press('Shift+' + key); await expectGeometry(shifted);
            assert.equal(await dialog.getByRole('button', { name, exact: true }).evaluate(el => getComputedStyle(el).outlineWidth), '2px');
          }
          const handleScreenshot = await shot('handle');
          await tab(4, true); assert.equal(await active(), 'Crop area');
          await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await expectGeometry([23, 23, 956, 556]);
          await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowDown'); await expectGeometry([33, 33, 956, 556]);
          await tab(5); assert.equal(await active(), 'X');
          for (const value of [5, 7, 500, 300]) { await type(value); await tab(); }
          await expectGeometry([5, 7, 500, 300]); assert.equal(await active(), 'Reset');
          await tab(4, true); assert.equal(await active(), 'X');
          for (const key of ['ArrowUp', 'Shift+ArrowUp', 'ArrowDown', 'Shift+ArrowDown']) await page.keyboard.press(key);
          await expectGeometry([5, 7, 500, 300]);
          await type(123); await dialog.locator('.crop-frame > img').dispatchEvent('load');
          assert.equal(await dialog.getByRole('spinbutton', { name: 'X', exact: true }).inputValue(), '123', 'image refresh preserves a field draft');
          await type(5);
          const fieldsScreenshot = await shot('fields');
          await tab(6); assert.equal(await active(), 'Done'); await page.keyboard.press('Enter'); await dialog.waitFor({ state: 'hidden' });
          let card = await saved(); assert.deepEqual(pixels(card), [5, 7, 500, 300]);
          assert.equal(card.url, original.url); assert.equal(card.props.tagText, original.props.tagText);
          const savedScreenshot = await shot('saved');

          // Enter commits a field before blur. Escape and the Cancel button preserve the saved crop.
          await open(); await expectGeometry([5, 7, 500, 300]); await tab(7); assert.equal(await active(), 'Width');
          await type(480); await page.keyboard.press('Enter'); await dialog.waitFor({ state: 'hidden' });
          card = await saved(); assert.deepEqual(pixels(card), [5, 7, 480, 300]);
          await open(); await tab(); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Escape');
          await dialog.waitFor({ state: 'hidden' });
          await page.waitForFunction(() => document.activeElement?.textContent === 'Crop');
          assert.deepEqual((await saved()).props.crop, card.props.crop);
          await open(); await tab(9); await page.keyboard.press('Enter'); await expectGeometry([0, 0, 1000, 600]);
          await tab(); assert.equal(await active(), 'Cancel'); await page.keyboard.press('Enter'); await dialog.waitFor({ state: 'hidden' });
          assert.deepEqual((await saved()).props.crop, card.props.crop);

          // Clamp fields at the minimum size and image edges, then clamp the handles there too.
          await open(); await tab(5);
          for (const value of [-100, -100, 0, 0]) { await type(value); await tab(); }
          await expectGeometry([0, 0, 80, 48]);
          await tab(2, true); assert.equal(await active(), 'Width'); await page.keyboard.press('ArrowDown');
          await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a'); await page.keyboard.press('Backspace');
          await tab(); await expectGeometry([0, 0, 80, 48]);
          await tab(3, true);
          for (const value of [9999, 9999, 9999, 9999]) { await type(value); await tab(); }
          await expectGeometry([920, 552, 80, 48]); await tab(8, true); assert.equal(await active(), 'Top-left crop handle');
          await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowDown'); await expectGeometry([920, 552, 80, 48]);
          await tab(3); await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowUp'); await expectGeometry([920, 552, 80, 48]);
          await tab(4, true); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowDown'); await expectGeometry([920, 552, 80, 48]);
          await tab(9); await page.keyboard.press('Enter'); await expectGeometry([0, 0, 1000, 600]);
          const targets = await dialog.locator('.crop-handle').evaluateAll(handles => handles.map(el => {
            const r = el.getBoundingClientRect();
            return { name: el.getAttribute('aria-label'), width: r.width, height: r.height, cornersHit: [[r.left + 1, r.top + 1], [r.right - 1, r.top + 1], [r.left + 1, r.bottom - 1], [r.right - 1, r.bottom - 1]].every(([x, y]) => document.elementFromPoint(x, y) === el) };
          }));
          for (const target of targets) { assert.ok(target.width >= 24 && target.height >= 24, target.name); assert.equal(target.cornersHit, true, target.name + ' is not clipped'); }
          // A one-pixel crop must survive saving even when it covers over 99.5% of the image.
          await tab(5, true); assert.equal(await active(), 'Bottom-right crop handle'); await page.keyboard.press('ArrowLeft');
          await page.keyboard.press('Enter'); await dialog.waitFor({ state: 'hidden' }); assert.deepEqual(pixels(await saved()), [0, 0, 999, 600]);
          await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board);
          assert.deepEqual(pixels(await saved()), [0, 0, 999, 600], 'crop survives a production UI reload');

          // Pointer dragging and shared stepper buttons still sync the same fields.
          await page.evaluate(id => { aegis.canvas.select([id]); aegis.canvas.frameIds([id], 1, false, true); }, imageId);
          await open(); await tab(9); await page.keyboard.press('Enter');
          const r = await dialog.locator('.crop-frame').boundingBox(), h = await dialog.locator('.crop-handle.se').boundingBox();
          await page.mouse.move(h.x + h.width - 2, h.y + h.height - 2); await page.mouse.down();
          await page.mouse.move(h.x + h.width - 2 - r.width * .2, h.y + h.height - 2 - r.height * .2, { steps: 5 }); await page.mouse.up();
          const dragged = await geometry(); assert.equal(dragged[0], 0); assert.equal(dragged[1], 0);
          assert.ok(Math.abs(dragged[2] - 800) <= 2 && Math.abs(dragged[3] - 480) <= 2, 'pointer resize follows the image scale');
          await expectGeometry(dragged);
          await dialog.getByRole('button', { name: 'Decrease width', exact: true }).click(); await expectGeometry([0, 0, dragged[2] - 1, dragged[3]]);
          await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
          assert.deepEqual(errors, []);
          measurements.push({ key, tabOrder, focus, targets, keyboardSaved: [5, 7, 500, 300], onePixelSaved: [0, 0, 999, 600], screenshots: [areaScreenshot, handleScreenshot, fieldsScreenshot, savedScreenshot] });
          console.log(`PASS ${key}: keyboard crop, all handles, fields, bounds, save/reload, cancel, focus and pointer targets`);
        } catch (error) {
          await page.screenshot({ path: out(`crop-${key}-failure.png`) }).catch(() => {});
          failures.push({ key, message: error.stack }); console.error(`FAIL ${key}: ${error.stack}`);
        } finally { await page.close(); }
      }
    } finally { await browser.close(); }
  }
  writeFileSync(out('crop-a11y.json'), JSON.stringify({ data, measurements, failures }, null, 2));
  assert.deepEqual(failures, []);
} finally { host.kill(); }
