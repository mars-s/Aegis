import assert from 'node:assert/strict';
import { withReactBrowser } from '../../../scripts/react-browser.ts';

await withReactBrowser(async page => {
  const reads = await page.evaluate(async () => {
    const facade = window.aegis;
    if (!facade) throw new Error('Missing test facade');
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
    const read = descriptor?.get;
    if (!descriptor || !read) throw new Error('Missing native innerText getter');
    let mounts = 0;
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      ...descriptor,
      get(this: HTMLElement): unknown {
        if (this.matches('.basic-note [role="textbox"]')) mounts++;
        const text: unknown = read.call(this);
        return text;
      },
    });
    try { await facade.benchmark(300); }
    finally { Object.defineProperty(HTMLElement.prototype, 'innerText', descriptor); }
    return mounts;
  });
  assert.equal(reads, 0, 'mounting unchanged editable bodies must not read layout through innerText');
  process.stdout.write(JSON.stringify({ ok: true, unchangedMountLayoutReads: reads }) + '\n');
});
