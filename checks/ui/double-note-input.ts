import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format as formatCheckOutput } from 'node:util';
import type { Browser } from 'playwright';
import type {} from '../../app/src/platform/test-facade.ts';
import { checkTemp, installBrowserChecks } from './agents-submit.ts';
import { out } from './out.ts';
import { chromium, webkit } from './playwright.ts';
declare global {
    interface Window {
        restoreDoubleNoteFrames?: () => void;
    }
}
export async function verifyDoubleNoteInput() {
    const root = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), results: unknown[] = [], failures: string[] = [];
    const check = (actual: unknown, expected: unknown, label: string) => {
        try {
            assert.deepEqual(actual, expected, label);
        }
        catch (error) {
            failures.push(error instanceof Error ? error.message : String(error));
        }
        process.stdout.write(formatCheckOutput(label, JSON.stringify(actual)) + '\n');
    };
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]] as const) {
        const token = `double-note-${name}-${process.pid}`, host = spawn(process.execPath, ['dist/main.js'], { cwd: root + '/agent', env: { ...process.env, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_UI: root + '/app/dist', AEGIS_DATA: checkTemp('/tmp/aegis-double-data-'), AEGIS_VITE_CACHE: checkTemp('/tmp/aegis-double-cache-'), AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
        let browser: Browser | undefined;
        try {
            const port = await new Promise<string>((done, fail) => {
                let log = '';
                const timer = setTimeout(() => fail(Error(log)), 15000);
                host.stdout.on('data', data => {
                    log += data;
                    const m = /"port":(\d+)/.exec(log);
                    if (m?.[1]) {
                        clearTimeout(timer);
                        done(m[1]);
                    }
                });
                host.once('exit', fail);
            });
            browser = await engine.launch();
            const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
            await installBrowserChecks(page);
            await page.addInitScript(() => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); });
            await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
            await page.waitForFunction(() => globalThis.window.aegis?.canvas.board);
            await page.evaluate(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                aegis.canvas.setView({ x: 2000, y: 2000, z: 1 });
                localStorage.setItem('aegis:double-click-note', 'off');
            });
            await page.waitForTimeout(100);
            const initial = await page.evaluate(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.canvas.board.cards.length;
            });
            await page.evaluate(() => {
                const request = window.requestAnimationFrame.bind(window), held: FrameRequestCallback[] = [];
                let id = 0;
                window.requestAnimationFrame = callback => { held.push(callback); return --id; };
                window.restoreDoubleNoteFrames = () => {
                    window.requestAnimationFrame = request;
                    for (const callback of held)
                        request(callback);
                    delete window.restoreDoubleNoteFrames;
                };
            });
            await page.waitForTimeout(60);
            await page.mouse.dblclick(900, 300);
            check(await page.evaluate(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.canvas.board.cards.length;
            }), initial, `${name}: disabled double-click remains inert while paint is held`);
            await page.evaluate(() => localStorage.setItem('aegis:double-click-note', 'on'));
            await page.mouse.dblclick(900, 300);
            check(await page.evaluate(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.canvas.board.cards.length;
            }), initial + 1, `${name}: native double-click commits before the next paint`);
            await page.evaluate(() => { const restore = window.restoreDoubleNoteFrames; if (!restore)
                throw new Error("Missing held animation frames"); restore(); });
            await page.waitForFunction(count => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.canvas.board.cards.length === count;
            }, initial + 1);
            await page.waitForFunction(() => {
                function present<T>(value: T | null | undefined): T {
                    if (value === undefined || value === null)
                        throw new Error('Missing expected test value');
                    return value;
                }
                return present(document.querySelector('#saveState, .bar-right [data-save-state]')).textContent.toLowerCase() === 'saved';
            });
            const board = await page.evaluate(() => {
                const aegis = globalThis.window.aegis;
                if (!aegis)
                    throw new Error('Missing test facade');
                return aegis.host.get(`/boards/${aegis.canvas.board.id}`).then(globalThis.window.__checkBoard);
            });
            check(board.cards.length, initial + 1, `${name}: release of held paint retains one persisted creation`);
            results.push({ engine: name });
        }
        finally {
            await browser?.close();
            host.kill('SIGTERM');
        }
    }
    writeFileSync(out('double-note-input.json'), JSON.stringify({ results, failures }, null, 2));
    assert.deepEqual(failures, []);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
    await verifyDoubleNoteInput();
