import { rmSync } from 'node:fs';
const ownedTemporaryDirectories: string[] = [];
export function checkTemp(prefix: string): string { const directory = mkdtempSync(prefix); ownedTemporaryDirectories.push(directory); return directory; }
process.once('exit', () => { for (const directory of ownedTemporaryDirectories) rmSync(directory, {recursive:true,force:true}); });

import { z } from 'zod';
import { BoardSchema } from '@aegis/domain/schema';
import { AgentSnapshotSchema, AgentReceiptSchema } from '@aegis/protocol/agents';
import { BatchResponseSchema } from '@aegis/protocol/http';
import { HtmlStateSchema } from '@aegis/domain/html-state';
const browserBoundarySchemas = {
 __checkBoard: BoardSchema,
 __checkAgents: AgentSnapshotSchema.array(),
 __checkAgentReceipts: AgentReceiptSchema.array(),
 __checkBatch: BatchResponseSchema,
 __checkHtmlState: HtmlStateSchema,
};
type BrowserBoundaryParsers = { [K in keyof typeof browserBoundarySchemas]: (value: unknown) => Promise<z.output<(typeof browserBoundarySchemas)[K]>> };
declare global { interface Window extends BrowserBoundaryParsers {} }
// Browser callbacks send external JSON to these real schema parsers before inspecting it.
export async function installBrowserChecks(page: Page): Promise<void> {
 await Promise.all(Object.entries(browserBoundarySchemas).map(([name, schema]) => page.exposeFunction(name, (value: unknown) => schema.parse(value))));
}
import type { Page, Browser, Locator } from 'playwright';
import type { ChildProcess } from 'node:child_process';
import type {} from '../../app/src/platform/test-facade.ts';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from './playwright.ts';
import { out } from './out.ts';
export async function verifyAgentSubmission() {
    const root = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), results = [], failures: string[] = [];
    const check = (actual: unknown, expected: unknown, label: string) => { try {
        assert.deepEqual(actual, expected, label);
    }
    catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
    } console.log(label, JSON.stringify(actual)); };
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]] as const) {
        const token = `agent-submit-${name}-${process.pid}`, host = spawn(process.execPath, ['dist/main.js'], { cwd: root + '/agent', env: { ...process.env, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_UI: root + '/app/dist', AEGIS_DATA: checkTemp('/tmp/aegis-submit-data-'), AEGIS_VITE_CACHE: checkTemp('/tmp/aegis-submit-cache-'), AEGIS_FAKE_MODEL: '1', AEGIS_FAKE_DELAY_MS: '1800' }, stdio: ['ignore', 'pipe', 'pipe'] });
        let browser: Browser | undefined; const gate = Promise.withResolvers<void>();
        try {
            const port = await new Promise<string>((done, fail) => { let log = ''; const timer = setTimeout(() => fail(Error(log)), 15000); host.stdout.on('data', data => { log += data; const m = /"port":(\d+)/.exec(log); if (m?.[1]) {
                clearTimeout(timer);
                done(m[1]);
            } }); host.once('exit', fail); });
            browser = await engine.launch();
            const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await installBrowserChecks(page);
            await page.addInitScript(() => { localStorage.setItem('aegis:onboarded', '1'); localStorage.setItem('aegis:orb-hint-seen', '1'); localStorage.setItem('aegis:model', 'fake|fake'); });
            await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);
            await page.waitForFunction(() => window.aegis?.canvas.board);
            await page.route('**/agents', async (route) => { if (route.request().method() !== 'POST') {
                await route.continue();
                return;
            } const response = await route.fetch(); await gate.promise; await route.fulfill({ response }); });
            await page.keyboard.press('/');
            await page.locator('#prompt').waitFor({ state: 'visible' });
            await page.locator('#orbMenuButton').click();
            await page.locator('#orbMenu').getByRole('menuitem', { name: 'Agent count', exact: false }).click();
            await page.locator('#orbMenu').getByRole('menuitemradio', { name: '2 agents', exact: true }).click();
            await page.locator('#prompt').fill('FAKE []');
            await page.locator('#prompt').press('Enter');
            await page.waitForFunction(() => document.querySelectorAll('.agent-window').length === 2);
            check(await page.locator('#prompt').isVisible(), false, `${name}: accepted submit collapses before its held HTTP acknowledgement`);
            await page.keyboard.press('/');
            await page.locator('#orbMenuButton').click();
            await page.locator('#orbMenu').getByRole('menuitem', { name: 'Agent count', exact: false }).click();
            await page.locator('#orbMenu').getByRole('menuitemradio', { name: '1 agent', exact: true }).click();
            gate.resolve();
            await page.waitForFunction(() => { function dom<T extends Element>(value: Element | null | undefined, kind: {
                new (): T;
            }): T { if (!(value instanceof kind))
                throw new Error('Unexpected DOM element type'); return value; } function present<T>(value: T | null | undefined): T { if (value === undefined || value === null)
                throw new Error('Missing expected test value'); return value; } return !dom(present(document.getElementById('send')), HTMLButtonElement).disabled; });
            check(await page.locator('#prompt').isVisible(), true, `${name}: late acknowledgement retains the newer native slash and menu intent`);
            await page.unroute('**/agents');
            await page.route('**/agents', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Submission fixture unavailable' }) }) : route.continue());
            await page.locator('#prompt').fill('Keep this unsent thought');
            await page.locator('#prompt').press('Alt+Enter');
            await page.getByRole('alert').filter({ hasText: 'Submission fixture unavailable' }).waitFor();
            check({ text: await page.locator('#prompt').inputValue(), visible: await page.locator('#prompt').isVisible() }, { text: 'Keep this unsent thought', visible: true }, `${name}: refused submission restores the untouched draft`);
            check(await page.locator('.agent-window').count(), 2, `${name}: refused submission starts no additional agents`);
            results.push({ engine: name });
        }
        finally {
            gate.resolve();
            await browser?.close();
            host.kill('SIGTERM');
        }
    }
    writeFileSync(out('agents-submit.json'), JSON.stringify({ results, failures }, null, 2));
    assert.deepEqual(failures, []);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
    await verifyAgentSubmission();
