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
  const before = await page.evaluate(() => window.aegis?.canvas.engine.leases.getSnapshot().map(lease => lease.key));
  await page.evaluate(() => window.aegis?.canvas.setView({ x: -100000, y: -100000, z: .2 }));
  await page.waitForFunction(() => window.aegis?.canvas.view.x === -100000 && window.aegis.canvas.inspect().pendingFrames === 0);
  assert.equal(await page.locator('#world > .card:not([hidden])').count(), 0);
  await page.evaluate(() => window.aegis?.canvas.setView({ x: 0, y: 0, z: .2 }));
  await page.waitForFunction(() => window.aegis?.canvas.view.x === 0 && window.aegis.canvas.inspect().pendingFrames === 0);
  const returned = await page.evaluate(() => window.aegis?.canvas.engine.leases.getSnapshot().map(lease => lease.key));
  assert.deepEqual(returned, before, 'a short pan away and back must preserve bodies through the two-second retention period');
  await page.evaluate(() => window.aegis?.canvas.setView({ x: -100000, y: -100000, z: .2 }));
  await page.waitForFunction(() => window.aegis?.canvas.inspect().activeLeases === 0 && window.aegis.canvas.inspect().releasingLeases === 0, undefined, { timeout: 5000 });
  const state = await page.evaluate(() => window.aegis?.canvas.inspect());
  assert.ok(state && state.activeLeases <= 256, 'unpinned warm bodies expire after the retention period');
  process.stdout.write(JSON.stringify({ ok: true, retained: state.activeLeases, visible: state.visibleCards }) + '\n');
});
