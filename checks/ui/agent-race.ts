import { BoardSchema } from '@aegis/domain/schema';
import type { AgentSnapshot } from '@aegis/protocol/agents';
import { AgentSnapshotSchema } from '@aegis/protocol/agents';
import { format as formatCheckOutput } from 'node:util';
import type { Page } from 'playwright';
import type {} from '../../app/src/platform/test-facade.ts';
import { checkTemp, installBrowserChecks } from './agents-submit.ts';
// PM6 finding 1: hold a real working snapshot until completion events reach the UI.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { out } from './out.ts';
import { chromium } from './playwright.ts';
let failurePage: Page | undefined;
declare global {
    interface Window {
        __agentRace: {
            events: AgentSnapshot[];
            deliver: ((data: unknown) => void) | null;
        };
    }
}
const offset = Number(process.env.AEGIS_PORT_OFFSET || 0);
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const token = `race-${process.pid}`, capture = Date.now();
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], {
    cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: checkTemp(join(tmpdir(), 'aegis-race-')), AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_FAKE_DELAY_MS: '1000' }, stdio: ['ignore', 'pipe', 'pipe'],
});
host.stderr.on('data', d => process.stderr.write(d));
const port = await new Promise<string>((resolve, reject) => {
    host.stdout.on('data', d => {
        const match = /"port":(\d+)/.exec(String(d));
        if (match?.[1])
            resolve(match[1]);
    });
    host.on('exit', code => reject(Error(`Host exited ${code}`)));
});
const vite = spawn('npx', ['vite', '--port', String(5200 + offset), '--strictPort'], { cwd: repo + '/app', stdio: 'pipe' });
await new Promise<void>((resolve, reject) => {
    vite.stdout.on('data', d => {
        if (/Local/.test(String(d)))
            resolve();
    });
    vite.on('exit', reject);
});
const browser = await chromium.launch(), evidence: unknown[] = [], errors: string[] = [];
let page: Page;
let gate = Promise.withResolvers<void>();
try {
    for (const legacy of [false, true] as const) {
        const board = BoardSchema.parse(await (await fetch(`http://127.0.0.1:${port}/boards`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ name: legacy ? 'Legacy reply race' : 'Revisioned reply race' }) })).json());
        page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        failurePage = page;
        await installBrowserChecks(page);
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(({ legacy, boardId }) => {
            function present<T>(value: T | null | undefined): T {
                if (value === undefined || value === null)
                    throw new Error('Missing expected test value');
                return value;
            }
            localStorage.setItem('aegis:onboarded', '1');
            localStorage.setItem('aegis:model', 'fake|fake');
            localStorage.setItem('aegis:board', boardId);
            const nativeFetch = window.fetch;
            const encoder = new TextEncoder();
            window.fetch = async (...args) => {
                const response = await nativeFetch(...args);
                if (!String(args[0]).includes('/events?'))
                    return response;
                const decoder = new TextDecoder();
                let buffered = '';
                const stream = new TransformStream<Uint8Array, Uint8Array>({
                    start(controller) {
                        window.__agentRace.deliver = (data: unknown) => controller.enqueue(encoder.encode('data: ' + JSON.stringify(data) + '\n\n'));
                    },
                    async transform(chunk, controller) {
                        buffered += decoder.decode(chunk, { stream: true });
                        for (;;) {
                            const boundary = /\r?\n\r?\n/.exec(buffered);
                            if (!boundary)
                                break;
                            const frame = buffered.slice(0, boundary.index);
                            buffered = buffered.slice(boundary.index + boundary[0].length);
                            const payload = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
                            if (!payload)
                                continue;
                            const data = await globalThis.window.__checkHostEvent(JSON.parse(payload));
                            if (legacy && data.type === 'agent')
                                delete data.revision;
                            if (data.type === 'agent')
                                window.__agentRace.events.push(await globalThis.window.__checkAgentSnapshot(data));
                            controller.enqueue(encoder.encode('data: ' + JSON.stringify(data) + '\n\n'));
                        }
                    }
                });
                return new Response(present(response.body).pipeThrough(stream), { headers: response.headers, status: response.status });
            };
            const NativeEventSource = window.EventSource;
            window.__agentRace = { events: [], deliver: null };
            window.EventSource = class extends NativeEventSource {
                set onmessage(handler: ((this: EventSource, event: MessageEvent<unknown>) => unknown) | null) {
                    const deliver = async (event: Pick<MessageEvent<unknown>, 'data'>) => {
                        if (typeof event.data !== 'string')
                            throw new Error('Expected SSE text');
                        const data = await globalThis.window.__checkHostEvent(JSON.parse(event.data));
                        if (legacy && data.type === 'agent')
                            delete data.revision;
                        if (data.type === 'agent')
                            window.__agentRace.events.push(await globalThis.window.__checkAgentSnapshot(data));
                        handler?.call(this, new MessageEvent('message', { data: JSON.stringify(data) }));
                    };
                    window.__agentRace.deliver = (data: unknown) => deliver({ data: JSON.stringify(data) });
                    super.onmessage = deliver;
                }
            };
        }, { legacy, boardId: board.id });
        await page.goto(`http://127.0.0.1:${5200 + offset}/?port=${port}&token=${token}`);
        await page.waitForFunction(() => globalThis.window.aegis?.canvas?.board && document.querySelector('#model option[value="fake|fake"]'));
        const held = Promise.withResolvers<AgentSnapshot[]>();
        gate = Promise.withResolvers<void>();
        await page.route('**/agents?*', async (route) => {
            const response = await route.fetch();
            const snapshots = AgentSnapshotSchema.array().parse(await response.json());
            if (legacy)
                for (const agent of snapshots)
                    delete agent.revision;
            if (!snapshots.some(agent => agent.running))
                return route.fulfill({ response, json: snapshots });
            held.resolve(snapshots);
            await gate.promise;
            await route.fulfill({ response, json: snapshots });
        });
        await page.keyboard.press('Meta+k');
        await page.locator('#prompt').fill('Help me think through a quieter week.');
        await page.locator('#prompt').press('Enter');
        const snapshots = await held.promise, stale = snapshots.find(agent => agent.running);
        assert.ok(stale, 'the intercepted GET contains a real working snapshot');
        assert.equal(stale.text, '');
        const id = stale.id;
        await page.waitForFunction(id => window.__agentRace.events.some(agent => agent.id === id && !agent.running && agent.text && agent.history.some(request => request.finished)), id);
        const completed = AgentSnapshotSchema.parse(await page.evaluate(id => window.__agentRace.events.findLast(agent => agent.id === id), id));
        assert.equal(completed.running, false);
        const responseArrived = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/agents');
        gate.resolve();
        await (await responseArrived).finished();
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
            return !dom(present(document.getElementById('send')), HTMLButtonElement).disabled;
        });
        await page.evaluate(() => new Promise<number>(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const state = await page.evaluate(id => {
            function present<T>(value: T | null | undefined): T {
                if (value === undefined || value === null)
                    throw new Error('Missing expected test value');
                return value;
            }
            return ({
                working: present(document.getElementById('askPill')).classList.contains('working'),
                island: present(document.getElementById('agentIsland')).dataset.state,
                count: present(document.getElementById('status')).textContent,
                answer: present(document.querySelector(`.agent-window[data-agent-id="${id}"] .agent-window-answer`)).textContent,
                history: present(document.querySelector(`.agent-window[data-agent-id="${id}"] .agent-history`)).textContent,
            });
        }, id);
        evidence.push({ legacy, snapshots, completed, afterDelayedGet: state });
        await page.screenshot({ path: out(`race-${capture}-${legacy ? 'legacy' : 'revision'}-delayed-get.png`) });
        assert.equal(state.working, false, 'a delayed working GET must not overwrite completion');
        assert.notEqual(state.island, 'running');
        assert.equal(state.count, '');
        assert.ok(state.answer.includes(completed.text), 'the spatial conversation retains the completed reply');
        assert.match(state.history, /No board changes/);
        assert.equal(await page.locator('#runStrip, #agentIsland.working').isVisible(), false);
        await page.keyboard.press('Meta+k');
        assert.equal(await page.locator('#composer .island-turn.assistant .turn-text').last().textContent(), completed.text, 'opening the conversation shows the assistant turn without reload');
        if (!legacy) {
            assert.ok(completed.revision !== undefined && stale.revision !== undefined && completed.revision > stale.revision, 'completion has a newer host revision');
            // Exercise old and duplicate events through the same EventSource handler as real events.
            await page.evaluate(({ stale, completed }) => {
                const deliver = window.__agentRace.deliver;
                if (!deliver) throw new Error('Missing event delivery handler');
                deliver({ type: 'agent', ...stale });
                deliver({ type: 'agent', ...stale, revision: completed.revision });
            }, { stale, completed });
            assert.equal(await page.locator('#composer .island-turn.assistant .turn-text').last().textContent(), completed.text);
            assert.equal(await page.locator('#askPill').evaluate(el => el.classList.contains('working')), false);
        }
        for (const width of [1440, 1586, 390] as const) {
            await page.setViewportSize({ width, height: width === 1586 ? 992 : 1000 });
            await page.screenshot({ path: out(`race-${capture}-${legacy ? 'legacy' : 'revision'}-conversation-${width}.png`) });
        }
        process.stdout.write(formatCheckOutput(`PASS ${legacy ? 'legacy' : 'revisioned'} delayed GET after completion preserves reply, history, idle count and island; conversation opens without reload`) + '\n');
        await page.close();
    }
    assert.deepEqual(errors, []);
}
catch (error) {
    process.stderr.write(formatCheckOutput(error) + '\n');
    process.exitCode = 1;
    if (typeof failurePage !== 'undefined' && !failurePage.isClosed())
        await failurePage.screenshot({ path: out(`race-${capture}-failure.png`) });
}
finally {
    gate.resolve();
    writeFileSync(out(`race-${capture}-evidence.json`), JSON.stringify({ evidence, errors }, null, 2));
    await browser.close();
    host.kill();
    vite.kill();
}
