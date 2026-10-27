import assert from 'node:assert/strict';
import { withReactBrowser } from '../../../scripts/react-browser.ts';

await withReactBrowser(async page => {
  await page.evaluate(async () => {
    const facade = window.aegis;
    if (!facade) throw new Error('Missing test facade');
    await facade.benchmark(1);
    facade.canvas.load({
      id: 'warm-leases', name: 'Warm retention regression', rev: 0, links: [],
      view: { x: 0, y: 0, z: .2 },
      cards: Array.from({ length: 320 }, (_, index) => ({
        id: `warm${index.toString().padStart(4, '0')}`, type: 'note', color: 'plain',
        text: `Visible note ${index}`, x: index % 20 * 260, y: Math.floor(index / 20) * 130,
        w: 220, h: 96,
      })),
    });
  });
  await page.waitForFunction(() => window.aegis?.canvas.inspect().activeLeases === 320);
  assert.equal(await page.locator('#world > .card:not([hidden])').count(), 320, 'static zoom retains every visible real body above the warm target');
  await page.evaluate(() => window.aegis?.canvas.setView({ x: -100000, y: -100000, z: .2 }));
  await page.waitForFunction(() => window.aegis?.canvas.view.x === -100000 && window.aegis.canvas.inspect().pendingFrames === 0);
  const state = await page.evaluate(() => window.aegis?.canvas.inspect());
  assert.ok(state && state.activeLeases <= 256, 'leaving a dense view must immediately trim unpinned warm retention to 256');
  assert.equal(await page.locator('#world > .card:not([hidden])').count(), 0);
  process.stdout.write(JSON.stringify({ ok: true, retained: state.activeLeases, visible: state.visibleCards }) + '\n');
});
