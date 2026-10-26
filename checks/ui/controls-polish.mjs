import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from './playwright.mjs';
import { out } from './out.mjs';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `controls-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: {
  ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-controls-')), AEGIS_UI: repo + '/app/dist', AEGIS_FAKE_MODEL: '1', AEGIS_PORT: '0', AEGIS_TOKEN: token,
}, stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((resolve, reject) => { host.stdout.on('data', data => { const match = /"port":(\d+)/.exec(String(data)); if (match) resolve(match[1]); }); host.once('exit', code => reject(Error(`Host exited ${code}`))); });
const measurements = [], errors = [];
const rect = locator => locator.evaluate(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { x: r.x, y: r.y, width: r.width, height: r.height, radius: s.borderRadius, font: s.fontSize }; });
try {
  for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await launcher.launch();
    try {
      for (const theme of ['dark', 'light']) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(theme => { if (window.top === window) { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:theme', theme); } }, theme);
        await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
        await page.waitForFunction(() => window.aegis?.canvas?.board && document.getElementById('model').options.length);
        const shot = async name => { await page.waitForTimeout(220); await page.screenshot({ path: out(`controls-${engine}-${theme}-${name}.png`) }); };
        const apply = commands => page.evaluate(commands => aegis.apply(commands), commands);
        const select = async id => { await page.evaluate(id => { aegis.canvas.select([id]); aegis.canvas.frameIds([id], 1, false, true); document.getElementById('stage').focus(); }, id); await page.waitForTimeout(350); };
        const dismiss = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(200); };
        await apply([{ op: 'restore', cards: [], links: [] }]);
        await page.mouse.move(1400, 20); await page.locator('#settingsBtn').click();
        const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
        for (const [width, height] of [[1440, 900], [1586, 992], [390, 844]]) {
          await page.setViewportSize({ width, height }); await page.waitForTimeout(220);
          const shell = await rect(settings), tabs = await rect(settings.getByRole('tablist')), done = await rect(settings.getByRole('button', { name: 'Done', exact: true }));
          assert.equal(Math.round(shell.width), Math.min(620, width - 24)); assert.equal(shell.y, 48); assert.equal(Math.round(shell.height), Math.min(760, height - 96));
          for (const name of ['General', 'Board', 'Toolbar', 'Panels', 'Accounts', 'Integrations', 'About']) {
            await settings.getByRole('tab', { name, exact: true }).click();
            assert.deepEqual(await rect(settings), shell, `${name}: fixed Settings shell`);
            assert.deepEqual(await rect(settings.getByRole('tablist')), tabs, `${name}: fixed tabs`);
            assert.deepEqual(await rect(settings.getByRole('button', { name: 'Done', exact: true })), done, `${name}: fixed Done button`);
          }
          measurements.push({ engine, theme, width, settings: shell, tabs, done });
          await settings.getByRole('tab', { name: 'General', exact: true }).click();
          assert.equal(await settings.locator('.settings-appearance').getAttribute('open'), null);
          await shot(`settings-general-${width}`);
          await settings.locator('.settings-appearance > summary').click();
          await settings.getByRole('button', { name: 'App board background', exact: true }).scrollIntoViewIfNeeded();
          const panel = settings.locator('#settings-general');
          await panel.evaluate(el => { el.scrollTop = el.scrollHeight; });
          assert.deepEqual(await rect(settings.getByRole('tablist')), tabs, 'only the content scrolls');
          assert.equal(await settings.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollTop === 0), true);
          await shot(`settings-appearance-${width}`);
          await settings.locator('.settings-appearance > summary').click();
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await settings.locator('.settings-appearance > summary').click();
        const colour = settings.getByRole('button', { name: 'App board background', exact: true }); await colour.click();
        const colourEditor = settings.getByRole('dialog', { name: 'Colour editor', exact: true });
        await colourEditor.getByRole('textbox', { name: 'Hex', exact: true }).fill('#152331'); await colourEditor.getByRole('textbox', { name: 'Hex', exact: true }).press('Tab');
        assert.equal(await page.evaluate(theme => JSON.parse(localStorage.getItem('aegis:colour-settings'))[theme].bg, theme), '#152331');
        // WebKit can tab past buttons when full keyboard access is off. Reopen if Tab left the popup.
        if (!await colourEditor.isVisible()) await colour.click();
        await shot('settings-colour-editor'); await dismiss();
        assert.equal(await settings.isVisible(), true); assert.equal(await colour.evaluate(el => document.activeElement === el), true);
        await settings.getByRole('button', { name: 'Reset colours for this mode', exact: true }).click();
        await settings.getByRole('button', { name: 'Done', exact: true }).click();

        const csv = 'amount,department,date,note\n' + Array.from({ length: 500 }, (_, i) => `${i + 1},Support,2026-10-01,Row ${i + 1}`).join('\n');
        await page.evaluate(csv => { const transfer = new DataTransfer(); transfer.items.add(new File([csv], 'controls.csv', { type: 'text/csv' })); document.getElementById('stage').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, clientX: 500, clientY: 350, bubbles: true })); }, csv);
        await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.type === 'dataset'));
        const id = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'dataset').id); await select(id);
        assert.ok(await page.locator('.data-col b').evaluateAll(nodes => nodes.every(el => parseFloat(getComputedStyle(el).fontSize) >= 11)));
        await shot('dataset-card'); await page.locator('#selectionBar').getByRole('button', { name: 'Open', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.data-viewport')?.getAttribute('aria-busy') === 'false');
        const picker = page.getByRole('combobox', { name: 'Go to column', exact: true });
        assert.equal(await picker.evaluate(el => el.tagName), 'BUTTON'); assert.equal((await rect(picker)).height, 32);
        await picker.click(); const list = page.getByRole('listbox', { name: 'Go to column options', exact: true }); await page.waitForTimeout(220);
        assert.equal((await rect(list)).radius, '10px');
        for (const option of await list.getByRole('option').all()) assert.equal((await rect(option)).height, 34);
        await shot('dataset-picker'); await dismiss();
        assert.equal(await list.isVisible(), false); assert.equal(await page.locator('.data-viewer').isVisible(), true); assert.equal(await picker.evaluate(el => el === document.activeElement), true);
        await picker.press('ArrowDown'); await page.keyboard.press('End'); await page.keyboard.press('Enter');
        assert.equal(await picker.evaluate(el => el.value), '3');
        await page.getByRole('searchbox', { name: 'Find column', exact: true }).fill('amount'); assert.equal(await picker.evaluate(el => el.value), '0');
        await picker.focus(); await dismiss(); assert.equal(await page.locator('.data-viewer').count(), 0);

        await apply([{ op: 'create', type: 'note', newId: 'controlnote', text: 'A useful thought, ready to connect.', x: 100, y: 100, w: 320, h: 200 }]); await select('controlnote');
        await page.getByLabel('More selection controls', { exact: true }).click(); await page.getByLabel('Format selection', { exact: true }).click();
        const format = page.getByRole('dialog', { name: 'Format selection controls', exact: true });
        await page.waitForTimeout(220);
        for (const row of await format.locator('.selection-row:has(.aegis-stepper)').all()) {
          const control = row.locator('.aegis-stepper'), label = row.locator(':scope > span').first();
          assert.equal((await rect(row)).height, 44); assert.equal((await rect(label)).width, 112); assert.equal((await rect(control)).width, 96);
          for (const target of await control.locator('button, input').all()) { const r = await rect(target); assert.equal(r.width, 32); assert.equal(r.height, 32); }
          assert.equal(await label.evaluate(el => el.scrollHeight <= parseFloat(getComputedStyle(el).lineHeight) + 1), true, 'stepper labels do not wrap');
        }
        const line = format.getByRole('textbox', { name: 'Line height', exact: true }), before = Number(await line.inputValue());
        await format.getByRole('button', { name: 'Increase line height', exact: true }).click(); assert.ok(Number(await line.inputValue()) > before);
        await line.fill('1.8'); await line.press('Tab'); assert.equal(await page.evaluate(() => aegis.canvas.board.cards.find(c => c.id === 'controlnote').props.lh), 1.8);
        await shot('format'); await dismiss(); await dismiss();

        await page.mouse.move(720, 20); await page.locator('#boardName').click();
        const rowMore = page.locator('.tree-row .row-more').first(); assert.equal((await rect(rowMore)).height, 32); assert.equal((await rect(rowMore)).width, 32);
        await rowMore.click(); const context = page.locator('.ctx-menu:not([hidden])');
        await shot('context'); assert.equal((await rect(context)).radius, '10px');
        const action = context.getByRole('menuitem').first(); await action.hover(); await page.mouse.down(); await page.waitForTimeout(160);
        assert.equal(await action.evaluate(el => getComputedStyle(el).transform), 'matrix(0.97, 0, 0, 0.97, 0, 0)');
        await page.mouse.move(1000, 800); await page.mouse.up(); await dismiss();
        await page.keyboard.press('Tab'); await rowMore.focus();
        const focusRing = await rowMore.evaluate(el => ({ width: getComputedStyle(el).outlineWidth, style: getComputedStyle(el).outlineStyle, visible: el.matches(':focus-visible'), side: !!el.closest('#side'), markup: el.outerHTML }));
        assert.equal(focusRing.width, '2px', JSON.stringify(focusRing));
        await page.locator('.library-home-button').click(); await shot('library'); await page.getByRole('button', { name: 'Back to board', exact: true }).click();
        await page.evaluate(() => aegisCtx.toast('Saved changes')); await shot('toast'); assert.equal((await rect(page.locator('.toast'))).radius, '10px');
        assert.deepEqual(await page.locator('select').evaluateAll(nodes => nodes.filter(el => el.getClientRects().length).map(el => el.id)), [], 'no visible native selects');
        assert.equal(await page.locator('input[type=color]').count(), 0);
        console.log(`PASS ${engine} ${theme}: stable Settings, shared colour editor, dataset picker Escape/focus, 32px steppers, 11px type labels, menu states, sidebar, Library and toast`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
  assert.deepEqual(errors, []); writeFileSync(out('controls-measurements.json'), JSON.stringify(measurements, null, 2));
} finally { host.kill(); }
