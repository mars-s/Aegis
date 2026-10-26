import assert from 'node:assert/strict';
import { out } from './out.mjs';

// PM4.7 to 9: use a separate page so preferences cannot alter the journey checks.
export async function checkRefineSettings(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 992 }, reducedMotion: 'reduce' });
  const stamp = Date.now(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); });
  try {
    await page.goto(url); await page.waitForFunction(() => window.aegis?.canvas?.board && document.getElementById('model').options.length);
    await page.keyboard.press('Meta+k');
    await page.locator('#orbMenuButton').click();
    await page.locator('#orbMenu').getByRole('menuitem', { name: /^Agent model/ }).click();
    const menu = page.locator('#orbMenu');
    const groupCount = await menu.getByRole('group').count();
    assert.ok(groupCount >= 3, 'each provider has one group');
    for (const group of await menu.getByRole('group').all()) {
      const status = await group.locator('.aegis-model-group span').nth(1).textContent();
      const options = group.getByRole('menuitemradio');
      assert.ok(await options.count() > 0);
      for (const option of await options.all()) {
        assert.equal(await option.getAttribute('aria-description'), status, 'each model retains accessible availability');
        assert.doesNotMatch(await option.textContent(), /sign in|signed in|available/i, 'status appears in the group header only');
      }
    }
    await page.screenshot({ path: out(`r5-model-groups-${stamp}-1440.png`) });
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown');
    assert.equal(await menu.getByRole('menuitemradio').first().evaluate(el => el === document.activeElement), true, 'arrow navigation skips group headings');
    await page.keyboard.press('f'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#model').inputValue(), 'fake|fake', 'model selection still works from the grouped menu');
    await page.keyboard.press('Escape');
    console.log('PASS model choices group by provider, show availability once, retain aria-description and support keyboard selection');

    await page.mouse.move(1400, 20); await page.locator('#settingsBtn').click();
    const settings = page.locator('#settings');
    await settings.getByRole('tab', { name: 'General', exact: true }).click();
    await settings.locator('.settings-appearance > summary').click();
    assert.equal(await settings.locator('.settings-colour').count(), 4);
    for (const well of await settings.locator('.settings-colour').all()) {
      const picker = well.locator('.aegis-colour-picker');
      assert.equal(await picker.locator('.aegis-colour-sample').evaluate(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width === r.height && s.borderRadius === '50%' && s.borderTopWidth === '1px'; }), true);
      assert.equal(await picker.locator('span').last().textContent(), (await picker.evaluate(el => el.value)).toUpperCase());
    }
    for (const [width, height] of [[1440, 992], [1586, 992], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: out(`r5-settings-colours-${stamp}-${width}.png`) });
      assert.equal(await settings.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    }
    const colour = settings.getByLabel('App board background', { exact: true });
    await colour.click();
    const editor = settings.getByRole('dialog', { name: 'Colour editor', exact: true });
    await editor.getByRole('textbox', { name: 'Hex', exact: true }).fill('#123456');
    await editor.getByRole('textbox', { name: 'Hex', exact: true }).press('Tab');
    assert.equal(await colour.evaluate(el => el.value), '#123456');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('aegis:colour-settings')).dark.bg), '#123456');
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--canvas')), '#123456');
    await editor.getByRole('button', { name: 'Done', exact: true }).click();
    await settings.getByRole('button', { name: 'Reset colours for this mode', exact: true }).click();
    console.log('PASS Settings colour buttons use the shared editor, save changes and fit desktop and phone');

    await settings.getByRole('tab', { name: 'Panels', exact: true }).click();
    const parent = settings.locator('[data-panel-visibility=tools]'), children = settings.getByRole('group', { name: 'Tools panels', exact: true });
    assert.equal(await parent.locator('..').evaluate(el => el.nextElementSibling?.classList.contains('panel-tools-choices')), true, 'Tools is the parent immediately above its children');
    const actualChildren = await page.locator('.tools-panels > .pbox').evaluateAll(nodes => nodes.map(el => el.dataset.panel).sort());
    assert.deepEqual(await children.locator('input').evaluateAll(nodes => nodes.map(el => el.dataset.panelVisibility).sort()), actualChildren);
    assert.equal(await children.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft) >= 24), true, 'child choices are visibly indented');
    await parent.uncheck();
    assert.equal(await page.locator('#side > [data-panel=tools]').evaluate(el => el.hidden), true);
    assert.equal(await children.locator('input').evaluateAll(nodes => nodes.every(el => el.checked)), true, 'hiding Tools preserves individual child preferences');
    await parent.check();
    const shortcuts = children.locator('[data-panel-visibility=keys]'); await shortcuts.uncheck();
    assert.equal(await page.locator('[data-panel=keys]').evaluate(el => el.hidden), true);
    await shortcuts.check();
    for (const [width, height] of [[1440, 992], [1586, 992], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: out(`r5-settings-panels-${stamp}-${width}.png`) });
    }
    console.log('PASS Panel settings show a Tools parent with indented child choices; parent and child visibility controls work');

    await page.setViewportSize({ width: 1440, height: 992 });
    await settings.getByRole('tab', { name: 'General', exact: true }).click();
    const agentModel = settings.getByRole('combobox', { name: 'Agent model', exact: true });
    await agentModel.click();
    const choices = page.locator(`[id="${await agentModel.getAttribute('aria-controls')}"]`);
    assert.equal(await choices.getByRole('group').count(), groupCount, 'Settings uses the same provider groups');
    for (const option of await choices.getByRole('option').all()) assert.ok(await option.getAttribute('aria-description'));
    await page.keyboard.press('Escape');
    assert.equal(await agentModel.evaluate(el => el === document.activeElement), true);
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({ path: out(`r5-settings-fail-${stamp}.png`) }); throw error;
  } finally { await page.close(); }
}
