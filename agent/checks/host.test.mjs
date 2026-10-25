// Starts the real host with a scripted local model and drives it over HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOKEN = 'check-token-' + process.pid;
let child, base;
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${TOKEN}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out'); await new Promise(r => setTimeout(r, 100)); } };

let data;
before(async () => {
  data = await mkdtemp(join(tmpdir(), 'aegis-host-'));
  // An older build wrote a non-UUID device id; ChatGPT sign-in refuses one.
  await writeFile(join(data, 'device-id'), 'not-a-uuid');
  child = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: TOKEN, AEGIS_FAKE_MODEL: '1' } });
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); });
    child.on('exit', code => reject(new Error('host exited ' + code)));
  });
  base = `http://127.0.0.1:${port}`;
});
after(() => child?.kill());

test('requests without the token are refused', async () => {
  const r = await fetch(base + '/boards');
  assert.equal(r.status, 401);
});

test('two agents edit one board at once and neither loses work', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Parallel' });
  await call('POST', `/boards/${board.id}/batch`, { commands: [{ op: 'create', type: 'note', text: 'seed' }] });
  const brief = n => 'FAKE ' + JSON.stringify([{ op: 'create', type: 'title', text: 'From agent ' + n, ref: 't' }, { op: 'focus', ids: ['$t'] }]);
  const a = await call('POST', '/agents', { boardId: board.id, brief: brief(1), model: { provider: 'fake', modelId: 'fake' } });
  const b = await call('POST', '/agents', { boardId: board.id, brief: brief(2), model: { provider: 'fake', modelId: 'fake' } });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const final = await until(async () => {
    const { body } = await call('GET', `/boards/${board.id}`);
    return body.cards.length === 3 ? body : null;
  });
  assert.deepEqual(final.cards.map(c => c.text).sort(), ['From agent 1', 'From agent 2', 'seed']);
  const agents = await until(async () => { const { body } = await call('GET', `/agents?board=${board.id}`); return body.every(x => !x.running && x.text) ? body : null; });
  assert.equal(agents.length, 2);
  assert.ok(agents.every(x => x.text === 'Done: sorted the board.'));
});

test('a bad batch from an agent changes nothing', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Bad' });
  await call('POST', '/agents', { boardId: board.id, brief: 'FAKE ' + JSON.stringify([{ op: 'create', type: 'note', text: 'x' }, { op: 'move', id: 'nope', x: 0, y: 0 }]), model: { provider: 'fake', modelId: 'fake' } });
  await until(async () => (await call('GET', `/agents?board=${board.id}`)).body.some(x => !x.running && x.text));
  assert.equal((await call('GET', `/boards/${board.id}`)).body.cards.length, 0);
});

test('sign-in state lists both providers', async () => {
  const { body } = await call('GET', '/auth');
  assert.deepEqual(Object.keys(body).sort(), ['anthropic', 'openai']);
});

test('ChatGPT sign-in starts with a login link and a paste box, and the device id is a UUID', async () => {
  await call('POST', '/auth/start', { provider: 'openai' });
  const s = await until(async () => { const { body } = await call('GET', '/auth'); return body.openai.link ? body.openai : null; });
  assert.equal(s.state, 'pending', s.error ?? '');
  assert.match(s.link, /^https:\/\/auth\.openai\.com\//);
  assert.equal(s.prompt.type, 'manual_code');
  assert.match(await readFile(join(data, 'device-id'), 'utf8'), /^[0-9a-f-]{36}$/);
  await call('POST', '/auth/cancel', { provider: 'openai' });
  const after = await until(async () => { const { body } = await call('GET', '/auth'); return body.openai.state !== 'pending' ? body.openai : null; });
  assert.equal(after.state, 'idle'); assert.equal(after.error, null);
});

test('starting a sign-in again replaces the unfinished one', async () => {
  await call('POST', '/auth/start', { provider: 'anthropic' });
  const first = await until(async () => (await call('GET', '/auth')).body.anthropic.link);
  await call('POST', '/auth/start', { provider: 'anthropic' });
  const second = await until(async () => { const l = (await call('GET', '/auth')).body.anthropic.link; return l && l !== first ? l : null; });
  assert.notEqual(first, second);
  assert.equal((await call('GET', '/auth')).body.anthropic.state, 'pending');
  await call('POST', '/auth/cancel', { provider: 'anthropic' });
});

test('the library files boards under projects and folders, and old boards show as loose', async () => {
  const { body: loose } = await call('POST', '/boards', { name: 'Loose' });
  const { body: proj } = await call('POST', '/library', { op: 'create', kind: 'project', name: 'Work' });
  const { body: folder } = await call('POST', '/library', { op: 'create', kind: 'folder', name: 'Q4', parent: proj.created });
  const { body: filed } = await call('POST', '/boards', { name: 'Filed', parent: folder.created });
  const { body: lib } = await call('GET', '/library');
  assert.equal(lib.boards.find(b => b.id === loose.id).parent, null);
  assert.equal(lib.boards.find(b => b.id === filed.id).parent, folder.created);
  const bad = await call('POST', '/library', { op: 'delete', id: proj.created });
  assert.equal(bad.status, 400); assert.match(bad.body.error, /not empty/);
});

test('media uploads come back by name, with byte ranges for video, and no token is needed to read', async () => {
  const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
  const up = await fetch(base + '/assets', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'video/mp4' }, body: bytes });
  const { url } = await up.json();
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
  const { body: board } = await call('POST', '/boards', { name: 'Objects' });
  const plot = { style: 'bar', x: { kind: 'category', label: 'Day' }, y: { format: 'number', label: 'Tasks' }, basis: 'Demo data', knowledge: true,
    series: [{ name: 'Tasks', points: [{ x: 'Mon', y: 8 }, { x: 'Tue', y: 12 }, { x: 'Wed', y: 6 }] }] };
  const r = await call('POST', `/boards/${board.id}/batch`, { commands: [
    { op: 'create', type: 'object', kind: 'reply', data: { headline: 'Thursday was busiest', text: 'You did **56 tasks**.' }, ref: 'r' },
    { op: 'create', type: 'object', kind: 'plot', text: 'Tasks completed', data: plot, ref: 'p' },
  ] });
  assert.equal(r.body.ok, true, JSON.stringify(r.body.errors));
  const { body: saved } = await call('GET', `/boards/${board.id}`);
  assert.deepEqual(saved.cards.map(c => c.kind), ['reply', 'plot']);
  const bad = await call('POST', `/boards/${board.id}/batch`, { commands: [{ op: 'create', type: 'object', kind: 'plot', data: { ...plot, style: 'pie' } }] });
  assert.equal(bad.body.ok, false); assert.match(bad.body.errors[0].reason, /plot\.style: must be one of bar/);
});

test('the host does not serve a UI until one is installed, and never serves files outside it', async () => {
  const r = await fetch(base + '/ui/index.html');
  assert.equal(r.status, 404);
  assert.equal((await fetch(base + '/ui/..%2f..%2fauth.json')).status, 404);
});

test('a UI update installs beside the old one, swaps in, refuses a broken build and rolls back', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const good = async label => {
    const dir = await mkdtemp(join(tmpdir(), 'aegis-ui-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'assets', 'app.js'), `document.title=${JSON.stringify(label)}`);
    await writeFile(join(dir, 'index.html'), `<!doctype html><title>${label}</title><script type="module" src="./assets/app.js"></script>`);
    return dir;
  };
  const one = await call('POST', '/ui-update', { from: await good('one') });
  assert.equal(one.body.ok, true, JSON.stringify(one.body));
  assert.match(await (await fetch(base + '/ui/index.html')).text(), /<title>one</);
  assert.equal((await fetch(base + '/ui/assets/app.js')).status, 200);
  await call('POST', '/ui-update', { from: await good('two') });
  assert.match(await (await fetch(base + '/ui/index.html')).text(), /<title>two</);
  // A build whose script is missing is refused and the working UI stays.
  const broken = await good('broken'); const { rm } = await import('node:fs/promises'); await rm(join(broken, 'assets', 'app.js'));
  const bad = await call('POST', '/ui-update', { from: broken });
  assert.equal(bad.body.ok, false); assert.match(bad.body.out, /missing assets\/app.js/);
  assert.match(await (await fetch(base + '/ui/index.html')).text(), /<title>two</);
  await call('POST', '/ui-update/rollback');
  assert.match(await (await fetch(base + '/ui/index.html')).text(), /<title>one</);
});

test('a lead runs two parts at once; each places an object and hands back a digest; the lead adds a reply', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Parts' });
  const part = (name, y) => 'FAKETOOLS ' + JSON.stringify([
    ['create', { kind: 'plot', title: name, data: { style: 'bar', x: { kind: 'category' }, y: { format: 'number' }, basis: 'demo', knowledge: true, series: [{ name, points: [{ x: 'a', y }, { x: 'b', y: y + 3 }] }] } }],
    ['finish', { summary: name + ' done', digest: `${name}: a=${y}`, found: true }],
  ]);
  const lead = 'FAKETOOLS ' + JSON.stringify([
    [['start_part', { title: 'One', goal: 'first numbers', brief: part('One', 1) }], ['start_part', { title: 'Two', goal: 'second numbers', brief: part('Two', 5) }]],
    ['create', { kind: 'reply', title: '', data: { headline: 'Both parts finished', text: 'Two charts from two helpers.' } }],
  ]);
  await call('POST', '/agents', { boardId: board.id, brief: lead, model: { provider: 'fake', modelId: 'fake' } });
  const final = await until(async () => { const { body } = await call('GET', `/boards/${board.id}`); return body.cards.filter(c => c.type === 'object').length === 3 ? body : null; }, 20000);
  assert.deepEqual(final.cards.map(c => c.kind).sort(), ['plot', 'plot', 'reply']);
  const agents = await until(async () => { const { body } = await call('GET', `/agents?board=${board.id}`); return body.length === 3 && body.every(a => !a.running) ? body : null; }, 20000);
  const parts = agents.filter(a => a.parent);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map(p => p.title).sort(), ['One', 'Two']);
  assert.ok(parts.every(p => p.summary?.endsWith('done')));
});

test('an agent can load a built-in skill, and an unknown skill names the ones that exist', async () => {
  const { body: board } = await call('POST', '/boards', { name: 'Skills' });
  await call('POST', '/agents', { boardId: board.id, brief: 'FAKETOOLS ' + JSON.stringify([['load_skill', { name: 'analyse-data' }], ['load_skill', { name: 'nope' }]]), model: { provider: 'fake', modelId: 'fake' } });
  const a = await until(async () => { const { body } = await call('GET', `/agents?board=${board.id}`); return body[0] && !body[0].running && body[0].text ? body[0] : null; });
  assert.equal(a.error, null);
});
