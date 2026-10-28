import type { Card } from '@aegis/domain';
import { CardSchema, RichNodeSchema, SlideSchema } from '@aegis/domain/schema';
import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { format as formatCheckOutput } from 'node:util';
import type { Browser, Page } from 'playwright';
import { z } from 'zod';
import type {} from '../../app/src/platform/test-facade.ts';
import { createUiSnapshot, disposeUiSnapshot } from '../support/ui-snapshot.ts';
import { checkTemp, installBrowserChecks } from './agents-submit.ts';
import { assertSlideFits } from './deck-fit.ts';
import { out } from './out.ts';
import { chromium, webkit } from './playwright.ts';
let failurePage: Page | undefined;
const ImageSchema = z.object({ src: z.string(), alt: z.string().optional() }).passthrough();
const ImportedCardSchema = CardSchema.and(z.object({ props: z.object({ import: z.object({ name: z.string(), original: z.string() }).passthrough(), pages: ImageSchema.array().optional(), slides: SlideSchema.extend({ images: ImageSchema.array().optional() }).array().optional(), body: z.string().optional(), doc: RichNodeSchema.optional() }).passthrough() }));
function importedName(card: Card) { const value = card.props?.import; return value && typeof value === 'object' && !Array.isArray(value) ? value.name : undefined; }
declare global {
    interface Window {
        __importMotions: {
            id: string | undefined;
            durations: (number | string | CSSNumericValue | undefined)[];
        }[];
    }
}
function present<T>(value: T | null | undefined): T {
    if (value === undefined || value === null)
        throw new Error('Missing expected test value');
    return value;
}
const offset = Number(process.env.AEGIS_PORT_OFFSET || 0), vitePort = 5195 + offset;
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const token = `imports-${process.pid}`, stamp = Date.now(), built = process.env.AEGIS_IMPORTS_BUILT === '1';
const data = checkTemp(join(tmpdir(), 'aegis-imports-'));
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', ...(built ? { AEGIS_UI: repo + '/app/dist' } : {}) } });
host.stderr.on('data', d => appendFileSync(out(`imports-host-${stamp}.txt`), d));
let vite: ChildProcess | undefined, browser: Browser | undefined, page: Page, snapshotUi: string | undefined;
const errors: string[] = [], workerRequests: {
    url: string;
    status: number;
    type: string | undefined;
}[] = [];
const fixture = (name: string) => ({ name, bytes: readFileSync(join(repo, 'checks/fixtures', name)).toString('base64') });
const cards = async () => ImportedCardSchema.array().parse(await page.evaluate(() => {
    const aegis = globalThis.window.aegis;
    if (!aegis)
        throw new Error('Missing test facade');
    return aegis.canvas.board.cards;
}));
const stored = async () => z.object({ cards: ImportedCardSchema.array() }).parse(await page.evaluate(() => {
    const aegis = globalThis.window.aegis;
    if (!aegis)
        throw new Error('Missing test facade');
    return aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard);
}));
async function drop(names: string[]) {
    await page.evaluate(files => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const x = aegis.canvas.board.cards.length * 1000;
        aegis.canvas.setView({ x: 160 - x, y: 40, z: 1 });
        const transfer = new DataTransfer();
        for (const file of files)
            transfer.items.add(new File([Uint8Array.from(atob(file.bytes), c => c.charCodeAt(0))], file.name, { type: file.name.endsWith('.pdf') ? 'application/pdf' : '' }));
        present(document.getElementById('stage')).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: 160, clientY: 140 }));
    }, names.map(fixture));
}
async function waitCard(name: string) {
    await page.waitForFunction(name => {
        function importedName(card: Card) { const value = card.props?.import; return value && typeof value === 'object' && !Array.isArray(value) ? value.name : undefined; }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.cards.some(c => importedName(c) === name);
    }, name, { timeout: 30000 });
    await page.waitForFunction(async (name) => {
        function importedName(card: Card) { const value = card.props?.import; return value && typeof value === 'object' && !Array.isArray(value) ? value.name : undefined; }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return (await aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard)).cards.some(c => importedName(c) === name);
    }, name, { timeout: 15000 });
    return (await cards()).filter(c => importedName(c) === name).at(-1);
}
async function verifyAsset(url: string, type: string, original?: string) {
    assert.match(url, /^asset:[a-f0-9]{32}\.[a-z0-9]{3,4}$/);
    const base = await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.host.base;
    });
    const response = await fetch(`${base}/assets/${url.slice(6)}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), type);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length > 100);
    if (original)
        assert.deepEqual(bytes, readFileSync(join(repo, 'checks/fixtures', original)));
}
async function screenshots(name: string, id?: string) {
    for (const [width, height] of [[1440, 900], [1586, 992], [390, 844]] as const) {
        await page.setViewportSize({ width, height });
        if (id)
            await page.evaluate(id => {
                function present<T>(value: T | null | undefined): T {
                    if (value === undefined || value === null)
                        throw new Error('Missing expected test value');
                    return value;
                }
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                const card = aegis.canvas.board.cards.find(c => c.id === id);
                const z = Math.min(1, (innerWidth - 48) / present(card).w, (innerHeight - 180) / present(card).h);
                aegis.canvas.setView({ x: (innerWidth - present(card).w * z) / 2 - present(card).x * z, y: 76 - present(card).y * z, z });
                aegis.canvas.select([id]);
            }, id);
        await page.evaluate(() => new Promise<number>(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.evaluate(async () => {
            function present<T>(value: T | null | undefined): T {
                if (value === undefined || value === null)
                    throw new Error('Missing expected test value');
                return value;
            }
            await Promise.all(document.getAnimations().filter(animation => present(animation.effect).getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => { })));
        });
        await page.screenshot({ path: out(`imports-${built ? 'built-' : ''}${name}-${width}-${stamp}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
}
try {
    const port = await new Promise<string>((resolve, reject) => {
        host.stdout.on('data', d => {
            const m = /"port":(\d+)/.exec(String(d));
            if (m?.[1])
                resolve(m[1]);
        });
        host.once('exit', code => reject(new Error(`Host exited ${code}`)));
    });
    if (!built) {
        const ui = snapshotUi = createUiSnapshot(repo, 'aegis-imports-ui-');
        // Preload the PDF worker so its first import cannot reload the running UI.
        // macOS resolves worker entries through /private/var while tmpdir() returns /var.
        writeFileSync(join(ui, 'vite.imports.config.ts'), `import { mergeConfig } from 'vite'; import base from './vite.config.ts'; export default mergeConfig(base, { optimizeDeps: { include: ['pdfjs-dist/legacy/build/pdf.worker.mjs'] }, server: { fs: { allow: ${JSON.stringify([join(ui, '..'), realpathSync(join(ui, '..'))])} } } });`);
        vite = spawn('npx', ['vite', '--config', 'vite.imports.config.ts', '--port', String(vitePort), '--strictPort'], { cwd: ui, stdio: 'pipe' });
        present(vite.stderr).on('data', d => appendFileSync(out(`imports-vite-${stamp}.txt`), d));
        present(vite.stdout).on('data', d => appendFileSync(out(`imports-vite-${stamp}.txt`), d));
        await new Promise<void>((resolve, reject) => {
            present(present(vite).stdout).on('data', d => {
                if (/Local/.test(String(d)))
                    resolve();
            });
            present(vite).once('exit', code => reject(new Error(`Vite exited ${code}`)));
        });
    }
    const engine = z.enum(['chromium', 'webkit']).parse(process.env.AEGIS_BROWSER || 'chromium');
    browser = await ({ chromium, webkit })[engine].launch();
    page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    failurePage = page;
    await installBrowserChecks(page);
    // Keep interception enabled before any input. Enabling it per wait can race keyboard.press.
    page.on('filechooser', () => { });
    await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
    page.on('console', message => {
        if (message.type() === 'error')
            errors.push(message.text());
    });
    page.on('response', response => {
        if (/pdf[.-]worker/.test(response.url()))
            workerRequests.push({ url: response.url(), status: response.status(), type: response.headers()['content-type'] });
    });
    // Match the app's worker and connection policy when checking the built host UI.
    if (built)
        await page.route('**/ui/index.html?*', async (route) => { const response = await route.fetch(); await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:* ws://127.0.0.1:*; img-src 'self' data: blob: https: http://127.0.0.1:*; media-src 'self' blob: https: http://127.0.0.1:*; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src https://open.spotify.com" } }); });
    await page.goto(built ? `http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}` : `http://127.0.0.1:${vitePort}/?port=${port}&token=${token}`);
    await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board, null, { timeout: 20000 });
    await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        window.__importMotions = [];
        new MutationObserver(records => {
            for (const record of records)
                for (const node of record.type === 'attributes' ? [record.target] : record.addedNodes)
                    if (node instanceof HTMLElement && node.matches('#world > .card[data-id]'))
                        window.__importMotions.push({ id: node.dataset.id, durations: node.getAnimations().map(animation => present(animation.effect).getTiming().duration) });
        }).observe(present(document.getElementById('world')), { childList: true, subtree: true, attributes: true, attributeFilter: ['data-id'] });
    });
    assert.equal((await cards()).length, 0);
    assert.equal(await page.locator('#empty .empty-actions button').count(), 3);
    assert.equal(await page.locator('#empty .empty-mark').count(), 0);
    await screenshots('empty');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.empty-actions button').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => document.body.classList.add('motion-off'));
    assert.equal(await page.locator('.empty-actions button').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await page.evaluate(() => document.body.classList.remove('motion-off'));
    process.stdout.write(formatCheckOutput('PASS quiet empty-board actions at 1440, 1586 and 390, with both reduced-motion settings') + '\n');
    // WKWebView versions supported by the app can lack these newer JS built-ins.
    await page.evaluate(() => { Reflect.deleteProperty(Promise, 'withResolvers'); Reflect.deleteProperty(Promise, 'try'); Reflect.deleteProperty(Math, 'sumPrecise'); Reflect.deleteProperty(Uint8Array, 'fromBase64'); });
    await drop(['two-pages.pdf']);
    await page.locator('.import-progress').waitFor();
    let pdf = await waitCard('two-pages.pdf');
    await page.locator(`.card[data-id="${present(pdf).id}"]`).waitFor();
    assert.ok(await page.evaluate(id => window.__importMotions.some(motion => motion.id === id && motion.durations.includes(240)), present(pdf).id));
    assert.equal(present(pdf).type, 'doc');
    assert.equal(present(present(present(pdf).props).pages).length, 2);
    assert.match(present(present(present(pdf).props).body), /# A quieter table/);
    assert.match(present(present(present(pdf).props).body), /Second page text/);
    assert.equal(present(present(present(present(pdf).props).doc).content).filter(node => node.type === 'image').length, 2);
    assert.equal(present(present(present(present(present(present(present(pdf).props).doc).content).filter(node => node.type === 'heading')[0]).content)[0]).text, 'A quieter table');
    for (const picture of present(present(present(pdf).props).pages))
        await verifyAsset(picture.src, 'image/jpeg');
    await verifyAsset(present(present(present(pdf).props).import).original, 'application/pdf', 'two-pages.pdf');
    await screenshots('pdf', present(pdf).id);
    assert.ok(workerRequests.some(request => request.status === 200 && /javascript/.test(present(request.type))));
    assert.ok(await page.evaluate(() => typeof Promise.withResolvers === 'function' && 'sumPrecise' in Math && typeof Math.sumPrecise === 'function'));
    await page.evaluate(id => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.select([id]);
    }, present(pdf).id);
    await page.locator(`.window-actions [data-window-action="${present(pdf).id}"]`).click();
    await page.locator('.docs-panel').waitFor();
    assert.equal(await page.locator('.docs-panel').evaluate(el => getComputedStyle(el).transitionDuration), '0.26s');
    assert.equal(await page.locator('.docs-panel img[data-asset-src]').count(), 2);
    await page.waitForFunction(() => { function dom<T extends Element>(value: Element | null | undefined, kind: {
        new (): T;
    }): T { if (!(value instanceof kind))
        throw new Error('Unexpected DOM element type'); return value; } return [...document.querySelectorAll('.docs-panel img')].every(img => dom(img, HTMLImageElement).complete && dom(img, HTMLImageElement).naturalWidth > 0); });
    await page.locator('.docs-panel img').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: out(`imports-${built ? 'built-' : ''}pdf-pages-1440-${stamp}.png`) });
    await page.locator('.docs-panel .tiptap').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('Editable import text.');
    await page.waitForFunction(() => document.querySelector('.docs-panel [data-saved]')?.textContent === 'Saved');
    pdf = (await stored()).cards.find(card => card.id === present(pdf).id);
    assert.ok(present(present(present(present(pdf).props).doc).content).filter(node => node.type === 'image').every(node => z.string().parse(present(node.attrs).src).startsWith('asset:')));
    await page.getByRole('button', { name: 'Close document', exact: true }).click();
    assert.equal(await page.locator('.docs-panel').evaluate(el => getComputedStyle(el).transitionDuration), '0.2s');
    await page.locator('.docs-panel').waitFor({ state: 'detached' });
    process.stdout.write(formatCheckOutput('PASS synthetic PDF drop extracts headings and editable text, saves both page images and the original, uses a real module worker, and retains stable image references after editing') + '\n');
    await drop(['two-slides.pptx']);
    let pptx = await waitCard('two-slides.pptx');
    assert.equal(present(pptx).type, 'deck');
    assert.equal(present(present(present(pptx).props).slides).length, 2);
    assert.equal(present(present(present(present(pptx).props).slides)[0]).title, 'First import slide');
    assert.equal(present(present(present(present(pptx).props).slides)[1]).title, 'Second import slide');
    assert.equal(present(present(present(present(pptx).props).slides)[0]).body, 'First slide body stays editable.');
    assert.equal(present(present(present(present(present(pptx).props).slides)[0]).images).length, 2);
    assert.equal(present(present(present(present(present(pptx).props).slides)[1]).images).length, 1);
    for (const picture of present(present(present(present(present(pptx).props).slides)[0]).images))
        await verifyAsset(picture.src, 'image/png');
    await verifyAsset(present(present(present(pptx).props).import).original, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'two-slides.pptx');
    await screenshots('pptx', present(pptx).id);
    const pptxCard = page.locator(`.card[data-id="${present(pptx).id}"]`);
    for (const [w, h] of [[470, 352], [760, 292]] as const) {
        await page.evaluate(({ id, w, h }) => {
            const aegisCtx = globalThis.window.aegisCtx;
            if (!aegisCtx)
                throw new Error('Missing test facade');
            return aegisCtx.apply([{ op: 'update', id, set: { w, h } }]);
        }, { id: present(pptx).id, w, h });
        await assertSlideFits(pptxCard.locator('.deck-main > .deck-fit'), { label: `Imported PPTX ${w} by ${h}`, pictures: 2 });
        await assertSlideFits(pptxCard.locator('.deck-thumb > .deck-fit').first(), { label: 'Imported PPTX thumbnail', pictures: 2 });
    }
    await page.evaluate(id => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.select([id]);
    }, present(pptx).id);
    await page.locator(`.window-actions [data-window-action="${present(pptx).id}"]`).click();
    await page.locator('.deck-panel').waitFor();
    await page.waitForFunction(() => document.querySelector('.deck-panel')?.getAnimations().every(animation => !animation.pending && animation.playState !== 'running'));
    assert.equal(await page.locator('.deck-panel .deck-slide-wrap').count(), 2);
    await assertSlideFits(page.locator('.deck-panel .deck-slide-wrap > .deck-fit').first(), { label: 'Imported PPTX editor', pictures: 2 });
    await assertSlideFits(page.locator('.deck-panel .deck-film-item > .deck-fit').first(), { label: 'Imported PPTX filmstrip', pictures: 2 });
    await page.getByRole('textbox', { name: 'Slide 1 title', exact: true }).fill('Edited import title');
    await page.waitForFunction(() => document.querySelector('.deck-panel [data-saved]')?.textContent === 'Saved');
    pptx = (await stored()).cards.find(card => card.id === present(pptx).id);
    assert.equal(present(present(present(present(pptx).props).slides)[0]).title, 'Edited import title');
    assert.equal(present(present(present(present(present(pptx).props).slides)[0]).images).length, 2);
    await page.getByRole('button', { name: 'Back to board', exact: true }).click();
    await page.locator('.deck-panel').waitFor({ state: 'detached' });
    process.stdout.write(formatCheckOutput('PASS synthetic PPTX drop follows presentation relationship order, imports titles, bodies and pictures, and retains pictures after a slide edit') + '\n');
    await drop(['two-previews.key']);
    const key = await waitCard('two-previews.key');
    assert.equal(present(key).type, 'deck');
    assert.equal(present(present(present(key).props).slides).length, 2);
    assert.deepEqual(present(present(present(key).props).slides).map(slide => z.object({ alt: z.string() }).parse(present(z.object({ src: z.string(), alt: z.string().optional() }).array().parse(slide.images)[0])).alt), ['st-2.jpg', 'st-10.jpg']);
    assert.ok(present(present(present(key).props).slides).every(slide => slide.layout === 'image' && slide.imageOnly));
    for (const slide of present(present(present(key).props).slides))
        await verifyAsset(present(z.object({ src: z.string(), alt: z.string().optional() }).array().parse(slide.images)[0]).src, 'image/jpeg');
    await verifyAsset(present(present(present(key).props).import).original, 'application/vnd.apple.keynote', 'two-previews.key');
    await screenshots('keynote', present(key).id);
    assert.match(present(await page.locator(`.card[data-id="${present(key).id}"] .deck-source`).getAttribute('href')), /\/assets\/.*\.key$/);
    await page.evaluate(id => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const c = aegis.canvas.board.cards.find(c => c.id === id);
        aegis.canvas.setView({ x: 80 - present(c).x, y: 80 - present(c).y, z: 1 });
    }, present(key).id);
    await page.waitForFunction(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.view.z === 1;
    });
    const downloadEvent = page.waitForEvent('download');
    await page.locator(`.card[data-id="${present(key).id}"] .deck-source`).click();
    const originalDownload = await downloadEvent;
    assert.equal(originalDownload.suggestedFilename(), 'two-previews.key');
    assert.deepEqual(readFileSync(await originalDownload.path()), readFileSync(join(repo, 'checks/fixtures/two-previews.key')));
    process.stdout.write(formatCheckOutput('PASS synthetic Keynote drop sorts previews numerically, prefers slide previews to QuickLook, and links the unchanged original file') + '\n');
    // The More tools Import button and the existing Import images tool share the route.
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.select([]);
    });
    await page.mouse.move(24, 450);
    await page.locator('#toolsFold').click();
    assert.equal(await page.locator('#toolsPopover section').filter({ has: page.getByRole('heading', { name: 'Media', exact: true }) }).getByRole('button', { name: 'Import', exact: true }).count(), 1);
    const picked = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const picker = await picked;
    assert.match(present(await picker.element().getAttribute('accept')), /\.pdf.*\.pptx.*\.key/);
    await picker.setFiles(join(repo, 'checks/fixtures/quicklook.key'));
    await waitCard('quicklook.key');
    // A selected deck must not steal Enter from the focused import button.
    await page.evaluate(id => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.select([id]);
    }, present(key).id);
    await page.locator('#toolsFold').click();
    await page.locator('#toolsPopover [data-tool="import-image"]').focus();
    await page.mouse.move(700, 450);
    await page.waitForTimeout(1400);
    assert.equal(await page.locator('#toolsPopover [data-tool="import-image"]').evaluate(el => el === document.activeElement), true);
    const imagesPick = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    const imagesPicker = await imagesPick;
    assert.match(present(await imagesPicker.element().getAttribute('accept')), /\.pdf/);
    await imagesPicker.setFiles(join(repo, 'checks/fixtures/two-slides.pptx'));
    await page.waitForFunction(() => {
        function importedName(card: Card) { const value = card.props?.import; return value && typeof value === 'object' && !Array.isArray(value) ? value.name : undefined; }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.cards.filter(c => importedName(c) === 'two-slides.pptx').length === 2;
    });
    const keyboardDeck = (await cards()).filter(card => card.props?.import?.name === 'two-slides.pptx').at(-1);
    await page.locator(`.card[data-id="${present(keyboardDeck).id}"]`).waitFor();
    assert.ok(await page.evaluate(id => window.__importMotions.some(motion => motion.id === id && !motion.durations.includes(240)), present(keyboardDeck).id));
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
        aegis.canvas.select([]);
    });
    await page.mouse.move(24, 450);
    const mediaPick = page.waitForEvent('filechooser');
    await page.locator('#tools [data-tool="media"]').click();
    const mediaPicker = await mediaPick;
    assert.match(present(await mediaPicker.element().getAttribute('accept')), /\.key/);
    await mediaPicker.setFiles(join(repo, 'checks/fixtures/quicklook.key'));
    await page.waitForFunction(() => {
        function importedName(card: Card) { const value = card.props?.import; return value && typeof value === 'object' && !Array.isArray(value) ? value.name : undefined; }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.cards.filter(c => importedName(c) === 'quicklook.key').length === 2;
    });
    process.stdout.write(formatCheckOutput('PASS More tools Files > Import, keyboard activation of Import images and the media picker accept presentations and use the same importer, including QuickLook fallback') + '\n');
    // I also opens the picker from a focused deck immediately after its import.
    const justImported = (await cards()).filter(card => card.props?.import?.name === 'quicklook.key').at(-1);
    await page.locator(`.card[data-id="${present(justImported).id}"]`).focus();
    assert.deepEqual(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.selection();
    }), [present(justImported).id]);
    const selectedPick = page.waitForEvent('filechooser');
    await page.keyboard.press('i');
    const selectedPicker = await selectedPick;
    assert.match(present(await selectedPicker.element().getAttribute('accept')), /\.pdf.*\.pptx.*\.key/);
    await selectedPicker.setFiles([]);
    assert.deepEqual(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.selection();
    }), [present(justImported).id]);
    process.stdout.write(formatCheckOutput('PASS I opens the import picker from a focused, selected deck just after import and preserves selection') + '\n');
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
        aegis.canvas.select([]);
    });
    await page.mouse.move(700, 450);
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return getComputedStyle(present(document.getElementById('tools'))).pointerEvents === 'none';
    });
    const shortcutPick = page.waitForEvent('filechooser');
    await page.keyboard.press('i');
    await (await shortcutPick).setFiles([]);
    const programmaticPick = page.waitForEvent('filechooser');
    await page.locator('#tools [data-tool="import-image"]').evaluate(button => { function dom<T extends Element>(value: Element | null | undefined, kind: {
        new (): T;
    }): T { if (!(value instanceof kind))
        throw new Error('Unexpected DOM element type'); return value; } return dom(button, HTMLElement).click(); });
    await (await programmaticPick).setFiles([]);
    assert.equal(await page.locator('#tools').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    process.stdout.write(formatCheckOutput('PASS selected deck preserves native Enter on Import images; shortcut and programmatic import work while the rail is idle') + '\n');
    // Exercise the directory-entry route used by Finder's package drops.
    const packageDrop = await page.evaluate(file => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const image = new File([Uint8Array.from(atob(file.bytes), c => c.charCodeAt(0))], 'st-1.jpg', { type: 'image/jpeg' });
        let root: FileSystemDirectoryEntry;
        const filesystem: FileSystem = { name: 'import-check', get root() { return root; } };
        const base = (name: string) => ({ name, fullPath: '/' + name, filesystem, getParent(done: FileSystemEntryCallback) { done(root); } });
        const directory = (name: string, children: FileSystemEntry[]): FileSystemDirectoryEntry => ({ ...base(name), isDirectory: true, isFile: false, createReader() { let read = false; return { readEntries(done) { done(read ? [] : children); read = true; } }; }, getDirectory() { throw new Error('Unused directory lookup'); }, getFile() { throw new Error('Unused file lookup'); } });
        const fileEntry: FileSystemFileEntry = { ...base('st-1.jpg'), isFile: true, isDirectory: false, file(done) { done(image); } };
        root = directory('package-drop.key', [directory('Data', [fileEntry])]);
        const transfer = new DataTransfer();
        transfer.items.add(new File([''], 'package-drop.key'));
        // Chromium returns fresh wrappers for items. Override the prototype for this
        // synchronous dispatch, then restore it before awaiting any import work.
        const originalEntry = DataTransferItem.prototype.webkitGetAsEntry;
        DataTransferItem.prototype.webkitGetAsEntry = function () { return this.getAsFile()?.name === 'package-drop.key' ? root : originalEntry.call(this); };
        const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: 160, clientY: 140 });
        const directorySeen = present(transfer.items[0]).webkitGetAsEntry()?.isDirectory;
        present(document.getElementById('stage')).dispatchEvent(event);
        DataTransferItem.prototype.webkitGetAsEntry = originalEntry;
        return { directorySeen, cancelled: event.defaultPrevented };
    }, fixture('preview-first.jpg'));
    assert.deepEqual(packageDrop, { directorySeen: true, cancelled: true });
    const packagedKey = await waitCard('package-drop.key');
    assert.equal(present(present(present(packagedKey).props).slides).length, 1);
    await verifyAsset(present(present(present(packagedKey).props).import).original, 'application/vnd.apple.keynote');
    process.stdout.write(formatCheckOutput('PASS Keynote directory-entry drops repack the original package and import its preview') + '\n');
    const count = (await cards()).length;
    for (const [name, message] of [['no-previews.key', /export it to PDF/], ['invalid.pdf', /could not be read/], ['oversized.pptx', /128 MB/]] as const) {
        await drop([name]);
        await page.getByRole('status').filter({ hasText: `Could not import ${name}.` }).waitFor();
        assert.match(present(await page.locator('#toast').textContent()), message);
        assert.equal((await cards()).length, count);
    }
    // Reject large files before parsing or upload, without shipping a 65 MB fixture.
    await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array(64 * 1024 * 1024 + 1)], 'too-big.pdf', { type: 'application/pdf' }));
        present(document.getElementById('stage')).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });
    await page.getByRole('status').filter({ hasText: 'This file is over 64 MB' }).waitFor();
    assert.equal((await cards()).length, count);
    process.stdout.write(formatCheckOutput('PASS missing previews, invalid PDF, expanded ZIP limits and 64 MB file limits report actionable errors without creating partial cards') + '\n');
    // Mixed clipboard imports must be handled once, with default paste cancelled synchronously.
    const cancelled = await page.evaluate(file => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const transfer = new DataTransfer();
        transfer.items.add(new File([Uint8Array.from(atob(file.bytes), c => c.charCodeAt(0))], file.name));
        const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer });
        present(document.getElementById('stage')).dispatchEvent(event);
        return event.defaultPrevented;
    }, fixture('quicklook.key'));
    assert.equal(cancelled, true);
    await page.waitForFunction(expected => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.cards.length === expected;
    }, count + 1);
    await page.locator('.import-progress').waitFor({ state: 'detached' });
    // Switching boards while an upload is held keeps the result on the captured board.
    const firstBoard = await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.id;
    });
    const held = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let heldOnce = false;
    await page.route('**/assets', async (route) => {
        if (route.request().method() !== 'POST' || heldOnce)
            return route.continue();
        heldOnce = true;
        held.resolve();
        await release.promise;
        await route.continue();
    });
    await drop(['quicklook.key']);
    await held.promise;
    const second = await page.evaluate(async () => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const next = await aegis.host.post('/boards', { name: 'Import destination isolation' }).then(globalThis.window.__checkBoard);
        const board = await aegis.host.get(`/boards/${next.id}`).then(globalThis.window.__checkBoard);
        aegis.canvas.setBoard(board);
        return next;
    });
    release.resolve();
    await page.waitForFunction(async (id) => {
        function importedName(card: Card) { const value = card.props?.import; return value && typeof value === 'object' && !Array.isArray(value) ? value.name : undefined; }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return (await aegis.host.get(`/boards/${id}`).then(globalThis.window.__checkBoard)).cards.filter(c => importedName(c) === 'quicklook.key').length === 4;
    }, firstBoard);
    await page.unroute('**/assets');
    assert.equal((await cards()).length, 0);
    assert.equal((await page.evaluate(id => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.host.get(`/boards/${id}`).then(globalThis.window.__checkBoard);
    }, second.id)).cards.length, 0);
    process.stdout.write(formatCheckOutput('PASS paste cancels the browser default once, and switching boards during conversion saves into the original board') + '\n');
    // Imported canvas windows leave a short snapshot on pointer deletion.
    await drop(['quicklook.key']);
    const closing = await waitCard('quicklook.key');
    await page.locator(`.card[data-id="${present(closing).id}"]`).waitFor();
    await page.locator(`.card[data-id="${present(closing).id}"]`).click({ button: 'right', position: { x: 100, y: 180 } });
    await page.locator('.ctx-menu').getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.locator('.import-window-exit').waitFor();
    assert.ok(await page.locator('.import-window-exit').evaluate(el => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return el.getAnimations().some(a => present(a.effect).getTiming().duration === 200);
    }));
    await page.locator('.import-window-exit').waitFor({ state: 'detached' });
    process.stdout.write(formatCheckOutput('PASS imported window arrival and pointer close motion, instant keyboard import, and document editor open/close motion') + '\n');
    // Toasts animate in and out, keyboard feedback and both reduced-motion paths cut instantly.
    await page.locator('.import-progress').waitFor({ state: 'detached' });
    await page.mouse.click(1100, 650);
    await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const toast = document.getElementById('toast');
        present(toast).hidden = true;
    });
    await page.waitForTimeout(210);
    await page.evaluate(() => {
        const aegisCtx = globalThis.window.aegisCtx;
        if (!aegisCtx)
            throw new Error('Missing test facade');
        return aegisCtx.toast('Import motion check');
    });
    assert.ok(await page.locator('#toast').evaluate(el => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return el.getAnimations().some(a => present(a.effect).getTiming().duration === 200);
    }));
    await page.waitForTimeout(210);
    await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return present(document.getElementById('toast')).hidden = true;
    });
    await page.locator('#toast.toast-leaving').waitFor();
    await page.locator('#toast.toast-leaving').waitFor({ state: 'detached' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
        const aegisCtx = globalThis.window.aegisCtx;
        if (!aegisCtx)
            throw new Error('Missing test facade');
        return aegisCtx.toast('Reduced motion');
    });
    assert.equal(await page.locator('#toast').evaluate(el => el.getAnimations().length), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
        const aegisCtx = globalThis.window.aegisCtx;
        if (!aegisCtx)
            throw new Error('Missing test facade');
        return aegisCtx.toast('Keyboard feedback');
    });
    assert.equal(await page.locator('#toast').evaluate(el => el.getAnimations().length), 0);
    await page.evaluate(() => document.body.classList.add('motion-off'));
    await page.evaluate(() => {
        const aegisCtx = globalThis.window.aegisCtx;
        if (!aegisCtx)
            throw new Error('Missing test facade');
        return aegisCtx.toast('Motion off');
    });
    assert.equal(await page.locator('#toast').evaluate(el => el.getAnimations().length), 0);
    process.stdout.write(formatCheckOutput('PASS toast enter and exit motion, keyboard feedback and both reduced-motion paths') + '\n');
    const assets = readdirSync(join(data, 'assets'));
    assert.ok(assets.some(name => name.endsWith('.pdf')) && assets.some(name => name.endsWith('.pptx')) && assets.some(name => name.endsWith('.key')));
    writeFileSync(out(`imports-evidence-${stamp}.json`), JSON.stringify({ built, workerRequests, assets, board: await page.evaluate(id => {
            const aegis = globalThis.window.aegis;
            if (!aegis)
                throw new Error('Missing test facade');
            return aegis.host.get(`/boards/${id}`).then(globalThis.window.__checkBoard);
        }, firstBoard) }, null, 2));
    assert.deepEqual(errors, []);
    process.stdout.write(formatCheckOutput(`PASS no browser errors, persisted cards and ${assets.length} assets verified${built ? ' in the built host UI under the packaged CSP' : ''}`) + '\n');
}
catch (error) {
    if (typeof failurePage !== 'undefined')
        await failurePage.screenshot({ path: out(`imports-fail-${stamp}.png`) }).catch(() => { });
    if (typeof failurePage !== 'undefined')
        process.stderr.write(formatCheckOutput('Last toast:', await failurePage.locator('#toast').textContent().catch(() => 'unavailable')) + '\n');
    if (typeof failurePage !== 'undefined')
        process.stderr.write(formatCheckOutput('Import progress:', await failurePage.locator('.import-progress').allTextContents(), 'workers:', workerRequests) + '\n');
    process.stderr.write(formatCheckOutput(error) + '\n');
    process.stderr.write(formatCheckOutput(errors) + '\n');
    process.exitCode = 1;
}
finally {
    await browser?.close();
    host.kill();
    vite?.kill();
    if (snapshotUi)
        disposeUiSnapshot(snapshotUi);
}
