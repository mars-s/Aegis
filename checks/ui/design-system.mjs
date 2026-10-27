// Production controls, real host and temporary data. Screenshots are the review inventory.
import { chromium, webkit } from './playwright.mjs';
import { out } from './out.mjs';
import { demoBatch } from '../demo-batch.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `design-system-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: {
  ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-design-system-')), AEGIS_UI: repo + '/app/dist',
  AEGIS_FAKE_MODEL: '1', AEGIS_PORT: '0', AEGIS_TOKEN: token,
}, stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((resolve, reject) => {
  host.stdout.on('data', bytes => { const m = /"port":(\d+)/.exec(String(bytes)); if (m) resolve(m[1]); });
  host.once('exit', code => reject(Error(`Host exited ${code}`)));
});
const browser = await (process.env.AEGIS_BROWSER === 'webkit' ? webkit : chromium).launch();
const captures = [], errors = [];
let page;
try {
  for (const theme of ['dark', 'light']) {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(theme => { if (window.top !== window) return; localStorage.setItem('aegis:theme', theme); localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); }, theme);
    await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
    await page.waitForFunction(() => window.aegis?.canvas?.board && document.getElementById('model').options.length);
    const shot = async (name, target) => {
      await page.waitForTimeout(190);
      if (target) {
        await target.waitFor({ state: 'visible' });
        assert.equal(await target.evaluate(el => el.classList.contains('aegis-surface') || el.classList.contains('aegis-dialog')), true, name + ' uses shared UI');
        const geometry = await target.evaluate(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, bg: s.backgroundColor, border: s.borderTopWidth, radius: s.borderRadius, shadow: s.boxShadow }; });
        assert.ok(geometry.x >= -1 && geometry.y >= -1 && geometry.right <= 1441 && geometry.bottom <= 1001, name + ': viewport containment ' + JSON.stringify(geometry));
        captures.push({ theme, name, ...geometry, path: out(`design-${theme}-${name}.png`) });
      } else captures.push({ theme, name, path: out(`design-${theme}-${name}.png`) });
      await page.screenshot({ path: captures.at(-1).path });
    };
    const dismiss = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(190); };
    const popupFor = async trigger => page.locator(`[id="${await trigger.getAttribute('aria-controls')}"]`);
    const select = async ids => { await page.evaluate(ids => { aegis.canvas.select(ids); aegis.canvas.frameIds(ids, 1, false, true); document.getElementById('stage').focus(); }, ids); await page.waitForTimeout(350); };
    const settings = page.locator('#settings');
    await page.mouse.move(1400, 20); await page.locator('#settingsBtn').click();
    for (const name of ['General', 'Board', 'Toolbar', 'Panels', 'Accounts', 'Integrations', 'About']) {
      await settings.getByRole('tab', { name, exact: true }).click(); await shot('settings-' + name.toLowerCase(), settings);
      if (name === 'General' || name === 'Board' || name === 'Toolbar') {
        for (const trigger of await settings.getByRole('combobox').all()) {
          const label = await trigger.getAttribute('aria-label'); await trigger.click();
          const menu = await popupFor(trigger); await shot('settings-select-' + label.toLowerCase().replaceAll(' ', '-'), menu);
          assert.equal(await menu.evaluate(el => !!el.closest('dialog[open]')), true, 'picker is interactive inside the modal');
          await dismiss(); assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'Escape restores select focus');
        }
      }
    }
    await settings.getByRole('tab', { name: 'General', exact: true }).focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await settings.getByRole('tab', { name: 'Board', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await settings.locator('[role=tab][tabindex="0"]').count(), 1);
    const motion = settings.getByRole('switch', { name: 'Motion', exact: true });
    await motion.uncheck(); assert.equal(await page.evaluate(() => document.body.classList.contains('motion-off')), true); await motion.check();
    await page.locator('#closeSettings').click();
    await page.mouse.move(1100, 20); const zoom = page.getByRole('button', { name: 'Zoom menu', exact: true });
    await zoom.focus(); await page.keyboard.press('ArrowDown'); const zoomMenu = await popupFor(zoom);
    assert.equal(await zoomMenu.evaluate(el => el.getAnimations().length), 0, 'keyboard menu is instant');
    await shot('zoom', zoomMenu); await page.keyboard.press('End'); await page.keyboard.press('Home'); await dismiss();
    assert.equal(await zoom.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Meta+k'); await page.locator('#orbMenuButton').click();
    const orb = page.locator('#orbMenu'); await shot('island-options', orb);
    for (const name of ['Agent model', 'Agent count', 'Status model']) {
      await orb.getByRole('menuitem', { name: new RegExp('^' + name) }).click(); await shot('island-' + name.toLowerCase().replaceAll(' ', '-'), orb);
      await orb.getByRole('menuitem', { name: 'Back to agent options', exact: true }).click();
    }
    await dismiss(); await dismiss();
    if (theme === 'dark') {
      await page.evaluate(batch => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify(batch), model: { provider: 'fake', modelId: 'fake' } }), demoBatch);
      await page.waitForFunction(() => aegis.canvas.board.cards.length === 9);
      await page.waitForFunction(async () => (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`)).every(a => !a.running));
      await page.evaluate(() => new Promise(resolve => aegisCtx.apply([{ op: 'create', type: 'note', newId: 'designnote', text: 'A shared language for every window.', x: 80, y: 80, w: 300, h: 180 }], resolve)));
    }
    await page.keyboard.press('Escape');
    const note = page.locator('.card[data-id="designnote"]');
    await select(['designnote']); await note.click({ button: 'right', position: { x: 2, y: 80 } });
    await shot('card-context', page.locator('.ctx-menu:not([hidden])'));
    assert.deepEqual(await page.locator('.ctx-menu:not([hidden]) > button').evaluateAll(nodes => nodes.map(el => el.dataset.label)), ['Edit', 'Copy', 'Duplicate', 'Arrange', 'Lock', 'Delete']);
    await page.locator('.ctx-menu:not([hidden])').getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.closest('.card')?.dataset.id === 'designnote' && document.activeElement?.getAttribute('contenteditable') !== null);
    assert.equal(await note.locator('.body').evaluate(el => el === document.activeElement), true, 'Edit focuses the actual inline text');
    await note.click({ button: 'right', position: { x: 2, y: 80 } });
    await page.locator('.ctx-menu:not([hidden])').getByRole('menuitem', { name: 'Arrange', exact: true }).click(); await shot('card-arrange', page.getByRole('menu', { name: 'Arrange', exact: true }));
    assert.equal(await page.getByRole('menuitem', { name: 'Group', exact: true }).count(), 0, 'a single object cannot group itself');
    assert.equal(await page.getByRole('menuitem', { name: 'Ungroup', exact: true }).count(), 0, 'ungroup needs an existing group'); await dismiss(); await dismiss();
    await page.getByLabel('More selection controls', { exact: true }).click();
    const selection = page.locator('.selection-overflow'); await shot('selection-more', selection);
    assert.ok(await selection.locator(':scope > details, :scope > section > button').count() <= 10, 'More has at most ten first-level actions');
    await page.getByLabel('Format selection', { exact: true }).click();
    const selectionFormat = page.getByRole('dialog', { name: 'Format selection controls', exact: true }); await shot('selection-format', selectionFormat);
    for (const trigger of await selectionFormat.getByRole('combobox').all()) {
      const label = await trigger.getAttribute('aria-label'); await trigger.click(); await shot('selection-' + label.toLowerCase().replaceAll(' ', '-'), await popupFor(trigger)); await dismiss();
    }
    await selectionFormat.getByRole('button', { name: 'Fonts…', exact: true }).click(); await shot('font-picker', page.getByRole('dialog', { name: 'Font picker', exact: true })); await dismiss();
    if (!await page.locator('.selection-more').evaluate(el => el.open)) await page.getByLabel('More selection controls', { exact: true }).click();
    await page.getByLabel('Details selection', { exact: true }).click();
    const details = page.getByRole('dialog', { name: 'Details selection controls', exact: true }); await shot('selection-details', details);
    await details.getByRole('button', { name: 'Tilt', exact: true }).click(); await shot('tilt', page.getByRole('dialog', { name: 'Tilt controls', exact: true })); await dismiss();
    for (const name of ['Arrange', 'Export']) {
      await page.getByLabel(`${name} selection`, { exact: true }).click();
      await shot('selection-' + name.toLowerCase(), page.getByRole('dialog', { name: `${name} selection controls`, exact: true }));
    }
    await dismiss();
    for (const name of ['Align', 'Colour']) {
      await page.getByLabel(name, { exact: true }).click(); await shot('selection-' + name.toLowerCase(), page.locator('.selection-popup-menu:not([hidden])')); await dismiss();
    }
    const open = async predicate => {
      await dismiss();
      const id = await page.evaluate(source => aegis.canvas.board.cards.find(new Function('c', 'return ' + source)).id, predicate);
      await select([id]); await page.locator('#stage').focus(); await page.keyboard.press('Enter');
    };
    await open("c.type === 'doc'");
    const doc = page.locator('.docs-panel'); await doc.waitFor();
    assert.equal(await doc.locator('.docs-ribbon').evaluate(el => el.offsetHeight), 40, 'writing ribbon is a single 40px row');
    await shot('doc-ribbon');
    await page.getByLabel('Format document', { exact: true }).click(); await shot('doc-format', page.getByRole('dialog', { name: 'Format document controls', exact: true }));
    for (const label of ['Text colour', 'Highlight']) {
      await (process.env.AEGIS_UI_IMPL === 'react' ? page.getByRole('dialog', { name: 'Format document controls', exact: true }).getByLabel(label, { exact: true }) : doc.locator(`summary[aria-label="${label}"]`)).click();
      await shot('doc-' + label.toLowerCase().replaceAll(' ', '-'), page.getByRole('dialog', { name: process.env.AEGIS_UI_IMPL === 'react' ? 'Colour editor' : label + ' choices', exact: true })); await dismiss();
    }
    await doc.getByRole('button', { name: 'Link', exact: true }).click();
    await shot('doc-link', page.getByRole('dialog', { name: 'Edit document link', exact: true })); await dismiss();
    const captureChoices = async scope => {
      for (const trigger of await scope.getByRole('combobox').all()) {
        if (!await trigger.isVisible()) continue;
        const label = await trigger.getAttribute('aria-label'); await trigger.click(); await shot('doc-' + label.toLowerCase().replaceAll(' ', '-'), await popupFor(trigger)); await dismiss();
      }
    };
    await page.getByLabel('Format document', { exact: true }).click();
    await captureChoices(page.getByRole('dialog', { name: 'Format document controls', exact: true })); await dismiss();
    await page.getByLabel('Insert document', { exact: true }).click(); await shot('doc-insert', page.getByRole('dialog', { name: 'Insert document controls', exact: true })); await dismiss();
    await captureChoices(doc);
    await page.getByLabel('Document options', { exact: true }).click();
    await shot('doc-options', page.locator('.docs-more-tools'));
    await captureChoices(page.locator('.docs-more-tools'));
    const pageColour = doc.getByRole('combobox', { name: 'Page colour', exact: true });
    await pageColour.focus(); await pageColour.press('ArrowDown'); await page.keyboard.press('End'); await page.keyboard.press('Enter');
    assert.equal(await pageColour.getAttribute('data-value'), 'dark', 'nested select opens with the keyboard before its parent consumes arrows');
    await dismiss();
    await dismiss(); await open("c.kind === 'sheet'");
    const kind = page.locator('.sheet-editor .office-ribbon [data-kind]'); await kind.click(); await shot('sheet-column-type', await popupFor(kind)); await dismiss(); await dismiss();
    await open("c.type === 'deck'");
    const layout = page.locator('.deck-ribbon [data-layout]'); await layout.click(); await shot('slide-layout', await popupFor(layout)); await dismiss(); await dismiss();
    // Owned geometric fixture, uploaded through the same image input as a person's file.
    if (theme === 'dark') {
      const buffer = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d'); g.fillStyle = '#141618'; g.fillRect(0, 0, 640, 360); g.fillStyle = '#3f8dfd'; g.fillRect(96, 96, 448, 168); return c.toDataURL().split(',')[1]; }), 'base64');
      await page.locator('#mediaFile').setInputFiles({ name: 'aegis-ui-fixture.png', mimeType: 'image/png', buffer });
      await page.waitForFunction(() => aegis.canvas.board.cards.some(c => c.type === 'image'));
      await page.evaluate(() => new Promise(resolve => aegisCtx.apply([{ op: 'create', type: 'link', newId: 'designlink', url: 'https://example.invalid/aegis', text: 'UI reference', x: 120, y: 120, props: { previewFor: 'https://example.invalid/aegis', preview: { title: 'UI reference', description: 'Local design verification fixture.' } } }], resolve)));
    }
    const imageId = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.type === 'image').id);
    for (const [button, title] of [['Caption', 'Image caption'], ['Crop', 'Crop image']]) {
      await select([imageId]); await page.locator(`.card[data-id="${imageId}"]`).getByRole('button', { name: button, exact: true }).click();
      await shot('media-' + button.toLowerCase(), page.getByRole('dialog', { name: title, exact: true })); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    await select(['designlink']); await page.locator('.card[data-id="designlink"]').getByRole('button', { name: 'Edit link', exact: true }).focus(); await page.keyboard.press('Enter');
    await shot('media-link', page.getByRole('dialog', { name: 'Edit link', exact: true })); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.mouse.move(24, 480); await page.locator('#toolsFold').click();
    await shot('more-tools', page.locator('#toolsPopover'));
    await page.locator('#toolsPopover').getByRole('button', { name: 'Customise toolbar', exact: true }).click();
    await shot('customise-toolbar', settings); await page.locator('#closeSettings').click();
    await page.mouse.move(24, 480); await page.locator('#toolsFold').click();
    await page.locator('#tools [data-tool="templates"]').click(); await shot('templates', page.locator('.ctx-menu:not([hidden])')); await dismiss();
    await page.mouse.move(720, 20); await page.locator('#boardName').click();
    const boardRow = page.locator('.tree-row[data-board]').first(); await boardRow.locator('.row-more').click();
    await shot('library-row', page.locator('.ctx-menu:not([hidden])'));
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    const confirm = page.locator('.aegis-confirm'); await shot('confirm', confirm);
    assert.equal(await confirm.getByRole('button', { name: 'Cancel', exact: true }).evaluate(el => el === document.activeElement), true);
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
    const toolsPanel = page.locator('#side > [data-panel=tools]');
    if (await toolsPanel.getByRole('button', { name: 'Toggle Tools', exact: true }).getAttribute('aria-expanded') === 'false') await toolsPanel.getByRole('button', { name: 'Toggle Tools', exact: true }).click();
    const palette = page.locator('[data-panel=board-colours]');
    if (await palette.locator('.fold').getAttribute('aria-expanded') === 'false') await palette.locator('.fold').click();
    await palette.getByRole('button', { name: 'Add colour', exact: true }).click();
    const colourEditor = page.getByRole('dialog', { name: 'Colour editor', exact: true });
    await shot('colour-editor', colourEditor);
    await colourEditor.getByRole('button', { name: 'Save to board colours', exact: true }).click();
    await colourEditor.getByRole('button', { name: 'Done', exact: true }).click();
    await palette.locator('.palette-row').first().click({ button: 'right' });
    await shot('palette-row', page.getByRole('menu', { name: 'Palette colour', exact: true })); await dismiss();
    await page.mouse.move(325, 480); await page.locator('#toolsFold').click(); await page.locator('#tools [data-tool="wireframe"]').click();
    await page.locator('.wf-design [data-wf="icon"]').click();
    const iconPicker = page.getByRole('dialog', { name: 'Choose icon', exact: true });
    await iconPicker.getByRole('textbox', { name: 'Search icons', exact: true }).fill('settings'); await shot('icon-picker', iconPicker); await dismiss();
    const rowMore = boardRow.locator('.row-more'); await rowMore.focus(); await page.waitForTimeout(30); await shot('row-tooltip');
    if (theme === 'dark') await page.evaluate(() => aegis.host.post('/library', { op: 'create', kind: 'project', name: 'Design system' }));
    await page.locator('.library-home-button').click();
    await shot('projects', page.getByRole('dialog', { name: 'All projects', exact: true }));
    const cover = page.getByRole('button', { name: 'Cover for Design system', exact: true }); await cover.click();
    await shot('project-cover', await popupFor(cover)); await dismiss(); await page.getByRole('button', { name: 'Back to board', exact: true }).click();
    await page.mouse.move(1400, 20); await page.locator('#settingsBtn').click(); await settings.getByRole('tab', { name: 'About', exact: true }).click();
    await settings.getByRole('button', { name: 'Replay welcome and tour', exact: true }).click();
    await shot('welcome', page.getByRole('dialog', { name: 'Welcome to Aegis', exact: true })); await dismiss();
    console.log(`PASS ${theme}: shared menus, dialogs, tabs, switches, focus, instant keyboard and viewport containment`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(out('design-system-captures.json'), JSON.stringify(captures, null, 2));
  console.log(`PASS ${captures.length} production screenshots in both themes`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: out('design-system-failure.png') });
  throw error;
} finally { await browser.close(); host.kill(); }
