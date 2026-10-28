import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { format as formatCheckOutput } from 'node:util';
import type {} from '../../app/src/platform/test-facade.ts';
import { checkTemp, ComposerRequestSchema, installBrowserChecks } from './agents-submit.ts';
import { verifyDoubleNoteInput } from './double-note-input.ts';
import { choose } from './dropdown.ts';
import { out } from './out.ts';
import { chromium } from './playwright.ts';
function present<T>(value: T | null | undefined): T {
    if (value === undefined || value === null)
        throw new Error('Missing expected test value');
    return value;
}
const PORT_OFFSET = Number(process.env.AEGIS_PORT_OFFSET || 0); // separate worktrees can run checks at once
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), token = 'parity-' + process.pid;
const data = checkTemp(join(tmpdir(), 'aegis-parity-'));
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
host.stderr.on('data', d => process.stderr.write(d));
const port = await new Promise<string>((resolve, reject) => {
    host.stdout.on('data', d => {
        const m = /"port":(\d+)/.exec(String(d));
        if (m?.[1])
            resolve(m[1]);
    });
    host.on('exit', reject);
});
const vite = spawn('npx', ['vite', '--port', String(5187 + PORT_OFFSET), '--strictPort'], { cwd: repo + '/app', stdio: 'pipe' });
await new Promise<void>((resolve, reject) => {
    vite.stdout.on('data', d => {
        if (/Local/.test(String(d)))
            resolve();
    });
    vite.on('exit', reject);
});
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
let page = await context.newPage();
await installBrowserChecks(page);
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const url = `http://127.0.0.1:${5187 + PORT_OFFSET}/?port=${port}&token=${token}`;
const waitSaved = async () => {
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return present(document.querySelector('#saveState, .bar-right [data-save-state]')).textContent.toLowerCase() === 'saved';
    });
    return page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard);
    });
};
const inputDone = async () => {
    ;
    await page.evaluate(async () => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const engine = aegis.canvas.engine;
        const frame = () => new Promise<void>(resolve => { const release = engine.registerFrameParticipant({ write() { release(); engine.afterInput(resolve); } }); });
        await frame();
        await frame();
    });
};
const log = (...a: unknown[]) => process.stdout.write(formatCheckOutput(...a) + '\n');
try {
    await page.goto(url);
    await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board);
    await page.getByRole('dialog', { name: 'Welcome to Aegis', exact: true }).waitFor();
    assert.equal(await page.locator('.tour-progress').textContent(), '1 of 3');
    await page.screenshot({ path: out('parity-welcome.png') });
    await page.getByLabel('Your first thought').fill('A sample thought for my next project.');
    await page.getByRole('button', { name: 'Add thought', exact: true }).tap();
    assert.equal(await page.locator('.tour-progress').textContent(), '2 of 3');
    await page.screenshot({ path: out('parity-phone-tour.png') });
    await page.route('**/agents', async (route) => {
        if (route.request().method() !== 'POST')
            return route.continue();
        const body = ComposerRequestSchema.parse(route.request().postDataJSON());
        assert.match(present(body.brief), /A sample thought for my next project/);
        await route.continue({ postData: JSON.stringify({ ...body, brief: 'FAKE ' + JSON.stringify([{ op: 'create', type: 'note', text: 'A small next step', x: 400, y: 200 }]) }) });
    });
    await page.getByRole('button', { name: 'Ask for a plan', exact: true }).tap();
    assert.equal(await page.locator('.tour-progress').textContent(), '3 of 3');
    await page.getByRole('button', { name: 'See my plan', exact: true }).tap();
    await page.unroute('**/agents');
    await page.waitForFunction(async () => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`).then(globalThis.window.__checkAgents)).every(a => !a.running);
    });
    await page.evaluate(() => {
        function dom<T extends Element>(value: Element | null | undefined, kind: {
            new (): T;
        }): T { if (!(value instanceof kind))
            throw new Error('Unexpected DOM element type'); return value; }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        document.querySelectorAll('.agent-window .agent-close').forEach(button => dom(button, HTMLElement).click());
        aegis.apply([{ op: 'delete', ids: aegis.canvas.board.cards.map(c => c.id) }]);
    });
    await waitSaved();
    await page.reload();
    await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board);
    assert.equal(await page.locator('.onboarding').evaluate(el => {
        function opened(value: Element | null | undefined) {
            if (!(value instanceof HTMLDetailsElement || value instanceof HTMLDialogElement))
                throw new Error('Expected details or dialog');
            return value;
        }
        return opened(el).open;
    }), false);
    log('first run, three real task steps, phone touch controls and once-only reload');
    const hub = page.getByRole('navigation', { name: 'Board hub' });
    await hub.getByRole('button', { name: 'Boards', exact: true }).tap();
    await page.locator('.mobile-sheet .tree-row[data-board]').first().tap();
    await page.locator('.mobile-sheet').waitFor({ state: 'hidden' });
    await hub.getByRole('button', { name: 'Windows', exact: true }).tap();
    await page.getByRole('button', { name: 'Close sheet', exact: true }).tap();
    await hub.getByRole('button', { name: 'Unsorted', exact: true }).tap();
    await page.touchscreen.tap(20, 100);
    await hub.getByRole('button', { name: 'Add', exact: true }).tap();
    for (const name of ['Basics', 'Wireframe', 'Colours'] as const)
        assert.equal(await page.getByRole('heading', { name, exact: true }).isVisible(), true);
    await page.screenshot({ path: out('parity-phone-add.png') });
    await page.locator('.mobile-content').getByRole('button', { name: 'Note', exact: true }).tap();
    await page.locator('.mobile-sheet').waitFor({ state: 'hidden' });
    await page.touchscreen.tap(200, 260);
    await page.waitForFunction(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.cards.length === 1;
    });
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    const note = (await waitSaved()).cards[0];
    await hub.getByRole('button', { name: 'Windows', exact: true }).tap();
    await page.locator('.mobile-sheet .layer-row .name').first().tap();
    await page.locator('.mobile-sheet').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.selection().length;
    }), 1);
    await hub.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.locator('.mobile-content').getByRole('button', { name: 'Wireframe', exact: true }).tap();
    await page.locator('.mobile-content [data-wf="box"]').tap();
    await page.locator('.mobile-sheet').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.tool;
    }), 'wireframe');
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.setTool(null);
    });
    await hub.getByRole('button', { name: 'Add', exact: true }).tap();
    await page.getByRole('button', { name: 'Quick capture (Shift+Cmd+K / Shift+Ctrl+K)', exact: true }).tap();
    await page.getByLabel('Capture idea', { exact: true }).fill('Phone captured idea');
    await page.getByLabel('Capture idea', { exact: true }).press('Enter');
    await waitSaved();
    assert.equal(await page.locator('.capture-confirmation').isVisible(), true);
    await page.getByRole('button', { name: 'Put on board', exact: true }).tap();
    assert.ok((await waitSaved()).cards.some(c => c.text === 'Phone captured idea'));
    await hub.getByRole('button', { name: 'Agents', exact: true }).tap();
    assert.equal(await page.locator('.mobile-content #prompt').isVisible(), true);
    await page.screenshot({ path: out('parity-phone-agents.png') });
    await page.getByRole('button', { name: 'Close sheet', exact: true }).tap();
    log('hub, sheet backdrop and close, board/layer/tool picks, grouped Add and Wireframe catalogue, Agents composer');
    const cdp = await context.newCDPSession(page);
    const touch = async (type: 'touchStart' | 'touchEnd' | 'touchMove' | 'touchCancel', points: readonly (readonly [
        number,
        number,
        number
    ])[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 2, radiusY: 2, force: 1 })) });
    await hub.getByRole('button', { name: 'Windows', exact: true }).tap();
    const grab = await page.locator('.mobile-grab').boundingBox();
    await touch('touchStart', [[1, 180, present(grab).y + 10]]);
    await touch('touchMove', [[1, 180, present(grab).y + 60]]);
    await touch('touchMove', [[1, 180, present(grab).y + 115]]);
    await touch('touchEnd', []);
    await page.locator('.mobile-sheet').waitFor({ state: 'hidden' });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        aegis.canvas.select([]);
        aegis.canvas.setView({ x: 1000, y: 1000, z: 1 });
    });
    await touch('touchStart', [[1, 140, 330]]);
    await touch('touchMove', [[1, 165, 355]]);
    await touch('touchMove', [[1, 200, 390]]);
    await touch('touchEnd', []);
    let v = await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.view;
    });
    assert.equal(v.x, 1060);
    assert.equal(v.y, 1060);
    await touch('touchStart', [[1, 130, 330]]);
    await touch('touchStart', [[1, 130, 330], [2, 230, 330]]);
    await touch('touchMove', [[1, 100, 330], [2, 260, 330]]);
    await touch('touchEnd', []);
    v = await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.view;
    });
    assert.ok(Math.abs(v.z - 1.6) < .01);
    await page.waitForTimeout(600);
    assert.ok(Math.abs((await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard);
    })).view.z - 1.6) < .01);
    log('real CDP touch: drag-down >90px, one-finger pan +60/+60, pinch 1 to 1.6');
    await touch('touchStart', [[1, 180, 340]]);
    await page.waitForTimeout(570);
    await touch('touchEnd', []);
    await page.getByText('New note here', { exact: true }).waitFor();
    await page.screenshot({ path: out('parity-phone-longpress.png') });
    await page.keyboard.press('Escape');
    // Moving beyond eight pixels cancels the hold, even when it returns to its start.
    await touch('touchStart', [[1, 180, 340]]);
    await touch('touchMove', [[1, 200, 340]]);
    await touch('touchMove', [[1, 180, 340]]);
    await page.waitForTimeout(560);
    await touch('touchEnd', []);
    assert.equal(await page.getByText('New note here', { exact: true }).isVisible(), false);
    await page.evaluate(id => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.apply([{ op: 'order', ids: [id], to: 'front' }]);
    }, present(note).id);
    await waitSaved();
    await page.evaluate(c => {
        function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
            throw new Error('Missing expected test value'); return value; }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        aegis.canvas.setView({ x: 120 - present(c).x, y: 260 - present(c).y, z: 1 });
        aegis.canvas.select([]);
    }, { x: present(note).x, y: present(note).y });
    await page.waitForTimeout(70);
    await touch('touchStart', [[1, 140, 340]]);
    await page.waitForTimeout(570);
    await touch('touchEnd', []);
    await page.getByRole('menuitem', { name: 'Arrange', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Bring to front', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.selection();
    }), [present(note).id]);
    await page.screenshot({ path: out('parity-phone-card-menu.png') });
    await page.keyboard.press('Escape');
    log('520ms board/card context-menu path and 8px cancellation, quick capture to the canvas');
    // Slow and failed saves, followed by retry and authoritative disk-backed host reads.
    let mode = 'slow';
    await page.route(`http://127.0.0.1:${port}/boards/*/batch`, async (route) => {
        if (mode === 'fail') {
            await route.abort();
            return;
        }
        if (mode === 'slow')
            await new Promise<void>(r => setTimeout(r, 400));
        await route.continue();
    });
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.apply([{ op: 'create', newId: 'savest', type: 'note', text: 'Save feedback', x: NaN, y: Infinity, w: -1, h: NaN, rot: Infinity }]);
    });
    await page.waitForFunction(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        return present(document.querySelector('#saveState, .bar-right [data-save-state]')).textContent.toLowerCase() === 'saving';
    });
    let b = await waitSaved();
    const repaired = b.cards.find(c => c.id === 'savest');
    assert.ok(['x', 'y', 'w', 'h', 'rot'].every(k => Number.isFinite(present(repaired)[k])));
    assert.ok(present(repaired).w > 0 && present(repaired).h > 0);
    mode = 'fail';
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.apply([{ op: 'update', id: 'savest', set: { text: 'Kept after failure' } }]);
    });
    await page.waitForFunction(() => (document.querySelector('[data-save-state=blocked]') || document.getElementById('saveState')?.textContent === 'not saved'));
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.apply([{ op: 'update', id: 'savest', set: { heading: 'Queued behind failure' } }]);
    });
    assert.equal(await page.evaluate(() => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(aegis.canvas.board.cards.find(c => c.id === 'savest')).text;
    }), 'Kept after failure');
    mode = 'ok';
    await page.getByRole('button', { name: 'Retry', exact: true }).tap();
    b = await waitSaved();
    assert.equal(present(b.cards.find(c => c.id === 'savest')).text, 'Kept after failure');
    assert.equal(present(b.cards.find(c => c.id === 'savest')).heading, 'Queued behind failure');
    log('saving/saved/not saved + retry, ordered retained edits, repaired finite geometry saved');
    const external = await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.host.post('/boards', { name: 'Focus refresh evidence' }).then(globalThis.window.__checkBoard);
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await hub.getByRole('button', { name: 'Boards', exact: true }).tap();
    await page.locator(`.mobile-sheet .tree-row[data-board="${external.id}"]`).waitFor();
    await page.getByRole('button', { name: 'Close sheet', exact: true }).tap();
    // Reuse the same context at desktop width to verify controls restore to their original homes.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(() => !document.body.classList.contains('phone'));
    assert.equal(await page.locator('#mobileHub').isVisible(), false);
    assert.equal(await page.locator('#side [data-panel="library"]').count(), 1);
    await page.locator('#askPill').waitFor({ state: 'visible' });
    await page.mouse.move(1400, 20);
    await page.locator('#settingsBtn').click();
    for (const name of ['General', 'Board', 'Toolbar', 'Panels', 'Accounts', 'About'] as const) {
        await page.getByRole('tab', { name, exact: true }).click();
        assert.equal(await page.getByRole('tabpanel', { name, exact: true }).isVisible(), true);
    }
    await page.getByRole('tab', { name: 'General', exact: true }).click();
    await page.getByLabel('Double-click creates a note', { exact: true }).uncheck();
    await choose(page.getByLabel('Default note colour', { exact: true }), 'purple');
    await page.locator('#closeSettings').click();
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        aegis.canvas.select([]);
        aegis.canvas.setView({ x: 2000, y: 2000, z: 1 });
    });
    const count = await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.cards.length;
    });
    await page.mouse.dblclick(900, 300);
    assert.equal(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.cards.length;
    }), count);
    await page.mouse.move(1400, 20);
    await page.locator('#settingsBtn').click();
    await page.getByLabel('Double-click creates a note', { exact: true }).check();
    await page.getByRole('tab', { name: 'Board', exact: true }).click();
    await page.getByLabel('Motion', { exact: true }).uncheck();
    await page.getByLabel('Tilt loose cards', { exact: true }).check();
    await page.getByLabel('Show grid', { exact: true }).uncheck();
    assert.equal(await page.evaluate(() => localStorage.getItem('aegis:grid')), 'none');
    await page.getByLabel('Show grid', { exact: true }).check();
    await page.locator('#settings').getByLabel('Snap to grid', { exact: true }).check();
    await page.locator('#closeSettings').click();
    await page.mouse.dblclick(900, 300);
    b = await waitSaved();
    assert.equal(b.cards.length, count + 1);
    assert.equal(present(b.cards.at(-1)).color, 'purple');
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
        aegis.canvas.glideTo({ x: 300, y: 300, z: 1 });
    });
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.view.x;
    }), 300);
    const purple = b.cards.at(-1);
    await page.evaluate(c => {
        function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
            throw new Error('Missing expected test value'); return value; }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
        aegis.canvas.setView({ x: 700 - present(c).x, y: 300 - present(c).y, z: 1 });
        aegis.canvas.select([present(c).id]);
    }, { x: present(purple).x, y: present(purple).y, id: present(purple).id });
    await page.waitForTimeout(80);
    const box = await page.locator(`#world [data-id="${present(purple).id}"]`).boundingBox();
    await page.mouse.move(present(box).x + 20, present(box).y + present(box).height - 15);
    await page.mouse.down();
    await page.mouse.move(present(box).x + 57, present(box).y + present(box).height + 10, { steps: 6 });
    await page.mouse.up();
    await inputDone();
    b = await waitSaved();
    const snapped = b.cards.find(c => c.id === present(purple).id);
    assert.equal(Math.abs(present(snapped).x % 24), 0);
    assert.equal(Math.abs(present(snapped).y % 24), 0);
    log('grid snap saved at', present(snapped).x, present(snapped).y);
    await page.mouse.move(1400, 20);
    await page.locator('#settingsBtn').click();
    await page.getByRole('tab', { name: 'Toolbar', exact: true }).click();
    await choose(page.locator('[data-size]'), 'large');
    await page.getByRole('switch', { name: 'Show readme', exact: true }).uncheck();
    await page.getByRole('tab', { name: 'Panels', exact: true }).click();
    await page.locator('[data-panel-visibility="keys"]').uncheck();
    await page.getByRole('button', { name: 'Reset layout', exact: true }).click();
    await page.getByRole('tab', { name: 'About', exact: true }).click();
    await page.screenshot({ path: out('parity-desktop-about.png') });
    await page.getByRole('button', { name: 'Replay welcome and tour', exact: true }).click();
    assert.equal(await page.locator('.tour-progress').textContent(), '1 of 3');
    await page.screenshot({ path: out('parity-desktop-tour.png') });
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.reload();
    await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board);
    assert.equal(await page.locator('#tools [data-tool="readme"]').isVisible(), false);
    await page.mouse.move(1400, 20);
    await page.locator('#settingsBtn').click();
    await page.getByRole('tab', { name: 'General', exact: true }).click();
    assert.equal(await page.getByLabel('Default note colour', { exact: true }).evaluate(el => {
        function control(value: Element | null | undefined) {
            if (!(value instanceof HTMLOptionElement || value instanceof HTMLInputElement || value instanceof HTMLButtonElement || value instanceof HTMLSelectElement || value instanceof HTMLTextAreaElement))
                throw new Error('Expected form control');
            return value;
        }
        return control(el).value;
    }), 'purple');
    await page.locator('#closeSettings').click();
    log('focus library refresh, desktop restoration, six tabs, double-click preference, default colour, motion, tilt, grid, toolbar/panels, replay, persisted preferences');
    writeFileSync(out('parity-saved-board.json'), JSON.stringify(await waitSaved(), null, 2));
    assert.deepEqual(errors, []);
    log('PASS, no page errors. Temporary data:', data);
}
catch (e) {
    process.stderr.write(formatCheckOutput(e) + '\n');
    process.stderr.write(formatCheckOutput('page errors:', errors) + '\n');
    await page.screenshot({ path: out('parity-fail.png') });
    process.exitCode = 1;
}
finally {
    await browser.close();
    host.kill();
    vite.kill();
}
if (!process.exitCode)
    await verifyDoubleNoteInput();
