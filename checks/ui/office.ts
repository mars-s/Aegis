import { SHAPES } from '@aegis/domain/objects';
import { format as formatCheckOutput } from 'node:util';
import type {} from '../../app/src/platform/test-facade.ts';
import { checkTemp, installBrowserChecks } from './agents-submit.ts';
// Office tools in the side editors: sheet ranges, status sums, ribbon sort and column type; slide ribbon and Present.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDemoBatch } from './agents-submit.ts';
import { out } from './out.ts';
import { chromium } from './playwright.ts';
function present<T>(value: T | null | undefined): T {
    if (value === undefined || value === null)
        throw new Error('Missing expected test value');
    return value;
}
const demoBatch = await loadDemoBatch();
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['run', 'build'], { cwd: repo + '/app', encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `office-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], {
    cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: checkTemp(join(tmpdir(), 'aegis-office-')), AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
const port = await new Promise<string>((resolve, reject) => {
    host.stdout.on('data', d => {
        const m = /"port":(\d+)/.exec(String(d));
        if (m?.[1])
            resolve(m[1]);
    });
    host.on('exit', code => reject(Error(`Host exited ${code}`)));
});
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await installBrowserChecks(page);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
        if (window.top === window) {
            localStorage.setItem('aegis:onboarded', '1');
            localStorage.setItem('aegis:orb-hint-seen', '1');
        }
    });
    await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
    await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board);
    await page.evaluate(batch => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.host.post('/agents', { boardId: aegis.canvas.board.id, brief: 'FAKE ' + batch, model: { provider: 'fake', modelId: 'fake' } }).then(globalThis.window.__checkAgentReceipts);
    }, JSON.stringify(demoBatch));
    await page.waitForFunction(() => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.canvas.board.cards.length === 9;
    });
    await page.waitForFunction(async () => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`).then(globalThis.window.__checkAgents)).every(a => !a.running);
    });
    await page.keyboard.press('Escape');
    const saved = () => page.waitForFunction(() => document.querySelector('.side-editor [data-saved]')?.textContent === 'Saved', null, { timeout: 15000 });
    const open = async (test: "c.kind === 'sheet'" | "c.type === 'deck'") => {
        const id = await page.evaluate(src => {
            function present<T>(value: T | null | undefined): T {
                if (value === undefined || value === null)
                    throw new Error('Missing expected test value');
                return value;
            }
            const aegis = globalThis.window.aegis;
            if (!aegis)
                throw new Error('Missing test facade');
            return present(aegis.canvas.board.cards.find(c => src === "c.kind === 'sheet'" ? c.type === 'object' && c.kind === 'sheet' : c.type === 'deck')).id;
        }, test);
        await page.evaluate(id => {
            const aegis = globalThis.window.aegis;
            if (!aegis)
                throw new Error('Missing test facade');
            return aegis.canvas.select([id]);
        }, id);
        await page.keyboard.press('Enter');
        return id;
    };
    // Sheet: drag a range, read the status sums, then sort by the active column from the ribbon.
    const sheetId = await open("c.kind === 'sheet'");
    const grid = page.locator('.sheet-grid');
    await grid.waitFor();
    const from = await grid.locator('td[data-r="1"][data-c="1"]').boundingBox(), to = await grid.locator('td[data-r="5"][data-c="2"]').boundingBox();
    await page.mouse.move(present(from).x + 20, present(from).y + 10);
    await page.mouse.down();
    await page.mouse.move(present(to).x + 20, present(to).y + 10, { steps: 6 });
    await page.mouse.up();
    assert.equal(await grid.locator('td.in-range').count(), 10, 'a dragged range covers every cell between its corners');
    assert.equal(await grid.locator('thead th.hl').count(), 2);
    assert.equal(await grid.locator('tbody th.hl').count(), 5);
    const sheet = SHAPES.sheet.parse(await page.evaluate(id => {
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        const card = aegis.canvas.board.cards.find(c => c.id === id);
        if (!card || card.type !== 'object' || card.kind !== 'sheet')
            throw new Error('Expected sheet card');
        return card.data;
    }, sheetId));
    const values = present(sheet).rows.flatMap(r => r.cells.slice(1, 3)).map(Number), sum = values.reduce((a, b) => a + b, 0);
    assert.match(present(await page.locator('.sheet-status [data-stats]').textContent()), new RegExp(`^Sum ${sum}\\s+Average .+\\s+Count ${values.length}$`));
    await page.screenshot({ path: out(`office-sheet-range-${Date.now()}.png`) });
    await grid.locator('td[data-r="1"][data-c="1"]').click();
    await page.getByRole('button', { name: 'Sort descending', exact: true }).click();
    await saved();
    const sorted = SHAPES.sheet.parse((await page.evaluate(id => {
        function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
            throw new Error('Missing expected test value'); return value; }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard).then(b => present(b.cards.find(c => c.id === id)).data);
    }, sheetId))).rows.map(r => Number(r.cells[1]));
    assert.deepEqual(sorted, [...sorted].sort((a, b) => b - a), 'Sort descending orders the active column on the host');
    await grid.locator('td[data-r="2"][data-c="1"]').click();
    await page.keyboard.press('Shift+ArrowDown');
    assert.equal(await grid.locator('td.in-range').count(), 2, 'Shift+arrow extends the range');
    process.stdout.write(formatCheckOutput('PASS sheet ranges by drag and Shift+arrow, header highlight, status sum/average/count and ribbon sort saved to the host') + '\n');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // Slides: change the layout from the ribbon, duplicate, then present and step with the keyboard.
    const deckId = await open("c.type === 'deck'");
    await page.locator('.deck-ribbon').waitFor();
    const before = (await page.evaluate(id => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(present(aegis.canvas.board.cards.find(c => c.id === id)).props).slides).length;
    }, deckId));
    await page.getByRole('button', { name: 'Duplicate slide', exact: true }).click();
    await saved();
    assert.equal(await page.evaluate(id => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(present(aegis.canvas.board.cards.find(c => c.id === id)).props).slides).length;
    }, deckId), before + 1);
    await page.locator('.deck-ribbon [data-layout], .deck-ribbon button[aria-label="Slide layout"]').click();
    await page.getByRole('menuitemradio', { name: 'Title and text', exact: true }).click();
    await saved();
    assert.equal(await page.evaluate(id => {
        function present<T>(value: T | null | undefined): T {
            if (value === undefined || value === null)
                throw new Error('Missing expected test value');
            return value;
        }
        const aegis = globalThis.window.aegis;
        if (!aegis)
            throw new Error('Missing test facade');
        return present(present(present(present(aegis.canvas.board.cards.find(c => c.id === id)).props).slides)[1]).layout;
    }, deckId), 'text');
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    const show = page.getByRole('dialog', { name: 'Presenting slides' });
    await show.waitFor();
    const counter = () => show.locator('.deck-present-count').textContent();
    const first = await counter();
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await counter(), first);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.elementFromPoint(innerWidth - 20, 20)?.closest('.deck-present') !== null), true, 'Present covers the editor panel');
    await page.screenshot({ path: out(`office-present-${Date.now()}.png`) });
    await page.keyboard.press('Escape');
    await show.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.deck-panel').count(), 1, 'Escape leaves Present, not the editor');
    process.stdout.write(formatCheckOutput('PASS slide ribbon duplicates and re-lays out slides, Present steps with the keyboard and Escape returns to the editor') + '\n');
    assert.deepEqual(errors, []);
}
finally {
    await browser.close();
    host.kill();
}
