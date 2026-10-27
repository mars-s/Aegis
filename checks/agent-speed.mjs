// Real HTTP + Pi Durable tool loop + Chromium canvas. Only the model is scripted.
// Run before changes with --baseline, afterwards without it. --live makes one provider run.
// AEGIS_FAKE_DELAY_MS models an explicitly labelled per-turn network/model delay (default 60 ms).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { out } from './ui/out.mjs';
import { pathToFileURL } from 'node:url';

// Inspect the input received by the provider, rather than its timing counters.
export function inspectModelInput(input, forbiddenBody = '') {
  const messages = JSON.stringify(input.messages.filter(m => m.role === 'user'));
  const summaryPart = input.messages.flatMap(m => m.role === 'user' && Array.isArray(m.content) ? m.content : []).find(p => p.type === 'text' && p.text.startsWith('Current board summary'));
  assert.ok(summaryPart, 'first model input includes the board summary');
  const summaryText = summaryPart.text.slice(summaryPart.text.indexOf('\n') + 1);
  if (forbiddenBody) assert.ok(!JSON.stringify(input).includes(forbiddenBody), 'first model input must omit full document bodies');
  const summary = JSON.parse(summaryText), summaryBytes = Buffer.byteLength(summaryText);
  assert.ok(summaryBytes <= 24000, `compact board summary exceeds 24000 bytes: ${summaryBytes}`);
  assert.ok(Buffer.byteLength(messages) <= 32000, 'first-turn messages stay within 32000 bytes');
  assert.ok(summary.cards.every(c => !('props' in c) && !('data' in c)), 'summary omits document bodies and object datasets');
  return { summary, summaryBytes, messageBytes: Buffer.byteLength(messages), payloadBytes: Buffer.byteLength(JSON.stringify(input)) };
}
export function assertBoundedGrowth(small, large) {
  assert.equal(small.summary.total, 25); assert.equal(large.summary.total, 250);
  assert.equal(large.summary.truncated, true);
  assert.ok(large.summary.cards.length <= 100, 'first turn pages large boards');
  assert.ok(large.summaryBytes <= small.summaryBytes * 4.5, '10x more cards must cost at most 4.5x summary bytes');
  assert.ok(large.payloadBytes <= small.payloadBytes * 4.5, 'actual provider payload grows sublinearly');
  assert.ok(large.payloadBytes - small.payloadBytes <= 20000, 'provider payload growth is bounded by 20000 bytes');
}

async function run() {
const { chromium } = await import('./ui/playwright.mjs');
const baseline = process.argv.includes('--baseline'), live = process.argv.includes('--live');
const label = `${live ? 'live' : 'scripted'}-${baseline ? 'before' : 'after'}`;
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const data = await mkdtemp(join(tmpdir(), 'aegis-speed-'));
if (live) {
  const owner = join(homedir(), 'Library/Application Support/Aegis');
  const auth = JSON.parse(await readFile(join(owner, 'auth.json'), 'utf8'));
  assert.ok(auth.openai, 'No ChatGPT sign-in in the host credential store');
  await cp(owner, data, { recursive: true });
  // Copied durable conversations must never resume or reach a model during this measurement.
  for (const name of ['agents.sqlite', 'agents.sqlite-wal', 'agents.sqlite-shm', 'runs.json']) await rm(join(data, name), { force: true });
}
const token = `speed-${process.pid}`, records = [];
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: join(root, 'agent'), env: {
  ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_PROFILE_TOOLS: '1',
  AEGIS_FAKE_MODEL: live ? '' : '1', AEGIS_FAKE_CAPTURE_INPUT: live ? '' : join(data, 'model-input.jsonl'), AEGIS_FAKE_DELAY_MS: process.env.AEGIS_FAKE_DELAY_MS || '60',
}, stdio: ['ignore', 'pipe', 'pipe'] });
let buffer = '', errors = '';
host.stderr.on('data', d => { errors += d; });
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Host startup timed out: ' + errors)), 15000);
  host.stdout.on('data', d => {
    buffer += d;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
      try { const r = JSON.parse(line); if (r.aegis === 'ready') { clearTimeout(timer); resolve(r.port); } else if (r.aegis === 'timing') records.push(r); } catch {}
    }
  });
  host.once('exit', code => { clearTimeout(timer); reject(new Error(`Host exited ${code}: ${errors}`)); });
});
let web, browser;
try {
  const port = await ready, base = `http://127.0.0.1:${port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
    const result = await r.json(); assert.equal(r.status, 200, JSON.stringify(result)); return result;
  };
  const board = await call('/boards', { name: '25-card planning board' });
  const seed = Array.from({ length: 25 }, (_, i) => ({ op: 'create', type: i >= 23 ? 'doc' : i >= 20 ? 'todo' : 'note',
    newId: `speed${String(i).padStart(3, '0')}`, text: ['Research', 'Design', 'Build', 'Review', 'Ship'][Math.floor(i / 5)] + ': ' + ['Gather examples', 'List constraints', 'Test the idea', 'Write the next action', 'Check the result'][i % 5],
    x: (i * 337) % 1100, y: (i * 193) % 700, w: 220, h: 128,
    ...(i >= 23 ? { props: { body: 'Project context and evidence. '.repeat(300) } } : {}),
    ...(i >= 20 && i < 23 ? { items: [{ text: 'Check with the team', done: false }, { text: 'Record the decision', done: false }] } : {}),
  }));
  await call(`/boards/${board.id}/batch`, { commands: seed });
  const saved = await call(`/boards/${board.id}`);
  const moves = saved.cards.map((c, i) => ({ op: 'move', id: c.id, x: i % 5 * 244, y: Math.floor(i / 5) * 152 }));
  const webPort = 5199 + Number(process.env.AEGIS_PORT_OFFSET || 0);
  web = spawn('npx', ['vite', '--port', String(webPort), '--strictPort'], { cwd: join(root, 'app'), stdio: 'pipe' });
  await new Promise((resolve, reject) => { web.stdout.on('data', d => { if (String(d).includes('Local')) resolve(); }); web.once('exit', c => reject(new Error('Vite exited ' + c))); });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 992 } });
  await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
  await page.goto(`http://127.0.0.1:${webPort}/?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board);
  await page.evaluate(async id => { await aegis.openBoard(id); }, board.id).catch(async () => {
    // The normal initial board selection opens the oldest board. Use the library's persisted choice on reload.
    await page.evaluate(id => localStorage.setItem('aegis:board', id), board.id); await page.reload();
  });
  await page.waitForFunction(id => window.aegis?.canvas?.board?.id === id, board.id);
  await page.evaluate(() => {
    window.speedEvents = []; window.speedPaints = [];
    const es = aegis.host.events();
    es.onmessage = m => { const e = JSON.parse(m.data); if (e.type === 'board' && e.author?.kind === 'agent') speedEvents.push({ rev: e.rev, latencyMs: Date.now() - e.sentAt, receivedAt: Date.now(), bytes: m.data.length }); };
    document.getElementById('stage').addEventListener('canvaspaint', () => speedPaints.push({ rev: aegis.canvas.board.rev, at: Date.now() }));
  });
  let boardReads = 0;
  page.on('request', r => { if (r.method() === 'GET' && new URL(r.url()).pathname === `/boards/${board.id}`) boardReads++; });
  const liveBrief = 'Organise these 25 cards into a tidy 5-column grid with 24px gutters at x=0,y=0. Keep their sizes and content. Preserve their current list order. Do not add any cards. A short chat acknowledgement is enough.';
  const turns = baseline ? [['board_read', {}], ...moves.map(m => ['board_apply', { commands: [m] }])] : [['board_apply', { commands: moves }]];
  const brief = live ? liveBrief : 'FAKETOOLS ' + JSON.stringify(turns);
  records.length = 0;
  const started = performance.now();
  const [agent] = await call('/agents', { boardId: board.id, brief, ...(live ? {} : { model: { provider: 'fake', modelId: 'fake' } }) });
  let final;
  do {
    await new Promise(r => setTimeout(r, 20));
    final = (await call(`/agents?board=${board.id}`)).find(a => a.id === agent.id);
    assert.ok(performance.now() - started < 180000, 'Tool loop timed out');
  } while (!final || final.running || !final.text && !final.error);
  const elapsedMs = performance.now() - started;
  assert.equal(final.error, null, JSON.stringify(final));
  const actual = await call(`/boards/${board.id}`);
  await page.waitForFunction(rev => aegis.canvas.board.rev >= rev, actual.rev);
  if (!live) assert.deepEqual(actual.cards.map(c => ({ id: c.id, x: c.x, y: c.y })), moves.map(({ id, x, y }) => ({ id, x, y })));
  const ui = await page.evaluate(() => ({ events: speedEvents, paints: speedPaints }));
  const jobRecords = [...records], tools = jobRecords.filter(r => r.kind === 'tool'), batches = jobRecords.filter(r => r.kind === 'batch');
  let compactProbeBytes = null, detailProbeBytes = null;
  if (!baseline && !live) {
    // Diagnostic reads are outside the timed job. Compare their returned bytes on this same board.
    const [probe] = await call('/agents', { boardId: board.id, model: { provider: 'fake', modelId: 'fake' }, brief: 'FAKETOOLS ' + JSON.stringify([['board_read', {}], ['board_read', { detail: true }]]) });
    const deadline = Date.now() + 10000;
    while (!records.some(r => r.kind === 'tool' && r.conversationId === probe.id && r.name === 'board_read') || records.filter(r => r.kind === 'tool' && r.conversationId === probe.id && r.name === 'board_read').length < 2) {
      assert.ok(Date.now() < deadline, 'Diagnostic reads timed out'); await new Promise(r => setTimeout(r, 20));
    }
    [compactProbeBytes, detailProbeBytes] = records.filter(r => r.kind === 'tool' && r.conversationId === probe.id && r.name === 'board_read').map(r => r.outputBytes);
  }
  let inputCoverage = null;
  if (!live) {
    const captured = (await readFile(join(data, 'model-input.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const first = captured.find(input => input.messages.some(m => m.role === 'user' && m.content?.some?.(p => p.text === brief)));
    const small = inspectModelInput(first, 'Project context and evidence. '.repeat(300));
    const largeBoard = await call('/boards', { name: '250-card payload probe' });
    await call(`/boards/${largeBoard.id}/batch`, { commands: Array.from({ length: 250 }, (_, i) => ({ ...seed[i % 25], newId: `large${String(i).padStart(4, '0')}` })) });
    const probeBrief = 'Payload growth probe, 250 cards';
    const [probe] = await call('/agents', { boardId: largeBoard.id, model: { provider: 'fake', modelId: 'fake' }, brief: probeBrief });
    const deadline = Date.now() + 10000;
    while ((await call(`/agents?board=${largeBoard.id}`)).find(a => a.id === probe.id)?.running) { assert.ok(Date.now() < deadline); await new Promise(r => setTimeout(r, 20)); }
    const inputs = (await readFile(join(data, 'model-input.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const large = inspectModelInput(inputs.find(input => JSON.stringify(input.messages).includes(probeBrief)), 'Project context and evidence. '.repeat(300));
    assertBoundedGrowth(small, large);
    inputCoverage = { small: { ...small, summary: undefined }, large: { ...large, summary: undefined } };
  }
  const mean = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  const report = { label, model: final.model, simulatedModelDelayMs: live ? null : Number(process.env.AEGIS_FAKE_DELAY_MS || 60), elapsedMs,
    toolCalls: tools.length, perTool: tools, modelTurns: jobRecords.filter(r => r.kind === 'model'),
    meanHostToolMs: mean(tools.map(t => t.durationMs)), boardReadBytes: tools.filter(t => t.name === 'board_read').map(t => t.outputBytes), compactProbeBytes, detailProbeBytes,
    inputCoverage, context: jobRecords.find(r => r.kind === 'context'), policy: jobRecords.find(r => r.kind === 'policy'),
    batchCount: batches.length, meanBatchApplyMs: mean(batches.map(t => t.applyMs)), meanBatchTotalMs: mean(batches.map(t => t.totalMs)),
    uiBoardReloads: boardReads, eventCount: ui.events.length, meanEventLatencyMs: mean(ui.events.map(e => e.latencyMs)),
    meanEventToPaintMs: mean(ui.events.map(e => ui.paints.find(p => p.rev >= e.rev && p.at >= e.receivedAt)?.at - e.receivedAt).filter(Number.isFinite)),
    batches, ui, finalCardCount: actual.cards.length,
  };
  await writeFile(out(`speed-${label}.json`), JSON.stringify(report, null, 2));
  await page.screenshot({ path: out(`speed-${label}-${Date.now()}.png`) });
  console.log(JSON.stringify({ ...report, perTool: undefined, modelTurns: report.modelTurns.length ? report.modelTurns : undefined, batches: undefined, ui: undefined }));
  console.log(`PASS ${label}: real durable tool loop, persisted board and UI revision agree`);
} finally {
  await browser?.close(); host.kill(); web?.kill();
  await rm(data, { recursive: true, force: true });
}

}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
