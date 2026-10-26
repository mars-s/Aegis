import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = new URL('../..', import.meta.url).pathname;
const token = `mcp-check-${process.pid}`;
let data, child, base, httpClient, stdioClient;
async function startHost() {
  child = spawn(process.execPath, ['--no-warnings', 'server.mjs'], {
    cwd: root + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', bytes => { errors += bytes; });
  const ready = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Host startup timed out: ' + errors)), 10000);
    child.stdout.on('data', bytes => {
      output += bytes;
      for (const line of output.split('\n')) {
        try { const event = JSON.parse(line); if (event.aegis === 'ready') { clearTimeout(timer); resolve(event); } } catch {}
      }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Host exited ${code}: ${errors}`)); });
  });
  base = `http://127.0.0.1:${ready.port}`;
}
async function stopHost() {
  const stopped = once(child, 'exit'); child.kill(); await stopped;
}
const call = async (name, args = {}, client = httpClient) => {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, result.content?.[0]?.text);
  return result.structuredContent;
};
const board = async (client = httpClient) => call('board_create', { name: 'MCP study board' }, client);

before(async () => {
  data = await mkdtemp(join(tmpdir(), 'aegis-mcp-'));
  await cp(root + '/plugins/aegis', join(data, 'plugin'), { recursive: true });
  await startHost();
  httpClient = new Client({ name: 'aegis-mcp-check', version: '1' });
  await httpClient.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  stdioClient = new Client({ name: 'aegis-stdio-check', version: '1' });
  await stdioClient.connect(new StdioClientTransport({ command: process.execPath, args: [join(data, 'plugin/server.mjs')], env: { AEGIS_DATA: data }, stderr: 'pipe' }));
});
after(async () => {
  await Promise.allSettled([httpClient?.close(), stdioClient?.close()]);
  if (child?.exitCode === null) await stopHost();
  await rm(data, { recursive: true, force: true });
});

test('HTTP and stdio clients discover tools, resources and prompts with the official SDK', async () => {
  for (const client of [httpClient, stdioClient]) {
    assert.equal(client.getServerVersion().name, 'aegis');
    const tools = await client.listTools();
    assert.ok(tools.tools.some(t => t.name === 'document_write'));
    assert.ok(tools.tools.some(t => t.name === 'asset_read' && t.annotations.readOnlyHint));
    const guide = await client.readResource({ uri: 'aegis://guide' });
    assert.match(guide.contents[0].text, /shape.*path/s);
    assert.equal((await client.listResourceTemplates()).resourceTemplates.length, 3);
    const prompt = await client.getPrompt({ name: 'study_board', arguments: { boardId: 'source', task: 'Make revision notes' } });
    assert.match(prompt.messages[0].content.text, /assessment rules/);
  }
});

test('MCP creates documents, searches full slide text, draws and connects cards in an atomic batch', async () => {
  const b = await board();
  const created = await call('board_apply', { boardId: b.id, expectedRev: b.rev, commands: [
    { op: 'create', type: 'deck', text: 'Lecture', props: { slides: [{ id: 'slide-one', title: 'Networks', body: 'Backpressure controls the producer.' }] }, ref: 'slides' },
    { op: 'create', type: 'shape', text: 'Producer', props: { shape: 'rect' }, ref: 'producer' },
    { op: 'create', type: 'path', props: { points: [{ x: 0, y: 0 }, { x: 100, y: 50 }], ow: 100, oh: 50, stroke: '#418cff', sw: 2 }, ref: 'line' },
    { op: 'connect', a: '$slides', b: '$producer', label: 'illustrates' },
  ] });
  const search = await call('board_search', { boardId: b.id, query: 'backpressure' }, stdioClient);
  assert.equal(search.matches[0].id, created.created.slides);
  const source = await call('card_read', { boardId: b.id, cardId: created.created.slides });
  assert.match(source.content, /Slide 1 \(slide-one\).*Backpressure/s);
  const doc = await call('document_write', { boardId: b.id, title: 'Revision notes', body: '## Networks\nBackpressure slows the producer.' }, stdioClient);
  assert.ok(doc.cardId);
  const resource = await httpClient.readResource({ uri: `aegis://boards/${b.id}/cards/${doc.cardId}` });
  assert.match(resource.contents[0].text, /Backpressure slows/);
  const saved = JSON.parse(await readFile(join(data, 'boards', b.id + '.json'), 'utf8'));
  assert.equal(saved.cards.length, 4);
  assert.equal(saved.links.length, 1);
  const bad = await httpClient.callTool({ name: 'board_apply', arguments: { boardId: b.id, expectedRev: saved.rev, commands: [
    { op: 'create', text: 'Should not be saved', type: 'note' }, { op: 'move', id: 'missing', x: 0, y: 0 },
  ] } });
  assert.equal(bad.isError, true);
  assert.equal((await call('board_read', { boardId: b.id })).rev, saved.rev);
});

test('stale writes and simultaneous writers cannot overwrite a newer document', async () => {
  const b = await board();
  const doc = await call('document_write', { boardId: b.id, title: 'Draft', body: 'Original' });
  const args = { boardId: b.id, cardId: doc.cardId, expectedRev: doc.rev };
  const writes = await Promise.all([
    httpClient.callTool({ name: 'document_write', arguments: { ...args, body: 'Writer one' } }),
    stdioClient.callTool({ name: 'document_write', arguments: { ...args, body: 'Writer two' } }),
  ]);
  assert.equal(writes.filter(w => w.isError).length, 1);
  assert.match(writes.find(w => w.isError).content[0].text, /board changed/);
  const stale = await httpClient.callTool({ name: 'document_write', arguments: { ...args, body: 'Stale content' } });
  assert.equal(stale.isError, true);
  const missingRevision = await httpClient.callTool({ name: 'document_write', arguments: { boardId: b.id, cardId: doc.cardId, body: 'Blind replacement' } });
  assert.equal(missingRevision.isError, true);
  assert.match(missingRevision.content[0].text, /expectedRev/);
  assert.doesNotMatch((await call('card_read', { boardId: b.id, cardId: doc.cardId })).content, /Stale|Blind/);
});

test('card content pagination and imported page resources preserve exact text and asset bytes', async () => {
  const b = await board();
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9v8AAAAASUVORK5CYII=', 'base64');
  const upload = await fetch(base + '/assets', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' }, body: bytes });
  const { url } = await upload.json();
  const text = 'Intro '.repeat(100) + 'final source statement';
  const created = await call('board_apply', { boardId: b.id, commands: [{ op: 'create', type: 'doc', text: 'Imported PDF', props: {
    body: text, pages: [{ src: url, alt: 'Page 1' }], import: { name: 'Lecture.pdf', format: 'pdf' },
  }, ref: 'source' }] });
  let content = '', offset = 0;
  do {
    const read = await call('card_read', { boardId: b.id, cardId: created.created.source, offset, limit: 100 });
    content += read.content; offset = read.nextOffset;
  } while (offset !== null);
  assert.equal(content, 'Imported PDF\n\n' + text);
  const read = await call('card_read', { boardId: b.id, cardId: created.created.source });
  const image = await stdioClient.callTool({ name: 'asset_read', arguments: { boardId: b.id, name: url.slice(6) } });
  assert.equal(image.content[0].type, 'image');
  assert.deepEqual(Buffer.from(image.content[0].data, 'base64'), bytes);
  const resource = await httpClient.readResource({ uri: read.assets[0].uri });
  assert.deepEqual(Buffer.from(resource.contents[0].blob, 'base64'), bytes);
  const other = await board();
  const refused = await httpClient.callTool({ name: 'asset_read', arguments: { boardId: other.id, name: url.slice(6) } });
  assert.equal(refused.isError, true);
});

test('MCP enforces authentication, browser origins, schema validation and private discovery files', async () => {
  assert.equal((await fetch(base + '/mcp', { method: 'POST' })).status, 401);
  assert.equal((await fetch(base + '/integrations/mcp')).status, 401);
  const hostile = await fetch(base + '/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}`, origin: 'https://example.com' } });
  assert.equal(hostile.status, 403);
  const invalid = await httpClient.callTool({ name: 'board_apply', arguments: { boardId: '../auth', commands: [] } });
  assert.equal(invalid.isError, true);
  const schema = await call('object_schema', { kind: 'diagram' });
  assert.ok(schema.schema.properties.nodes);
  const connection = join(data, 'mcp-connection.json');
  assert.equal((await stat(connection)).mode & 0o777, 0o600);
  const info = await (await fetch(base + '/integrations/mcp', { headers: { authorization: `Bearer ${token}` } })).json();
  assert.equal(info.config.mcpServers.aegis.env.AEGIS_DATA, data);
  assert.equal(info.config.mcpServers.aegis.command, process.execPath);
  assert.equal(info.config.mcpServers.aegis.args[0], join(data, 'integrations/mcp/server.mjs'));
  assert.equal((await stat(info.config.mcpServers.aegis.args[0])).mode & 0o777, 0o600);
  assert.match(info.codexCommand, /^codex mcp add aegis --env /);
  assert.match(info.codexConfig, /\[mcp_servers\.aegis\.env\]/);
  assert.ok(!JSON.stringify(info).includes(token));
});

test('an existing stdio session rediscovers the app after its port changes', async () => {
  const b = await board(stdioClient);
  await stopHost();
  await assert.rejects(readFile(join(data, 'mcp-connection.json')), { code: 'ENOENT' });
  const offline = await stdioClient.callTool({ name: 'board_list', arguments: {} }).then(() => null, e => e);
  assert.match(offline.message, /Open the app/);
  await startHost();
  const saved = await call('board_read', { boardId: b.id }, stdioClient);
  assert.equal(saved.name, b.name);
});
