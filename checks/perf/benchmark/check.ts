import assert from 'node:assert/strict';
import { withReactBrowser } from '../../../scripts/react-browser.ts';

await withReactBrowser(async page => {
  const result = await page.evaluate(async () => {
    const facade = window.aegis;
    if (!facade) throw new Error('Missing test facade');
    const engine = facade.canvas.engine;
    const metrics = Object.getOwnPropertyDescriptor(engine, 'recordMetrics');
    const timers = Object.getOwnPropertyDescriptor(window, 'setTimeout');
    if (!metrics || !timers) throw new Error('Missing native instrumentation boundaries');
    const record = engine.recordMetrics;
    const schedule = window.setTimeout;
    let recording = false, pollingTimers = 0, otherShortTimers = 0;
    Object.defineProperty(engine, 'recordMetrics', {
      ...metrics,
      value: (enabled: boolean): void => { recording = enabled; record(enabled); },
    });
    Object.defineProperty(window, 'setTimeout', {
      ...timers,
      value: (...args: Parameters<typeof window.setTimeout>): unknown => {
        if (recording && args[1] === 1) {
          const owner = new Error().stack ?? '';
          if (owner.includes('/src/canvas/benchmark.ts')) pollingTimers++;
          else otherShortTimers++;
        }
        const handle: unknown = Reflect.apply(schedule, window, args);
        return handle;
      },
    });
    try {
      const measured = await facade.benchmark(5000);
      return { pollingTimers, otherShortTimers, frames: measured.frames, intervals: measured.interval.count, cards: measured.cards, zoom: measured.zoom };
    } finally {
      Object.defineProperty(engine, 'recordMetrics', metrics);
      Object.defineProperty(window, 'setTimeout', timers);
    }
  });
  assert.equal(result.pollingTimers, 0, 'the timed replay must not delay input with clamped completion polling');
  assert.equal(result.frames, 240);
  assert.equal(result.intervals, 239);
  assert.equal(result.cards, 5000);
  assert.equal(result.zoom, .05);
  process.stdout.write(JSON.stringify({ ok: true, ...result }) + '\n');
});
