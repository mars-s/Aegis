import assert from 'node:assert/strict';
import { withReactBrowser } from '../../../scripts/react-browser.ts';

await withReactBrowser(async page => {
  await page.evaluate(() => window.aegis?.canvas.load({
    id: 'vector-paint', name: 'Vector-only scene paint', rev: 0, links: [],
    view: { x: 0, y: 0, z: 1 },
    cards: [{ id: 'paint-note', type: 'note', color: 'plain', text: 'Real retained content', x: 100, y: 100, w: 240, h: 160, props: { fixedHeight: true } }],
  }));
  await page.waitForFunction(() => {
    const state = window.aegis?.canvas.inspect();
    return state?.activeLeases === 1 && !state.pendingFrames && !state.queuedMounts;
  });
  const result = await page.evaluate(async () => {
    const facade = window.aegis, stage = document.getElementById('stage');
    if (!facade || !stage) throw new Error('Missing real React canvas');
    const engine = facade.canvas.engine;
    const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
    const set = descriptor?.set;
    if (!descriptor || !set) throw new Error('Missing native canvas font setter');
    let fontResolutions = 0, release = (): void => {};
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', { ...descriptor, set(this: CanvasRenderingContext2D, value: string) {
      if (this.canvas.classList.contains('scene-overlay')) fontResolutions++;
      set.call(this, value);
    } });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((done, fail) => {
        let frames = 0;
        timer = setTimeout(() => fail(new Error('Vector replay stopped')), 10000);
        release = engine.registerFrameParticipant({ write: () => queueMicrotask(() => {
          if (frames++ === 60) { done(); return; }
          stage.dispatchEvent(new WheelEvent('wheel', { deltaX: 1, deltaY: .1, bubbles: true, cancelable: true }));
        }) });
      });
      return { fontResolutions, text: document.querySelector('.basic-note .body')?.textContent, camera: engine.camera() };
    } finally {
      clearTimeout(timer); release();
      Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', descriptor);
    }
  });
  assert.equal(result.fontResolutions, 0, 'a scene with live bodies and vector overlays must not resolve unused canvas fonts each frame');
  assert.equal(result.text, 'Real retained content');
  assert.ok(result.camera.x < -50, 'replay pans the actual camera');
  process.stdout.write(JSON.stringify({ ok: true, ...result }) + '\n');
});
