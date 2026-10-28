import type { Card } from '@aegis/domain';
import { HtmlStateSchema } from '@aegis/domain/html-state';
import { BoardSchema } from '@aegis/domain/schema';
import { AgentReceiptSchema, AgentSnapshotSchema } from '@aegis/protocol/agents';
import { BoardListEntrySchema } from '@aegis/protocol/http';
import { LibrarySnapshotSchema } from '@aegis/protocol/services';
import { format as formatCheckOutput } from 'node:util';
import { z } from 'zod';
import type {} from '../../app/src/platform/test-facade.ts';
import { checkTemp, ComposerRequestSchema, installBrowserChecks } from './agents-submit.ts';
// Fresh agent results must remain reversible after rendering and saving the shipped UI.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDemoBatch } from './agents-submit.ts';
import { out } from './out.ts';
import { chromium, webkit } from './playwright.ts';
function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
    throw new Error('Missing expected test value'); return value; }
const demoBatch = await loadDemoBatch();
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const build = spawnSync('npm', ['--prefix', 'app', 'run', 'build'], { cwd: repo, encoding: 'utf8' });
assert.equal(build.status, 0, build.stdout + build.stderr);
const token = `trust-undo-${process.pid}`, data = checkTemp(join(tmpdir(), 'aegis-trust-undo-'));
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], {
    cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_UI: repo + '/app/dist', AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
const port = await new Promise<string>((resolve, reject) => {
    let output = '';
    host.stdout.on('data', d => {
        output += d;
        const m = /"port":(\d+)/.exec(output);
        if (m?.[1])
            resolve(m[1]);
    });
    host.stderr.on('data', d => process.stderr.write(d));
    host.once('exit', code => reject(Error(`Host exited ${code}`)));
});
async function api(path: '/boards', body: unknown): Promise<import('@aegis/domain').Board>;
async function api(path: '/boards'): Promise<import('@aegis/protocol/http').BoardListEntry[]>;
async function api(path: '/library'): Promise<import('@aegis/protocol/services').LibrarySnapshot>;
async function api(path: '/agents', body: unknown): Promise<z.output<typeof AgentReceiptSchema>[]>;
async function api(path: `/agents?board=${string}`): Promise<import('@aegis/protocol/agents').AgentSnapshot[]>;
async function api(path: `/boards/${string}`): Promise<import('@aegis/domain').Board>;
async function api(path: string, body?: unknown) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.ok(response.ok, `${path}: ${response.status}`);
    const value: unknown = await response.json();
    if (path === '/boards' && body === undefined)
        return BoardListEntrySchema.array().parse(value);
    if (path === '/library')
        return LibrarySnapshotSchema.parse(value);
    if (path === '/agents')
        return AgentReceiptSchema.array().parse(value);
    if (path.startsWith('/agents?'))
        return AgentSnapshotSchema.array().parse(value);
    return BoardSchema.parse(value);
}
const results: unknown[] = [], failures: string[] = [];
try {
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]] as const) {
        const browser = await engine.launch();
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        await installBrowserChecks(page);
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        try {
            const board = await api('/boards', { name: `Trust Undo ${name}` });
            await page.addInitScript(id => {
                if (window.top !== window)
                    return;
                localStorage.setItem('aegis:board', id);
                localStorage.setItem('aegis:onboarded', '1');
                localStorage.setItem('aegis:orb-hint-seen', '1');
                localStorage.setItem('aegis:model', 'fake|fake');
            }, board.id);
            await page.route('**/agents', async (route) => {
                if (route.request().method() !== 'POST')
                    return route.continue();
                const payload = ComposerRequestSchema.parse(route.request().postDataJSON());
                assert.match(present(payload.brief), /Help me plan my week/);
                await route.continue({ postData: JSON.stringify({ ...payload, brief: 'FAKE ' + JSON.stringify(demoBatch) }) });
            });
            await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
            await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board);
            assert.equal(await page.evaluate(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.canvas.board.cards.length;
            }), 0);
            await page.getByRole('button', { name: 'Plan my week', exact: true }).click();
            await page.waitForFunction(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.canvas.board.cards.length === 9;
            });
            await page.locator('#agentIsland[data-state="done"]').waitFor();
            await page.waitForFunction(() => {
                function present<T>(value: T | null | undefined): T {
                    if (value === undefined || value === null)
                        throw new Error('Missing expected test value');
                    return value;
                }
                return present(document.querySelector('#saveState, .bar-right [data-save-state]')).textContent.toLowerCase() === 'saved';
            });
            await page.waitForTimeout(500);
            await page.evaluate(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                aegis.canvas.select([]);
                aegis.canvas.fit();
            });
            await page.waitForFunction(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return !!aegis.canvas.board.cards.find(c => c.type === 'object' && c.kind === 'html')?.data.state;
            });
            await page.waitForFunction(() => {
                function present<T>(value: T | null | undefined): T {
                    if (value === undefined || value === null)
                        throw new Error('Missing expected test value');
                    return value;
                }
                return present(document.querySelector('#saveState, .bar-right [data-save-state]')).textContent.toLowerCase() === 'saved';
            });
            await page.waitForTimeout(250);
            const undo = page.locator('.island-result-undo');
            await page.screenshot({ path: out(`trust-undo-fresh-${name}.png`) });
            const state = await page.evaluate(async () => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return ({ board: await aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard), agents: await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`).then(globalThis.window.__checkAgents), local: (await globalThis.window.__checkBoard(JSON.parse(JSON.stringify(aegis.canvas.board)))) });
            });
            assert.deepEqual(state.local.cards, state.board.cards, 'the saved board and rendered board agree after sizing');
            writeFileSync(out(`trust-undo-fresh-${name}.json`), JSON.stringify(state, null, 2));
            assert.equal(await undo.isEnabled(), true, `${name}: fresh Undo disabled: ${await undo.getAttribute('title')}`);
            await undo.click();
            await page.waitForFunction(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.canvas.board.cards.length === 0;
            });
            assert.equal((await api(`/boards/${board.id}`)).cards.length, 0);
            await page.screenshot({ path: out(`trust-undo-empty-${name}.png`) });
            process.stdout.write(formatCheckOutput(`PASS ${name}: Plan my week creates nine windows and one Undo removes all nine`) + '\n');
            // A real editor save must still protect the person's work, even after remeasurement.
            const { id: agentId } = present((await api('/agents', { boardId: board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKE ' + JSON.stringify(demoBatch) }))[0]);
            await page.waitForFunction(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.canvas.board.cards.length === 9;
            });
            await page.waitForFunction(async (id) => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`).then(globalThis.window.__checkAgents)).find(a => a.id === id)?.history[0]?.canUndo;
            }, agentId);
            await page.waitForFunction(() => {
                function present<T>(value: T | null | undefined): T {
                    if (value === undefined || value === null)
                        throw new Error('Missing expected test value');
                    return value;
                }
                return present(document.querySelector('#saveState, .bar-right [data-save-state]')).textContent.toLowerCase() === 'saved';
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
                aegis.canvas.select([present(aegis.canvas.board.cards.find(c => c.type === 'doc')).id]);
                present(document.getElementById('stage')).focus();
            });
            await page.keyboard.press('Enter');
            await page.locator('.docs-panel .tiptap').fill('Keep my real later edit.');
            await page.waitForFunction(() => document.querySelector('.docs-panel [data-saved]')?.textContent === 'Saved');
            await page.getByRole('button', { name: 'Close document', exact: true }).click();
            await page.waitForFunction(async (id) => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                const agent = (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`).then(globalThis.window.__checkAgents)).find(a => a.id === id);
                return agent?.history[0]?.undoBlockedReason && !agent.history[0].canUndo;
            }, agentId);
            const editedHistory = present((await api(`/agents?board=${board.id}`)).find(a => a.id === agentId)).history[0];
            const refused = await fetch(`http://127.0.0.1:${port}/agents/${agentId}/history/${present(editedHistory).id}/undo`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{}' });
            assert.equal(refused.status, 400);
            assert.ok((await api(`/boards/${board.id}`)).cards.some(c => c.props?.body === 'Keep my real later edit.'));
            await page.screenshot({ path: out(`trust-undo-edited-${name}.png`) });
            process.stdout.write(formatCheckOutput(`PASS ${name}: a real document edit remains protected after measurement and the Undo endpoint refuses it`) + '\n');
            // Populate Windows and an older tray, then reveal a whole new mixed batch at 1440 x 900.
            await page.evaluate(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                aegis.apply([{ op: 'board_set', set: { tray: Array.from({ length: 12 }, (_, i) => ({ id: `older${i}`, type: 'note', text: `Earlier idea ${i + 1}` })) } }]);
            });
            await page.keyboard.press('Meta+Shift+k');
            const input = page.getByLabel('Capture idea', { exact: true });
            await input.fill('The first saved thought\nhttps://example.com/research\n- Read the paper\n- [x] Save the source\nThe last saved thought');
            await input.press('Enter');
            await page.waitForFunction(() => document.querySelectorAll('.tray-item.capture-highlight').length === 4);
            await page.waitForTimeout(250);
            const capture = await page.evaluate(async () => {
                function present<T>(value: T | null | undefined): T {
                    if (value === undefined || value === null)
                        throw new Error('Missing expected test value');
                    return value;
                }
                const rows = [...document.querySelectorAll('.tray-item.capture-highlight')];
                const visible = (node: Element | null) => {
                    if (!node)
                        throw new Error('Missing captured item');
                    const r = node.getBoundingClientRect();
                    let top = 0, bottom = innerHeight;
                    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
                        if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY))
                            continue;
                        const p = parent.getBoundingClientRect();
                        top = Math.max(top, p.top);
                        bottom = Math.min(bottom, p.bottom);
                    }
                    return { top: r.top, bottom: r.bottom, clipTop: top, clipBottom: bottom, visible: r.top >= top - 1 && r.bottom <= bottom + 1 };
                };
                const panel = present(rows[0]).closest('[data-panel="unsorted"]');
                return { rows: rows.map(visible), count: { text: present(present(panel).querySelector('.muted')).textContent, ...visible(present(panel).querySelector('.muted')) }, trayHeight: present(present(panel).querySelector('.pbody')).clientHeight, storedWindowsFold: (await globalThis.window.__checkPanels(JSON.parse(present(localStorage.getItem('aegis:panels'))))).folded.layers };
            });
            await page.screenshot({ path: out(`trust-capture-batch-${name}.png`) });
            assert.equal(capture.rows.length, 4);
            assert.ok(capture.rows.every(r => r.visible), JSON.stringify(capture));
            assert.ok(capture.count.visible);
            assert.match(capture.count.text, /16 ideas/);
            assert.ok(capture.trayHeight >= 220);
            assert.equal(capture.storedWindowsFold, false, 'temporary folding does not change the saved Windows preference');
            assert.equal(await page.evaluate(() => {
                function present<T>(value: T | null | undefined): T {
                    if (value === undefined || value === null)
                        throw new Error('Missing expected test value');
                    return value;
                }
                return present(document.activeElement).id;
            }), 'stage');
            await page.getByRole('button', { name: 'Put on board', exact: true }).click();
            await page.waitForFunction(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.canvas.board.cards.length === 13;
            });
            assert.equal(await page.locator('#side.capture-reveal').count(), 0);
            assert.equal(await page.locator('[data-panel="layers"]').evaluate(el => el.classList.contains('folded')), false);
            assert.equal(await page.evaluate(() => {
                function present<T>(value: T | null | undefined): T {
                    if (value === undefined || value === null)
                        throw new Error('Missing expected test value');
                    return value;
                }
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return present(aegis.canvas.board.tray).length;
            }), 12);
            await page.locator('.capture-confirmation [data-undo]').click();
            await page.waitForFunction(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.canvas.board.cards.length === 9;
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
                return present(aegis.canvas.board.tray).length;
            }), 12);
            process.stdout.write(formatCheckOutput(`PASS ${name}: all four captures and count are visible at 1440 x 900, with highlights, Put on board, Undo and restored Windows`) + '\n');
            const widgetBoard = await api('/boards', { name: `Widget Undo ${name}` });
            await page.waitForFunction(() => {
                function present<T>(value: T | null | undefined): T {
                    if (value === undefined || value === null)
                        throw new Error('Missing expected test value');
                    return value;
                }
                return present(document.querySelector('#saveState, .bar-right [data-save-state]')).textContent.toLowerCase() === 'saved';
            });
            await page.evaluate(async (board) => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                aegis.canvas.setBoard((await globalThis.window.__checkBoard(JSON.parse(board))));
                aegis.canvas.setView({ x: 400, y: 160, z: 1 });
            }, JSON.stringify(widgetBoard));
            const { id: widgetAgent } = present((await api('/agents', { boardId: widgetBoard.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKE ' + JSON.stringify([demoBatch.find(c => c.type === 'object' && c.kind === 'html')]) }))[0]);
            await page.waitForFunction(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                const card = aegis.canvas.board.cards[0];
                return card?.type === 'object' && card.kind === 'html' && !!card.data.state;
            });
            await page.waitForFunction(async (id) => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`).then(globalThis.window.__checkAgents)).find(a => a.id === id)?.history[0]?.canUndo;
            }, widgetAgent);
            const slider = page.frameLocator('.card.kind-html iframe').locator('#minutes');
            assert.equal(await slider.inputValue(), '45');
            await slider.focus();
            await slider.press('ArrowRight');
            await page.waitForFunction(async () => {
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
                return present((await globalThis.window.__checkHtmlState(JSON.parse(present(present(htmlCard(present(aegis.canvas.board.cards[0])).data).state)))).controls[0]).value === '46';
            });
            await page.waitForFunction(async (id) => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                const a = (await aegis.host.get(`/agents?board=${aegis.canvas.board.id}`).then(globalThis.window.__checkAgents)).find(a => a.id === id);
                return a?.history[0]?.undoBlockedReason && !a.history[0].canUndo;
            }, widgetAgent);
            await page.waitForFunction(async () => {
                function htmlCard(value: Card | null | undefined) { if (!value || value.type !== 'object' || value.kind !== 'html')
                    throw new Error('Expected html card'); return value; }
                function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
                    throw new Error('Missing expected test value'); return value; }
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                const saved = await aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard);
                return present((await globalThis.window.__checkHtmlState(JSON.parse(present(present(htmlCard(present(saved.cards[0])).data).state)))).controls[0]).value === '46';
            });
            assert.equal(present(HtmlStateSchema.parse(JSON.parse(z.object({ data: z.object({ state: z.string() }) }).parse((await api(`/boards/${widgetBoard.id}`)).cards[0]).data.state)).controls[0]).value, '46');
            await page.waitForFunction(() => {
                function present<T>(value: T | null | undefined): T {
                    if (value === undefined || value === null)
                        throw new Error('Missing expected test value');
                    return value;
                }
                return present(document.querySelector('#saveState, .bar-right [data-save-state]')).textContent.toLowerCase() === 'saved';
            });
            await page.waitForFunction(() => { function optionalDom<T extends Element>(value: Element | null | undefined, kind: {
                new (): T;
            }): T | null { if (value == null)
                return null; if (!(value instanceof kind))
                throw new Error('Unexpected DOM element type'); return value; } return optionalDom(document.querySelector('.island-result-undo'), HTMLButtonElement)?.disabled === true; });
            await page.screenshot({ path: out(`trust-undo-widget-edited-${name}.png`) });
            process.stdout.write(formatCheckOutput(`PASS ${name}: widget defaults leave Undo enabled and a keyboard slider edit saves and blocks Undo`) + '\n');
            assert.deepEqual(errors, []);
            results.push({ engine: name, windows: [0, 9, 0], laterEditProtected: true, widgetEditProtected: true, capture });
        }
        catch (error) {
            failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
            process.stderr.write(formatCheckOutput(error) + '\n');
            await page.screenshot({ path: out(`trust-undo-fail-${name}.png`) });
        }
        finally {
            await browser.close();
        }
    }
}
finally {
    host.kill();
    writeFileSync(out('trust-undo-results.json'), JSON.stringify({ data, results, failures }, null, 2));
}
assert.deepEqual(failures, []);
