import type { Card } from '@aegis/domain';
import { HtmlStateSchema } from '@aegis/domain/html-state';
import type { ChildProcess } from 'node:child_process';
import { format as formatCheckOutput } from 'node:util';
import type { Browser, Locator, Page } from 'playwright';
import { createServer } from 'vite';
import { z } from 'zod';
import type {} from '../../app/src/platform/test-facade.ts';
import { checkTemp, installBrowserChecks } from './agents-submit.ts';
// Every item 12 kind, saved person edits, and the iframe isolation boundary in the real app.
import { OBJECT_KINDS } from '@aegis/domain/objects';
import { THEME_KEYS } from '@aegis/protocol/sandbox';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { galleryArtwork, genuiSamples } from '../host/genui-fixtures.ts';
import { out } from './out.ts';
import { chromium } from './playwright.ts';
import { verifySandboxLifecycle } from './sandbox-lifecycle.ts';
let failurePage: Page | undefined;
type Probe = Awaited<ReturnType<Window['__checkProbe']>> & {
    origin: string;
};
type Height = Awaited<ReturnType<Window['__checkHeight']>> & {
    origin: string;
    ownFrame: boolean;
    expandedFrame: boolean;
};
declare global {
    interface Window {
        __genuiReports: Probe[];
        __genuiHeights: Height[];
        __genuiViolations: {
            directive: string;
            blocked: string;
        }[];
        __genuiPrivate: string;
        __genuiParentInlineRan?: boolean;
        __genuiInjectedInlineRan?: boolean;
        __widgetFrames: {
            frame: HTMLIFrameElement;
            src: string;
            loads: number;
        }[];
        aegisState?: unknown;
    }
}
function present<T>(value: T | null | undefined): T {
    if (value === undefined || value === null)
        throw new Error('Missing expected test value');
    return value;
}
const offset = Number(process.env.AEGIS_PORT_OFFSET || 0), vitePort = 5194 + offset;
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), token = 'genui-' + process.pid;
const stamp = Date.now();
let host: ChildProcess | undefined, vite: import("vite").ViteDevServer | undefined, browser: Browser | undefined, page: Page;
const errors: string[] = [], logs: string[] = [];
function ready(child: ChildProcess, pattern: RegExp) {
    return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server did not start')), 20000);
        present(child.stdout).on('data', d => {
            const match = pattern.exec(String(d));
            if (match?.[1]) {
                clearTimeout(timer);
                resolve(match[1]);
            }
        });
        child.on('exit', code => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
        present(child.stderr).on('data', d => logs.push(String(d)));
    });
}
try {
    host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: checkTemp(join(tmpdir(), 'aegis-genui-ui-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
    const port = await ready(host, /"port":(\d+)/);
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    failurePage = page;
    await installBrowserChecks(page);
    // Apply exactly the packaged app's policy before any document scripts run.
    const security = z.object({ app: z.object({ security: z.object({ dangerousDisableAssetCspModification: z.boolean().optional(), csp: z.string() }) }) }).parse(JSON.parse(readFileSync(repo + '/src-tauri/tauri.conf.json', 'utf8'))).app.security;
    assert.equal(security.dangerousDisableAssetCspModification, undefined, 'keep Tauri CSP hash insertion enabled');
    assert.equal(security.csp.split(';').map(s => s.trim()).find(s => s.startsWith('script-src ')), "script-src 'self'");
    assert.equal(security.csp.split(';').map(s => s.trim()).find(s => s.startsWith('frame-src ')), 'frame-src http://127.0.0.1:* https://open.spotify.com');
    vite = await createServer({
        root: repo + '/app', configFile: repo + '/app/vite.config.ts',
        server: { port: vitePort, strictPort: true, host: '127.0.0.1', fs: { allow: [repo + '/app', realpathSync(repo + '/app/node_modules')] } },
        plugins: [{
                name: 'item-12-parent-csp-check',
                enforce: 'pre',
                configureServer(server) {
                    if (process.env.AEGIS_BROWSER_BUILD !== 'production')
                        return;
                    // Serve the policy over the real loopback connection. Intercepting the
                    // navigation with route.fulfill loses Chromium's local address space.
                    server.middlewares.use((request, response, next) => {
                        if (new URL(request.url || '/', 'http://localhost').pathname !== '/')
                            return next();
                        const html = readFileSync(repo + '/app/dist/index.html', 'utf8');
                        response.setHeader('Content-Type', 'text/html');
                        response.setHeader('X-Aegis-Build', 'react:production');
                        response.end(html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${security.csp}"><script>window.__genuiParentInlineRan = true</script>`));
                    });
                },
                transformIndexHtml: {
                    order: 'post',
                    handler: html => html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${security.csp}"><script>window.__genuiParentInlineRan = true</script>`),
                },
            }],
    });
    await present(vite).listen();
    const unknown = await fetch(`http://127.0.0.1:${port}/sandbox/${'0'.repeat(64)}`);
    assert.equal(unknown.status, 404, 'unknown sandbox IDs return 404 without a bearer token');
    const anonymousPost = await fetch(`http://127.0.0.1:${port}/sandbox`, { method: 'POST', body: '{}' });
    assert.equal(anonymousPost.status, 401, 'registering source requires the bearer token');
    page.on('pageerror', e => { errors.push(e.message); process.stderr.write(formatCheckOutput('genui page error:', e.stack) + '\n'); });
    page.on('console', message => {
        if (message.type() === 'error')
            logs.push(message.text());
    });
    await page.addInitScript(() => {
        function optionalDom<T extends Element>(value: Element | null | undefined, kind: {
            new (): T;
        }): T | null { if (value == null)
            return null; if (!(value instanceof kind))
            throw new Error('Unexpected DOM element type'); return value; }
        if (window.top !== window)
            return;
        localStorage.setItem('aegis:onboarded', '1');
        window.__genuiReports = [];
        window.__genuiHeights = [];
        window.__genuiViolations = [];
        addEventListener('securitypolicyviolation', event => window.__genuiViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI }));
        window.__genuiPrivate = 'Only the app may read this';
        addEventListener('message', async (event: MessageEvent<unknown>) => {
            if (event.data && typeof event.data === 'object' && 'type' in event.data && event.data.type === 'aegis:html-height')
                window.__genuiHeights.push({ ...await globalThis.window.__checkHeight(event.data), origin: event.origin, ownFrame: event.source === optionalDom(document.querySelector('.card.kind-html iframe'), HTMLIFrameElement)?.contentWindow, expandedFrame: event.source === optionalDom(document.querySelector('.side-editor iframe'), HTMLIFrameElement)?.contentWindow });
            if (event.data && typeof event.data === 'object' && 'type' in event.data && event.data.type === 'genui:probe')
                window.__genuiReports.push({ ...await globalThis.window.__checkProbe(event.data), origin: event.origin });
        });
    });
    await page.goto(`http://127.0.0.1:${vitePort}/?port=${port}&token=${token}`);
    await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board, null, { timeout: 15000 });
    assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), security.csp);
    await page.evaluate(() => {
        const script = document.createElement('script');
        script.textContent = 'window.__genuiInjectedInlineRan = true';
        document.head.append(script);
    });
    await page.waitForFunction(() => window.__genuiViolations.some(v => v.directive === 'script-src-elem' && v.blocked === 'inline'));
    assert.equal(await page.evaluate(() => window.__genuiParentInlineRan), undefined, 'parser-inserted parent inline script is blocked');
    assert.equal(await page.evaluate(() => window.__genuiInjectedInlineRan), undefined, 'injected parent inline script is blocked');
    process.stdout.write(formatCheckOutput('pass genui: exact Tauri CSP blocks parent inline scripts; anonymous registration denied; unknown sandbox is 404') + '\n');
    const boardId = await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.id;
    });
    const samples = structuredClone(genuiSamples);
    // PM6.7: the same original artwork at a dense size exercises both pan axes at 100%.
    const denseArtwork = galleryArtwork.map(svg => svg.replace(/<svg\b[^>]*>/, root => root.replace(/\s(?:width|height)="[^"]*"/g, '').replace('<svg', '<svg width="1800" height="1350"')));
    const assets = await page.evaluate(async (artwork) => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return Promise.all(artwork.map((svg, i) => aegis.host.upload(new File([svg], `study-${i}.svg`, { type: 'image/svg+xml' }))));
    }, denseArtwork);
    samples.gallery.images.forEach((image, i) => image.url = present(assets[i]).url);
    const batch = Object.entries(samples).map(([kind, data], i) => ({ op: 'create', type: 'object', kind, text: `Sample ${kind}`, data, x: i % 3 * 820, y: Math.floor(i / 3) * 560 }));
    const agent = await page.evaluate(([boardId, batch]) => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.host.post('/agents', { boardId, brief: 'FAKE ' + JSON.stringify(batch), model: { provider: 'fake', modelId: 'fake' } }).then(globalThis.window.__checkAgentReceipts);
    }, [boardId, batch]);
    assert.ok(agent[0]?.id, JSON.stringify(agent));
    await page.waitForFunction(count => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.cards.filter(c => c.type === 'object').length === count;
    }, batch.length, { timeout: 20000 });
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.fit();
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: out(`genui-overview-${stamp}.png`) });
    const frame = async (kind: string) => {
        const sampleId = await page.evaluate(kind => {
            function present<T>(value: T | null | undefined): T {
                if (value === undefined || value === null)
                    throw new Error('Missing expected test value');
                return value;
            }
            const aegis = globalThis.window.aegis;
            if (!aegis)
                throw new Error('Missing test facade');
            return aegis.canvas.board.cards.find(c => c.kind === kind && c.text === `Sample ${kind}`)?.id ?? present(aegis.canvas.board.cards.find(c => c.kind === kind)).id;
        }, kind);
        // An editor that just closed glides the camera home; let that finish so it cannot carry the view away from this frame.
        await page.waitForFunction(() => {
            const aegis = globalThis.window.aegis;
            if (!aegis)
                throw new Error('Missing test facade');
            return !document.querySelector('.side-editor') && new Promise<boolean>(done => { const a = JSON.stringify(aegis.canvas.view); setTimeout(() => done(a === JSON.stringify(aegis.canvas.view)), 300); });
        }, null, { polling: 100 });
        await page.evaluate(id => {
            const aegis = globalThis.window.aegis;
            if (!aegis)
                throw new Error('Missing test facade');
            return aegis.canvas.frameIds([id], 1);
        }, sampleId);
        await page.locator(`.card[data-id="${sampleId}"] :is(.object, .plot-card, .sheet-card)`).waitFor({ state: 'visible' });
        // Editor close glides the camera back; wait until the view stops moving before pointing at the card.
        await page.waitForFunction(() => {
            const aegis = globalThis.window.aegis;
            if (!aegis)
                throw new Error('Missing test facade');
            return new Promise<boolean>(done => { const a = JSON.stringify(aegis.canvas.view); requestAnimationFrame(() => requestAnimationFrame(() => done(a === JSON.stringify(aegis.canvas.view)))); });
        });
        // Select the real title after a revised widget has mounted.
        await page.waitForFunction(id => { const c = document.querySelector(`#world > .card[data-id="${id}"]`); return c && c.querySelector('.win-strip :is(h3, .win-name)') && c.getBoundingClientRect().width > 0; }, sampleId);
        const title = page.locator(`.card[data-id="${sampleId}"] .win-strip :is(h3, .win-name)`);
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await title.click({ timeout: 5000 });
                break;
            }
            catch (error) {
                if (attempt === 2)
                    throw error;
            }
        }
        await page.waitForTimeout(500);
        return page.locator(`.card[data-id="${sampleId}"]`);
    };
    const contentText: Record<string, string | undefined> = {
        stats: 'Tasks completed', timeline: 'Agree on the brief', kanban: 'Write the brief',
        table: samples.table.note, progress: 'Read the source material', compare: samples.compare.verdict,
        gallery: present(samples.gallery.images[0]).caption, stages: 'One clear question', callout: samples.callout.text,
        form: samples.form.description, reply: 'A readable result', plot: 'Sample observations',
        diagram: 'Choose the question', plan: 'Read the evidence', list: 'Check the result', code: 'const answer = 42;', sheet: 'Monday',
    };
    const checkedOpen = new Set();
    const assertOpen = async (kind: string, card: Locator, width = 1440) => {
        if (!await card.locator('.win-open').count()) {
            assert.equal(await card.getByRole('button', { name: /^Open(?: |$)/ }).count(), 0, `${kind} has no Open affordance`);
            checkedOpen.add(kind);
            return;
        }
        await card.locator('.win-strip').hover();
        const open = page.locator('.window-actions').getByRole('button', { name: ['plot', 'sheet'].includes(kind) ? 'Open' : `Open Sample ${kind}`, exact: true });
        await open.click();
        const editor = page.locator('.side-editor.is-open');
        await editor.waitFor({ state: 'visible', timeout: 3000 });
        assert.equal(await editor.locator('.side-editor-name').textContent(), `Sample ${kind}`);
        assert.equal(await editor.evaluate(el => el.contains(document.activeElement)), true, `${kind} Open focuses its expanded view`);
        const content = editor.locator(kind === 'sheet' ? '.sheet-scroll' : kind === 'plot' ? '.plot-scroll' : `.object.${kind} .content`);
        assert.ok(await content.isVisible(), `${kind} expanded content is visible`);
        assert.equal(await content.evaluate(el => el === document.activeElement), true, `${kind} focuses its scrollable content`);
        assert.equal(await editor.locator('.win-open').count(), 0, 'the expanded view has no nested Open button');
        if (kind === 'html') {
            const sandbox = editor.locator('iframe');
            assert.equal(await sandbox.getAttribute('sandbox'), 'allow-scripts');
            assert.equal(await sandbox.getAttribute('srcdoc'), null);
            await page.frameLocator('.side-editor iframe').locator('#minutes').waitFor();
            assert.match(present(await sandbox.getAttribute('src')), /^http:\/\/127\.0\.0\.1:\d+\/sandbox\/[a-f0-9]{64}$/);
        }
        else
            assert.ok(present((await content.textContent())).includes(present(contentText[kind])), `${kind} expanded view contains its content`);
        await page.waitForFunction(() => {
            function present<T>(value: T | null | undefined): T {
                if (value === undefined || value === null)
                    throw new Error('Missing expected test value');
                return value;
            }
            const box = present(document.querySelector('.side-editor.is-open')).getBoundingClientRect();
            return box.left >= 0 && box.right <= innerWidth;
        });
        await page.screenshot({ path: out(`genui-open-${kind}-${width}-${stamp}.png`) });
        if (width === 390 && kind === 'table') {
            const scroll = editor.locator('.table-scroll'), viewport = editor.locator('.table-viewport');
            assert.ok(await scroll.evaluate(el => el.scrollWidth > el.clientWidth), 'narrow table retains horizontal scrolling');
            assert.equal(await viewport.evaluate(el => getComputedStyle(el, '::after').opacity), '1', 'right-edge fade reveals more columns');
            await page.screenshot({ path: out(`r4-table-overflow-start-${stamp}.png`) });
            await scroll.hover();
            await page.mouse.wheel(800, 0);
            await page.waitForFunction(() => {
                function present<T>(value: T | null | undefined): T {
                    if (value === undefined || value === null)
                        throw new Error('Missing expected test value');
                    return value;
                }
                const el = document.querySelector('.side-editor .object.expanded .table-scroll');
                return present(el).scrollWidth - present(el).clientWidth - present(el).scrollLeft <= 1;
            });
            assert.equal(await viewport.evaluate(el => getComputedStyle(el, '::after').opacity), '0', 'fade disappears at the last column after real horizontal wheel input');
            await page.screenshot({ path: out(`r4-table-overflow-end-${stamp}.png`) });
            await page.mouse.wheel(-800, 0);
            await page.waitForFunction(() => {
                function present<T>(value: T | null | undefined): T {
                    if (value === undefined || value === null)
                        throw new Error('Missing expected test value');
                    return value;
                }
                return present(document.querySelector('.side-editor .object.expanded .table-scroll')).scrollLeft === 0;
            });
            assert.equal(await viewport.evaluate(el => getComputedStyle(el, '::after').opacity), '1', 'fade returns when scrolling back');
        }
        await page.keyboard.press('Escape');
        if (kind === 'html')
            await editor.waitFor({ state: 'detached', timeout: 2000 });
        assert.equal(await editor.count(), 0, kind === 'html' ? 'Escape removes the editor after sandbox acknowledgement' : 'Escape removes the editor immediately');
        // Focus returns to the invoking Open action for this window (or the window itself if the action is gone).
        await page.waitForFunction(kind => { function optionalDom<T extends Element>(value: Element | null | undefined, kind: {
            new (): T;
        }): T | null { if (value == null)
            return null; if (!(value instanceof kind))
            throw new Error('Unexpected DOM element type'); return value; } const a = document.activeElement; const id = optionalDom(a, HTMLElement)?.dataset.windowAction; const owner = a?.closest('#selectionBar') ? document.querySelector('.card.selected') : id ? document.querySelector(`.card[data-id="${id}"]`) : a?.closest('.card'); return owner?.classList.contains(`kind-${kind}`); }, kind);
        checkedOpen.add(kind);
    };
    for (const kind of Object.keys(samples)) {
        const card = await frame(kind);
        assert.ok(await card.locator('.genui').isVisible(), `${kind} renders`);
        assert.equal(await card.locator('.unknown').count(), 0);
        if (kind === 'stats')
            assert.equal(await card.getByLabel('Tasks completed', { exact: true }).evaluate(el => getComputedStyle(el).fontSize), '30px', 'editable stats retain the same hierarchy as read-only values');
        if (kind === 'progress') {
            assert.equal(await card.locator('input').count(), 0, 'resting goals have plain values');
            await card.getByRole('button', { name: 'Current: Read the source material', exact: true }).click();
            assert.ok(present((await card.locator('input').first().boundingBox())).width <= 110, 'goal input leaves room for its label');
            assert.equal(await card.locator('.goals .edit').count(), 0, 'current value has no duplicate editing row');
            await page.keyboard.press('Escape');
            await card.locator('.win-strip h3').click();
            assert.equal(await card.getByRole('button', { name: 'Current: Read the source material', exact: true }).evaluate(el => getComputedStyle(el).borderWidth), '0px', 'resting current value has no input frame');
        }
        if (kind === 'stats')
            assert.equal(await card.locator('input').count(), 0, 'resting stats have plain values');
        if (kind === 'gallery')
            assert.ok(await card.locator('img').evaluateAll(images => { function dom<T extends Element>(value: Element | null | undefined, kind: {
                new (): T;
            }): T { if (!(value instanceof kind))
                throw new Error('Unexpected DOM element type'); return value; } return images.every(img => dom(img, HTMLImageElement).complete && dom(img, HTMLImageElement).naturalWidth > 0); }), 'local gallery assets loaded');
        if (kind === 'form') {
            const radio = await card.getByRole('radio').first().boundingBox();
            assert.ok(radio && radio.width === 18 && radio.height === 18, 'radio keeps its compact shape');
        }
        if (kind === 'html') {
            assert.match(present(await card.locator('iframe').getAttribute('sandbox')), /^allow-scripts$/);
            assert.equal(await card.locator('iframe').getAttribute('srcdoc'), null);
            await page.waitForFunction(() => { function dom<T extends Element>(value: Element | null | undefined, kind: {
                new (): T;
            }): T { if (!(value instanceof kind))
                throw new Error('Unexpected DOM element type'); return value; } return /^http:\/\/127\.0\.0\.1:\d+\/sandbox\/[a-f0-9]{64}$/.test(dom(document.querySelector('.card.kind-html iframe'), HTMLIFrameElement)?.src); });
            await page.frameLocator('.card.kind-html iframe').locator('#minutes').waitFor();
        }
        await card.screenshot({ path: out(`genui-${kind}-1440-${stamp}.png`) });
        await assertOpen(kind, card);
    }
    await page.waitForFunction(() => window.__genuiHeights.some(r => r.origin === 'null' && r.ownFrame && r.height >= 80));
    process.stdout.write(formatCheckOutput('pass genui: all 11 kinds rendered; host sandbox runs and reports opaque-origin height under exact Tauri CSP') + '\n');
    await frame('kanban');
    await page.getByRole('button', { name: 'Drag Write the brief', exact: true }).dragTo(page.locator('.kanban .lane[aria-label="In progress"]'));
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'kanban')).data.cards[0]).column === 'doing';
    });
    const moveTrigger = page.getByRole('button', { name: 'Move Write the brief', exact: true });
    await page.mouse.move(1000, 800);
    assert.equal(await moveTrigger.evaluate(el => getComputedStyle(el).opacity), '0', 'ticket actions are quiet at rest');
    await page.getByRole('button', { name: 'Drag Write the brief', exact: true }).hover();
    assert.equal(await moveTrigger.evaluate(el => getComputedStyle(el).opacity), '1', 'pointer hover reveals the icon');
    assert.equal(present((await moveTrigger.boundingBox())).width, 44, 'Move retains a reachable target');
    await moveTrigger.focus();
    await page.keyboard.press('ArrowDown');
    const move = page.getByRole('menuitemradio', { name: 'Move Write the brief to Done', exact: true });
    assert.equal(await page.locator('.aegis-action-menu:not([hidden]) .aegis-menu-heading').textContent(), 'Write the brief');
    assert.deepEqual(await page.locator('.aegis-action-menu:not([hidden]) [role=menuitemradio]').allTextContents(), samples.kanban.columns.map(c => c.title), 'destinations have short visible labels and retain their full accessible names');
    await page.screenshot({ path: out(`r5-kanban-menu-${stamp}.png`) });
    await move.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'kanban')).data.cards[0]).column === 'done';
    });
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Move Write the brief' && document.activeElement.closest('.lane')?.getAttribute('aria-label') === 'Done');
    assert.equal(await moveTrigger.evaluate(el => el === document.activeElement), true, 'keyboard Move keeps focus on the ticket in its new lane');
    process.stdout.write(formatCheckOutput('pass genui: kanban drag and keyboard Move saved') + '\n');
    await frame('form');
    await page.getByLabel('Project name (required)', { exact: true }).fill('A useful result');
    await page.getByLabel('What needs to change?', { exact: true }).fill('Keep the source beside the answer.');
    await page.getByLabel('Hours available', { exact: true }).fill('6.5');
    await page.getByRole('radio', { name: 'Report', exact: true }).check();
    await page.getByLabel('Ready for a review', { exact: true }).check();
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const fields = present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'form')).data.fields;
        return present(fields[0]).value === 'A useful result' && present(fields[1]).value === 'Keep the source beside the answer.' && present(fields[2]).value === 6.5 && present(fields[3]).value === 'Report' && present(fields[4]).value === true;
    });
    await page.getByLabel('Hours available', { exact: true }).fill('');
    await page.getByLabel('What needs to change?', { exact: true }).focus();
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'form')).data.fields[2]).value === null;
    });
    const project = page.getByLabel('Project name (required)', { exact: true });
    await project.focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' today');
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');
    await page.waitForTimeout(150);
    assert.equal(await page.getByLabel('What needs to change?', { exact: true }).evaluate(el => el === document.activeElement), true, 'Tab focus survives saving the previous field');
    await project.fill('A useful result');
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'form')).data.fields[0]).value === 'A useful result';
    });
    process.stdout.write(formatCheckOutput('pass genui: text, textarea, number, choice, checkbox and clearing a number saved') + '\n');
    await frame('timeline');
    await page.getByLabel('Done: Agree on the brief', { exact: true }).check();
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'timeline')).data.events[0]).done === true;
    });
    await frame('progress');
    await page.getByRole('button', { name: 'Current: Read the source material', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Current: Read the source material', exact: true }).fill('7');
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'progress')).data.goals[0]).current === 7;
    });
    assert.equal(await page.getByRole('button', { name: 'Current: Draft the report', exact: true }).evaluate(el => el === document.activeElement), true, 'Tab commits and reaches the next current value');
    await page.keyboard.press('Enter');
    await page.getByRole('spinbutton', { name: 'Current: Draft the report', exact: true }).fill('99');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.card.kind-progress input').count(), 0, 'Escape restores plain progress values');
    assert.notEqual(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'progress')).data.goals[1]).current;
    }), 99, 'Escape cancels progress edits');
    await page.getByRole('button', { name: 'Current: Read the source material', exact: true }).click();
    const current = page.getByRole('spinbutton', { name: 'Current: Read the source material', exact: true });
    await current.fill('');
    await page.keyboard.press('Tab');
    assert.equal(await current.evaluate(el => { function dom<T extends Element>(value: Element | null | undefined, kind: {
        new (): T;
    }): T { if (!(value instanceof kind))
        throw new Error('Unexpected DOM element type'); return value; } return el === document.activeElement && !dom(el, HTMLInputElement).validity.valid; }), true, 'an empty current value stays active rather than saving invalid data');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'progress')).data.goals[0]).current;
    }), 7, 'cancelling an empty draft keeps the saved current value');
    await frame('stats');
    const stat = page.getByRole('button', { name: 'Tasks completed', exact: true });
    await stat.press('Enter');
    await page.getByRole('textbox', { name: 'Tasks completed', exact: true }).fill('20');
    await page.screenshot({ path: out(`r4-stats-active-${stamp}.png`) });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'stats')).data.tiles[0]).value === '20';
    });
    assert.equal(await stat.evaluate(el => el === document.activeElement && getComputedStyle(el).borderWidth === '0px'), true, 'Enter commits and returns to an unboxed stat');
    await stat.click();
    await page.getByRole('textbox', { name: 'Tasks completed', exact: true }).fill('Cancelled');
    await page.keyboard.press('Escape');
    assert.equal(await stat.textContent(), '20', 'Escape cancels a stat draft');
    await stat.click();
    await page.getByRole('textbox', { name: 'Tasks completed', exact: true }).fill('20');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.card.kind-stats input').count(), 0, 'Tab commits stats and removes the field');
    await frame('table');
    const grid = page.locator('.card.kind-table').getByRole('grid', { name: 'Data table' });
    assert.equal(await grid.locator('input').count(), 0, 'resting table has plain values, without input borders');
    assert.equal(await grid.getByRole('gridcell').evaluateAll(cells => cells.every(cell => cell.tabIndex === 0 && getComputedStyle(cell).boxShadow === 'none' && getComputedStyle(cell).borderBottomWidth === '1px')), true, 'cells stay focusable with thin row rules and no boxes');
    const tasksCell = grid.getByRole('gridcell', { name: 'Tasks, row 1', exact: true });
    assert.equal(await tasksCell.evaluate(cell => getComputedStyle(cell).textAlign), 'right');
    assert.match(await tasksCell.evaluate(cell => getComputedStyle(cell).fontVariantNumeric), /tabular-nums/);
    await tasksCell.click();
    const tasksInput = grid.getByRole('spinbutton', { name: 'Edit Tasks, row 1', exact: true });
    assert.equal(await tasksInput.evaluate(input => input === document.activeElement && getComputedStyle(input).borderWidth === '0px'), true, 'only the active cell has a frame, its input has no extra border');
    assert.equal(await grid.locator('input').count(), 1);
    await tasksInput.fill('12');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'table')).data.rows[0]).cells[1] === 12;
    });
    assert.equal(await grid.getByRole('gridcell', { name: 'Tasks, row 2', exact: true }).evaluate(cell => cell === document.activeElement), true, 'Enter commits and moves down');
    await tasksCell.focus();
    await page.keyboard.type('99');
    assert.equal(await tasksInput.inputValue(), '99', 'typing on a focused cell starts a replacement edit');
    await page.keyboard.press('Escape');
    assert.equal(await grid.locator('input').count(), 0);
    assert.equal(await tasksCell.locator('.cell-value').textContent(), '12', 'Escape cancels the draft');
    assert.equal(await tasksCell.evaluate(cell => cell === document.activeElement), true);
    await tasksCell.press('Enter');
    await tasksInput.fill('12');
    await page.keyboard.press('Tab');
    assert.equal(await grid.getByRole('gridcell', { name: 'Week trend, row 1', exact: true }).evaluate(cell => cell === document.activeElement), true, 'Tab commits and moves right, including read-only cells');
    await grid.getByRole('gridcell', { name: 'Day, row 2', exact: true }).click();
    await grid.getByRole('textbox', { name: 'Edit Day, row 2', exact: true }).fill('Tuesday saved on blur');
    await grid.getByRole('gridcell', { name: 'Day, row 3', exact: true }).focus();
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'table')).data.rows[1]).cells[0] === 'Tuesday saved on blur';
    });
    await page.screenshot({ path: out(`genui-table-quiet-${stamp}.png`) });
    process.stdout.write(formatCheckOutput('pass genui: quiet focusable table cells; click, Enter and typing edit; Escape cancels; Enter, Tab and blur commit with keyboard movement') + '\n');
    await frame('stages');
    const stageTrigger = page.getByRole('button', { name: 'Set status for Brief', exact: true });
    await stageTrigger.focus();
    assert.equal(await stageTrigger.evaluate(el => getComputedStyle(el).opacity), '1', 'keyboard focus reveals the status icon');
    await stageTrigger.press('ArrowDown');
    await page.keyboard.press('Escape');
    assert.equal(await stageTrigger.evaluate(el => el === document.activeElement), true, 'menu Escape restores the status trigger');
    await stageTrigger.click();
    await page.waitForTimeout(180);
    assert.equal(await page.locator('.aegis-action-menu:not([hidden]) .aegis-menu-heading').textContent(), 'Brief');
    assert.deepEqual(await page.locator('.aegis-action-menu:not([hidden]) [role=menuitemradio]').allTextContents(), ['Pending', 'In progress', 'Done', 'Blocked'], 'one stage heading replaces repeated stage names');
    await page.screenshot({ path: out(`r5-stages-menu-${stamp}.png`) });
    await page.screenshot({ path: out(`r4-stages-menu-${stamp}.png`) });
    await page.getByRole('menuitemradio', { name: 'Brief: Blocked', exact: true }).click();
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'stages')).data.steps[0]).status === 'blocked';
    });
    process.stdout.write(formatCheckOutput('pass genui: timeline ticks, stats, table, progress and stage values saved') + '\n');
    const openEditor = async (kind: string, keyboard = false) => {
        const card = await frame(kind);
        await card.locator('.win-strip').hover();
        const open = page.locator('.window-actions').getByRole('button', { name: `Open Sample ${kind}`, exact: true });
        if (keyboard)
            await open.press('Enter');
        else
            await open.click();
        const editor = page.locator('.side-editor.is-open:has(.object.expanded)');
        await editor.waitFor({ state: 'visible' });
        assert.equal(await editor.evaluate(el => el.contains(document.activeElement)), true);
        await page.waitForFunction(() => {
            function present<T>(value: T | null | undefined): T {
                if (value === undefined || value === null)
                    throw new Error('Missing expected test value');
                return value;
            }
            return present(document.querySelector('.side-editor.is-open')).getBoundingClientRect().right <= innerWidth;
        });
        return { editor, open };
    };
    // PM5 8: use actual activation and key events in the fitted gallery inspector.
    const galleryEditor = await openEditor('gallery');
    const artwork = galleryEditor.editor.getByRole('button', { name: `Inspect ${present(samples.gallery.images[0]).alt}`, exact: true });
    await artwork.click();
    const inspection = galleryEditor.editor.getByRole('dialog', { name: 'Image inspection' });
    await inspection.waitFor();
    assert.equal(await inspection.evaluate(el => getComputedStyle(el).animationDuration), '0.2s');
    assert.equal(await inspection.locator('img').evaluate(el => getComputedStyle(el).objectFit), 'contain');
    assert.equal(await inspection.locator('figcaption').textContent(), present(samples.gallery.images[0]).caption);
    assert.equal(await inspection.getByRole('button', { name: 'Close image inspection' }).evaluate(el => el === document.activeElement), true);
    await page.waitForTimeout(220);
    const fitted = await inspection.boundingBox(), pane = await galleryEditor.editor.locator(':is(.side-editor-body, .react-editor-content)').boundingBox();
    assert.ok(Math.abs(present(fitted).x - present(pane).x) < 1 && Math.abs(present(fitted).y - present(pane).y) < 1 && Math.abs(present(fitted).width - present(pane).width) < 1 && Math.abs(present(fitted).height - present(pane).height) < 1, 'inspection fills only the editor pane');
    await page.screenshot({ path: out(`r6-gallery-inspection-1440-${stamp}.png`) });
    await page.keyboard.press('ArrowRight');
    assert.equal(await inspection.locator('figcaption').textContent(), present(samples.gallery.images[1]).caption);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await inspection.locator('figcaption').textContent(), present(samples.gallery.images[0]).caption);
    await page.keyboard.press('Tab');
    assert.equal(await inspection.getByRole('button', { name: 'Magnify image' }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await inspection.getByRole('button', { name: 'Previous image' }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await inspection.count(), 0);
    assert.equal(await artwork.evaluate(el => el === document.activeElement), true, 'Escape returns to the image without closing Open');
    await page.keyboard.press('Enter');
    await inspection.waitFor();
    assert.equal(await inspection.evaluate(el => getComputedStyle(el).animationName), 'none', 'keyboard activation is instant');
    await inspection.getByRole('button', { name: 'Next image' }).click();
    assert.equal(await inspection.locator('figcaption').textContent(), present(samples.gallery.images[1]).caption);
    await inspection.getByRole('button', { name: 'Close image inspection' }).click();
    await inspection.waitFor({ state: 'detached' });
    assert.equal(await artwork.evaluate(el => el === document.activeElement), true, 'pointer close restores focus');
    for (const mode of ['os', 'app'] as const) {
        if (mode === 'os')
            await page.emulateMedia({ reducedMotion: 'reduce' });
        else
            await page.evaluate(() => document.body.classList.add('motion-off'));
        await artwork.click();
        await inspection.waitFor();
        assert.equal(await inspection.evaluate(el => getComputedStyle(el).animationName), 'none', `${mode} motion preference suppresses scale and fade`);
        await inspection.getByRole('button', { name: 'Magnify image' }).click();
        assert.equal(await inspection.locator('img').evaluate(el => { function dom<T extends Element>(value: Element | null | undefined, kind: {
            new (): T;
        }): T { if (!(value instanceof kind))
            throw new Error('Unexpected DOM element type'); return value; } return el.getBoundingClientRect().width === dom(el, HTMLImageElement).naturalWidth && el.getAnimations().length === 0 && getComputedStyle(el).transitionDuration === '0s'; }), true, `${mode}: magnification has no travel or scale animation`);
        await page.keyboard.press('0');
        await inspection.getByRole('button', { name: 'Close image inspection' }).click();
        await inspection.waitFor({ state: 'detached' });
        if (mode === 'os')
            await page.emulateMedia({ reducedMotion: 'no-preference' });
        else
            await page.evaluate(() => document.body.classList.remove('motion-off'));
    }
    for (const width of [1440, 1586, 390] as const) {
        await page.setViewportSize({ width, height: 992 });
        await artwork.click();
        await page.waitForTimeout(220);
        const imageBox = await inspection.locator('img').boundingBox(), overlayBox = await inspection.boundingBox();
        assert.ok(present(imageBox).x >= present(overlayBox).x && present(imageBox).x + present(imageBox).width <= present(overlayBox).x + present(overlayBox).width + 1 && present(imageBox).y + present(imageBox).height <= present(overlayBox).y + present(overlayBox).height, `image fits at ${width}px`);
        await page.screenshot({ path: out(`r6-gallery-inspection-${width}-${stamp}.png`) });
        const magnify = inspection.getByRole('button', { name: 'Magnify image' });
        const viewport = inspection.getByRole('region', { name: 'Image viewport' });
        await magnify.click();
        assert.equal(await magnify.getAttribute('aria-pressed'), 'true');
        assert.equal(await magnify.textContent(), 'Fit');
        assert.equal(await inspection.locator('img').evaluate(el => { function dom<T extends Element>(value: Element | null | undefined, kind: {
            new (): T;
        }): T { if (!(value instanceof kind))
            throw new Error('Unexpected DOM element type'); return value; } return el.getBoundingClientRect().width === dom(el, HTMLImageElement).naturalWidth && el.getBoundingClientRect().height === dom(el, HTMLImageElement).naturalHeight; }), true, '100% uses intrinsic pixels');
        const start = await viewport.evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }));
        assert.ok(start.left > 0 && start.top > 0, 'magnification starts centred with both axes pannable');
        const bounds = await viewport.boundingBox();
        await page.mouse.move(present(bounds).x + present(bounds).width / 2, present(bounds).y + present(bounds).height / 2);
        await page.mouse.wheel(85, 110);
        await page.waitForFunction(({ left, top }) => {
            function present<T>(value: T | null | undefined): T {
                if (value === undefined || value === null)
                    throw new Error('Missing expected test value');
                return value;
            }
            const el = document.querySelector('.inspection-viewport');
            return present(el).scrollLeft > left + 40 && present(el).scrollTop > top + 60;
        }, start);
        const scrolled = await viewport.evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }));
        await page.mouse.down();
        await page.mouse.move(present(bounds).x + present(bounds).width / 2 + 50, present(bounds).y + present(bounds).height / 2 + 65, { steps: 5 });
        await page.mouse.up();
        const dragged = await viewport.evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }));
        assert.ok(Math.abs(dragged.left - (scrolled.left - 50)) <= 1 && Math.abs(dragged.top - (scrolled.top - 65)) <= 1, 'pointer drag pans one to one');
        await page.screenshot({ path: out(`r7-gallery-magnified-${width}-${stamp}.png`) });
        await page.keyboard.press('-');
        assert.equal(await magnify.getAttribute('aria-pressed'), 'false');
        assert.equal(await viewport.evaluate(el => el.scrollLeft === 0 && el.scrollTop === 0), true);
        await page.keyboard.press('+');
        assert.equal(await magnify.getAttribute('aria-pressed'), 'true');
        await page.keyboard.press('Tab');
        assert.equal(await viewport.evaluate(el => el === document.activeElement), true, 'keyboard can reach the magnified viewport');
        await page.keyboard.press('0');
        assert.equal(await magnify.getAttribute('aria-pressed'), 'false');
        await page.keyboard.press('+');
        await page.keyboard.press('ArrowRight');
        assert.equal(await magnify.getAttribute('aria-pressed'), 'false', 'next image returns to fit');
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 1000 });
    process.stdout.write(formatCheckOutput('pass genui: gallery click/Enter inspection fills editor pane, fitted image/caption, arrows, focus return, 200ms pointer motion and both reduced-motion settings') + '\n');
    process.stdout.write(formatCheckOutput('pass genui: PM6 gallery 100% toggle, centred intrinsic pixels, real wheel and drag pan, + / - / 0, focus trap and motion preferences at 1440, 1586 and 390px') + '\n');
    // PM5 9: every read-only generated text route keeps its resting presentation.
    const revisions = [
        ['callout', 'Callout text', ['text'], 'Keep the original evidence beside the revised answer.', true],
        ['compare', 'Verdict', ['verdict'], 'Use the report for the evidence and the board for questions.', true],
        ['timeline', 'Event 1 title', ['events', 0, 'title'], 'Agree on one useful question', false],
        ['stages', 'Stage 1 detail', ['steps', 0, 'detail'], 'One clear question, agreed together', true],
        ['stats', 'Stat 2 value', ['tiles', 1, 'value'], '26', false],
        ['progress', 'Goal 1 label', ['goals', 0, 'label'], 'Read the evidence first', false],
        ['table', 'Table note', ['note'], 'Demo data, reviewed together.', true],
        ['kanban', 'Card detail: Write the brief', ['cards', 0, 'detail'], 'One question, checked against the evidence.', true],
        ['gallery', 'Image 1 caption', ['images', 0, 'caption'], 'An original chart, ready to inspect.', true],
        ['form', 'Form description', ['description'], 'Capture the next useful step.', true],
    ] as const;
    for (const [kind, label, path, next, multiline] of revisions) {
        const view = await openEditor(kind);
        const toggle = view.editor.getByRole('button', { name: 'Edit text', exact: true });
        assert.equal(await view.editor.getByRole('button', { name: label, exact: true }).count(), 0, `${kind}: resting text is plain`);
        await toggle.click();
        const trigger = view.editor.getByRole('button', { name: label, exact: true });
        assert.equal(await trigger.evaluate(el => getComputedStyle(el).borderWidth), '0px');
        await trigger.click();
        const field = view.editor.getByRole('textbox', { name: label, exact: true });
        const hint = view.editor.locator('.text-edit-hint:visible');
        const guidance = `Return to save · ${multiline ? 'Shift Return for a new line · ' : ''}Esc to cancel`;
        assert.equal(await hint.count(), 1, 'only the active text field has guidance');
        assert.equal(await hint.textContent(), guidance);
        assert.equal(await field.getAttribute('aria-description'), guidance);
        const original = await field.inputValue();
        await field.fill('Cancelled wording');
        await page.keyboard.press('Escape');
        assert.equal(await view.editor.isVisible(), true);
        assert.equal(await trigger.textContent(), original);
        assert.deepEqual(errors, [], `${kind}: cancelling text must not cause a render or focus error`);
        assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
        assert.equal(await hint.count(), 0, 'Escape hides the guidance');
        await page.keyboard.press('Enter');
        await field.fill(present(next));
        if (multiline) {
            await page.keyboard.press('Shift+Enter');
            await page.keyboard.type('A second line.');
        }
        if (['callout', 'compare', 'timeline', 'stages'].includes(present(kind)))
            await page.screenshot({ path: out(`r6-edit-text-${kind}-active-${stamp}.png`) });
        if (kind === 'callout') {
            for (const width of [1586, 390] as const) {
                await page.setViewportSize({ width, height: 992 });
                const box = await hint.boundingBox();
                assert.ok(present(box).x >= 0 && present(box).x + present(box).width <= width, `${width}px guidance wraps within the editor`);
                await page.screenshot({ path: out(`r7-text-hint-${width}-${stamp}.png`) });
            }
            await page.setViewportSize({ width: 1440, height: 1000 });
        }
        await page.keyboard.press('Enter');
        assert.equal(await hint.count(), 0, 'Return hides the guidance after saving');
        const committed = multiline ? next + '\nA second line.' : next;
        await page.waitForFunction(async ({ kind, path, value }) => {
            function present<T>(value: T | null | undefined): T {
                if (value === undefined || value === null)
                    throw new Error('Missing expected test value');
                return value;
            }
            const aegis = globalThis.window.aegis;
            if (!aegis)
                throw new Error('Missing test facade');
            const board = await aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard);
            return present(path).reduce<unknown>((data, key) => data !== null && typeof data === 'object' ? Reflect.get(data, key) : undefined, present(board.cards.find(c => c.kind === kind)).data) === value;
        }, { kind, path, value: committed });
        await page.keyboard.press('Enter');
        await field.fill(present(next));
        await view.editor.getByRole('button', { name: 'Done editing', exact: true }).click();
        await page.waitForFunction(async ({ kind, path, value }) => {
            function present<T>(value: T | null | undefined): T {
                if (value === undefined || value === null)
                    throw new Error('Missing expected test value');
                return value;
            }
            const aegis = globalThis.window.aegis;
            if (!aegis)
                throw new Error('Missing test facade');
            const board = await aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard);
            return present(path).reduce<unknown>((data, key) => data !== null && typeof data === 'object' ? Reflect.get(data, key) : undefined, present(board.cards.find(c => c.kind === kind)).data) === value;
        }, { kind, path, value: next });
        assert.equal(await view.editor.getByRole('button', { name: label, exact: true }).count(), 0, 'Done editing restores plain text after blur commit');
        if (['callout', 'compare', 'timeline', 'stages'].includes(present(kind)))
            await page.screenshot({ path: out(`r6-edit-text-${kind}-${stamp}.png`) });
        // Restore this fixture so the existing reload and value assertions stay intact.
        await view.editor.getByRole('button', { name: 'Edit text', exact: true }).click();
        await trigger.click();
        await field.fill(original);
        await page.keyboard.press('Enter');
        await view.editor.getByRole('button', { name: 'Done editing', exact: true }).click();
        await page.keyboard.press('Escape');
    }
    process.stdout.write(formatCheckOutput('pass genui: 10 generated text kinds use quiet Edit text, pointer/Enter activation, Escape cancellation, Enter/blur object_set persistence and plain resting text') + '\n');
    // PM5 10: commit reassurance sits beside the field until the first change saves.
    const formGuidance = await openEditor('form');
    const projectField = formGuidance.editor.getByLabel('Project name (required)', { exact: true });
    await projectField.click();
    const activeHint = formGuidance.editor.locator('[data-field-index="0"] .commit-hint');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return getComputedStyle(present(document.querySelector('.side-editor .object.expanded [data-field-index="0"] .commit-hint'))).opacity === '1';
    });
    assert.equal(await activeHint.textContent(), 'Saves when you leave the field');
    assert.ok(present((await projectField.getAttribute('aria-describedby'))).includes(present(await activeHint.getAttribute('id'))), 'the active control describes its commit boundary');
    await page.keyboard.press('Tab');
    assert.equal(await formGuidance.editor.locator('[data-field-index="1"] .commit-hint').getAttribute('aria-hidden'), 'false', 'guidance follows keyboard focus before the first commit');
    await projectField.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' with guidance');
    await page.waitForTimeout(220);
    await page.screenshot({ path: out(`r6-form-active-hint-${stamp}.png`) });
    for (const width of [1586, 390] as const) {
        await page.setViewportSize({ width, height: 992 });
        await page.screenshot({ path: out(`r6-form-active-hint-${width}-${stamp}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.keyboard.press('Tab');
    await page.waitForFunction(async () => {
        function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
            throw new Error('Missing expected test value'); return value; }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return (await globalThis.window.__checkString(present(present((await aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard)).cards.find(c => c.type === 'object' && c.kind === 'form')).data.fields[0])?.value)).endsWith(' with guidance');
    });
    await page.waitForFunction(() => [...document.querySelectorAll('.side-editor .object.expanded .commit-hint')].every(el => getComputedStyle(el).opacity === '0'));
    await projectField.click();
    assert.equal(await activeHint.getAttribute('aria-hidden'), 'true', 'guidance stays quiet after the first commit');
    await projectField.fill('A useful result');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    process.stdout.write(formatCheckOutput('pass genui: active form hint follows pointer and Tab focus, describes the field and fades after the first host-saved commit') + '\n');
    const statEditor = await openEditor('stats', true);
    await statEditor.editor.getByRole('button', { name: 'Tasks completed', exact: true }).press('Enter');
    await statEditor.editor.getByRole('textbox', { name: 'Tasks completed', exact: true }).fill('Cancelled expanded draft');
    await page.keyboard.press('Escape');
    assert.equal(await statEditor.editor.isVisible(), true, 'first Escape cancels an inline draft without closing its editor');
    assert.equal(await statEditor.editor.getByRole('button', { name: 'Tasks completed', exact: true }).textContent(), '20');
    await page.keyboard.press('Escape');
    let expanded = await openEditor('table', true);
    assert.equal(await expanded.editor.evaluate(el => getComputedStyle(el).transitionDuration), '0s', 'keyboard opening is instant');
    const expandedDay = expanded.editor.getByRole('gridcell', { name: 'Day, row 1', exact: true });
    await expandedDay.press('Enter');
    await expanded.editor.getByRole('textbox', { name: 'Edit Day, row 1', exact: true }).fill('Cancelled draft');
    await page.keyboard.press('Escape');
    assert.equal(await expanded.editor.isVisible(), true, 'first Escape cancels the cell without closing the editor');
    assert.equal(await expandedDay.locator('.cell-value').textContent(), 'Monday');
    await expandedDay.press('Enter');
    await expanded.editor.getByRole('textbox', { name: 'Edit Day, row 1', exact: true }).fill('Monday review');
    // Keep both headers visible beside one another for the save-state evidence.
    await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const left = present(document.querySelector('.card.kind-table')).getBoundingClientRect().left;
        aegis.canvas.setView({ ...aegis.canvas.view, x: aegis.canvas.view.x + 40 - left });
    });
    await page.screenshot({ path: out(`genui-table-editing-${stamp}.png`) });
    // PM4 saving feedback: hold a real save response, then fail the next edit.
    await page.waitForFunction(() => (document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? document.querySelector('#saveState')?.textContent) === 'saved');
    const heldResponse = Promise.withResolvers<void>();
    const holdSave = async (route: import('playwright').Route) => { await heldResponse.promise; await route.continue(); };
    await page.route('**/boards/*/batch', holdSave);
    await page.keyboard.press('Enter');
    await expanded.editor.locator('[data-saved]').filter({ hasText: 'Saving…' }).waitFor();
    // While editing, reference summaries cover the canvas windows; their status still updates underneath.
    await page.locator('.card.kind-table [data-object-saved]').filter({ hasText: 'Saving…' }).waitFor({ state: 'attached' });
    await page.screenshot({ path: out(`r5-table-saving-${stamp}.png`) });
    heldResponse.resolve();
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return present(document.querySelector('.side-editor:has(.object.expanded) [data-saved]')).textContent === 'Saved';
    });
    await page.locator('.card.kind-table [data-object-saved]').filter({ hasText: /^\s*Saved\s*$/ }).waitFor({ state: 'attached' });
    await page.unroute('**/boards/*/batch', holdSave);
    await page.screenshot({ path: out(`r5-table-saved-${stamp}.png`) });
    // PM5: settled success recedes only on the canvas, after the host confirms it.
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('.card.kind-table [data-object-saved]').evaluate(el => getComputedStyle(el).opacity), '0', 'canvas Saved fades after 1.5 seconds');
    assert.equal(await expanded.editor.locator('[data-saved]').textContent(), 'Saved', 'the editor keeps its confirmation');
    await page.screenshot({ path: out(`r6-canvas-saved-faded-${stamp}.png`) });
    assert.equal(await expanded.editor.getByRole('gridcell', { name: 'Day, row 2', exact: true }).evaluate(cell => cell === document.activeElement), true);
    // Refuse saves before editing, so no earlier save can land the draft first.
    const refuseSave = (route: import('playwright').Route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Forced save failure' }) });
    await page.route('**/boards/*/batch', refuseSave);
    await expandedDay.press('Enter');
    await expanded.editor.getByRole('textbox', { name: 'Edit Day, row 1', exact: true }).fill('Retry table draft');
    await page.keyboard.press('Enter');
    await expanded.editor.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
    await page.locator('.card.kind-table button[aria-label="Retry save"]').waitFor({ state: 'attached' });
    assert.match(present(await expanded.editor.locator('[data-saved]').textContent()), /Not saved/);
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('.card.kind-table [data-object-saved]').evaluate(el => getComputedStyle(el).opacity), '1', 'failure stays visible beyond the success timeout');
    assert.equal(await page.locator('.card.kind-table button[aria-label="Retry save"]').count(), 1);
    await page.screenshot({ path: out(`r6-canvas-failure-persists-${stamp}.png`) });
    await page.screenshot({ path: out(`r5-table-retry-${stamp}.png`) });
    await page.unroute('**/boards/*/batch', refuseSave);
    await expanded.editor.getByRole('button', { name: 'Retry save', exact: true }).click();
    await page.waitForFunction(async () => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(document.querySelector('.side-editor:has(.object.expanded) [data-saved]')).textContent === 'Saved' && present(present((await aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard)).cards.find(c => c.type === 'object' && c.kind === 'table')).data.rows[0]).cells[0] === 'Retry table draft';
    });
    await expandedDay.press('Enter');
    await expanded.editor.getByRole('textbox', { name: 'Edit Day, row 1', exact: true }).fill('Monday review');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return present(document.querySelector('.side-editor:has(.object.expanded) [data-saved]')).textContent === 'Saved';
    });
    process.stdout.write(formatCheckOutput('pass genui: table shows Saving, host-confirmed Saved, failure Retry and successful recovery in Open and canvas headers') + '\n');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'table')).data.rows[0]).cells[0] === 'Monday review';
    });
    await page.waitForFunction(() => { function optionalDom<T extends Element>(value: Element | null | undefined, kind: {
        new (): T;
    }): T | null { if (value == null)
        return null; if (!(value instanceof kind))
        throw new Error('Unexpected DOM element type'); return value; } const a = document.activeElement, id = optionalDom(a, HTMLElement)?.dataset.windowAction; const owner = a?.closest('#selectionBar') ? document.querySelector('.card.selected') : id ? document.querySelector(`.card[data-id="${id}"]`) : a?.closest('.card'); return owner?.classList.contains('kind-table'); });
    expanded = await openEditor('form');
    await expanded.editor.getByLabel('What needs to change?', { exact: true }).fill('Expanded edits save on Escape.');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'form')).data.fields[1]).value === 'Expanded edits save on Escape.';
    });
    expanded = await openEditor('kanban');
    await expanded.editor.getByRole('button', { name: 'Move Write the brief', exact: true }).press('ArrowDown');
    await page.getByRole('menuitemradio', { name: 'Move Write the brief to In progress', exact: true }).press('Enter');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'kanban')).data.cards[0]).column === 'doing';
    });
    // Let the board finish grouping the first edit before testing a separate gesture's undo.
    await page.waitForTimeout(400);
    await expanded.editor.getByRole('button', { name: 'Drag Write the brief', exact: true }).dragTo(expanded.editor.locator('.lane[aria-label="Done"]'));
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'kanban')).data.cards[0]).column === 'done';
    });
    await expanded.editor.getByRole('button', { name: 'Full width', exact: true }).click();
    assert.equal(await expanded.editor.getByRole('button', { name: 'Side panel', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.ok(present((await expanded.editor.boundingBox())).width > 1400, 'full width gives the board room');
    await expanded.editor.locator('.object.expanded > .content').focus();
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'kanban')).data.cards[0]).column === 'doing';
    });
    assert.ok(await expanded.editor.locator('.lane[aria-label="In progress"] .ticket').filter({ hasText: 'Write the brief' }).isVisible(), 'undo updates the open view');
    await page.keyboard.press('Meta+Shift+z');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'kanban')).data.cards[0]).column === 'done';
    });
    await page.keyboard.press('Escape');
    process.stdout.write(formatCheckOutput('pass genui: expanded table commits before closing and cancels drafts on Escape; form flushes on Escape; kanban moves, dragging, undo and redo save; full width works') + '\n');
    await frame('stats');
    const toolbarOpen = page.locator('.selection-bar').getByRole('button', { name: 'Open', exact: true });
    await toolbarOpen.click();
    assert.equal(await page.locator('.side-editor-name').textContent(), 'Sample stats', 'global Open uses the same expanded view');
    assert.equal(await page.locator('.side-editor').evaluate(el => getComputedStyle(el).transitionDuration), '0.24s', 'pointer Open in the selection toolbar slides in');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => { function optionalDom<T extends Element>(value: Element | null | undefined, kind: {
        new (): T;
    }): T | null { if (value == null)
        return null; if (!(value instanceof kind))
        throw new Error('Unexpected DOM element type'); return value; } const a = document.activeElement, id = optionalDom(a, HTMLElement)?.dataset.windowAction; const owner = a?.closest('#selectionBar') ? document.querySelector('.card.selected') : id ? document.querySelector(`.card[data-id="${id}"]`) : a?.closest('.card'); return owner?.classList.contains('kind-stats'); });
    await toolbarOpen.press('Enter');
    assert.equal(await page.locator('.side-editor').evaluate(el => getComputedStyle(el).transitionDuration), '0s', 'keyboard Open in the selection toolbar is instant');
    await page.keyboard.press('Escape');
    const tableCard = await frame('table');
    await tableCard.locator('.win-strip h3').dblclick();
    assert.equal(await page.locator('.side-editor-name').textContent(), 'Sample table', 'double-click opens the generated window');
    await page.keyboard.press('Escape');
    await page.locator('#stage').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.side-editor-name').textContent(), 'Sample table', 'Return opens the selected generated window');
    await page.keyboard.press('Escape');
    process.stdout.write(formatCheckOutput('pass genui: global Open, double-click and Return open a focused view and preserve native control keys') + '\n');
    await page.waitForFunction(async (id) => {
        function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
            throw new Error('Missing expected test value'); return value; }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const b = await aegis.host.get(`/boards/${id}`).then(globalThis.window.__checkBoard);
        return present(present(b.cards.find(c => c.type === 'object' && c.kind === 'kanban')).data.cards[0]).column === 'done' && present(present(b.cards.find(c => c.type === 'object' && c.kind === 'form')).data.fields[0]).value === 'A useful result' && present(present(b.cards.find(c => c.type === 'object' && c.kind === 'form')).data.fields[2]).value === null && present(present(b.cards.find(c => c.type === 'object' && c.kind === 'table')).data.rows[0]).cells[1] === 12;
    }, boardId);
    await page.reload();
    await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board);
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'form')).data.fields[0]).value;
    }), 'A useful result');
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'stats')).data.tiles[0]).value;
    }), '20', 'committed plain stat survives reload');
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'progress')).data.goals[0]).current;
    }), 7, 'committed inline progress value survives reload');
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'stages')).data.steps[0]).status;
    }), 'blocked', 'the themed status menu saves through reload');
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'kanban')).data.cards[0]).column;
    }), 'done');
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'table')).data.rows[0]).cells[0];
    }), 'Monday review');
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'table')).data.rows[0]).cells[1];
    }), 12, 'Enter-committed number survives reload');
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'table')).data.rows[1]).cells[0];
    }), 'Tuesday saved on blur');
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'form')).data.fields[1]).value;
    }), 'Expanded edits save on Escape.');
    process.stdout.write(formatCheckOutput('pass genui: saved values survive host read and page reload') + '\n');
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
    const htmlCard = await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html');
    });
    const revision = await page.evaluate(([id, data]) => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify([{ op: 'revise', id, data }]), model: { provider: 'fake', modelId: 'fake' } }).then(globalThis.window.__checkAgentReceipts);
    }, [present(htmlCard).id, { ...samples.html, js: samples.html.js + probe }]);
    assert.ok(revision[0]?.id, JSON.stringify(revision));
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html')).ver === 2;
    });
    await frame('html');
    await page.waitForFunction(() => window.__genuiReports.some(r => r.parentBlocked && r.fetchBlocked && r.localFetchBlocked && r.storageBlocked && r.origin === 'null'));
    assert.equal(outgoing, 0, 'CSP stops fetch before a request leaves the iframe');
    assert.equal(await page.locator('body').getAttribute('data-genui-escaped'), null);
    assert.equal(await page.evaluate(() => window.__genuiPrivate), 'Only the app may read this');
    const iframe = page.frameLocator('.card.kind-html iframe');
    await iframe.locator('#minutes').fill('30');
    assert.match(present(await iframe.locator('#total').textContent()), /120 minutes/);
    const initialHeight = await page.locator('.card.kind-html iframe').evaluate(el => el.clientHeight);
    await iframe.locator('body').evaluate(body => { const p = document.createElement('p'); p.textContent = 'Extra detail'; p.style.height = '470px'; body.append(p); });
    await page.waitForFunction(initial => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return present(document.querySelector('.card.kind-html iframe')?.clientHeight) > initial + 300;
    }, initialHeight);
    await page.waitForFunction(() => {
        function dom<T extends Element>(value: Element | null | undefined, kind: {
            new (): T;
        }): T {
            if (!(value instanceof kind))
                throw new Error('Unexpected DOM element type');
            return value;
        }
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const frame = document.querySelector('.card.kind-html iframe');
        const content = present(frame).closest('.content'), strip = present(present(frame).closest('.object')).querySelector('.win-strip'), card = present(frame).closest('.card');
        const style = getComputedStyle(present(content));
        return present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html')).h === present(frame).clientHeight + dom(present(strip), HTMLElement).offsetHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + dom(present(card), HTMLElement).offsetHeight - present(card).clientHeight;
    });
    const beforeSpoof = await page.locator('.card.kind-html iframe').evaluate(el => el.clientHeight);
    assert.match(present(await iframe.locator('#total').textContent()), /120 minutes/, 'auto height preserves the live widget state');
    await page.evaluate(() => {
        const channel = window.__genuiHeights.findLast(r => r.ownFrame)?.channel;
        const data = { type: 'aegis:html-height', channel, height: 1900 };
        dispatchEvent(new MessageEvent('message', { origin: 'null', source: window, data }));
    });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.card.kind-html iframe').evaluate(el => el.clientHeight), beforeSpoof, 'wrong source cannot resize the frame');
    process.stdout.write(formatCheckOutput('pass genui: sandbox blocks parent document, storage and fetch; height reports resize only their own frame') + '\n');
    // Restore a normal custom UI through the same fake agent path, proving source revision.
    const replacedChannel = await page.evaluate(() => { function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
        throw new Error('Missing expected test value'); return value; } return present(window.__genuiHeights.findLast(r => r.ownFrame)).channel; });
    await page.evaluate(([id, data]) => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify([{ op: 'revise', id, data }]), model: { provider: 'fake', modelId: 'fake' } }).then(globalThis.window.__checkAgentReceipts);
    }, [present(htmlCard).id, { ...samples.html, html: samples.html.html.replace('Try a different pace', 'Plan a focused afternoon') }]);
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html')).ver) >= 3;
    });
    await frame('html');
    await page.frameLocator('.card.kind-html iframe').getByRole('heading', { name: 'Plan a focused afternoon' }).waitFor();
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html')).data.state?.includes('"value":"25"');
    });
    const revisedState = await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html')).data.state;
    });
    await page.evaluate(async ({ channel, state }) => {
        function dom<T extends Element>(value: Element | null | undefined, kind: {
            new (): T;
        }): T {
            if (!(value instanceof kind))
                throw new Error('Unexpected DOM element type');
            return value;
        }
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const saved = (await globalThis.window.__checkHtmlState(JSON.parse(present(state))));
        present(saved.controls[0]).value = '55';
        dispatchEvent(new MessageEvent('message', { origin: 'null', source: dom(present(document.querySelector('.card.kind-html iframe')), HTMLIFrameElement).contentWindow, data: { type: 'aegis:html-state', channel, state: JSON.stringify(saved) } }));
    }, { channel: replacedChannel, state: revisedState });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html')).data.state;
    }), revisedState, 'late snapshots from replaced source channels are ignored');
    process.stdout.write(formatCheckOutput('pass genui: agent revise replaces sandbox source in place') + '\n');
    await page.context().setOffline(true);
    await page.frameLocator('.card.kind-html iframe').locator('#minutes').fill('35');
    assert.match(present(await page.frameLocator('.card.kind-html iframe').locator('#total').textContent()), /140 minutes/);
    await page.waitForFunction(() => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') === 'blocked' || document.getElementById('saveState')?.textContent === 'not saved');
    await page.context().setOffline(false);
    await page.locator('#retrySave').press('Enter');
    await page.waitForFunction(() => (document.querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? document.getElementById('saveState')?.textContent) === 'saved');
    const setMinutes = async (widget: import('playwright').FrameLocator, minutes: number) => {
        const slider = widget.locator('#minutes');
        const box = await slider.boundingBox();
        const track = await slider.evaluate(el => {
            function dom<T extends Element>(value: Element | null | undefined, kind: {
                new (): T;
            }): T { if (!(value instanceof kind))
                throw new Error('Unexpected DOM element type'); return value; }
            const s = getComputedStyle(el);
            return { left: parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth) + 8, right: parseFloat(s.paddingRight) + parseFloat(s.borderRightWidth) + 8, min: Number(dom(el, HTMLInputElement).min), max: Number(dom(el, HTMLInputElement).max) };
        });
        await page.mouse.click(present(box).x + track.left + (minutes - track.min) / (track.max - track.min) * (present(box).width - track.left - track.right), present(box).y + present(box).height / 2);
        assert.equal(await slider.inputValue(), String(minutes), 'real pointer sets calculator minutes');
    };
    await setMinutes(page.frameLocator('.card.kind-html iframe'), 40);
    const canvasHtmlHeight = await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html')).h;
    });
    expanded = await openEditor('html');
    const expandedFrame = page.frameLocator('.side-editor iframe');
    await expandedFrame.locator('#minutes').waitFor();
    assert.equal(await expandedFrame.locator('#minutes').inputValue(), '40', 'Open restores the canvas widget state');
    assert.match(present(await expandedFrame.locator('#total').textContent()), /160 minutes/);
    await page.screenshot({ path: out(`genui-html-shared-40-${stamp}.png`) });
    await page.waitForFunction(() => window.__genuiHeights.some(r => r.expandedFrame && r.origin === 'null'));
    await page.evaluate(() => {
        window.__widgetFrames = [...document.querySelectorAll('.card.kind-html iframe, .side-editor iframe')].map(frame => {
            if (!(frame instanceof HTMLIFrameElement))
                throw new Error('Expected widget iframe');
            const tracked = { frame, src: frame.src, loads: 0 };
            frame.addEventListener('load', () => tracked.loads++);
            return tracked;
        });
    });
    const widgetFrames = [page.frameLocator('.card.kind-html iframe'), expandedFrame];
    for (const widget of widgetFrames)
        await widget.locator('h2').evaluate(el => { el.style.animation = 'spin 1s infinite'; });
    // The Open view covers the top-right chrome, so use its keyboard entry point.
    await page.locator('#settingsBtn').press('Enter');
    await page.getByRole('tab', { name: 'Board', exact: true }).click();
    const motion = page.getByRole('switch', { name: 'Motion', exact: true });
    for (const off of [true, false] as const) {
        await motion.setChecked(!off);
        for (const widget of widgetFrames) {
            await widget.locator(off ? 'html.motion-off' : 'html:not(.motion-off)').waitFor();
            assert.equal(await widget.locator('#minutes').inputValue(), '40');
            assert.match(present(await widget.locator('#total').textContent()), /160 minutes/);
            assert.equal(await widget.locator('h2').evaluate(el => getComputedStyle(el).animationName), off ? 'none' : 'spin');
        }
    }
    await page.locator('#closeSettings').click();
    const preferenceData = await page.evaluate(keys => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const frame = document.querySelector('.card.kind-html iframe');
        return { type: 'aegis:html-preferences', channel: present(window.__genuiHeights.findLast(r => r.ownFrame)).channel, motionOff: true, theme: Object.fromEntries(keys.map(key => [key, getComputedStyle(present(frame)).getPropertyValue(key)])) };
    }, THEME_KEYS);
    // A correct channel alone cannot authorise a message from a child or sibling.
    await page.frameLocator('.card.kind-html iframe').locator('html').evaluate((_, data) => dispatchEvent(new MessageEvent('message', { source: window, data })), preferenceData);
    await page.evaluate(data => {
        function dom<T extends Element>(value: Element | null | undefined, kind: {
            new (): T;
        }): T {
            if (!(value instanceof kind))
                throw new Error('Unexpected DOM element type');
            return value;
        }
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const frame = document.querySelector('.card.kind-html iframe');
        present(dom(present(frame), HTMLIFrameElement).contentWindow).postMessage({ ...data, channel: 'wrong-channel' }, '*');
        present(dom(present(frame), HTMLIFrameElement).contentWindow).postMessage({ ...data, motionOff: 'true' }, '*');
    }, preferenceData);
    await page.waitForTimeout(100);
    assert.equal(await page.frameLocator('.card.kind-html iframe').locator('html').evaluate(el => el.classList.contains('motion-off')), false, 'wrong source, channel and malformed preferences are ignored');
    await page.evaluate(() => document.documentElement.style.setProperty('--data', '#345678'));
    for (const widget of widgetFrames) {
        await widget.locator('html[style*="#345678"]').waitFor();
        assert.equal(await widget.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--data').trim()), '#345678');
        assert.equal(await widget.locator('#minutes').inputValue(), '40', 'theme preferences preserve widget state');
    }
    await page.evaluate(() => document.documentElement.style.removeProperty('--data'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const widget of widgetFrames)
        assert.equal(await widget.locator('h2').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // Title and geometry updates must not register a new document either.
    await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const card = aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html');
        aegis.apply([{ op: 'update', id: present(card).id, set: { text: 'Live calculator', x: present(card).x + 4 } }]);
    });
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return present(document.querySelector('.side-editor-name')).textContent === 'Live calculator';
    });
    await page.waitForTimeout(150);
    const loads = await page.evaluate(() => window.__widgetFrames.map(({ frame, src, loads }) => ({ connected: frame.isConnected, unchangedSource: frame.src === src, loads })));
    assert.deepEqual(loads, [{ connected: true, unchangedSource: true, loads: 0 }, { connected: true, unchangedSource: true, loads: 0 }], 'both original iframe elements stay alive with zero reload events');
    await page.screenshot({ path: out(`genui-html-motion-preserved-${stamp}.png`) });
    process.stdout.write(formatCheckOutput('pass genui: Motion off and on retain 40 and 160 minutes in canvas and Open; theme, title and geometry keep both frames alive; 0 iframe load events; invalid preferences ignored; offline and OS reduced motion work') + '\n');
    await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const card = aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html');
        aegis.apply([{ op: 'update', id: present(card).id, set: { text: 'Sample html' } }]);
    });
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return present(document.querySelector('.side-editor-name')).textContent === 'Sample html';
    });
    await page.evaluate(() => {
        function dom<T extends Element>(value: Element | null | undefined, kind: {
            new (): T;
        }): T {
            if (!(value instanceof kind))
                throw new Error('Unexpected DOM element type');
            return value;
        }
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const channel = present(window.__genuiHeights.findLast(r => r.expandedFrame)).channel;
        dispatchEvent(new MessageEvent('message', { origin: 'null', source: dom(present(document.querySelector('.card.kind-html iframe')), HTMLIFrameElement).contentWindow, data: { type: 'aegis:html-escape', channel } }));
        dispatchEvent(new MessageEvent('message', { origin: 'null', source: dom(present(document.querySelector('.side-editor iframe')), HTMLIFrameElement).contentWindow, data: { type: 'aegis:html-escape', channel: 'wrong-channel' } }));
    });
    assert.equal(await expanded.editor.isVisible(), true, 'sibling frames and incorrect channels cannot close the editor');
    const expandedHeight = await expanded.editor.locator('iframe').evaluate(el => el.clientHeight);
    await expandedFrame.locator('body').evaluate(body => { const extra = document.createElement('p'); extra.style.height = '450px'; body.append(extra); });
    await page.waitForFunction(initial => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return present(document.querySelector('.side-editor iframe')).clientHeight > initial + 300;
    }, expandedHeight);
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html')).h;
    }), canvasHtmlHeight, 'expanded widget height does not change canvas geometry');
    await setMinutes(expandedFrame, 50);
    await page.waitForFunction(async () => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present((await globalThis.window.__checkHtmlState(JSON.parse(present(present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html')).data.state)))).controls[0]).value === '50';
    });
    assert.match(present(await expandedFrame.locator('#total').textContent()), /200 minutes/);
    await page.frameLocator('.card.kind-html iframe').locator('#total').filter({ hasText: '200 minutes' }).waitFor();
    assert.equal(await page.frameLocator('.card.kind-html iframe').locator('#minutes').inputValue(), '50', 'Open edits update the live canvas before Close');
    await page.screenshot({ path: out(`genui-html-open-50-${stamp}.png`) });
    await expanded.editor.getByRole('button', { name: 'Back to board', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.side-editor.is-open'));
    const canvasFrame = page.frameLocator('.card.kind-html iframe');
    assert.equal(await canvasFrame.locator('#minutes').inputValue(), '50', 'closing Open preserves its edits on the canvas');
    assert.match(present(await canvasFrame.locator('#total').textContent()), /200 minutes/);
    await page.screenshot({ path: out(`genui-html-canvas-50-${stamp}.png`) });
    // Pointer close animates out before a new view is opened.
    await page.locator('.side-editor').waitFor({ state: 'detached' });
    expanded = await openEditor('html');
    await page.frameLocator('.side-editor iframe').locator('#minutes').waitFor();
    assert.equal(await page.frameLocator('.side-editor iframe').locator('#minutes').inputValue(), '50', 'Open again retains 50 minutes');
    assert.match(present(await page.frameLocator('.side-editor iframe').locator('#total').textContent()), /200 minutes/);
    await page.screenshot({ path: out(`genui-html-reopen-50-${stamp}.png`) });
    await page.frameLocator('.side-editor iframe').locator('#minutes').press('Escape');
    await page.waitForFunction(() => !document.querySelector('.side-editor.is-open'));
    await page.waitForFunction(() => { function optionalDom<T extends Element>(value: Element | null | undefined, kind: {
        new (): T;
    }): T | null { if (value == null)
        return null; if (!(value instanceof kind))
        throw new Error('Unexpected DOM element type'); return value; } const a = document.activeElement, id = optionalDom(a, HTMLElement)?.dataset.windowAction; const owner = a?.closest('#selectionBar') ? document.querySelector('.card.selected') : id ? document.querySelector(`.card[data-id="${id}"]`) : a?.closest('.card'); return owner?.classList.contains('kind-html'); });
    process.stdout.write(formatCheckOutput('pass genui: expanded custom UI runs in its isolated iframe and Escape closes from inside the widget') + '\n');
    const savedState = await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html')).data.state;
    });
    const stateChannel = await page.evaluate(() => { function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
        throw new Error('Missing expected test value'); return value; } return present(window.__genuiHeights.findLast(r => r.ownFrame)).channel; });
    const forged = HtmlStateSchema.parse(JSON.parse(present(savedState)));
    present(forged.controls[0]).value = '55';
    await canvasFrame.locator('html').evaluate(async (_, { channel, state }) => {
        for (const bad of [undefined, {}, 'not JSON', '{"version":1}', JSON.stringify({ ...(await globalThis.window.__checkHtmlState(JSON.parse(state))), custom: 'x'.repeat(65536) }), JSON.stringify({ ...(await globalThis.window.__checkHtmlState(JSON.parse(state))), custom: '🦘'.repeat(20000) })] as const)
            parent.postMessage({ type: 'aegis:html-state', channel, state: bad }, '*');
        parent.postMessage({ type: 'aegis:html-state', channel: 'wrong-channel', state }, '*');
    }, { channel: stateChannel, state: JSON.stringify(forged) });
    await page.evaluate(async ({ channel, state }) => {
        function dom<T extends Element>(value: Element | null | undefined, kind: {
            new (): T;
        }): T {
            if (!(value instanceof kind))
                throw new Error('Unexpected DOM element type');
            return value;
        }
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const data = { type: 'aegis:html-state', channel, state };
        dispatchEvent(new MessageEvent('message', { origin: 'null', source: window, data }));
        dispatchEvent(new MessageEvent('message', { origin: location.origin, source: dom(present(document.querySelector('.card.kind-html iframe')), HTMLIFrameElement).contentWindow, data }));
        for (const bad of ['not JSON', JSON.stringify({ ...(await globalThis.window.__checkHtmlState(JSON.parse(state))), custom: 'x'.repeat(65536) })] as const)
            present(dom(present(document.querySelector('.card.kind-html iframe')), HTMLIFrameElement).contentWindow).postMessage({ type: 'aegis:html-restore', channel, state: bad }, '*');
    }, { channel: stateChannel, state: JSON.stringify(forged) });
    await canvasFrame.locator('html').evaluate((_, { channel, state }) => {
        const data = { type: 'aegis:html-restore', channel, state };
        dispatchEvent(new MessageEvent('message', { source: window, origin: 'null', data }));
        dispatchEvent(new MessageEvent('message', { source: parent, origin: 'https://example.com', data }));
    }, { channel: stateChannel, state: JSON.stringify(forged) });
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html')).data.state;
    }), savedState, 'malformed, oversized, non-JSON, wrong-source, wrong-origin and wrong-channel state cannot overwrite the widget');
    assert.equal(await canvasFrame.locator('#minutes').inputValue(), '50');
    process.stdout.write(formatCheckOutput('pass genui: malformed and oversized state messages ignored; source, opaque origin and instance channel enforced') + '\n');
    await page.waitForFunction(async ([id, state]) => {
        function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
            throw new Error('Missing expected test value'); return value; }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present((await aegis.host.get(`/boards/${id}`).then(globalThis.window.__checkBoard)).cards.find(c => c.type === 'object' && c.kind === 'html')).data.state === state;
    }, [boardId, savedState]);
    await page.reload();
    await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board);
    await frame('html');
    await page.frameLocator('.card.kind-html iframe').locator('#minutes').waitFor();
    assert.equal(await page.frameLocator('.card.kind-html iframe').locator('#minutes').inputValue(), '50', 'saved state survives app page reload');
    assert.match(present(await page.frameLocator('.card.kind-html iframe').locator('#total').textContent()), /200 minutes/);
    await page.screenshot({ path: out(`genui-html-reload-50-${stamp}.png`) });
    process.stdout.write(formatCheckOutput('pass genui: real pointer sets canvas 40, Open shows 40 and 160, Open edits 50, Close returns canvas 50, Open again and page reload retain 50 and 200') + '\n');
    // A separate widget exercises the full transfer contract, beyond the calculator's input listener.
    const contractId = await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        aegis.apply([{ op: 'create', type: 'object', kind: 'html', text: 'State contract', x: 0, y: 3200, data: {
                    html: '<label>Working note<textarea id="note"></textarea></label><label><input id="tick" type="checkbox">Ready</label><label>Choices<select id="choices" multiple><option>Read</option><option>Write</option><option>Review</option></select></label><button id="silent">Remember</button><button id="advance">Advance</button><output id="count" data-aegis-state>0 saved</output><p id="early"></p><input type="password" value="fixture-password"><input type="file">',
                    css: 'label,button,output{display:block;margin:12px}textarea{width:90%}',
                    js: 'globalThis.window.aegisState ??= {count:0,nested:{ok:true},nonce:Math.random()}; document.querySelector("#early").textContent = "Initial script read: " + globalThis.window.aegisState.count; const draw = () => document.querySelector("#count").textContent = globalThis.window.aegisState.count + " saved"; document.querySelector("#silent").addEventListener("click", () => { globalThis.window.aegisState.remembered = true; }); document.querySelector("#note").addEventListener("input", () => { globalThis.window.aegisState.count = 99; }); document.querySelector("#advance").addEventListener("click", () => { globalThis.window.aegisState.count++; draw(); }); addEventListener("aegis:restore", draw);',
                } }]);
        const card = aegis.canvas.board.cards.find(c => c.text === 'State contract');
        aegis.canvas.frameIds([present(card).id], 1);
        return present(card).id;
    });
    const contractCard = page.locator(`.card[data-id="${contractId}"]`);
    const contractFrame = page.frameLocator(`.card[data-id="${contractId}"] iframe`);
    await page.waitForFunction(id => {
        function htmlCard(value: Card | null | undefined) { if (!value || value.type !== 'object' || value.kind !== 'html')
            throw new Error('Expected html card'); return value; }
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return !!present(htmlCard(present(aegis.canvas.board.cards.find(c => c.id === id))).data).state;
    }, contractId);
    const initialNonce = (await contractFrame.locator('html').evaluate(() => globalThis.window.__checkCustomState(globalThis.window.aegisState))).nonce;
    assert.equal(await page.evaluate(async (id) => {
        function htmlCard(value: Card | null | undefined) { if (!value || value.type !== 'object' || value.kind !== 'html')
            throw new Error('Expected html card'); return value; }
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return (await globalThis.window.__checkContractState(JSON.parse(present(present(htmlCard(present(aegis.canvas.board.cards.find(c => c.id === id))).data).state)))).custom.nonce;
    }, contractId), initialNonce, 'initial generated state is captured before any person input');
    await contractFrame.locator('#silent').click();
    await page.waitForFunction(async (id) => {
        function htmlCard(value: Card | null | undefined) { if (!value || value.type !== 'object' || value.kind !== 'html')
            throw new Error('Expected html card'); return value; }
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return (await globalThis.window.__checkContractState(JSON.parse(present(present(htmlCard(present(aegis.canvas.board.cards.find(c => c.id === id))).data).state)))).custom.remembered === true;
    }, contractId);
    await contractFrame.locator('#note').click();
    await page.keyboard.type('Keep the evidence.');
    await page.waitForFunction(async (id) => {
        function htmlCard(value: Card | null | undefined) { if (!value || value.type !== 'object' || value.kind !== 'html')
            throw new Error('Expected html card'); return value; }
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return (await globalThis.window.__checkContractState(JSON.parse(present(present(htmlCard(present(aegis.canvas.board.cards.find(c => c.id === id))).data).state)))).custom.count === 99;
    }, contractId);
    await contractFrame.locator('#tick').click();
    await contractFrame.locator('#choices option').nth(1).click();
    await contractFrame.locator('#choices option').nth(2).click({ modifiers: ['Meta'] });
    await contractFrame.locator('#advance').click();
    await page.waitForFunction(async (id) => {
        function htmlCard(value: Card | null | undefined) { if (!value || value.type !== 'object' || value.kind !== 'html')
            throw new Error('Expected html card'); return value; }
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return (await globalThis.window.__checkContractState(JSON.parse(present(present(htmlCard(present(aegis.canvas.board.cards.find(c => c.id === id))).data).state)))).custom.count === 100;
    }, contractId);
    const contractState = await page.evaluate(id => {
        function htmlCard(value: Card | null | undefined) { if (!value || value.type !== 'object' || value.kind !== 'html')
            throw new Error('Expected html card'); return value; }
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(htmlCard(present(aegis.canvas.board.cards.find(c => c.id === id))).data).state;
    }, contractId);
    const contractSnapshot = HtmlStateSchema.parse(JSON.parse(present(contractState)));
    assert.equal(contractSnapshot.controls.length, 3, 'password and file inputs never enter saved control state');
    assert.deepEqual(present(contractSnapshot.controls[2]).selected, [1, 2], 'multiple selected options are captured');
    await contractCard.hover();
    await page.locator('.window-actions').getByRole('button', { name: 'Open State contract', exact: true }).click();
    const openContract = page.frameLocator('.side-editor iframe');
    await openContract.locator('#note').waitFor();
    assert.equal(await openContract.locator('#note').inputValue(), 'Keep the evidence.');
    assert.equal(await openContract.locator('#tick').isChecked(), true);
    assert.deepEqual(await openContract.locator('#choices').evaluate(el => {
        function dom<T extends Element>(value: Element | null | undefined, kind: {
            new (): T;
        }): T {
            if (!(value instanceof kind))
                throw new Error('Unexpected DOM element type');
            return value;
        }
        return [...dom(el, HTMLSelectElement).selectedOptions].map(option => option.textContent);
    }), ['Write', 'Review']);
    assert.equal(await openContract.locator('#count').textContent(), '100 saved', 'marked output text is restored');
    assert.equal(await openContract.locator('#early').textContent(), 'Initial script read: 100', 'custom JSON is available before widget source scripts run');
    assert.deepEqual(await openContract.locator('html').evaluate(() => globalThis.window.aegisState), { count: 100, nested: { ok: true }, nonce: initialNonce, remembered: true }, 'replayed field events cannot overwrite restored script state');
    await openContract.locator('#advance').click();
    await contractFrame.locator('#count').filter({ hasText: '101 saved' }).waitFor();
    await openContract.locator('html').evaluate(async () => { const state = await globalThis.window.__checkCustomState(globalThis.window.aegisState); state.nested.ok = false; globalThis.window.aegisState = state; dispatchEvent(new Event('aegis:statechange')); });
    await page.waitForFunction(async (id) => {
        function htmlCard(value: Card | null | undefined) { if (!value || value.type !== 'object' || value.kind !== 'html')
            throw new Error('Expected html card'); return value; }
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return (await globalThis.window.__checkContractState(JSON.parse(present(present(htmlCard(present(aegis.canvas.board.cards.find(c => c.id === id))).data).state)))).custom.nested.ok === false;
    }, contractId);
    await openContract.locator('#advance').press('Escape');
    // Cull the canvas widget and return, so a fresh instance must restore the object's snapshot.
    await frame('html');
    await page.evaluate(id => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.frameIds([id], 1);
    }, contractId);
    await contractFrame.locator('#count').filter({ hasText: '101 saved' }).waitFor();
    assert.deepEqual(await contractFrame.locator('html').evaluate(() => globalThis.window.aegisState), { count: 101, nested: { ok: false }, nonce: initialNonce, remembered: true });
    await page.evaluate(id => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.apply([{ op: 'delete', ids: [id] }]);
    }, contractId);
    process.stdout.write(formatCheckOutput('pass genui: textarea, checkbox, multiple select, marked text and custom JSON transfer; state is ready before source scripts; script-only state events and canvas culling retain it; password and file values excluded') + '\n');
    const otherSamples = {
        reply: { headline: 'A readable result', text: 'Keep the evidence beside the answer.' },
        plot: { style: 'line', x: { kind: 'category' }, y: { format: 'number' }, series: [{ name: 'Tasks', points: [{ x: 'Monday', y: 3 }, { x: 'Tuesday', y: 7 }] }], basis: 'Sample observations' },
        sheet: { columns: [{ label: 'Day', kind: 'text' }], rows: [{ cells: ['Monday'] }] },
        diagram: { nodes: [{ id: 'brief', name: 'Choose the question', kind: 'step' }, { id: 'read', name: 'Read the source', kind: 'step' }], edges: [{ from: 'brief', to: 'read' }] },
        plan: { checkable: true, steps: [{ title: 'Read the evidence', kind: 'task' }] },
        list: { style: 'todo', items: [{ title: 'Check the result' }] },
        code: { language: 'javascript', text: 'const answer = 42;' },
    };
    await page.evaluate(data => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify(Object.entries(data).map(([kind, data], i) => ({ op: 'create', type: 'object', kind, text: `Sample ${kind}`, data, x: i * 820, y: 2400 }))), model: { provider: 'fake', modelId: 'fake' } }).then(globalThis.window.__checkAgentReceipts);
    }, otherSamples);
    await page.waitForFunction(count => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.cards.filter(c => c.type === 'object').length === count;
    }, OBJECT_KINDS.length);
    for (const kind of Object.keys(otherSamples))
        await assertOpen(kind, await frame(kind));
    assert.deepEqual([...checkedOpen].sort(), [...OBJECT_KINDS].sort(), 'Open behaviour is checked for every supported object kind');
    process.stdout.write(formatCheckOutput('pass genui: all 18 supported kinds either open visible focused content or have no Open button') + '\n');
    expanded = await openEditor('table');
    await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const card = aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'table');
        aegis.apply([{ op: 'update', id: present(card).id, set: { text: 'Revised table' } }, { op: 'object_set', id: present(card).id, path: ['rows', 1, 'cells', 0], value: 'Updated in the open view' }]);
    });
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return present(document.querySelector('.side-editor-name')).textContent === 'Revised table';
    });
    assert.equal(await expanded.editor.getByRole('gridcell', { name: 'Day, row 2', exact: true }).locator('.cell-value').textContent(), 'Updated in the open view');
    await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const card = aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'table');
        aegis.apply([{ op: 'update', id: present(card).id, set: { text: 'Sample table' } }]);
    });
    await page.keyboard.press('Escape');
    expanded = await openEditor('callout', true);
    // Opening frames the editor context with a short glide; compare views once the camera rests.
    await page.waitForFunction(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return new Promise<boolean>(done => { const a = JSON.stringify(aegis.canvas.view); setTimeout(() => done(a === JSON.stringify(aegis.canvas.view)), 500); });
    }, null, { polling: 100 });
    const beforeKeys = await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return JSON.stringify({ view: aegis.canvas.view, cards: aegis.canvas.board.cards.length, tool: aegis.canvas.tool });
    });
    await page.keyboard.press('Delete');
    await page.keyboard.press('0');
    await page.keyboard.press('n');
    assert.equal(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return JSON.stringify({ view: aegis.canvas.view, cards: aegis.canvas.board.cards.length, tool: aegis.canvas.tool });
    }), beforeKeys, 'reading a focused view cannot delete a canvas card, fit the canvas or switch tools');
    await page.keyboard.press('Escape');
    const temporaryId = await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        aegis.apply([{ op: 'create', type: 'object', kind: 'callout', text: 'Temporary view', data: { tone: 'note', text: 'Close when removed.' }, ref: 'temporary' }]);
        const card = aegis.canvas.board.cards.find(c => c.text === 'Temporary view');
        dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id: present(card).id, keyboard: true } }));
        return present(card).id;
    });
    await page.locator('.side-editor.is-open').waitFor({ state: 'visible' });
    await page.evaluate(id => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.apply([{ op: 'delete', ids: [id] }]);
    }, temporaryId);
    assert.equal(await page.locator('.side-editor').count(), 0, 'deleting an object closes and disposes its view');
    process.stdout.write(formatCheckOutput('pass genui: board edits and title changes update the open view; canvas keys stay local; deletion closes the view') + '\n');
    const originalTimeline = await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'timeline')).data;
    });
    await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const card = aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'timeline');
        const events = Array.from({ length: 40 }, (_, i) => ({ ...present(card).data.events[i % present(card).data.events.length], title: `Event ${i + 1}` }));
        aegis.apply([{ op: 'revise', id: present(card).id, data: { ...present(card).data, events } }]);
    });
    expanded = await openEditor('timeline', true);
    const timelineContent = expanded.editor.locator('.content');
    await page.keyboard.press('PageDown');
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return present(document.querySelector('.side-editor .object.expanded > .content')).scrollTop > 0;
    });
    assert.ok(await timelineContent.evaluate(el => el.scrollHeight > el.clientHeight && el === document.activeElement), 'long expanded content supports keyboard scrolling');
    await page.keyboard.press('Escape');
    await page.evaluate(data => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.apply([{ op: 'revise', id: present(aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'timeline')).id, data }]);
    }, originalTimeline);
    process.stdout.write(formatCheckOutput('pass genui: long expanded content scrolls with PageDown and Escape restores focus') + '\n');
    for (const width of [1586, 390] as const) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 992 });
        if (width === 390) {
            await page.evaluate(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + JSON.stringify(aegis.canvas.board.cards.filter(c => c.type === 'object').map(c => ({ op: 'update', id: c.id, set: { w: 350 } }))), model: { provider: 'fake', modelId: 'fake' } }).then(globalThis.window.__checkAgentReceipts);
            });
            await page.waitForFunction(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.canvas.board.cards.filter(c => c.type === 'object').every(c => c.w === 350);
            });
        }
        for (const kind of Object.keys(samples)) {
            const card = await frame(kind);
            await card.screenshot({ path: out(`genui-${kind}-${width}-${stamp}.png`) });
            await assertOpen(kind, card, width);
        }
    }
    assert.deepEqual(errors, []);
    writeFileSync(out(`genui-results-${stamp}.json`), JSON.stringify({ kinds: Object.keys(samples), openChecked: [...checkedOpen], screenshots: [1440, 1586, 390], outgoingSandboxRequests: outgoing, errors }, null, 2));
    process.stdout.write(formatCheckOutput('pass genui: screenshots of every kind at 1440, 1586 and 390; no page errors') + '\n');
    await verifySandboxLifecycle();
}
catch (error) {
    process.stderr.write(formatCheckOutput('FAIL genui:', error instanceof Error ? error.stack : String(error)) + '\n');
    if (typeof failurePage !== 'undefined')
        process.stderr.write(formatCheckOutput('diagnostics', JSON.stringify(await failurePage.evaluate(async () => {
            const aegis = globalThis.window.aegis;
            if (!aegis)
                throw new Error('Missing test facade');
            return ({ reports: window.__genuiReports, rev: aegis.canvas.board.rev, saved: document.querySelector('[data-save-state], #saveState')?.textContent, server: await aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard).then(b => ({ rev: b.rev, html: b.cards.find(c => c.type === 'object' && c.kind === 'html') })), html: aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html'), widths: aegis.canvas.board.cards.map(c => [c.type, c.kind, c.w]) });
        }).catch(() => null)), errors) + '\n');
    if (logs.length)
        process.stderr.write(formatCheckOutput(logs.slice(-5).join('\n')) + '\n');
    if (typeof failurePage !== 'undefined')
        await failurePage.screenshot({ path: out(`genui-fail-${stamp}.png`) }).catch(() => { });
    process.exitCode = 1;
}
finally {
    await browser?.close();
    host?.kill();
    await vite?.close();
}
