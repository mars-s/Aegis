// Every item 12 kind, saved person edits, and the iframe isolation boundary in the real app.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { genuiSamples, galleryArtwork } from '../../agent/checks/genui-fixtures.mjs';

const offset = Number(process.env.AEGIS_PORT_OFFSET || 0), vitePort = 5194 + offset;
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), token = 'genui-' + process.pid;
const stamp = Date.now();
let host, vite, browser, page;
const errors = [], logs = [];
function ready(child, pattern) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 20000);
    child.stdout.on('data', d => { const match = pattern.exec(String(d)); if (match) { clearTimeout(timer); resolve(match[1]); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
    child.stderr.on('data', d => logs.push(String(d)));
  });
}
try {
  host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-genui-ui-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
  const port = await ready(host, /"port":(\d+)/);

  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  // Apply exactly the packaged app's policy before any document scripts run.
  const security = JSON.parse(readFileSync(repo + '/src-tauri/tauri.conf.json', 'utf8')).app.security;
  assert.equal(security.dangerousDisableAssetCspModification, undefined, 'keep Tauri CSP hash insertion enabled');
  assert.equal(security.csp.split(';').map(s => s.trim()).find(s => s.startsWith('script-src ')), "script-src 'self'");
  assert.equal(security.csp.split(';').map(s => s.trim()).find(s => s.startsWith('frame-src ')), 'frame-src http://127.0.0.1:* https://open.spotify.com');
  const require = createRequire(new URL('../../app/package.json', import.meta.url));
  const { createServer } = await import(require.resolve('vite'));
  vite = await createServer({
    root: repo + '/app', configFile: repo + '/app/vite.config.ts',
    server: { port: vitePort, strictPort: true, host: '127.0.0.1' },
    plugins: [{
      name: 'item-12-parent-csp-check',
      transformIndexHtml: {
        order: 'post',
        handler: html => html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${security.csp}"><script>window.__genuiParentInlineRan = true</script>`),
      },
    }],
  });
  await vite.listen();
  const unknown = await fetch(`http://127.0.0.1:${port}/sandbox/${'0'.repeat(64)}`);
  assert.equal(unknown.status, 404, 'unknown sandbox IDs return 404 without a bearer token');
  const anonymousPost = await fetch(`http://127.0.0.1:${port}/sandbox`, { method: 'POST', body: '{}' });
  assert.equal(anonymousPost.status, 401, 'registering source requires the bearer token');
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') logs.push(message.text()); });
  await page.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem('aegis:onboarded', '1');
    window.__genuiReports = [];
    window.__genuiHeights = [];
    window.__genuiViolations = [];
    addEventListener('securitypolicyviolation', event => window.__genuiViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI }));
    window.__genuiPrivate = 'Only the app may read this';
    addEventListener('message', event => {
      if (event.data?.type === 'aegis:html-height') window.__genuiHeights.push({ ...event.data, origin: event.origin, ownFrame: event.source === document.querySelector('.card.kind-html iframe')?.contentWindow });
      if (event.data?.type === 'genui:probe') window.__genuiReports.push({ ...event.data, origin: event.origin });
    });
  });
  await page.goto(`http://127.0.0.1:${vitePort}/?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board, null, { timeout: 15000 });
  assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), security.csp);
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__genuiInjectedInlineRan = true'; document.head.append(script);
  });
  await page.waitForFunction(() => window.__genuiViolations.some(v => v.directive === 'script-src-elem' && v.blocked === 'inline'));
  assert.equal(await page.evaluate(() => window.__genuiParentInlineRan), undefined, 'parser-inserted parent inline script is blocked');
  assert.equal(await page.evaluate(() => window.__genuiInjectedInlineRan), undefined, 'injected parent inline script is blocked');
  console.log('pass genui: exact Tauri CSP blocks parent inline scripts; anonymous registration denied; unknown sandbox is 404');
  const boardId = await page.evaluate(() => aegis.canvas.board.id);
  const samples = structuredClone(genuiSamples);
  const assets = await page.evaluate(async artwork => Promise.all(artwork.map((svg, i) => aegis.host.upload(new File([svg], `study-${i}.svg`, { type: 'image/svg+xml' })))), galleryArtwork);
  samples.gallery.images.forEach((image, i) => image.url = assets[i].url);
  const batch = Object.entries(samples).map(([kind, data], i) => ({ op: 'create', type: 'object', kind, text: `Sample ${kind}`, data, x: i % 3 * 820, y: Math.floor(i / 3) * 560 }));
  const agent = await page.evaluate(([boardId, batch]) => aegis.host.post('/agents', { boardId, brief: 'FAKE ' + JSON.stringify(batch), model: { provider: 'fake', modelId: 'fake' } }), [boardId, batch]);
  assert.ok(agent[0]?.id, JSON.stringify(agent));
  await page.waitForFunction(count => aegis.canvas.board.cards.filter(c => c.type === 'object').length === count, batch.length, { timeout: 20000 });
  await page.keyboard.press('Escape');
  await page.evaluate(() => aegis.canvas.fit());
  await page.waitForTimeout(600);
  await page.screenshot({ path: out(`genui-overview-${stamp}.png`) });

  const frame = async kind => {
    await page.evaluate(kind => aegis.canvas.frameIds([aegis.canvas.board.cards.find(c => c.kind === kind).id], 1), kind);
    await page.locator(`.card.kind-${kind} .object`).waitFor({ state: 'visible' });
    await page.locator(`.card.kind-${kind} .win-strip h3`).click();
    await page.waitForTimeout(500);
    return page.locator(`.card.kind-${kind}`);
  };
  for (const kind of Object.keys(samples)) {
    const card = await frame(kind);
    assert.ok(await card.locator('.genui').isVisible(), `${kind} renders`);
    assert.equal(await card.locator('.unknown').count(), 0);
    if (kind === 'stats') assert.equal(await card.getByLabel('Tasks completed', { exact: true }).evaluate(el => getComputedStyle(el).fontSize), '30px', 'editable stats retain the same hierarchy as read-only values');
    if (kind === 'progress') assert.ok((await card.locator('input').first().boundingBox()).width <= 110, 'goal input leaves room for its label');
    if (kind === 'gallery') assert.ok(await card.locator('img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), 'local gallery assets loaded');
    if (kind === 'form') {
      const radio = await card.getByRole('radio').first().boundingBox();
      assert.ok(radio && radio.width === 18 && radio.height === 18, 'radio keeps its compact shape');
    }
    if (kind === 'html') {
      assert.match(await card.locator('iframe').getAttribute('sandbox'), /^allow-scripts$/);
      assert.equal(await card.locator('iframe').getAttribute('srcdoc'), null);
      await page.waitForFunction(() => /^http:\/\/127\.0\.0\.1:\d+\/sandbox\/[a-f0-9]{64}$/.test(document.querySelector('.card.kind-html iframe')?.src));
      await page.frameLocator('.card.kind-html iframe').locator('#minutes').waitFor();
    }
    await card.screenshot({ path: out(`genui-${kind}-1440-${stamp}.png`) });
  }
  await page.waitForFunction(() => window.__genuiHeights.some(r => r.origin === 'null' && r.ownFrame && r.height >= 80));
  console.log('pass genui: all 11 kinds rendered; host sandbox runs and reports opaque-origin height under exact Tauri CSP');

  await frame('kanban');
  await page.getByRole('button', { name: 'Drag Write the brief', exact: true }).dragTo(page.locator('.kanban .lane[aria-label="In progress"]'));
  await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.kind === 'kanban').data.cards[0].column === 'doing');
  await page.locator('.ticket').filter({ hasText: 'Write the brief' }).locator('summary').click();
  const move = page.getByRole('button', { name: 'Move Write the brief to Done', exact: true });
  await move.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.kind === 'kanban').data.cards[0].column === 'done');
  console.log('pass genui: kanban drag and keyboard Move saved');

  await frame('form');
  await page.getByLabel('Project name (required)', { exact: true }).fill('A useful result');
  await page.getByLabel('What needs to change?', { exact: true }).fill('Keep the source beside the answer.');
  await page.getByLabel('Hours available', { exact: true }).fill('6.5');
  await page.getByRole('radio', { name: 'Report', exact: true }).check();
  await page.getByLabel('Ready for a review', { exact: true }).check();
  await page.waitForFunction(() => {
    const fields = aegis.canvas.board.cards.find(c => c.kind === 'form').data.fields;
    return fields[0].value === 'A useful result' && fields[1].value === 'Keep the source beside the answer.' && fields[2].value === 6.5 && fields[3].value === 'Report' && fields[4].value === true;
  });
  await page.getByLabel('Hours available', { exact: true }).fill('');
  await page.getByLabel('What needs to change?', { exact: true }).focus();
  await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.kind === 'form').data.fields[2].value === null);
  const project = page.getByLabel('Project name (required)', { exact: true });
  await project.focus();
  await page.keyboard.press('End'); await page.keyboard.type(' today'); await page.keyboard.press('Tab');
  await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');
  await page.waitForTimeout(150);
  assert.equal(await page.getByLabel('What needs to change?', { exact: true }).evaluate(el => el === document.activeElement), true, 'Tab focus survives saving the previous field');
  await project.fill('A useful result'); await page.keyboard.press('Tab');
  await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.kind === 'form').data.fields[0].value === 'A useful result');
  console.log('pass genui: text, textarea, number, choice, checkbox and clearing a number saved');

  await frame('timeline');
  await page.getByLabel('Done: Agree on the brief', { exact: true }).check();
  await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.kind === 'timeline').data.events[0].done === true);
  await frame('progress');
  await page.getByLabel('Current: Read the source material', { exact: true }).fill('7');
  await page.getByLabel('Current: Draft the report', { exact: true }).focus();
  await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.kind === 'progress').data.goals[0].current === 7);
  await frame('stats');
  await page.getByLabel('Tasks completed', { exact: true }).fill('20');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.kind === 'stats').data.tiles[0].value === '20');
  await frame('table');
  await page.getByLabel('Tasks, row 1', { exact: true }).fill('12');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.kind === 'table').data.rows[0].cells[1] === 12);
  await frame('stages');
  await page.locator('.stages details').first().locator('summary').click();
  await page.getByRole('button', { name: 'Brief: Blocked', exact: true }).click();
  await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.kind === 'stages').data.steps[0].status === 'blocked');
  console.log('pass genui: timeline ticks, stats, table, progress and stage values saved');

  await page.waitForFunction(async id => {
    const b = await aegis.host.get(`/boards/${id}`);
    return b.cards.find(c => c.kind === 'kanban').data.cards[0].column === 'done' && b.cards.find(c => c.kind === 'form').data.fields[0].value === 'A useful result' && b.cards.find(c => c.kind === 'form').data.fields[2].value === null && b.cards.find(c => c.kind === 'table').data.rows[0].cells[1] === 12;
  }, boardId);
  await page.reload();
  await page.waitForFunction(() => window.aegis?.canvas?.board);
  assert.equal(await page.evaluate(() => aegis.canvas.board.cards.find(c => c.kind === 'form').data.fields[0].value), 'A useful result');
  assert.equal(await page.evaluate(() => aegis.canvas.board.cards.find(c => c.kind === 'kanban').data.cards[0].column), 'done');
  console.log('pass genui: saved values survive host read and page reload');

  let outgoing = 0;
  await page.route('https://sandbox.invalid/**', route => { outgoing++; return route.abort(); });
  const sameOriginProbe = `http://127.0.0.1:${vitePort}/genui-probe`;
  await page.route(sameOriginProbe + '**', route => { outgoing++; return route.abort(); });
  const probe = `
    (async () => {
      let parentBlocked = false, fetchBlocked = false, localFetchBlocked = false, storageBlocked = false;
      try { window.parent.document.body.dataset.genuiEscaped = 'true'; } catch { parentBlocked = true; }
      try { localStorage.setItem('escape', '1'); } catch { storageBlocked = true; }
      try { await fetch('https://sandbox.invalid/probe'); } catch { fetchBlocked = true; }
      try { await fetch(${JSON.stringify(sameOriginProbe)}); } catch { localFetchBlocked = true; }
      const image = new Image(); image.src = ${JSON.stringify(sameOriginProbe + '/image')}; document.body.append(image);
      parent.postMessage({ type: 'genui:probe', parentBlocked, fetchBlocked, localFetchBlocked, storageBlocked }, '*');
    })();`;
  const htmlCard = await page.evaluate(() => aegis.canvas.board.cards.find(c => c.kind === 'html'));
  const revision = await page.evaluate(([id, data]) => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify([{ op: 'revise', id, data }]), model: { provider: 'fake', modelId: 'fake' } }), [htmlCard.id, { ...samples.html, js: samples.html.js + probe }]);
  assert.ok(revision[0]?.id, JSON.stringify(revision));
  await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.kind === 'html').ver === 2);
  await frame('html');
  await page.waitForFunction(() => window.__genuiReports.some(r => r.parentBlocked && r.fetchBlocked && r.localFetchBlocked && r.storageBlocked && r.origin === 'null'));
  assert.equal(outgoing, 0, 'CSP stops fetch before a request leaves the iframe');
  assert.equal(await page.locator('body').getAttribute('data-genui-escaped'), null);
  assert.equal(await page.evaluate(() => window.__genuiPrivate), 'Only the app may read this');
  const iframe = page.frameLocator('.card.kind-html iframe');
  await iframe.locator('#minutes').fill('30');
  assert.match(await iframe.locator('#total').textContent(), /120 minutes/);
  const initialHeight = await page.locator('.card.kind-html iframe').evaluate(el => el.clientHeight);
  await iframe.locator('body').evaluate(body => { const p = document.createElement('p'); p.textContent = 'Extra detail'; p.style.height = '470px'; body.append(p); });
  await page.waitForFunction(initial => document.querySelector('.card.kind-html iframe')?.clientHeight > initial + 300, initialHeight);
  await page.waitForFunction(() => {
    const frame = document.querySelector('.card.kind-html iframe');
    const content = frame.closest('.content'), strip = frame.closest('.object').querySelector('.win-strip'), card = frame.closest('.card');
    const style = getComputedStyle(content);
    return aegis.canvas.board.cards.find(c => c.kind === 'html').h === frame.clientHeight + strip.offsetHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + card.offsetHeight - card.clientHeight;
  });
  const beforeSpoof = await page.locator('.card.kind-html iframe').evaluate(el => el.clientHeight);
  assert.match(await iframe.locator('#total').textContent(), /120 minutes/, 'auto height preserves the live widget state');
  await page.evaluate(() => {
    const channel = window.__genuiHeights.findLast(r => r.ownFrame)?.channel;
    const data = { type: 'aegis:html-height', channel, height: 1900 };
    dispatchEvent(new MessageEvent('message', { origin: 'null', source: window, data }));
  });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.card.kind-html iframe').evaluate(el => el.clientHeight), beforeSpoof, 'wrong source cannot resize the frame');
  console.log('pass genui: sandbox blocks parent document, storage and fetch; height reports resize only their own frame');

  // Restore a normal custom UI through the same fake agent path, proving source revision.
  await page.evaluate(([id, data]) => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify([{ op: 'revise', id, data }]), model: { provider: 'fake', modelId: 'fake' } }), [htmlCard.id, { ...samples.html, html: samples.html.html.replace('Try a different pace', 'Plan a focused afternoon') }]);
  await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.kind === 'html').ver >= 3);
  await frame('html');
  await page.frameLocator('.card.kind-html iframe').getByRole('heading', { name: 'Plan a focused afternoon' }).waitFor();
  console.log('pass genui: agent revise replaces sandbox source in place');

  await page.context().setOffline(true);
  await page.frameLocator('.card.kind-html iframe').locator('#minutes').fill('35');
  assert.match(await page.frameLocator('.card.kind-html iframe').locator('#total').textContent(), /140 minutes/);
  await page.context().setOffline(false);
  const beforeMotion = await page.locator('.card.kind-html iframe').getAttribute('src');
  await page.evaluate(() => document.body.classList.add('motion-off'));
  await page.waitForFunction(before => document.querySelector('.card.kind-html iframe')?.src !== before, beforeMotion);
  await page.frameLocator('.card.kind-html iframe').locator('h2').waitFor();
  await page.frameLocator('.card.kind-html iframe').locator('h2').evaluate(el => { el.style.animation = 'spin 1s infinite'; });
  assert.equal(await page.frameLocator('.card.kind-html iframe').locator('h2').evaluate(el => getComputedStyle(el).animationName), 'none');
  const motionSource = await page.locator('.card.kind-html iframe').getAttribute('src');
  await page.evaluate(() => document.body.classList.remove('motion-off'));
  await page.waitForFunction(before => document.querySelector('.card.kind-html iframe')?.src !== before, motionSource);
  await page.frameLocator('.card.kind-html iframe').locator('h2').waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.frameLocator('.card.kind-html iframe').locator('h2').evaluate(el => { el.style.animation = 'spin 1s infinite'; });
  assert.equal(await page.frameLocator('.card.kind-html iframe').locator('h2').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.frameLocator('.card.kind-html iframe').locator('h2').evaluate(el => { el.style.animation = ''; });
  console.log('pass genui: custom UI works offline and honours both motion settings');

  for (const width of [1586, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 992 });
    if (width === 390) {
      await page.evaluate(() => aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify(aegis.canvas.board.cards.filter(c => c.type === 'object').map(c => ({ op: 'update', id: c.id, set: { w: 350 } }))), model: { provider: 'fake', modelId: 'fake' } }));
      await page.waitForFunction(() => aegis.canvas.board.cards.filter(c => c.type === 'object').every(c => c.w === 350));
    }
    for (const kind of Object.keys(samples)) {
      const card = await frame(kind);
      await card.screenshot({ path: out(`genui-${kind}-${width}-${stamp}.png`) });
    }
  }
  assert.deepEqual(errors, []);
  writeFileSync(out(`genui-results-${stamp}.json`), JSON.stringify({ kinds: Object.keys(samples), screenshots: [1440, 1586, 390], outgoingSandboxRequests: outgoing, errors }, null, 2));
  console.log('pass genui: screenshots of every kind at 1440, 1586 and 390; no page errors');
} catch (error) {
  console.error('FAIL genui:', error.stack);
  if (page) console.error('diagnostics', JSON.stringify(await page.evaluate(async () => ({ reports: window.__genuiReports, rev: aegis.canvas.board.rev, saved: document.querySelector('#saveState')?.textContent, server: await aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(b => ({ rev: b.rev, html: b.cards.find(c => c.kind === 'html') })), html: aegis.canvas.board.cards.find(c => c.kind === 'html'), widths: aegis.canvas.board.cards.map(c => [c.type, c.kind, c.w]) })).catch(() => null)), errors);
  if (logs.length) console.error(logs.slice(-5).join('\n'));
  if (page) await page.screenshot({ path: out(`genui-fail-${stamp}.png`) }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close(); host?.kill(); await vite?.close();
}
