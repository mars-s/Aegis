import { CallToolResultSchema } from '../../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';
import type { CallToolRequest } from '../../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';
import { z } from 'zod/v4';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { BoardSchema } from '@aegis/domain/schema';
import { required } from './required.ts';
const ReadySchema = z.object({ aegis: z.literal('ready'), port: z.number() });
const BoardSummarySchema = z.object({ id: z.string(), name: z.string(), rev: z.number() });
const AppliedSchema = z.object({ ok: z.literal(true), rev: z.number(), created: z.record(z.string(), z.string()) });
const DocumentSchema = AppliedSchema.extend({ cardId: z.string() });
const ReadSchema = z.object({ content: z.string(), nextOffset: z.number().nullable(), assets: z.array(z.object({ uri: z.string() })) });
const SearchSchema = z.object({ matches: z.array(z.object({ id: z.string() })) });
const ShapeSchema = z.object({ schema: z.object({ properties: z.record(z.string(), z.unknown()) }) });
const IntegrationSchema = z.object({ config: z.object({ mcpServers: z.object({ aegis: z.object({ env: z.object({ AEGIS_DATA: z.string() }), command: z.string(), args: z.array(z.string()) }) }) }), codexCommand: z.string(), codexConfig: z.string() });
const textResource = (value: unknown) => z.object({ text: z.string() }).parse(value).text;
const blobResource = (value: unknown) => z.object({ blob: z.string() }).parse(value).blob;
const textContent = (value: unknown) => z.object({ type: z.literal('text'), text: z.string() }).parse(value).text;
const imageContent = (value: unknown) => z.object({ type: z.literal('image'), data: z.string() }).parse(value);
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Client } from '../../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import { StdioClientTransport } from '../../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const callTool = async (client: Client, args: CallToolRequest['params']) => CallToolResultSchema.parse(await client.callTool(args));

const root = new URL('../..', import.meta.url).pathname;
const token = `mcp-check-${process.pid}`;
let data = '', base = '';
let child: ChildProcessWithoutNullStreams, httpClient: Client, stdioClient: Client;
async function startHost() {
  child = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], {
    cwd: root + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', bytes => { errors += bytes; });
  const ready = await new Promise<z.output<typeof ReadySchema>>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Host startup timed out: ' + errors)), 10000);
    child.stdout.on('data', bytes => {
      output += bytes;
      for (const line of output.split('\n')) {
        try { const value: unknown = JSON.parse(line); const event = ReadySchema.safeParse(value); if (event.success) { clearTimeout(timer); resolve(event.data); } } catch {}
      }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Host exited ${code}: ${errors}`)); });
  });
  base = `http://127.0.0.1:${ready.port}`;
}
async function stopHost() {
  const stopped = once(child, 'exit'); child.kill(); await stopped;
}
const call = async <S extends z.ZodType>(name: string, args: Record<string, unknown>, schema: S, client = httpClient): Promise<z.output<S>> => {
  const result = await callTool(client, { name, arguments: args });
  assert.ok(!result.isError, result.content?.[0]?.type === 'text' ? result.content[0].text : 'MCP call failed');
  return schema.parse(result.structuredContent);
};
const board = async (client = httpClient) => call('board_create', { name: 'MCP study board' }, BoardSummarySchema, client);

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
    assert.equal(required(client.getServerVersion()).name, 'aegis');
    const tools = await client.listTools();
    assert.ok(tools.tools.some(t => t.name === 'document_write'));
    assert.ok(tools.tools.some(t => t.name === 'asset_read' && t.annotations?.readOnlyHint));
    const guide = await client.readResource({ uri: 'aegis://guide' });
    assert.match(textResource(guide.contents[0]), /shape.*path/s);
    assert.equal((await client.listResourceTemplates()).resourceTemplates.length, 3);
    const prompt = await client.getPrompt({ name: 'study_board', arguments: { boardId: 'source', task: 'Make revision notes' } });
    assert.match(textContent(required(prompt.messages[0]).content), /assessment rules/);
  }
});

test('MCP creates documents, searches full slide text, draws and connects cards in an atomic batch', async () => {
  const b = await board();
  const created = await call('board_apply', { boardId: b.id, expectedRev: b.rev, commands: [
    { op: 'create', type: 'deck', text: 'Lecture', props: { slides: [{ id: 'slide-one', title: 'Networks', body: 'Backpressure controls the producer.' }] }, ref: 'slides' },
    { op: 'create', type: 'shape', text: 'Producer', props: { shape: 'rect' }, ref: 'producer' },
    { op: 'create', type: 'path', props: { points: [{ x: 0, y: 0 }, { x: 100, y: 50 }], ow: 100, oh: 50, stroke: '#418cff', sw: 2 }, ref: 'line' },
    { op: 'connect', a: '$slides', b: '$producer', label: 'illustrates' },
  ] }, AppliedSchema);
  const search = await call('board_search', { boardId: b.id, query: 'backpressure' }, SearchSchema, stdioClient);
  assert.equal(required(search.matches[0]).id, created.created.slides);
  const source = await call('card_read', { boardId: b.id, cardId: created.created.slides }, ReadSchema);
  assert.match(source.content, /Slide 1 \(slide-one\).*Backpressure/s);
  const doc = await call('document_write', { boardId: b.id, title: 'Revision notes', body: '## Networks\nBackpressure slows the producer.' }, DocumentSchema, stdioClient);
  assert.ok(doc.cardId);
  const resource = await httpClient.readResource({ uri: `aegis://boards/${b.id}/cards/${doc.cardId}` });
  assert.match(textResource(resource.contents[0]), /Backpressure slows/);
  const saved = BoardSchema.parse(JSON.parse(await readFile(join(data, 'boards', b.id + '.json'), 'utf8')));
  assert.equal(saved.cards.length, 4);
  assert.equal(saved.links.length, 1);
  const bad = await callTool(httpClient, { name: 'board_apply', arguments: { boardId: b.id, expectedRev: saved.rev, commands: [
    { op: 'create', text: 'Should not be saved', type: 'note' }, { op: 'move', id: 'missing', x: 0, y: 0 },
  ] } });
  assert.equal(bad.isError, true);
  assert.equal((await call('board_read', { boardId: b.id }, BoardSummarySchema)).rev, saved.rev);
});

test('stale writes and simultaneous writers cannot overwrite a newer document', async () => {
  const b = await board();
  const doc = await call('document_write', { boardId: b.id, title: 'Draft', body: 'Original' }, DocumentSchema);
  const args = { boardId: b.id, cardId: doc.cardId, expectedRev: doc.rev };
  const writes = await Promise.all([
    callTool(httpClient, { name: 'document_write', arguments: { ...args, body: 'Writer one' } }),
    callTool(stdioClient, { name: 'document_write', arguments: { ...args, body: 'Writer two' } }),
  ]);
  assert.equal(writes.filter(w => w.isError).length, 1);
  assert.match(textContent(required(writes.find(w => w.isError)).content[0]), /board changed/);
  const stale = await callTool(httpClient, { name: 'document_write', arguments: { ...args, body: 'Stale content' } });
  assert.equal(stale.isError, true);
  const missingRevision = await callTool(httpClient, { name: 'document_write', arguments: { boardId: b.id, cardId: doc.cardId, body: 'Blind replacement' } });
  assert.equal(missingRevision.isError, true);
  assert.match(textContent(missingRevision.content[0]), /expectedRev/);
  assert.doesNotMatch((await call('card_read', { boardId: b.id, cardId: doc.cardId }, ReadSchema)).content, /Stale|Blind/);
});

test('card content pagination and imported page resources preserve exact text and asset bytes', async () => {
  const b = await board();
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9v8AAAAASUVORK5CYII=', 'base64');
  const upload = await fetch(base + '/assets', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' }, body: bytes });
  const value: unknown = await upload.json(); const { url } = z.object({ url: z.string() }).parse(value);
  const text = 'Intro '.repeat(100) + 'final source statement';
  const created = await call('board_apply', { boardId: b.id, commands: [{ op: 'create', type: 'doc', text: 'Imported PDF', props: {
    body: text, pages: [{ src: url, alt: 'Page 1' }], import: { name: 'Lecture.pdf', format: 'pdf' },
  }, ref: 'source' }] }, AppliedSchema);
  let content = '', offset: number | null = 0;
  do {
    const read: z.output<typeof ReadSchema> = await call('card_read', { boardId: b.id, cardId: created.created.source, offset, limit: 100 }, ReadSchema);
    content += read.content; offset = read.nextOffset;
  } while (offset !== null);
  assert.equal(content, 'Imported PDF\n\n' + text);
  const read = await call('card_read', { boardId: b.id, cardId: created.created.source }, ReadSchema);
  const image = await callTool(stdioClient, { name: 'asset_read', arguments: { boardId: b.id, name: url.slice(6) } });
  assert.equal(required(image.content[0]).type, 'image');
  assert.deepEqual(Buffer.from(imageContent(image.content[0]).data, 'base64'), bytes);
  const resource = await httpClient.readResource({ uri: required(read.assets[0]).uri });
  assert.deepEqual(Buffer.from(blobResource(resource.contents[0]), 'base64'), bytes);
  const other = await board();
  const refused = await callTool(httpClient, { name: 'asset_read', arguments: { boardId: other.id, name: url.slice(6) } });
  assert.equal(refused.isError, true);
});

test('MCP enforces authentication, browser origins, schema validation and private discovery files', async () => {
  assert.equal((await fetch(base + '/mcp', { method: 'POST' })).status, 401);
  assert.equal((await fetch(base + '/integrations/mcp')).status, 401);
  const hostile = await fetch(base + '/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}`, origin: 'https://example.com' } });
  assert.equal(hostile.status, 403);
  const invalid = await callTool(httpClient, { name: 'board_apply', arguments: { boardId: '../auth', commands: [] } });
  assert.equal(invalid.isError, true);
  const schema = await call('object_schema', { kind: 'diagram' }, ShapeSchema);
  assert.ok(schema.schema.properties.nodes);
  const connection = join(data, 'mcp-connection.json');
  assert.equal((await stat(connection)).mode & 0o777, 0o600);
  const info = IntegrationSchema.parse(await (await fetch(base + '/integrations/mcp', { headers: { authorization: `Bearer ${token}` } })).json());
  assert.equal(info.config.mcpServers.aegis.env.AEGIS_DATA, data);
  assert.equal(info.config.mcpServers.aegis.command, process.execPath);
  assert.equal(info.config.mcpServers.aegis.args[0], join(data, 'integrations/mcp/server.mjs'));
  assert.equal((await stat(required(info.config.mcpServers.aegis.args[0]))).mode & 0o777, 0o600);
  assert.match(info.codexCommand, /^codex mcp add aegis --env /);
  assert.match(info.codexConfig, /\[mcp_servers\.aegis\.env\]/);
  assert.ok(!JSON.stringify(info).includes(token));
});

test('an existing stdio session rediscovers the app after its port changes', async () => {
  const b = await board(stdioClient);
  await stopHost();
  await assert.rejects(readFile(join(data, 'mcp-connection.json')), { code: 'ENOENT' });
  const offline = await callTool(stdioClient, { name: 'board_list', arguments: {} }).then(() => null, (error: unknown) => error);
  assert.ok(offline instanceof Error);
  assert.match(offline.message, /Open the app/);
  await startHost();
  const saved = await call('board_read', { boardId: b.id }, BoardSummarySchema, stdioClient);
  assert.equal(saved.name, b.name);
});

const EventSchema = z.object({ type: z.literal('board'), boardId: z.string(), author: z.object({ kind: z.string(), name: z.string().optional() }) });

test('a stdio client names itself on the board events it causes', async () => {
  const created = await board(stdioClient);
  const stream = await fetch(`${base}/events?token=${token}`, { signal: AbortSignal.timeout(15000) });
  const body = stream.body;
  if (!body) throw new Error('The host did not open an event stream.');
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  const next = async (): Promise<z.output<typeof EventSchema>> => {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('The event stream ended before the board event.');
      buffer += decoder.decode(chunk.value);
      for (;;) {
        const index = buffer.indexOf('\n');
        if (index < 0) break;
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line.startsWith('data:')) continue;
        let value: unknown;
        try { value = JSON.parse(line.slice(5)); } catch { continue; }
        const parsed = EventSchema.safeParse(value);
        if (parsed.success && parsed.data.boardId === created.id) return parsed.data;
      }
    }
  };
  const pending = next();
  await call('board_apply', { boardId: created.id, commands: [{ op: 'create', type: 'note', text: 'Named client' }] }, AppliedSchema, stdioClient);
  const event = await pending;
  assert.equal(event.author.kind, 'mcp');
  assert.equal(event.author.name, 'aegis-stdio-check');
  await reader.cancel();
});
