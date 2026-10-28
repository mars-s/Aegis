import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BoardSchema } from '@aegis/domain/schema';
import { withApplication } from './application.ts';

const implementation = 'react';
const output = process.env.AEGIS_CHECK_OUT ?? '/tmp/aegis-scene-parity';
mkdirSync(output, { recursive: true });
const results: { readonly name: string; readonly passed: boolean }[] = [];
function verify(name: string, passed: boolean): void { results.push({ name, passed }); assert.ok(passed, name); }
await withApplication(async page => {
  const settle = async (): Promise<void> => { await page.waitForTimeout(220); };
  await page.evaluate(() => { const facade = window.aegis; if (!facade) throw new Error('Missing workspace'); if (facade.canvas.board.cards.length) facade.apply(facade.canvas.board.cards.map(card => ({ op: 'delete', id: card.id }))); });
  await page.evaluate(() => window.aegis?.apply([
    { op: 'create', newId: 'scenetitle', type: 'title', text: 'Thinking table', x: 200, y: 120, w: 340, h: 64 },
    { op: 'create', newId: 'scenenote', type: 'note', heading: 'A clear next step', text: 'Keep the work at its real size.\nPan and zoom around the table.', x: 200, y: 240, w: 320, h: 180 },
    { op: 'create', newId: 'scenenext', type: 'note', heading: 'Connected work', text: 'The same geometry at every scale.', x: 720, y: 240, w: 320, h: 180 },
    { op: 'connect', a: 'scenenote', b: 'scenenext', label: 'Next step', bend: 0, arrow: 'both' },
  ]));
  await page.evaluate(() => { window.aegis?.canvas.select([]); window.aegis?.canvas.setView({ x: 0, y: 0, z: 1 }); });
  await page.mouse.move(1100, 650); await settle();
  await page.screenshot({ path: join(output, 'react-working.png') });
  const initial = await page.locator('#world .card[data-id="scenenote"]').boundingBox();
  verify('working card retains its world dimensions', !!initial && Math.abs(initial.width - 320) < 1 && Math.abs(initial.height - 180) < 1);
  // Plain zoom intentionally differs from the superseded adaptive legacy zoom.
  await page.evaluate(() => window.aegis?.canvas.setView({ x: 50, y: 70, z: .5 })); await settle();
  const scaled = await page.locator('#world .card[data-id="scenenote"]').boundingBox();
  verify('static zoom retains real content and exact scaled geometry', !!scaled && Math.abs(scaled.x - 150) < 1 && Math.abs(scaled.y - 190) < 1 && Math.abs(scaled.width - 160) < 1 && Math.abs(scaled.height - 90) < 1);
  await page.screenshot({ path: join(output, 'react-scaled.png') });
  {
    await page.evaluate(() => {
      window.aegis?.apply([{ op: 'create', newId: 'fixednote', type: 'note', text: 'A fixed note', x: 4000, y: 4000, w: 240, h: 120 }]);
      window.aegis?.canvas.setView({ x: -3570, y: -3700, z: 1 }); window.aegis?.canvas.select(['fixednote']);
    }); await settle();
    const grip = await page.locator('.card[data-id="fixednote"] .resize').boundingBox();
    if (!grip) throw new Error('Missing scene resize grip');
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 20, grip.y + grip.height / 2 + 20, { steps: 6 }); await page.mouse.up(); await settle();
    const height = await page.evaluate(() => window.aegis?.canvas.board.cards.find(card => card.id === 'fixednote')?.h);
    await page.evaluate(() => window.aegis?.flush());
    const saved = BoardSchema.parse(await page.evaluate(() => { const facade = window.aegis; if (!facade) throw new Error('Missing workspace'); return facade.host.get(`/boards/${facade.canvas.board.id}`); }));
    verify('scene resize persists its height and fixed-height intent', saved.cards.find(card => card.id === 'fixednote')?.h === height && saved.cards.find(card => card.id === 'fixednote')?.props?.fixedHeight === true);
    const body = page.locator('.card[data-id="fixednote"] .body');
    await body.fill(Array.from({ length: 20 }, (_, i) => `Fixed line ${i}`).join('\n')); await settle();
    verify('manual height stays fixed and scrolls with a bottom fade', await body.evaluate((el, height) => {
      const card = el.closest('.card'), style = getComputedStyle(el);
      return card instanceof HTMLElement && height !== undefined && Math.abs(parseFloat(card.style.height) - height) < 1 && el.scrollHeight > el.clientHeight && style.overflowY === 'auto' && style.maskImage.includes('gradient');
    }, height));
    await body.evaluate(el => { el.scrollTop = 0; }); const before = await page.evaluate(() => window.aegis?.canvas.view);
    await body.hover(); await page.mouse.wheel(0, 80); await settle();
    verify('scrolling a fixed note leaves the canvas still', await body.evaluate(el => el.scrollTop > 0) && JSON.stringify(before) === await page.evaluate(() => JSON.stringify(window.aegis?.canvas.view)));
    await body.blur();
  }
  await page.setViewportSize({ width: 1586, height: 992 });
  await page.evaluate(() => window.aegis?.apply(Array.from({ length: 40 }, (_, i) => ({ op: 'create', newId: `orientation${i}`, type: 'note', heading: `Research window ${i + 1}`, text: 'Overview fixture', x: 10000 + i % 8 * 1400, y: 10000 + Math.floor(i / 8) * 1200, w: 500 + i * 5, h: 300 + i * 3 }))));
  const outside = page.locator('.react-tools button').first();
  await outside.focus(); await page.mouse.move(1000, 700);
  await page.evaluate(() => { window.aegis?.canvas.select([]); window.aegis?.canvas.setView({ x: -400, y: -400, z: .05 }); }); await settle();
  const orientation = page.locator('.canvas-orientation'), aid = orientation.locator('.orientation-aid');
  verify('far zoom names are absent from an idle board', !await orientation.isVisible());
  await page.mouse.move(4, 450); await orientation.waitFor({ state: 'visible' });
  verify('edge approach reveals only the largest 30 visible window names', await orientation.locator('span').evaluateAll(nodes => nodes.length > 0 && nodes.length <= 30 && nodes.every(el => /^orientation\d+$/.test(el.dataset.cardId ?? '') && Number(el.dataset.cardId?.slice(11)) >= 10)));
  verify('labels keep 11px screen type and the overlay passes input through', await orientation.locator('span').evaluateAll(nodes => nodes.every(el => parseFloat(getComputedStyle(el).fontSize) >= 11 && getComputedStyle(el).pointerEvents === 'auto')) && await orientation.evaluate(el => getComputedStyle(el).pointerEvents === 'none'));
  const label = orientation.locator('span').first(); await label.hover(); await aid.waitFor({ state: 'visible' });
  verify('label hover outlines true card geometry with a blue hairline', await aid.evaluate(el => {
    const canvas = window.aegis?.canvas, card = canvas?.board.cards.find(card => card.id === el.getAttribute('data-card-id'));
    const rect = el.querySelector('rect'), line = el.querySelector('line');
    if (!canvas || !card || !rect || !line) return false;
    const v = canvas.view;
    return Math.abs(Number(rect.getAttribute('x')) - (card.x * v.z + v.x)) < .1 && Math.abs(Number(rect.getAttribute('y')) - (card.y * v.z + v.y)) < .1 && Math.abs(Number(rect.getAttribute('width')) - card.w * v.z) < .1 && Math.abs(Number(rect.getAttribute('height')) - card.h * v.z) < .1 && getComputedStyle(rect).stroke === 'rgb(63, 141, 253)' && getComputedStyle(rect).strokeWidth === '1px' && getComputedStyle(el).pointerEvents === 'none' && Math.hypot(Number(line.getAttribute('x2')) - Number(line.getAttribute('x1')), Number(line.getAttribute('y2')) - Number(line.getAttribute('y1'))) > 0;
  }));
  await page.screenshot({ path: join(output, 'react-orientation.png') });
  const id = await label.getAttribute('data-card-id'); await label.click(); await page.keyboard.press('Tab'); await settle();
  writeFileSync(join(output, 'react-focus.json'), JSON.stringify(await page.evaluate(() => ({ active: document.activeElement?.outerHTML, aid: document.querySelector('.orientation-aid')?.outerHTML, labels: [...document.querySelectorAll('.canvas-orientation span')].map(label => label.getAttribute('data-card-id')) })), null, 2));
  verify('Tab hands the aid to the focused name while the pointer stays parked', await orientation.evaluate(el => el.contains(document.activeElement) && document.activeElement?.getAttribute('data-card-id') === el.querySelector('.orientation-aid')?.getAttribute('data-card-id')) && await aid.getAttribute('data-card-id') !== id);
  await page.keyboard.press('Shift+Tab'); await settle(); verify('Shift+Tab restores the matching aid', await aid.getAttribute('data-card-id') === id);
  const box = await label.boundingBox(); if (!box) throw new Error('Missing orientation label');
  await page.keyboard.press('Tab'); await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2); await settle();
  verify('pointer movement takes aid ownership back from keyboard focus', await aid.getAttribute('data-card-id') === id);
  verify('More counts every unlabelled visible window', await orientation.locator('.orientation-more').textContent() === `+${40 - await orientation.locator('span').count()} more`);
  await outside.focus(); await page.mouse.move(1000, 700); await orientation.waitFor({ state: 'hidden' });
  verify('orientation clears after leaving the edge', !await orientation.isVisible());
  await page.keyboard.press('Tab'); await page.locator('#stage').focus(); await orientation.waitFor({ state: 'visible' });
  verify('keyboard canvas focus reveals bounded names', await orientation.locator('span').count() > 0 && await orientation.locator('span').count() <= 30);
  await page.evaluate(() => window.aegis?.canvas.setView({ x: -1400, y: -1400, z: .2 })); await settle(); await page.mouse.move(4, 450);
  verify('orientation stays hidden at working zoom', !await orientation.isVisible());
  await page.evaluate(() => window.aegis?.apply(Array.from({ length: 401 }, (_, i) => ({ op: 'create', newId: `orientationcrowd${i}`, type: 'note', text: `Small window ${i}`, x: 10000 + i % 30 * 80, y: 10000 + Math.floor(i / 30) * 60, w: 40, h: 30 }))));
  await page.evaluate(() => window.aegis?.canvas.setView({ x: -400, y: -400, z: .05 })); await orientation.waitFor({ state: 'visible' }); await settle();
  verify('crowded far view keeps bounded names and fewer than 400 visible live shells', await page.locator('#stage').evaluate(el => el.classList.contains('far')) && await orientation.locator('span').count() > 0 && await orientation.locator('span').count() <= 30 && await page.locator('#world > .card:not([hidden])').count() < 400);
  await page.screenshot({ path: join(output, `${implementation}-crowded.png`) });
  await outside.focus(); await page.mouse.move(1000, 700); await orientation.waitFor({ state: 'hidden' });
  await page.evaluate(() => window.aegis?.apply(Array.from({ length: 9 }, (_, i) => ({ op: 'create', newId: `supporting${i}`, type: 'note', heading: `Supporting window ${i + 1}`, text: 'Collision fixture', x: 100000 + i * 40, y: 100000 + i * 40, w: 600, h: 400 }))));
  for (const width of [1440, 1586, 390]) {
    await page.setViewportSize({ width, height: 992 }); await outside.focus(); await page.mouse.move(width - 100, 600);
    await page.evaluate(() => window.aegis?.canvas.setView({ x: -4900, y: -4900, z: .05 })); await settle();
    const chip = orientation.locator('.orientation-more'), menu = page.getByRole('menu', { name: 'More window names', exact: true });
    verify(`${width}px names and menu remain absent on the idle board`, !await orientation.isVisible() && !await chip.isVisible() && !await menu.isVisible());
    await page.mouse.move(width - 4, 450); await orientation.waitFor({ state: 'visible' });
    const labelled = await orientation.locator('span').allTextContents();
    verify(`${width}px collisions offer every omitted name`, labelled.length > 0 && labelled.length < 9 && await chip.textContent() === `+${9 - labelled.length} more`);
    const chipBox = await chip.boundingBox();
    verify(`${width}px More is a reachable 44px target`, !!chipBox && chipBox.width >= 44 && chipBox.height >= 44 && chipBox.x >= 0 && chipBox.x + chipBox.width <= width && chipBox.y + chipBox.height <= 992);
    verify(`${width}px More sits beside the displayed label group`, await chip.evaluate(el => {
      const chip = el.getBoundingClientRect(), labels = [...(el.parentElement?.querySelectorAll('span') ?? [])].map(label => label.getBoundingClientRect());
      const left = Math.min(...labels.map(r => r.left)), right = Math.max(...labels.map(r => r.right)), top = Math.min(...labels.map(r => r.top)), bottom = Math.max(...labels.map(r => r.bottom));
      return Math.max(0, left - chip.right, chip.left - right) <= 13 && Math.max(0, top - chip.bottom, chip.top - bottom) <= 13 && labels.every(r => chip.left >= r.right || chip.right <= r.left || chip.top >= r.bottom || chip.bottom <= r.top);
    }));
    if (width === 1586) {
      await orientation.locator('span').last().focus(); await page.keyboard.press('Tab');
      verify('Tab reaches More after the displayed labels', await chip.evaluate(el => el === document.activeElement));
    }
    await chip.focus(); await page.keyboard.press('Enter'); await menu.waitFor();
    verify(`${width}px shared menu lists exactly the omitted windows`, JSON.stringify((await menu.getByRole('menuitem').allTextContents()).sort()) === JSON.stringify(Array.from({ length: 9 }, (_, i) => `Supporting window ${i + 1}`).filter(name => !labelled.includes(name)).sort()) && await menu.evaluate(el => el.classList.contains('aegis-action-menu') && getComputedStyle(el).backgroundColor === 'rgb(36, 39, 43)'));
    const menuBox = await menu.boundingBox(); verify(`${width}px menu stays within the screen`, !!menuBox && menuBox.x >= 8 && menuBox.y >= 8 && menuBox.x + menuBox.width <= width - 7 && menuBox.y + menuBox.height <= 985);
    await page.screenshot({ path: join(output, `${implementation}-omitted-${width}.png`) });
    await page.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' });
    verify(`${width}px Escape restores the More chip`, await chip.evaluate(el => el === document.activeElement));
    await page.keyboard.press('Enter'); await menu.waitFor();
    verify(`${width}px keyboard menu opens instantly`, await menu.evaluate(el => el.getAnimations().length === 0));
    await page.keyboard.press('ArrowDown'); const target = await menu.getByRole('menuitem').nth(1).textContent();
    verify(`${width}px arrows focus the next omitted name`, await menu.getByRole('menuitem').nth(1).evaluate(el => el === document.activeElement));
    await page.keyboard.press('Enter'); await settle();
    verify(`${width}px keyboard choice frames the real card instantly`, await page.evaluate(target => {
      const canvas = window.aegis?.canvas, card = canvas?.board.cards.find(card => card.heading === target);
      if (!canvas || !card) return false;
      const available: unknown = Reflect.get(canvas, 'availableArea');
      const centre = available && typeof available === 'object' && 'y' in available && 'h' in available && typeof available.y === 'number' && typeof available.h === 'number' ? available.y + available.h / 2 : innerHeight / 2;
      return canvas.view.z > .2 && Math.abs((card.y + card.h / 2) * canvas.view.z + canvas.view.y - centre) < 1;
    }, target));
    verify(`${width}px framing dismisses far zoom controls`, !await orientation.isVisible() && !await menu.isVisible());
    if (width !== 1586) {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await outside.focus(); await page.mouse.move(width - 100, 600);
      await page.evaluate(() => window.aegis?.canvas.setView({ x: -4900, y: -4900, z: .05 })); await settle();
      await page.mouse.move(width - 4, 450); await orientation.waitFor({ state: 'visible' });
      await chip.click(); await menu.waitFor();
      const name = await menu.getByRole('menuitem').first().textContent(); await menu.getByRole('menuitem').first().click();
      await page.waitForFunction(() => { const zoom = window.aegis?.canvas.view.z; return zoom !== undefined && zoom > .05 && zoom < 1; });
      verify(`${width}px pointer choice starts a glide after changing the motion preference`, await page.evaluate(() => { const zoom = window.aegis?.canvas.view.z; return zoom !== undefined && zoom > .05 && zoom < 1; }));
      await page.waitForTimeout(450);
      verify(`${width}px glide reaches the real card within the viewport`, await page.evaluate(name => {
        const canvas = window.aegis?.canvas, card = canvas?.board.cards.find(card => card.heading === name);
        if (!canvas || !card) return false;
        const v = canvas.view, available: unknown = Reflect.get(canvas, 'availableArea');
        const centre = available && typeof available === 'object' && 'y' in available && 'h' in available && typeof available.y === 'number' && typeof available.h === 'number' ? available.y + available.h / 2 : innerHeight / 2;
        return v.z > .2 && card.x * v.z + v.x >= 0 && card.y * v.z + v.y >= 0 && (card.x + card.w) * v.z + v.x <= innerWidth && (card.y + card.h) * v.z + v.y <= innerHeight && Math.abs((card.y + card.h / 2) * v.z + v.y - centre) < 1;
      }, name));
      verify(`${width}px pointer framing dismisses the names and menu`, !await orientation.isVisible() && !await menu.isVisible());
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
  }
});
writeFileSync(join(output, `${implementation}-scene-parity.json`), `${JSON.stringify({ implementation, assertions: results.length, results }, null, 2)}\n`);
process.stdout.write(`${implementation}: ${results.length}/${results.length} scoped scene assertions passed\n`);
