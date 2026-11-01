import { z } from 'zod/v4';
import { BoardSchema, JsonSchema } from '@aegis/domain/schema';
import { BatchResponseSchema, BoardListEntrySchema } from '@aegis/protocol/http';
import { hostFixture } from './fixture.ts';
import { required } from './required.ts';
const AgentSchema = z.object({ id: z.string(), running: z.boolean(), text: z.string(), parent: z.string().nullable(), title: z.string().nullable(), summary: z.string().nullable(), error: z.string().nullable(), history: z.array(z.object({ id: z.string(), finished: z.number().nullable(), canUndo: z.boolean() }).catchall(JsonSchema)) });
const StartedSchema = z.array(z.object({ id: z.string() }));
const ProviderSchema = z.object({ state: z.string(), error: z.string().nullable(), link: z.string().nullable(), prompt: z.object({ type: z.string() }).nullable() }).catchall(JsonSchema);
const AuthSchema = z.object({ openai: ProviderSchema, claude: z.object({ connected: z.boolean(), state: z.string(), version: z.string().nullable() }) }).catchall(JsonSchema);
const LibraryActionSchema = z.object({ ok: z.literal(true), created: z.string().nullable(), nextBoard: z.string(), removed: z.array(z.string()) });
const LibrarySchema = z.object({ nodes: z.array(z.unknown()), boards: z.array(BoardListEntrySchema.extend({ parent: z.string().nullable() })) });
const ErrorSchema = z.object({ error: z.string() });
const UiResultSchema = z.object({ ok: z.boolean(), out: z.string().optional() }).catchall(JsonSchema);
const OkSchema = z.object({ ok: z.literal(true) });
const RewriteSchema = z.object({ text: z.string() });
// Starts the real host with a scripted local model and drives it over HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let host: Awaited<ReturnType<typeof hostFixture>>, base = '', TOKEN = '';
const call = async <S extends z.ZodType>(method: string, path: string, body: unknown, schema: S): Promise<{ status: number; body: z.output<S> }> => {
  const response = await fetch(base + path, { method, headers: { authorization: `Bearer ${TOKEN}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value: unknown = await response.json(); return { status: response.status, body: schema.parse(value) };
};
const until = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 10000): Promise<T> => { const time = Date.now(); for (;;) { const value = await fn(); if (value) return value; if (Date.now() - time > ms) throw new Error('timed out'); await new Promise(resolve => setTimeout(resolve, 100)); } };
before(async () => {
  host = await hostFixture({ prepare: data => writeFile(join(data, 'device-id'), 'not-a-uuid') });
  base = host.base; TOKEN = host.token;
});
after(async () => { await host?.close(); });

test('requests without the token are refused', async () => {
  const r = await fetch(base + '/boards');
  assert.equal(r.status, 401);
});

test('agent document titles are normalised in the original commit and fresh history stays undoable', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Document history' }, BoardSchema);
  const title = 'Launch plan', paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Keep this content' }] };
  const commands = [
    { op: 'create', type: 'doc', text: title, newId: 'richdoc1', props: { doc: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] }, paragraph] } } },
    { op: 'create', type: 'doc', text: title, newId: 'markdoc1', props: { body: '# Launch plan\n\nKeep this content' } },
  ];
  const { body: [agent] } = await call('POST', '/agents', { boardId: board.id, brief: 'FAKE ' + JSON.stringify(commands), model: { provider: 'fake', modelId: 'fake' } }, StartedSchema); assert.ok(agent);
  const done = await until(async () => {
    const { body } = await call('GET', `/agents?board=${board.id}`, undefined, z.array(AgentSchema));
    return body.find(a => a.id === agent.id && !a.running && a.history[0]?.finished);
  });
  const { body: saved } = await call('GET', `/boards/${board.id}`, undefined, BoardSchema);
  assert.equal(saved.rev, 1, 'normalisation is part of the agent batch');
  for (const card of saved.cards) {
    assert.ok(card.props);
    assert.equal(card.props.docTitleMigrated, true);
    assert.equal(card.props.body, 'Keep this content');
  }
  assert.deepEqual(required(required(required(saved.cards[0]).props).doc).content, [paragraph]);
  assert.equal(required(done.history[0]).canUndo, true);
  await call('POST', `/boards/${board.id}/batch`, { commands: [{ op: 'update', id: 'markdoc1', set: { props: { body: 'A real later edit' } } }] }, BatchResponseSchema);
  const { body: later } = await call('GET', `/agents?board=${board.id}`, undefined, z.array(AgentSchema));
  assert.equal(required(required(later[0]).history[0]).canUndo, false, 'real later content still blocks request Undo');
  await call('POST', `/boards/${board.id}/batch`, { commands: [{ op: 'update', id: 'markdoc1', set: { props: { body: 'Keep this content' } } }] }, BatchResponseSchema);
  const undone = await call('POST', `/agents/${agent.id}/history/${required(done.history[0]).id}/undo`, {}, BatchResponseSchema);
  assert.equal(undone.status, 200);
  assert.equal((await call('GET', `/boards/${board.id}`, undefined, BoardSchema)).body.cards.length, 0);
});

test('two agents edit one board at once and neither loses work', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Parallel' }, BoardSchema);
  await call('POST', `/boards/${board.id}/batch`, { commands: [{ op: 'create', type: 'note', text: 'seed' }] }, BatchResponseSchema);
  const brief = (n: number) => 'FAKE ' + JSON.stringify([{ op: 'create', type: 'title', text: 'From agent ' + n, ref: 't' }, { op: 'focus', ids: ['$t'] }]);
  const a = await call('POST', '/agents', { boardId: board.id, brief: brief(1), model: { provider: 'fake', modelId: 'fake' } }, StartedSchema);
  const b = await call('POST', '/agents', { boardId: board.id, brief: brief(2), model: { provider: 'fake', modelId: 'fake' } }, StartedSchema);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const final = await until(async () => {
    const { body } = await call('GET', `/boards/${board.id}`, undefined, BoardSchema);
    return body.cards.length === 3 ? body : null;
  });
  assert.deepEqual(final.cards.map(c => c.text).sort(), ['From agent 1', 'From agent 2', 'seed']);
  const agents = await until(async () => { const { body } = await call('GET', `/agents?board=${board.id}`, undefined, z.array(AgentSchema)); return body.every(x => !x.running && x.text) ? body : null; });
  assert.equal(agents.length, 2);
  assert.ok(agents.every(x => x.text === 'Done: sorted the board.'));
});

test('a bad batch from an agent changes nothing', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Bad' }, BoardSchema);
  await call('POST', '/agents', { boardId: board.id, brief: 'FAKE ' + JSON.stringify([{ op: 'create', type: 'note', text: 'x' }, { op: 'move', id: 'nope', x: 0, y: 0 }]), model: { provider: 'fake', modelId: 'fake' } }, StartedSchema);
  await until(async () => (await call('GET', `/agents?board=${board.id}`, undefined, z.array(AgentSchema))).body.some(x => !x.running && x.text));
  assert.equal((await call('GET', `/boards/${board.id}`, undefined, BoardSchema)).body.cards.length, 0);
});

test('sign-in state lists both providers', async () => {
  const { body } = await call('GET', '/auth', undefined, AuthSchema);
  assert.deepEqual(Object.keys(body).sort(), ['claude', 'openai']);
});

test('removed Anthropic OAuth and key credentials are rejected', async () => {
  for (const path of ['/auth/start', '/auth/cancel', '/auth/logout', '/auth/answer']) {
    const response = await host.response(path, { provider: 'anthropic', answer: 'unused' });
    assert.equal(response.status, 400);
  }
  for (const field of ['key', 'apiKey', 'api_key']) assert.equal((await host.response('/auth/start', { provider: 'openai', [field]: 'not-a-real-key' })).status, 400);
  assert.equal((await host.response('/auth/key', { provider: 'openai', key: 'not-a-real-key' })).status, 404);
});

test('the library files boards under projects and folders, and old boards show as loose', async () => {
  const { body: loose } = await call('POST', '/boards', { name: 'Loose' }, BoardSchema);
  const { body: proj } = await call('POST', '/library', { op: 'create', kind: 'project', name: 'Work' }, LibraryActionSchema);
  const { body: folder } = await call('POST', '/library', { op: 'create', kind: 'folder', name: 'Q4', parent: proj.created }, LibraryActionSchema);
  const { body: filed } = await call('POST', '/boards', { name: 'Filed', parent: folder.created }, BoardSchema);
  const { body: lib } = await call('GET', '/library', undefined, LibrarySchema);
  assert.equal(required(lib.boards.find(b => b.id === loose.id)).parent, null);
  assert.equal(required(lib.boards.find(b => b.id === filed.id)).parent, folder.created);
  const bad = await call('POST', '/library', { op: 'delete', id: proj.created }, ErrorSchema);
  assert.equal(bad.status, 400); assert.match(bad.body.error, /not empty/);
});

test('media uploads come back by name, with byte ranges for video, and no token is needed to read', async () => {
  const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
  const up = await fetch(base + '/assets', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'video/mp4' }, body: bytes });
  const value: unknown = await up.json(); const { url } = z.object({ url: z.string() }).parse(value);
  assert.match(url, /^asset:[a-f0-9]{32}\.mp4$/);
  const path = '/assets/' + url.slice(6);
  const whole = await fetch(base + path);
  assert.equal(whole.status, 200); assert.deepEqual(Buffer.from(await whole.arrayBuffer()), bytes);
  const part = await fetch(base + path, { headers: { range: 'bytes=10-19' } });
  assert.equal(part.status, 206); assert.equal(part.headers.get('content-range'), 'bytes 10-19/1000');
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), bytes.subarray(10, 20));
  const html = await fetch(base + '/assets', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'text/html' }, body: '<script>' });
  assert.equal(html.status, 415);
  assert.equal((await fetch(base + '/assets/..%2fauth.json')).status, 404);
  assert.equal((await fetch(base + '/assets', { method: 'POST', headers: { 'content-type': 'image/png' }, body: bytes })).status, 401);
});

test('an agent places a reply and a chart through create, and a bad chart is refused with the field named', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Objects' }, BoardSchema);
  const plot = { style: 'bar', x: { kind: 'category', label: 'Day' }, y: { format: 'number', label: 'Tasks' }, basis: 'Demo data', knowledge: true,
    series: [{ name: 'Tasks', points: [{ x: 'Mon', y: 8 }, { x: 'Tue', y: 12 }, { x: 'Wed', y: 6 }] }] };
  const r = await call('POST', `/boards/${board.id}/batch`, { commands: [
    { op: 'create', type: 'object', kind: 'reply', data: { headline: 'Thursday was busiest', text: 'You did **56 tasks**.' }, ref: 'r' },
    { op: 'create', type: 'object', kind: 'plot', text: 'Tasks completed', data: plot, ref: 'p' },
  ] }, BatchResponseSchema);
  assert.equal(r.body.ok, true, JSON.stringify('errors' in r.body ? r.body.errors : []));
  const { body: saved } = await call('GET', `/boards/${board.id}`, undefined, BoardSchema);
  assert.deepEqual(saved.cards.map(c => c.kind), ['reply', 'plot']);
  const bad = await call('POST', `/boards/${board.id}/batch`, { commands: [{ op: 'create', type: 'object', kind: 'plot', data: { ...plot, style: 'pie' } }] }, BatchResponseSchema);
  assert.equal(bad.body.ok, false); assert.match(required(bad.body.errors[0]).reason, /plot\.style: must be one of bar/);
});

test('the host does not serve a UI until one is installed, and never serves files outside it', async () => {
  const r = await fetch(base + '/ui/index.html');
  assert.equal(r.status, 404);
  assert.equal((await fetch(base + '/ui/..%2f..%2fauth.json')).status, 404);
});

test('a UI update installs beside the old one, swaps in, refuses a broken build and rolls back', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const good = async (label: string) => {
    const dir = await mkdtemp(join(tmpdir(), 'aegis-ui-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'assets', 'app.js'), `document.title=${JSON.stringify(label)}`);
    await writeFile(join(dir, 'index.html'), `<!doctype html><title>${label}</title><script type="module" src="./assets/app.js"></script>`);
    return dir;
  };
  const one = await call('POST', '/ui-update', { from: await good('one') }, UiResultSchema);
  assert.equal(one.body.ok, true, JSON.stringify(one.body));
  assert.match(await (await fetch(base + '/ui/index.html')).text(), /<title>one</);
  assert.equal((await fetch(base + '/ui/assets/app.js')).status, 200);
  await call('POST', '/ui-update', { from: await good('two') }, UiResultSchema);
  assert.match(await (await fetch(base + '/ui/index.html')).text(), /<title>two</);
  // A build whose script is missing is refused and the working UI stays.
  const broken = await good('broken'); const { rm } = await import('node:fs/promises'); await rm(join(broken, 'assets', 'app.js'));
  const bad = await call('POST', '/ui-update', { from: broken }, UiResultSchema);
  assert.equal(bad.body.ok, false); assert.match(required(bad.body.out), /missing assets\/app.js/);
  assert.match(await (await fetch(base + '/ui/index.html')).text(), /<title>two</);
  const future = await good('future');
  await writeFile(join(future, 'index.html'), '<!doctype html><meta name="aegis-ui-protocol" content="999"><script type="module" src="./assets/app.js"></script>');
  const incompatible = await call('POST', '/ui-update', { from: future }, UiResultSchema);
  assert.equal(incompatible.body.ok, false);
  assert.match(required(incompatible.body.out), /unsupported UI protocol 999/);
  assert.match(await (await fetch(base + '/ui/index.html')).text(), /<title>two</);
  await call('POST', '/ui-update/rollback', undefined, UiResultSchema);
  assert.match(await (await fetch(base + '/ui/index.html')).text(), /<title>one</);
});

test('a lead runs two parts at once; each places an object and hands back a digest; the lead adds a reply', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Parts' }, BoardSchema);
  const part = (name: string, y: number) => 'FAKETOOLS ' + JSON.stringify([
    ['create', { kind: 'plot', title: name, data: { style: 'bar', x: { kind: 'category' }, y: { format: 'number' }, basis: 'demo', knowledge: true, series: [{ name, points: [{ x: 'a', y }, { x: 'b', y: y + 3 }] }] } }],
    ['finish', { summary: name + ' done', digest: `${name}: a=${y}`, found: true }],
  ]);
  const lead = 'FAKETOOLS ' + JSON.stringify([
    [['start_part', { title: 'One', goal: 'first numbers', brief: part('One', 1) }], ['start_part', { title: 'Two', goal: 'second numbers', brief: part('Two', 5) }]],
    ['create', { kind: 'reply', title: '', data: { headline: 'Both parts finished', text: 'Two charts from two helpers.' } }],
  ]);
  await call('POST', '/agents', { boardId: board.id, brief: lead, model: { provider: 'fake', modelId: 'fake' } }, StartedSchema);
  const final = await until(async () => { const { body } = await call('GET', `/boards/${board.id}`, undefined, BoardSchema); return body.cards.filter(c => c.type === 'object').length === 3 ? body : null; }, 20000);
  assert.deepEqual(final.cards.map(c => c.kind).sort(), ['plot', 'plot', 'reply']);
  const agents = await until(async () => { const { body } = await call('GET', `/agents?board=${board.id}`, undefined, z.array(AgentSchema)); return body.length === 3 && body.every(a => !a.running) ? body : null; }, 20000);
  const parts = agents.filter(a => a.parent);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map(p => p.title).sort(), ['One', 'Two']);
  assert.ok(parts.every(p => p.summary?.endsWith('done')));
});

test('an agent can load a built-in skill, and an unknown skill names the ones that exist', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Skills' }, BoardSchema);
  await call('POST', '/agents', { boardId: board.id, brief: 'FAKETOOLS ' + JSON.stringify([['load_skill', { name: 'analyse-data' }], ['load_skill', { name: 'nope' }]]), model: { provider: 'fake', modelId: 'fake' } }, StartedSchema);
  const a = await until(async () => { const { body } = await call('GET', `/agents?board=${board.id}`, undefined, z.array(AgentSchema)); return required(body[0]) && !required(body[0]).running && required(body[0]).text ? required(body[0]) : null; });
  assert.equal(a.error, null);
});

test('the document rewrite endpoint returns rewritten text and refuses an empty selection', async () => {
  const r = await call('POST', '/rewrite', { text: 'make this better', how: 'Shorter' }, RewriteSchema);
  assert.equal(r.status, 200); assert.equal(r.body.text, 'make this better (rewritten)');
  assert.equal((await call('POST', '/rewrite', { text: '  ' }, ErrorSchema)).status, 400);
});

test('Library summaries follow content edits and rename, and ignore camera changes', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Summary evidence' }, BoardSchema);
  const created = required((await call('GET', '/boards', undefined, z.array(BoardListEntrySchema))).body.find(b => b.id === board.id));
  assert.ok(required(created.editedAt) > 0);
  await call('POST', `/boards/${board.id}/batch`, { commands: [{ op: 'create', type: 'title', text: 'A calmer week', newId: 'summaryheading' }] }, BatchResponseSchema);
  const edited = required((await call('GET', '/library', undefined, LibrarySchema)).body.boards.find(b => b.id === board.id));
  assert.equal(edited.subtitle, 'A calmer week'); assert.ok(required(edited.editedAt) >= required(created.editedAt));
  await call('POST', `/boards/${board.id}/view`, { view: { x: 140, y: 200, z: .1 } }, OkSchema);
  assert.equal(required((await call('GET', '/boards', undefined, z.array(BoardListEntrySchema))).body.find(b => b.id === board.id)).editedAt, edited.editedAt);
  await call('POST', `/boards/${board.id}/name`, { name: 'Found again' }, OkSchema);
  const renamed = required((await call('GET', '/boards', undefined, z.array(BoardListEntrySchema))).body.find(b => b.id === board.id));
  assert.equal(renamed.name, 'Found again'); assert.ok(required(renamed.editedAt) >= required(edited.editedAt));
});
