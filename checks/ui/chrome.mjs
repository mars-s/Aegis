// PM 6 and 7: shell discovery and focused-editor furniture, exercised through real input.
import assert from 'node:assert/strict';
import { out } from './out.mjs';

export async function checkChrome(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 992 } });
  const stamp = Date.now();
  const documentPanel = '.side-editor.is-open .docs-panel';
  const objectPanel = '.side-editor.is-open:has(.object.expanded)';
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('aegis:onboarded', '1');
    localStorage.setItem('aegis:orb-hint-seen', '1');
  });
  const shot = name => page.screenshot({ path: out(`r3-chrome-${stamp}-${name}.png`) });
  const idle = async () => {
    await page.evaluate(() => { document.activeElement?.blur(); aegis.canvas.select([]); });
    await page.mouse.move(720, 650);
    await page.waitForFunction(() => ['#tools', '.bar-left', '.bar-right'].every(selector => {
      const style = getComputedStyle(document.querySelector(selector));
      return Number(style.opacity) < .01 && style.pointerEvents === 'none';
    }));
  };
  const revealed = selector => page.waitForFunction(selector => {
    const style = getComputedStyle(document.querySelector(selector));
    return Number(style.opacity) > .99 && style.pointerEvents === 'auto';
  }, selector);
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.aegis?.canvas?.board);
    await page.evaluate(async () => { const board = await aegis.host.post('/boards', { name: 'Chrome focus checks' }); localStorage.setItem('aegis:board', board.id); });
    await page.reload(); await page.waitForFunction(() => window.aegis?.canvas?.board?.name === 'Chrome focus checks');
    await idle();
    // Check a real hit target as well as the parent CSS, including the whole empty top bar.
    assert.equal(await page.evaluate(() => ['#tools button', '#settingsBtn'].every(selector => {
      const element = document.querySelector(selector), rect = element.getBoundingClientRect();
      return !element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })), true);
    await shot('idle-1440');
    await page.setViewportSize({ width: 1586, height: 992 }); await shot('idle-1586');
    await page.setViewportSize({ width: 1440, height: 992 });
    await page.mouse.move(40, 480); await revealed('#tools'); await shot('left-edge-1440');
    assert.match(await page.locator('#tools').evaluate(el => getComputedStyle(el).transitionDuration), /0\.18s/);
    await page.mouse.move(720, 650); await page.waitForTimeout(700);
    assert.ok(await page.locator('#tools').evaluate(el => Number(getComputedStyle(el).opacity) > .99), 'rail stays for the absence grace period');
    await idle();
    await page.mouse.move(1150, 40); await revealed('.bar-right'); await revealed('.bar-left');
    await page.mouse.move(720, 650); await idle();
    await page.mouse.move(1400, 450); await revealed('.bar-right');
    await idle(); await page.keyboard.press('Tab');
    await revealed('#tools'); await revealed('.bar-right'); await revealed('.bar-left');
    assert.equal(await page.locator('#tools').evaluate(el => getComputedStyle(el).transitionDuration), '0s', 'keyboard reveal is instant');
    await page.locator('#settingsBtn').focus(); await page.waitForTimeout(1500); await revealed('.bar-right');
    await page.keyboard.press('Enter'); await page.mouse.move(720, 650); await page.waitForTimeout(1500);
    await revealed('.bar-right'); await page.locator('#closeSettings').click();
    await idle(); await page.keyboard.press('Shift+T'); await revealed('#tools');
    assert.equal(await page.locator('#tools').evaluate(el => el.contains(document.activeElement)), true);
    await page.locator('#toolsFold').click(); await page.mouse.move(720, 650);
    await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(1500); await revealed('#tools');
    assert.equal(await page.locator('#toolsPopover').isVisible(), true, 'open tools menu keeps its rail');
    await page.locator('#toolsFold').press('Escape'); await idle();
    await page.keyboard.press('n');
    assert.equal(await page.locator('#tools').evaluate(el => getComputedStyle(el).transitionDuration), '0s', 'keyboard tool selection reveals instantly');
    await page.mouse.move(720, 650); await page.waitForTimeout(1500);
    await revealed('#tools'); await revealed('.bar-right');
    await page.keyboard.press('Escape'); await idle();
    for (const setting of ['system', 'app']) {
      if (setting === 'system') await page.emulateMedia({ reducedMotion: 'reduce' });
      else await page.evaluate(() => document.body.classList.add('motion-off'));
      await page.mouse.move(40, 480); await revealed('#tools');
      assert.equal(await page.locator('#tools').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
      await idle(); await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    await page.evaluate(() => document.body.classList.remove('motion-off'));
    console.log('PASS idle chrome is transparent and not hit-testable; 48px edges, Tab, Shift+T, focus, menus and active tools reveal it; 1200ms grace and both reduced-motion routes work');

    await page.evaluate(() => {
      aegis.apply([{ op: 'create', type: 'doc', newId: 'chromedoc', text: 'Working notes', x: 0, y: 0, w: 440, h: 370, props: { body: 'Keep the work in focus.' } },
        { op: 'create', type: 'object', kind: 'reply', newId: 'chromeobject', text: 'A focused view', x: 600, y: 0, w: 440, h: 300, data: { headline: 'A focused view', text: 'A quiet source stays on the board.' } }]);
      aegis.canvas.select(['chromedoc']); aegis.canvas.setView({ x: 140, y: 230, z: 1 });
    });
    await revealed('#tools'); await page.locator('#selectionBar:not([hidden])').waitFor();
    assert.equal(await page.locator('.rotation-handle').isVisible(), true);
    await page.locator('#selectionBar').getByRole('button', { name: 'Open', exact: true }).click();
    await page.locator(documentPanel).waitFor();
    const assertQuiet = async id => {
      await page.waitForFunction(selector => {
        const saved = document.querySelector(selector);
        return !saved || saved.textContent === 'Saved';
      }, `${documentPanel} [data-saved]`);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      // A save replaces the preview before its connector overlay catches up on the next paint.
      await page.waitForFunction(id => {
        const source = document.querySelector(`.card[data-id="${id}"]`), title = aegis.canvas.board.cards.find(c => c.id === id)?.text;
        return source?.classList.contains('editor-source') && source.textContent.includes(title) && [...document.querySelectorAll(`[data-connect-card="${id}"]`)].every(el => getComputedStyle(el).display === 'none');
      }, id);
      assert.equal(await page.locator(`#world [data-id="${id}"] .resize`).isVisible(), false);
      assert.equal(await page.locator('[data-connect-card]').count(), 0, 'card edge connectors stay absent');
      for (const selector of ['.editing-outline', '.rotation-handle', '.selection-resize', '#selectionBar']) assert.equal(await page.locator(selector).isVisible(), false, selector);
      const marker = await page.locator(`#world [data-id="${id}"]`).evaluate(el => {
        const style = getComputedStyle(el); return { width: style.outlineWidth, colour: style.outlineColor, data: style.getPropertyValue('--data').trim() };
      });
      assert.equal(marker.width, '1px'); assert.equal(marker.data, '#3f8dfd'); assert.match(marker.colour, /63|0\.247/);
      assert.deepEqual(await page.evaluate(() => aegis.canvas.selection()), [id], 'opening preserves selection');
    };
    await assertQuiet('chromedoc'); await shot('document-focus-1440');
    // Saving a source card re-renders it, so the marker must survive a new DOM node.
    await page.getByLabel('Document title', { exact: true }).fill('Working notes, saved');
    await page.getByLabel('Document title', { exact: true }).press('Enter');
    await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.id === 'chromedoc').text === 'Working notes, saved');
    await assertQuiet('chromedoc');
    await page.evaluate(() => aegis.canvas.setView({ x: -10000, y: -10000, z: 1 }));
    await page.locator('#world [data-id="chromedoc"]:not([hidden])').waitFor({ state: 'detached' });
    await page.evaluate(() => aegis.canvas.setView({ x: 140, y: 230, z: 1 })); await assertQuiet('chromedoc');
    await page.keyboard.press('Escape');
    await page.locator('#selectionBar').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.rotation-handle').isVisible(), true);
    assert.equal(await page.locator('.selection-resize').isVisible(), true);
    assert.equal(await page.locator('[data-connect-card]').count(), 0);
    assert.equal(await page.locator('.card.editor-source').count(), 0);
    assert.equal(await page.locator('#selectionBar').getByRole('button', { name: 'Open', exact: true }).evaluate(el => el === document.activeElement), true, 'Escape restores Open focus');
    await shot('document-return-1440');
    await page.evaluate(() => { aegis.canvas.select(['chromeobject']); aegis.canvas.setView({ x: -460, y: 230, z: 1 }); });
    await page.locator('#stage').focus(); await page.keyboard.press('Enter');
    await page.locator(objectPanel).waitFor(); await assertQuiet('chromeobject');
    await page.setViewportSize({ width: 1586, height: 992 }); await shot('object-focus-1586');
    await page.keyboard.press('Escape'); await page.locator('#selectionBar').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.rotation-handle').isVisible(), true);
    assert.equal(await page.locator('.selection-resize').isVisible(), true);
    assert.equal(await page.locator('.card.editor-source').count(), 0);
    await page.evaluate(() => { document.activeElement?.blur(); aegis.canvas.select([]); });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1500); await revealed('#tools'); await revealed('.bar-right');
    assert.equal(await page.locator('#tools').isVisible(), true, 'phone has a visible rail without edge hover');
    await shot('phone-visible-390');
    await page.evaluate(() => { aegis.canvas.select(['chromeobject']); aegis.canvas.setView({ x: -540, y: 200, z: .6 }); });
    await page.locator('#stage').focus(); await page.keyboard.press('Enter');
    await page.locator(objectPanel).waitFor(); await assertQuiet('chromeobject'); await shot('phone-editor-390');
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.card.editor-source').count(), 0);
    const touch = await browser.newPage({ viewport: { width: 1100, height: 900 }, hasTouch: true });
    try {
      await touch.addInitScript(() => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); });
      await touch.goto(url); await touch.waitForFunction(() => window.aegis?.canvas?.board);
      await touch.waitForTimeout(1500);
      assert.equal(await touch.evaluate(() => matchMedia('(pointer: coarse)').matches && ['#tools', '.bar-left', '.bar-right'].every(selector => {
        const style = getComputedStyle(document.querySelector(selector)); return style.opacity === '1' && style.pointerEvents === 'auto';
      })), true, 'touch desktop chrome stays visible without pointer approach');
      assert.ok((await touch.locator('#tools > [data-tool=select]').boundingBox()).height >= 44);
    } finally { await touch.close(); }
    assert.deepEqual(errors, []);
    console.log('PASS document and object Open views hide source resize/rotation/toolbar, retain a blue hairline through saves and restore controls on close; phone chrome remains visible');
  } catch (error) { await shot('FAIL'); throw error; }
  finally { await page.close(); }
}
