import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { format as formatCheckOutput } from 'node:util';
import type {} from '../../app/src/platform/test-facade.ts';
import { viteModule } from '../support/ui-snapshot.ts';
import { checkTemp, installBrowserChecks } from './agents-submit.ts';
import { choose } from './dropdown.ts';
import { out } from './out.ts';
import { chromium } from './playwright.ts';
import { waitForAsync } from './poll.ts';
declare global {
    interface Window {
        __wireframeInputComplete: boolean;
        __imageHook?: unknown;
    }
}
function present<T>(value: T | null | undefined): T {
    if (value === undefined || value === null)
        throw new Error('Missing expected test value');
    return value;
}
const PORT_OFFSET = Number(process.env.AEGIS_PORT_OFFSET || 0); // separate worktrees can run checks at once
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), token = 'wireframe-' + process.pid;
const data = checkTemp(join(tmpdir(), 'aegis-wireframe-'));
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
host.stderr.on('data', d => process.stderr.write(d));
const port = await new Promise<string>((r, reject) => {
    const timer = setTimeout(() => reject(Error('host startup timeout')), 20000);
    host.stdout.on('data', d => {
        const m = /"port":(\d+)/.exec(String(d));
        if (m?.[1]) {
            clearTimeout(timer);
            r(m[1]);
        }
    });
});
writeFileSync(out('wireframe-vite.mjs'), `import { createServer } from ${JSON.stringify(viteModule(repo))}; const server = await createServer({ root: ${JSON.stringify(repo + '/app')}, server: { fs: { allow: ${JSON.stringify([repo, realpathSync(repo)])} }, host: '127.0.0.1', port: ${5184 + PORT_OFFSET}, strictPort: true, watch: null } }); await server.listen(); server.printUrls();`);
const vite = spawn(process.execPath, [out('wireframe-vite.mjs')], { cwd: repo + '/app', stdio: 'pipe' });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, colorScheme: 'light' });
await installBrowserChecks(page);
await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {
    if (m.type() === 'error')
        errors.push(m.text());
});
const log = (...args: unknown[]) => process.stdout.write(formatCheckOutput(...args) + '\n');
const panel = page.locator('.wf-design');
const snapshot = () => page.evaluate(() => {
    const aegis = globalThis.window.aegis;
    if (!aegis)
        throw new Error('Missing test facade');
    return structuredClone(aegis.canvas.board);
});
const point = (x: number, y: number) => page.evaluate(([x, y]) => {
    function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
        throw new Error('Missing expected test value'); return value; }
    const aegis = globalThis.window.aegis;
    if (!aegis)
        throw new Error('Missing test facade');
    return aegis.canvas.worldToScreen(present(x), present(y));
}, [x, y]);
async function clickAt(x: number, y: number) {
    const p = await point(x, y);
    await page.mouse.click(p.x, p.y);
    ;
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        window.__wireframeInputComplete = false;
        const engine = aegis.canvas.engine;
        const off = engine.registerFrameParticipant({ write: () => { off(); engine.afterInput(() => { window.__wireframeInputComplete = true; }); } });
    });
    await page.waitForFunction(() => window.__wireframeInputComplete);
}
async function select(id: string) {
    await page.evaluate(id => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.select([id]);
    }, id);
    await page.waitForTimeout(260);
}
async function prop(name: string, value: string | number) {
    const input = panel.getByLabel(name, { exact: true });
    if (await input.evaluate(element => element instanceof HTMLButtonElement)) {
        await input.click();
        const editor = page.getByRole('dialog', { name: 'Colour editor', exact: true });
        await editor.getByLabel('Hex', { exact: true }).fill(String(value));
        await editor.getByRole('button', { name: 'Done', exact: true }).click();
    }
    else {
        await input.fill(String(value));
        await input.press('Tab');
    }
    await panel.locator('.wf-panel-head strong').click();
    await page.waitForTimeout(260);
}
async function drag(x: number, y: number, dx: number, dy: number, guideScreenshot?: string) {
    const start = await point(x, y), end = await point(x + dx, y + dy);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    if (guideScreenshot) {
        assert.ok(await page.locator('.drag-guides line').count() > 0, 'alignment guides visible');
        await page.screenshot({ path: guideScreenshot });
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
}
try {
    await new Promise<void>((r, reject) => {
        const timer = setTimeout(() => reject(Error('vite startup timeout')), 20000);
        vite.stdout.on('data', d => {
            if (/Local:/.test(String(d))) {
                clearTimeout(timer);
                r();
            }
        });
        vite.stderr.on('data', d => process.stderr.write(d));
    });
    await page.goto(`http://127.0.0.1:${5184 + PORT_OFFSET}/?port=${port}&token=${token}`);
    await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board, null, { timeout: 20000 });
    // This is a temporary board with a fake-model host. Remove its starter cards only.
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        if (aegis.canvas.board.cards.length)
            aegis.apply([{ op: 'delete', ids: aegis.canvas.board.cards.map(c => c.id) }]);
        aegis.canvas.setView({ x: 440, y: 100, z: .75 });
    });
    await page.mouse.move(24, 480);
    await page.locator('#toolsFold').click();
    await page.locator('#tools [data-tool="wireframe"]').click();
    await panel.locator('[data-wf="frame"]').click();
    await clickAt(0, 0);
    await page.waitForFunction(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.cards.some(c => c.type === 'frame');
    });
    const frame = (await snapshot()).cards.find(c => c.type === 'frame');
    assert.deepEqual([present(frame).w, present(frame).h], [393, 852]);
    await prop('Name', 'Account screen');
    const fillRect = await page.locator(`[data-id="${present(frame).id}"] .wf-surface rect`).evaluate(el => { function dom<T extends Element>(value: Element | null | undefined, kind: {
        new (): T;
    }): T { if (!(value instanceof kind))
        throw new Error('Unexpected DOM element type'); return value; } return ({ width: dom(el, SVGGraphicsElement).getBBox().width, height: dom(el, SVGGraphicsElement).getBBox().height }); });
    assert.equal(fillRect.width, 393);
    assert.equal(fillRect.height, 852);
    log('screen created, renamed, SVG fill dimensions verified');
    await panel.locator('.wf-pieces summary').click();
    await panel.locator('[data-piece="Nav bar"]').click();
    await clickAt(20, 44);
    await panel.locator('[data-piece="Input"]').click();
    await clickAt(24, 180);
    await panel.locator('[data-piece="Button"]').click();
    await clickAt(24, 255);
    await panel.locator('[data-wf="text"]').click();
    await clickAt(24, 130);
    await page.waitForTimeout(250);
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('Welcome back');
    await page.keyboard.press('Escape');
    const heading = (await snapshot()).cards.find(c => c.type === 'text' && c.text === 'Welcome back');
    assert.ok(heading);
    await select(heading.id);
    await prop('Font size', 26);
    await prop('Font family', 'Georgia');
    await choose(panel.getByLabel('Font weight', { exact: true }), '700');
    await panel.locator('.wf-panel-head strong').click();
    assert.equal(present(present((await snapshot()).cards.find(c => c.id === heading.id)).props).size, 26);
    log('editable pieces stamped and text typed and formatted');
    const groupBefore = await snapshot(), arrow = groupBefore.cards.find(c => c.type === 'icon' && present(c.props).name === 'arrow_back');
    const navParts = groupBefore.cards.filter(c => c.group === present(arrow).group);
    await select(present(arrow).id);
    await drag(present(arrow).x + 20, present(arrow).y + 12, 0, 15);
    const groupAfter = await snapshot(), arrowMoved = groupAfter.cards.find(c => c.id === present(arrow).id);
    assert.ok(present(arrowMoved).y !== present(arrow).y);
    for (const c of navParts) {
        const next = groupAfter.cards.find(k => k.id === c.id);
        assert.deepEqual([present(next).x - c.x, present(next).y - c.y], [present(arrowMoved).x - present(arrow).x, present(arrowMoved).y - present(arrow).y]);
    }
    assert.equal(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.selection().length;
    }), navParts.length);
    await page.keyboard.down('Meta');
    await drag(present(arrowMoved).x + 20, present(arrowMoved).y + 12, 10, 0);
    await page.keyboard.up('Meta');
    assert.equal(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.selection().length;
    }), 1);
    const independent = await snapshot();
    assert.notEqual(present(independent.cards.find(c => c.id === present(arrow).id)).x, present(arrowMoved).x);
    for (const c of navParts.filter(c => c.id !== present(arrow).id))
        assert.equal(present(independent.cards.find(k => k.id === c.id)).x, present(groupAfter.cards.find(k => k.id === c.id)).x);
    log('piece drag selects the group; Command drag moves one part');
    // Search and swap real bundled Material Icons.
    await panel.locator('[data-wf="icon"]').click();
    await page.getByRole('dialog', { name: 'Choose icon', exact: true }).getByLabel('Search icons', { exact: true }).fill('settings');
    await page.getByRole('dialog', { name: 'Choose icon', exact: true }).locator('[data-icon="settings"]').click();
    await clickAt(330, 125);
    await page.locator('.card[data-type="icon"] .wf-icon').filter({ hasText: 'settings' }).waitFor();
    let icon = (await snapshot()).cards.find(c => c.type === 'icon' && present(c.props).name === 'settings');
    assert.ok(icon);
    await select(icon.id);
    await panel.getByRole('button', { name: 'Change icon', exact: true }).click();
    await page.getByRole('dialog', { name: 'Choose icon', exact: true }).getByLabel('Search icons', { exact: true }).fill('favorite border');
    await page.getByRole('dialog', { name: 'Choose icon', exact: true }).locator('[data-icon="favorite_border"]').click();
    await page.waitForTimeout(260);
    assert.equal(present(present((await snapshot()).cards.find(c => c.id === icon.id)).props).name, 'favorite_border');
    assert.ok(await page.evaluate(() => document.fonts.check('24px "Aegis Material Icons"')));
    await page.screenshot({ path: out('wireframe-screen-light.png') });
    // Draw a box backwards, style it, and keep a labelled image slot with a callable hook.
    await panel.locator('[data-wf="box"]').click();
    await drag(330, 470, -306, -150);
    let box = (await snapshot()).cards.filter(c => c.type === 'box').at(-1);
    assert.ok(box);
    assert.equal(box.w, 306);
    assert.equal(box.h, 150);
    await prop('Fill', '#dbeafe');
    await prop('Border width', 3);
    await prop('Border colour', '#2563eb');
    await choose(panel.getByLabel('Border style', { exact: true }), 'dash');
    await panel.locator('.wf-panel-head strong').click();
    await prop('Dash length', 12);
    await prop('Dash gap', 7);
    await prop('Corner radius', 20);
    await prop('Image placeholder label', 'Account photo');
    await page.evaluate(() => document.addEventListener('aegis:wireframe-image-request', e => { if (e instanceof CustomEvent) {
        const detail: unknown = e.detail;
        if (!detail || typeof detail !== 'object' || !('cardId' in detail))
            throw new Error('Missing image request');
        window.__imageHook = detail.cardId;
    } e.preventDefault(); }, { once: true }));
    await panel.getByRole('button', { name: 'Fill image', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__imageHook), box.id);
    assert.equal(present(present((await snapshot()).cards.find(c => c.id === box.id)).props).placeholder, undefined, 'cancelled host hook does not apply a placeholder');
    await page.waitForTimeout(250);
    await panel.getByRole('button', { name: 'Fill image', exact: true }).click();
    await page.waitForFunction(id => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(aegis.canvas.board.cards.find(c => c.id === id)?.props).placeholder === true;
    }, box.id);
    const placeholder = page.locator(`[data-id="${box.id}"] .wf-placeholder-pattern`);
    await placeholder.waitFor();
    assert.equal(await placeholder.getByText('Account photo', { exact: true }).count(), 1);
    assert.equal(await placeholder.getByText('Placeholder, not AI-generated', { exact: true }).count(), 1);
    assert.match(await placeholder.evaluate(el => getComputedStyle(el).backgroundImage), /repeating-linear-gradient/);
    assert.equal(present(present((await snapshot()).cards.find(c => c.id === box.id)).props).src, undefined);
    await page.screenshot({ path: out('wireframe-placeholder.png') });
    const styled = (await snapshot()).cards.find(c => c.id === box.id);
    assert.equal(present(present(styled).props).sdash, 'dash');
    assert.equal(present(styled).parent, present(frame).id);
    assert.equal(await page.locator(`[data-id="${box.id}"] rect`).getAttribute('stroke-dasharray'), '12 7');
    await choose(panel.getByLabel('Border style', { exact: true }), 'dot');
    await panel.locator('.wf-panel-head strong').click();
    assert.equal(await page.locator(`[data-id="${box.id}"] rect`).getAttribute('stroke-linecap'), 'round');
    await panel.getByRole('button', { name: 'No fill', exact: true }).click();
    await page.waitForTimeout(250);
    assert.equal(present(present((await snapshot()).cards.find(c => c.id === box.id)).props).fill, 'none');
    await prop('Fill', '#dbeafe');
    assert.equal(present(present((await snapshot()).cards.find(c => c.id === box.id)).props).fill, '#dbeafe');
    await prop('Opacity', .7);
    await prop('Rotation', 12);
    assert.equal(present((await snapshot()).cards.find(c => c.id === box.id)).rot, 12);
    await prop('Rotation', 0);
    await prop('Opacity', 1);
    await choose(panel.getByLabel('Border style', { exact: true }), 'dash');
    await panel.locator('.wf-panel-head strong').click();
    log('drag box, solid/dashed/dotted borders, no fill, opacity, rotation and labelled image hook verified');
    // Drag the screen from its name and assert every owned child moves by exactly the same delta.
    await page.locator('.wf-panel-head strong').click();
    const before = await snapshot(), children = before.cards.filter(c => c.parent === present(frame).id);
    assert.ok(children.length >= 10);
    await drag(40, -14, 70, 50);
    const after = await snapshot(), movedFrame = after.cards.find(c => c.id === present(frame).id), dx = present(movedFrame).x - present(frame).x, dy = present(movedFrame).y - present(frame).y;
    assert.ok(dx !== 0 || dy !== 0);
    for (const c of children) {
        const next = after.cards.find(k => k.id === c.id);
        assert.deepEqual([present(next).x - c.x, present(next).y - c.y], [dx, dy], c.type + ' moved with screen');
        assert.equal(present(next).parent, present(frame).id);
    }
    log('frame carries all', children.length, 'owned child cards');
    // A specimen has its own editable sample and family field.
    await panel.locator('[data-wf="font"]').click();
    await clickAt(550, 0);
    const font = (await snapshot()).cards.find(c => c.type === 'font');
    assert.ok(font);
    await prop('Font family', 'Courier New');
    await page.locator(`[data-id="${font.id}"] .wf-specimen`).dblclick();
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('A custom font sample.');
    await page.keyboard.press('Escape');
    assert.equal(present((await snapshot()).cards.find(c => c.id === font.id)).text, 'A custom font sample.');
    // Group with a glass section using the real shortcut.
    await page.evaluate(ids => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.select(ids);
    }, [present(frame).id, font.id]);
    await page.locator('#stage').focus();
    await page.keyboard.press('Meta+Alt+g');
    await page.waitForTimeout(300);
    const section = (await snapshot()).cards.find(c => c.type === 'section');
    assert.ok(section);
    await select(section.id);
    await prop('Name', 'Mobile concept');
    const beforeSection = await snapshot();
    await drag(section.x + 20, section.y + 18, 30, 35);
    const afterSection = await snapshot(), movedSection = afterSection.cards.find(c => c.id === section.id);
    const sx = present(movedSection).x - section.x, sy = present(movedSection).y - section.y;
    assert.ok(sx !== 0 || sy !== 0);
    for (const c of beforeSection.cards.filter(c => c.id !== section.id)) {
        const next = afterSection.cards.find(k => k.id === c.id);
        assert.deepEqual([present(next).x - c.x, present(next).y - c.y], [sx, sy], 'section carries ' + c.type);
    }
    await select(section.id);
    await page.screenshot({ path: out('wireframe-section-light.png') });
    await panel.getByRole('button', { name: 'Remove section', exact: true }).click();
    assert.equal((await snapshot()).cards.length, beforeSection.cards.length - 1);
    log('font specimen, section shortcut, movement and content-preserving removal verified');
    // Place a full website template in its own frame on loose canvas.
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.setView({ x: -650, y: 80, z: .6 });
    });
    await panel.locator('[data-piece="Hero"]').click();
    await clickAt(1800, 0);
    await page.waitForTimeout(350);
    const website = (await snapshot()).cards.find(c => c.type === 'frame' && c.id !== present(frame).id);
    assert.ok(website);
    assert.equal(website.w, 1200);
    assert.ok((await snapshot()).cards.filter(c => c.parent === website.id).length >= 8);
    await select(website.id);
    await panel.locator('.wf-panel-body').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: out('wireframe-website-light.png') });
    // Real snapping on two loose boxes, including guide visibility during pointermove.
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.setView({ x: 400, y: 100, z: 1 });
    });
    for (const [x, y] of [[550, 550], [850, 550]] as const) {
        await panel.locator('[data-wf="box"]').click();
        await clickAt(x, y);
    }
    let loose = (await snapshot()).cards.filter(c => c.type === 'box' && !c.parent);
    assert.equal(loose.length, 2);
    await drag(580, 580, 137, 0, out('wireframe-snapping-light.png'));
    loose = (await snapshot()).cards.filter(c => c.type === 'box' && !c.parent);
    assert.equal(present(loose[0]).x + present(loose[0]).w, present(loose[1]).x);
    assert.equal(await page.locator('.drag-guides line').count(), 0);
    log('live edge snapping and guide clearing verified');
    // Move a loose box onto a screen and back out. Save assertions use the real host.
    await drag(present(loose[0]).x + 20, present(loose[0]).y + 20, -500, -100);
    const inside = (await snapshot()).cards.find(c => c.id === present(loose[0]).id);
    assert.equal(present(inside).parent, present(frame).id);
    await drag(present(inside).x + 20, present(inside).y + 20, 500, 100);
    assert.equal(present((await snapshot()).cards.find(c => c.id === present(inside).id)).parent, undefined);
    await panel.getByLabel('Snap to grid', { exact: true }).check();
    const gridBox = (await snapshot()).cards.find(c => c.id === present(loose[1]).id);
    await drag(present(gridBox).x + 20, present(gridBox).y + 20, 10, 11);
    const gridMoved = (await snapshot()).cards.find(c => c.id === present(gridBox).id);
    assert.equal(present(gridMoved).x % 26, 0);
    assert.equal(present(gridMoved).y % 26, 0);
    await page.keyboard.down('Meta');
    await drag(present(gridMoved).x + 20, present(gridMoved).y + 20, 13, 11);
    await page.keyboard.up('Meta');
    const bypassed = (await snapshot()).cards.find(c => c.id === present(gridBox).id);
    assert.deepEqual([present(bypassed).x - present(gridMoved).x, present(bypassed).y - present(gridMoved).y], [13, 11]);
    await panel.getByLabel('Snap to grid', { exact: true }).uncheck();
    await select(present(frame).id);
    await page.locator('#stage').focus();
    await page.keyboard.press(']');
    const ordered = await snapshot(), frameIndex = ordered.cards.findIndex(c => c.id === present(frame).id);
    assert.ok(ordered.cards.filter(c => c.parent === present(frame).id).every(c => ordered.cards.indexOf(c) > frameIndex));
    await page.keyboard.press('[');
    log('grid snapping, Option bypass and screen stacking preserve content');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.setView({ x: 440, y: 70, z: .7 });
    });
    await select(box.id);
    assert.equal(await panel.getByLabel('Dash gap', { exact: true }).inputValue(), '7');
    await page.screenshot({ path: out('wireframe-screen-dark.png') });
    await select(present(frame).id);
    await choose(panel.getByLabel('Device', { exact: true }), 'Android');
    await panel.locator('.wf-panel-head strong').click();
    assert.equal(present((await snapshot()).cards.find(c => c.id === present(frame).id)).w, 412);
    await choose(panel.getByLabel('Device', { exact: true }), 'iPhone');
    await panel.locator('.wf-panel-head strong').click();
    await prop('Width', 410);
    assert.equal(present(present((await snapshot()).cards.find(c => c.id === present(frame).id)).props).device, 'Custom');
    await prop('Width', 393);
    // Wait for the board write queue by comparing host state, then reload the UI.
    await waitForAsync(page, async () => { const aegis = globalThis.window.aegis; if (!aegis)
        throw new Error('Missing test facade'); const saved = await aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard); return JSON.stringify(saved.cards) === JSON.stringify(aegis.canvas.board.cards); }, null, { timeout: 15000 });
    const saved = await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard);
    });
    writeFileSync(out('wireframe-saved-board.json'), JSON.stringify(saved, null, 2));
    assert.equal(present(saved.cards.find(c => c.id === heading.id)).text, 'Welcome back');
    assert.equal(present(present(saved.cards.find(c => c.id === box.id)).props).dg, 7);
    assert.equal(present(present(saved.cards.find(c => c.id === box.id)).props).fill, '#dbeafe');
    await page.reload();
    await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board);
    assert.equal((await snapshot()).cards.length, saved.cards.length);
    assert.equal(present(present((await snapshot()).cards.find(c => c.id === box.id)).props).placeholder, true, 'placeholder persists after reload');
    // R is occupied by the core Read-me tool. Keep the existing box chord.
    await page.locator('#stage').focus();
    await page.keyboard.press('r');
    assert.equal(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.tool;
    }), 'readme');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+r');
    assert.equal(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.tool;
    }), 'wireframe');
    await page.keyboard.press('Escape');
    // An isolated section fixture makes pointer behaviour observable without moving other cards.
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        aegis.apply([
            { op: 'create', type: 'section', newId: 'glasssec', x: 3000, y: 2000, w: 800, h: 500, text: 'Glass section', props: { fill: '#cbd5e1', radius: 24 } },
            { op: 'create', type: 'box', newId: 'glassbox', x: 3100, y: 2100, w: 160, h: 100, props: { fill: '#dbeafe', img: 'Landscape', placeholder: true } },
            { op: 'create', type: 'title', newId: 'glasstitle', x: 3400, y: 2100, w: 260, h: 60, text: 'Hollow title' },
        ]);
        aegis.canvas.setView({ x: 450 - 3000 * .75, y: 140 - 2000 * .75, z: .75 });
        aegis.canvas.select([]);
    });
    await page.waitForTimeout(300);
    await drag(3050, 2070, 250, 180);
    assert.deepEqual(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.selection();
    }), ['glassbox'], 'unselected glass starts a marquee through the section body');
    assert.equal(present((await snapshot()).cards.find(c => c.id === 'glasssec')).x, 3000, 'marquee does not move the section');
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.select([]);
    });
    await clickAt(3050, 2300);
    assert.deepEqual(await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.selection();
    }), ['glasssec'], 'a tap selects the section');
    const sectionBeforeDrag = (await snapshot()).cards.filter(c => c.id.startsWith('glass'));
    await drag(3050, 2300, 30, 35);
    const sectionAfterDrag = (await snapshot()).cards.find(c => c.id === 'glasssec');
    const sectionDx = present(sectionAfterDrag).x - 3000, sectionDy = present(sectionAfterDrag).y - 2000;
    assert.ok(sectionDx || sectionDy, 'selected body drags the section');
    for (const c of sectionBeforeDrag) {
        const next = (await snapshot()).cards.find(k => k.id === c.id);
        assert.deepEqual([present(next).x - c.x, present(next).y - c.y], [sectionDx, sectionDy]);
    }
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.select([]);
    });
    await page.waitForTimeout(250);
    const name = page.locator('[data-id="glasssec"] .wf-section-name');
    const nameRect = await name.boundingBox();
    await page.mouse.move(present(nameRect).x + 20, present(nameRect).y + 10);
    await page.mouse.down();
    await page.mouse.move(present(nameRect).x + 50, present(nameRect).y + 40, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.notEqual(present((await snapshot()).cards.find(c => c.id === 'glasssec')).x, present(sectionAfterDrag).x, 'name drags an unselected section');
    let labelWidth;
    for (const z of [1, .5, 2] as const) {
        await page.evaluate(z => {
            const aegis = globalThis.window.aegis;
            if (!aegis)
                throw new Error('Missing test facade');
            return aegis.canvas.setView({ x: 450 - 3000 * z, y: 140 - 2000 * z, z });
        }, z);
        await page.waitForTimeout(250);
        const width = present((await name.boundingBox())).width;
        if (z === 1)
            labelWidth = width;
        else
            assert.ok(Math.abs(width - present(labelWidth) * (z === .5 ? 1 : 2)) < 2, 'labels counter-scale below 100% and retain natural scale above it');
    }
    await page.evaluate(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.setView({ x: 450 - 3000 * .75, y: 140 - 2000 * .75, z: .75 });
    });
    await select('glasstitle');
    await panel.getByRole('button', { name: 'Hollow letters', exact: true }).click();
    await prop('Letter outline width', 2);
    await prop('Letter outline colour', '#2563eb');
    const titleBody = page.locator('[data-id="glasstitle"] .body');
    assert.equal(await titleBody.evaluate(el => getComputedStyle(el).color), 'rgba(0, 0, 0, 0)');
    assert.equal(await titleBody.evaluate(el => getComputedStyle(el).webkitTextStrokeWidth), '2px');
    assert.equal(await titleBody.evaluate(el => getComputedStyle(el).webkitTextStrokeColor), 'rgb(37, 99, 235)');
    await panel.getByRole('button', { name: 'Filled letters', exact: true }).click();
    await page.waitForTimeout(250);
    assert.notEqual(await titleBody.evaluate(el => getComputedStyle(el).color), 'rgba(0, 0, 0, 0)', 'filled letters restores the fill');
    await panel.getByRole('button', { name: 'Hollow letters', exact: true }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: out('wireframe-gap-options.png') });
    await waitForAsync(page, async () => { const aegis = globalThis.window.aegis; if (!aegis)
        throw new Error('Missing test facade'); return JSON.stringify((await aegis.host.get('/boards/' + aegis.canvas.board.id).then(globalThis.window.__checkBoard)).cards) === JSON.stringify(aegis.canvas.board.cards); }, undefined);
    await page.reload();
    await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board);
    await page.waitForTimeout(250);
    assert.equal(present(present((await snapshot()).cards.find(c => c.id === 'glasstitle')).props).hollow, true);
    assert.equal(await page.locator('[data-id="glasstitle"] .body').evaluate(el => getComputedStyle(el).webkitTextStrokeWidth), '2px', 'hollow title renders after reload');
    assert.equal(errors.length, 0, errors.join('\n'));
    log('PASS: board persisted and reloaded;', saved.cards.length, 'cards; no browser errors; temporary data', data);
}
catch (error) {
    await page.screenshot({ path: out('wireframe-fail.png') });
    process.stderr.write(formatCheckOutput(error instanceof Error ? error.stack : String(error)) + '\n');
    process.stderr.write(formatCheckOutput('browser errors', errors) + '\n');
    process.exitCode = 1;
}
finally {
    await browser.close();
    host.kill();
    vite.kill();
}
