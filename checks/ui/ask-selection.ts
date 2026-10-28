import { z } from 'zod';
const UserMessageSchema = z.object({ content: z.array(z.object({text:z.string()})) });
const CapturedInputSchema = z.object({messages:z.array(z.object({role:z.string()}).passthrough())});
import { installBrowserChecks, checkTemp } from './agents-submit.ts';
function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
    throw new Error('Missing expected test value'); return value; }
import type { Page, Browser, Locator } from 'playwright';
import type { ChildProcess } from 'node:child_process';
import type {} from '../../app/src/platform/test-facade.ts';
// Select windows, press the selection bar's star, and the request carries exactly those windows as context.
import { chromium } from './playwright.ts';
import { out } from './out.ts';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['run', 'build'], { cwd: repo + '/app', encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `ask-${process.pid}`, data = checkTemp(join(tmpdir(), 'aegis-ask-')), capture = join(data, 'model-input.jsonl');
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], {
    cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_FAKE_CAPTURE_INPUT: capture }, stdio: ['ignore', 'pipe', 'pipe'],
});
const port = await new Promise<string>((resolve, reject) => {
    host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m?.[1])
        resolve(m[1]); });
    host.on('exit', code => reject(Error(`Host exited ${code}`)));
});
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await installBrowserChecks(page);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:model', 'fake|fake'); });
    await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
    await page.waitForFunction(() => { function control(value: Element | null | undefined) { if (!(value instanceof HTMLOptionElement || value instanceof HTMLInputElement || value instanceof HTMLButtonElement || value instanceof HTMLSelectElement || value instanceof HTMLTextAreaElement))
        throw new Error('Expected form control'); return value; } return window.aegis?.canvas?.board && [...document.querySelectorAll('#model option')].some(o => control(o).value === 'fake|fake'); });
    await page.evaluate(() => { const aegis = window.aegis; if (!aegis)
        throw new Error('Missing test facade'); return aegis.apply([0, 1, 2, 3].map(i => ({ op: 'create', type: 'note', newId: `asknote${i}`, text: `Idea ${i}`, x: i * 260, y: 0 }))); });
    await page.waitForFunction(() => { const aegis = window.aegis; if (!aegis)
        throw new Error('Missing test facade'); return aegis.canvas.board.cards.length === 4; });
    const chosen = ['asknote0', 'asknote2', 'asknote3'];
    await page.evaluate(ids => { const aegis = window.aegis; if (!aegis)
        throw new Error('Missing test facade'); aegis.canvas.fit(); aegis.canvas.select(ids); }, chosen);
    const star = page.locator('#selectionBar .selection-ai');
    await star.waitFor();
    assert.equal(await star.getAttribute('aria-label'), 'Ask AI about 3 windows');
    await page.screenshot({ path: out(`ask-selection-bar-${Date.now()}.png`) });
    await star.click();
    const chip = page.locator('#islandContext');
    await chip.waitFor();
    assert.match(present(await chip.textContent()), /3 windows · Idea 0, Idea 2/);
    assert.match(present(await page.locator('#prompt').getAttribute('placeholder')), /these 3 windows/);
    // Changing the canvas selection after pinning does not change what the request is about.
    await page.evaluate(() => { const aegis = window.aegis; if (!aegis)
        throw new Error('Missing test facade'); return aegis.canvas.select(['asknote1']); });
    assert.deepEqual(await page.evaluate(() => { function dom<T extends Element>(value: Element | null | undefined, kind: {
        new (): T;
    }): T { if (!(value instanceof kind))
        throw new Error('Unexpected DOM element type'); return value; } return [...document.querySelectorAll('.card.in-context')].map(el => dom(el, HTMLElement).dataset.id).sort(); }), chosen, 'pinned windows stay marked after the selection moves');
    await page.locator('#prompt').fill('Group these');
    await page.waitForTimeout(300);
    await page.screenshot({ path: out(`ask-selection-chip-${Date.now()}.png`) });
    await page.locator('#prompt').press('Enter');
    await page.waitForFunction(() => { function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
        throw new Error('Missing expected test value'); return value; } return present(document.getElementById('islandContext')).hidden && !document.querySelector('.card.in-context'); });
    // The fake model receives the same context parts as a real one.
    let line = '';
    for (let i = 0; i < 50 && !line; i++) {
        await page.waitForTimeout(100);
        try {
            line = readFileSync(capture, 'utf8').split('\n').find(Boolean) ?? '';
        }
        catch { }
    }
    const first = UserMessageSchema.parse(CapturedInputSchema.parse(JSON.parse(line)).messages.find(m => m.role === 'user'));
    const parts = first.content.map(c => c.text);
    assert.equal(parts[0], 'Group these');
    assert.equal(parts[1], `Work on the selected cards: ${chosen.join(', ')}.`);
    console.log('PASS the selection star pins exactly the selected windows and sends them with the request');
    // Cmd+K with windows selected pins them too; the chip's clear button drops them.
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const aegis = window.aegis; if (!aegis)
        throw new Error('Missing test facade'); document.activeElement instanceof HTMLElement && document.activeElement.blur(); aegis.canvas.select(['asknote1', 'asknote2']); });
    await page.keyboard.press('Meta+k');
    await chip.waitFor();
    assert.match(present(await chip.textContent()), /2 windows/);
    await chip.locator('.context-clear').click();
    assert.equal(await chip.isHidden(), true);
    console.log('PASS Cmd+K asks about the selection, and the chip can be cleared');
    assert.deepEqual(errors, []);
}
finally {
    await browser.close();
    host.kill();
}
