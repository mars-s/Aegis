import { z } from 'zod/v4';
import { BoardSchema, JsonRecordSchema } from '@aegis/domain/schema';
import type { JsonValue } from '@aegis/domain/schema';
import { BatchResponseSchema } from '@aegis/protocol/http';
import { applyBatch } from './batch.ts';
import { hostFixture } from './fixture.ts';
import { required } from './required.ts';
type SampleKind = keyof typeof genuiSamples;
function isSampleKind(value: string): value is SampleKind { return Object.hasOwn(genuiSamples, value); }
function fieldAt(value: unknown, path: readonly (string | number)[]): unknown {
  for (const key of path) { if (typeof value !== 'object' || value === null) return undefined; const next: unknown = Reflect.get(value, key); value = next; }
  return value;
}
const UrlSchema = z.object({ url: z.string() });
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SHAPES, checkObject, OBJECT_SIZE, objectSchemas, OBJECT_GUIDE } from '@aegis/domain/objects';
import { emptyBoard } from '@aegis/domain/commands';
import { sandboxDocument, reportedHeight, reportedEscape, reportedState, parseHtmlState, SANDBOX_CSP, SANDBOX_HEADER_CSP } from '@aegis/protocol/sandbox';
import { genuiSamples } from './genui-fixtures.ts';

for (const [kind, data] of Object.entries(genuiSamples)) {
  if (!isSampleKind(kind)) assert.fail('Unknown sample kind');
  test(`genui ${kind}: create, default size, revise, and invalid data are checked`, () => {
    assert.deepEqual(checkObject(kind, data), data);
    const r = applyBatch(emptyBoard('test'), { commands: [{ op: 'create', type: 'object', kind, data, ref: 'o' }] });
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    const card = required(r.board.cards[0]);
    assert.deepEqual([card.w, card.h], OBJECT_SIZE[kind]);
    const revised = applyBatch(r.board, { commands: [{ op: 'revise', id: card.id, data, text: 'Revised' }] });
    assert.equal(revised.ok, true);
    assert.equal(required(revised.board.cards[0]).ver, 2);
    assert.equal(required(revised.board.cards[0]).id, card.id);
    assert.deepEqual([required(revised.board.cards[0]).x, required(revised.board.cards[0]).y], [card.x, card.y]);
    const invalid = applyBatch(r.board, { commands: [{ op: 'revise', id: card.id, data: { ...data, invented: true } }] });
    assert.equal(invalid.ok, false); assert.equal(invalid.board, r.board);
    assert.match(required(invalid.errors[0]).reason, /unknown field/);
    assert.ok(objectSchemas()[kind]); assert.match(OBJECT_GUIDE, new RegExp('- ' + kind + ':'));
  });
}

test('genui rejects inconsistent references, values and oversized source', () => {
  const bad = <K extends SampleKind>(kind: K, edit: (data: typeof genuiSamples[K]) => void, pattern: RegExp) => { const data = structuredClone(genuiSamples[kind]); edit(data); assert.throws(() => checkObject(kind, data), pattern); };
  bad('stats', d => required(d.tiles[0]).sparkline = [Infinity], /sparkline\[0\]/);
  bad('stats', d => d.tiles = [], /at least 1/);
  bad('timeline', d => required(d.events[0]).date = '2026-02-30', /real YYYY-MM-DD/);
  bad('timeline', d => d.direction = 'diagonal', /direction/);
  bad('kanban', d => required(d.cards[0]).column = 'missing', /no column/);
  bad('kanban', d => required(d.cards[1]).id = required(d.cards[0]).id, /unique/);
  bad('kanban', d => required(d.columns[1]).id = required(d.columns[0]).id, /unique/);
  bad('table', d => required(d.rows[0]).cells.pop(), /match columns/);
  bad('table', d => required(d.rows[0]).cells[2] = 4, /sparkline value/);
  bad('table', d => required(d.rows[0]).cells[1] = 'many', /number value/);
  bad('table', d => required(d.columns[3]).max = 0, /positive maximum/);
  bad('table', d => required(d.rows[0]).cells[3] = -1, /bar value/);
  bad('progress', d => required(d.goals[0]).target = 0, /positive/);
  bad('progress', d => required(d.goals[0]).current = -1, /non-negative/);
  bad('compare', d => d.options = d.options.slice(0, 1), /at least 2/);
  bad('compare', d => required(d.criteria[0]).values.pop(), /per option/);
  bad('gallery', d => required(d.images[0]).url = 'javascript:alert(1)', /local asset/);
  bad('gallery', d => required(d.images[0]).url = 'https://example.com/a.png', /local asset/);
  bad('stages', d => required(d.steps[0]).status = 'finished', /status/);
  bad('callout', d => d.tone = 'danger', /tone/);
  bad('form', d => required(d.fields[1]).id = required(d.fields[0]).id, /unique/);
  bad('form', d => required(d.fields[4]).value = 'yes', /checkbox value/);
  bad('form', d => required(d.fields[3]).value = 'Unknown', /choice value/);
  bad('form', d => delete required(d.fields[3]).options, /distinct options/);
  bad('html', d => d.html = 'x'.repeat(60001), /limit is 60000/);
  bad('html', d => d.height = 2001, /whole number/);
  bad('html', d => Object.assign(d, { framework: 'svelte' }), /unknown field/);
});

test('genui object_set saves moves, ticks and values and rejects invalid edits atomically', () => {
  const edits: [SampleKind, (string | number)[], JsonValue][] = [
    ['stats', ['tiles', 0, 'value'], '20'], ['timeline', ['events', 0, 'done'], true],
    ['kanban', ['cards', 0, 'column'], 'done'], ['table', ['rows', 0, 'cells', 1], 12],
    ['progress', ['goals', 0, 'current'], 7], ['stages', ['steps', 0, 'status'], 'blocked'],
    ['form', ['fields', 0, 'value'], 'A useful result'], ['form', ['fields', 2, 'value'], null],
    ['form', ['fields', 4, 'value'], true], ['html', ['js'], 'document.body.textContent = "Revised";'],
  ];
  for (const [kind, path, value] of edits) {
    const made = applyBatch(emptyBoard('edits'), { commands: [{ op: 'create', type: 'object', kind, data: genuiSamples[kind] }] });
    const id = required(made.board.cards[0]).id;
    const r = applyBatch(made.board, { commands: [{ op: 'object_set', id, path, value }] });
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.deepEqual(fieldAt(required(r.board.cards[0]).data, path), value);
  }
  const made = applyBatch(emptyBoard('bad-move'), { commands: [{ op: 'create', type: 'object', kind: 'kanban', data: genuiSamples.kanban }] });
  const r = applyBatch(made.board, { commands: [{ op: 'object_set', id: required(made.board.cards[0]).id, path: ['cards', 0, 'column'], value: 'missing' }] });
  assert.equal(r.ok, false); assert.equal(r.board, made.board);
});

test('sandbox source keeps the CSP first and height reports require origin, source and channel', () => {
  const source = {}, channel = 'channel';
  const event = { origin: 'null', source, data: { type: 'aegis:html-height', channel, height: 333.1 } };
  assert.equal(reportedHeight(event, source, channel), 334);
  for (const patch of [{ origin: 'https://example.com' }, { source: {} }, { data: { ...event.data, channel: 'other' } }, { data: { ...event.data, height: Infinity } }, { data: { ...event.data, height: '333' } }, { data: null }]) assert.equal(reportedHeight({ ...event, ...patch }, source, channel), null);
  assert.equal(reportedHeight({ ...event, data: { ...event.data, height: 999999 } }, source, channel), 2000);
  assert.equal(reportedHeight({ ...event, data: { ...event.data, height: -5 } }, source, channel), 80);
  const doc = sandboxDocument({ html: '<script>window.custom = true</script>', css: '', js: 'document.body.textContent = "</script>";' }, channel, '--text:#fff;', 'data:font/woff2;base64,');
  assert.ok(doc.indexOf(SANDBOX_CSP) < doc.indexOf('window.custom'));
  assert.ok(doc.includes('"<\\/script>"'));
  assert.match(doc, /connect-src 'none'/);
  assert.doesNotMatch(SANDBOX_CSP, /https?:|unsafe-eval/);
  assert.match(OBJECT_GUIDE, /Prefer built-in kinds/);
  assert.match(OBJECT_GUIDE, /framework compilation is omitted/);
});

test('sandbox Escape reports require the owning opaque frame and channel', () => {
  const source = {}, channel = 'channel';
  const event = { origin: 'null', source, data: { type: 'aegis:html-escape', channel } };
  assert.equal(reportedEscape(event, source, channel), true);
  assert.equal(reportedEscape(event, null, channel), false);
  for (const patch of [{ origin: 'https://example.com' }, { source: {} }, { data: { ...event.data, channel: 'other' } }, { data: { ...event.data, type: 'aegis:html-height' } }, { data: null }]) {
    assert.equal(reportedEscape({ ...event, ...patch }, source, channel), false);
  }
});

const widgetState = () => JSON.stringify({ version: 1, controls: [{ index: 0, tag: 'INPUT', type: 'range', value: '50', checked: false, selected: [] }], text: [{ index: 0, text: 'Four blocks: 200 minutes' }], custom: { minutes: 50, history: [40, 50] } });
test('widget state accepts bounded JSON only and requires source, opaque origin and channel', () => {
  const source = {}, channel = 'channel', state = widgetState();
  const event = { origin: 'null', source, data: { type: 'aegis:html-state', channel, state } };
  assert.equal(reportedState(event, source, channel), state);
  const initial = { ...event, data: { ...event.data, type: 'aegis:html-initial-state' } };
  assert.equal(reportedState(initial, source, channel), null, 'initialisation is separate from an interaction');
  assert.equal(reportedState(initial, source, channel, 'aegis:html-initial-state'), state);
  assert.equal(reportedState({ ...initial, source: {} }, source, channel, 'aegis:html-initial-state'), null);
  assert.equal(reportedState(event, null, channel), null);
  for (const patch of [{ source: {} }, { origin: 'http://localhost' }, { data: { ...event.data, channel: 'other' } }, { data: { ...event.data, type: 'other' } }]) assert.equal(reportedState({ ...event, ...patch }, source, channel), null);
  let deep: JsonValue = null;
  for (let i = 0; i < 34; i++) deep = [deep];
  const parsed = JsonRecordSchema.parse(JSON.parse(state));
  for (const bad of [null, {}, 'null', '[]', 'not JSON', '{}', state.replace('"version":1', '"version":2'), state.replace('"50"', '50'), state.replace('"range"', '"file"'), state.replace('"minutes":50', '"minutes":1e999'), JSON.stringify({ ...parsed, custom: deep }), JSON.stringify({ ...parsed, custom: 'x'.repeat(65536) }), JSON.stringify({ ...parsed, custom: '🦘'.repeat(20000) })]) {
    assert.equal(parseHtmlState(bad), null);
    assert.equal(reportedState({ ...event, data: { ...event.data, state: bad } }, source, channel), null);
    if (bad !== null) assert.throws(() => checkObject('html', { ...genuiSamples.html, state: bad }), /html.state/);
  }
  assert.equal(SHAPES.html.parse(checkObject('html', { ...genuiSamples.html, state })).state, state);
  const injection = JSON.stringify({ ...parsed, custom: '</script><script>parent.pwned=true</script>' });
  const doc = sandboxDocument({ ...genuiSamples.html, state: injection }, channel, '', '');
  assert.ok(!doc.includes('</script><script>parent.pwned'));
  assert.ok(doc.includes('\\u003c/script>'));
});

let host: Awaited<ReturnType<typeof hostFixture>>, base = '', token = '';
before(async () => { host = await hostFixture(); base = host.base; token = host.token; });
after(async () => { await host?.close(); });
const call = async <S extends z.ZodType>(method: string, path: string, body: unknown, schema: S): Promise<z.output<S>> => {
  const response = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, 200, path); const value: unknown = await response.json(); return schema.parse(value);
};

test('the real host persists every new kind from a fake agent, including a revised sandbox', async () => {
  const board = await call('POST', '/boards', { name: 'Generative UI' }, BoardSchema);
  const commands = Object.entries(genuiSamples).map(([kind, data]) => ({ op: 'create', type: 'object', kind, text: kind, data, ref: kind }));
  await call('POST', '/agents', { boardId: board.id, brief: 'FAKE ' + JSON.stringify(commands), model: { provider: 'fake', modelId: 'fake' } }, z.array(z.object({ id: z.string() })));
  let stored: z.output<typeof BoardSchema>;
  const deadline = Date.now() + 15000;
  do { stored = await call('GET', `/boards/${board.id}`, undefined, BoardSchema); if (stored.cards.length === commands.length) break; await new Promise(r => setTimeout(r, 100)); } while (Date.now() < deadline);
  assert.deepEqual(stored.cards.map(c => c.kind).sort(), Object.keys(genuiSamples).sort());
  const html = required(stored.cards.find(c => c.kind === 'html')); assert.ok(html.kind === 'html');
  const changed = { ...html.data, html: '<p>New custom UI</p>' };
  await call('POST', `/boards/${board.id}/batch`, { commands: [{ op: 'revise', id: html.id, data: changed }] }, BatchResponseSchema);
  const revised = (await call('GET', `/boards/${board.id}`, undefined, BoardSchema)).cards.find(c => c.id === html.id);
  assert.ok(revised?.kind === 'html');
  assert.equal(revised.data.html, changed.html); assert.equal(revised.ver, 2);
  await call('POST', `/boards/${board.id}/batch`, { commands: [{ op: 'object_set', id: html.id, path: ['state'], value: widgetState() }] }, BatchResponseSchema);
  assert.equal(SHAPES.html.parse((await call('GET', `/boards/${board.id}`, undefined, BoardSchema)).cards.find(c => c.id === html.id)?.data).state, widgetState(), 'widget state uses the durable object save path');
});

// item 12 sandbox: exercise the real HTTP boundary, limits and capability lifetime.
const sandboxPayload = () => ({ html: '<p>Isolated</p>', css: '', js: 'document.body.dataset.ran = "yes";', channel: randomUUID(), theme: '--text:#fff;', motionOff: false });
test('sandbox registration needs auth; public documents have all isolation headers and unknown IDs are 404', async () => {
  const payload = sandboxPayload();
  const denied = await fetch(base + '/sandbox', { method: 'POST', body: JSON.stringify(payload) });
  assert.equal(denied.status, 401);
  const { url } = await call('POST', '/sandbox', payload, UrlSchema);
  assert.match(url, new RegExp('^' + base + '/sandbox/[a-f0-9]{64}$'));
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const expected = {
    'content-type': 'text/html; charset=utf-8', 'content-security-policy': SANDBOX_HEADER_CSP,
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
    'cache-control': 'no-store', 'cross-origin-resource-policy': 'same-site',
  };
  for (const [key, value] of Object.entries(expected)) assert.equal(response.headers.get(key), value, key);
  const document = await response.text();
  assert.equal(document, sandboxDocument(payload, payload.channel, payload.theme, '', false));
  assert.equal(await (await fetch(url)).text(), document, 'iframe reload can reuse the URL');
  for (const id of ['0'.repeat(64), 'unknown', '../sandbox/unknown']) assert.equal((await fetch(base + '/sandbox/' + id)).status, 404);
});

test('sandbox rejects invalid payloads and caps request bytes and rendered document bytes', async () => {
  const post = (payload: unknown) => fetch(base + '/sandbox', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  for (const patch of [{ js: 1 }, { channel: 'guessable' }, { font: 'https://example.com/font.woff2' }, { motionOff: 'false' }, { theme: null }, { extra: true }, { state: 'not JSON' }, { state: JSON.stringify({ ...JSON.parse(widgetState()), custom: 'x'.repeat(65536) }) }, { parentOrigin: 123 }]) {
    assert.equal((await post({ ...sandboxPayload(), ...patch })).status, 400);
  }
  assert.equal((await post({ ...sandboxPayload(), theme: 'x'.repeat(1024 * 1024) })).status, 413, 'request cap');
  const prefix = JSON.stringify({ ...sandboxPayload(), theme: '' });
  const theme = 'x'.repeat(1024 * 1024 - Buffer.byteLength(prefix) - 1);
  assert.equal((await post({ ...sandboxPayload(), theme })).status, 413, 'rendered document cap');
});

test('sandbox cache evicts least recently used entries after 200 registrations', async () => {
  const first = await call('POST', '/sandbox', sandboxPayload(), UrlSchema);
  const second = await call('POST', '/sandbox', sandboxPayload(), UrlSchema);
  const latest = [];
  for (let i = 0; i < 198; i++) latest.push(await call('POST', '/sandbox', sandboxPayload(), UrlSchema));
  assert.equal((await fetch(first.url)).status, 200, 'reading refreshes recency');
  const added = await call('POST', '/sandbox', sandboxPayload(), UrlSchema);
  assert.equal((await fetch(second.url)).status, 404, 'oldest unread entry is evicted');
  assert.equal((await fetch(first.url)).status, 200, 'recently read entry survives');
  assert.equal((await fetch(added.url)).status, 200);
  assert.equal((await fetch(required(latest[0]).url)).status, 200);
});
// item 12 sandbox end


test('sandbox snapshot acknowledgement is an explicit registration capability', async () => {
  const payload = { ...sandboxPayload(), acknowledgeSnapshots: true };
  const { url } = await call('POST', '/sandbox', payload, UrlSchema);
  const response = await fetch(url);
  assert.equal(response.headers.get('content-security-policy'), SANDBOX_HEADER_CSP);
  assert.equal(await response.text(), sandboxDocument(payload, payload.channel, payload.theme, '', false, true));
});
