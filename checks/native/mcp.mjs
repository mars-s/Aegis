// Launch the actual app bundle with disposable data and connect through its bundled plugin.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { Client } from '../../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { codexMcpClient } from '../mcp/codex-client.mjs';

const repo = new URL('../..', import.meta.url).pathname;
const bundle = resolve(process.argv[2] || join(repo, 'src-tauri/target/release/bundle/macos/Aegis.app'));
const data = await mkdtemp(join(tmpdir(), 'aegis-native-mcp-'));
const app = spawn(join(bundle, 'Contents/MacOS/aegis'), [], { env: { ...process.env,
  AEGIS_DATA: data, AEGIS_SAFE: '1', AEGIS_FAKE_MODEL: '1',
}, stdio: ['ignore', 'pipe', 'pipe'] });
let diagnostics = '', client, connection;
app.on('error', error => { diagnostics += error.message; });
app.stderr.on('data', bytes => { diagnostics += bytes; });
try {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { connection = JSON.parse(await readFile(join(data, 'mcp-connection.json'), 'utf8')); break; } catch {}
    if (app.exitCode !== null) throw new Error(`App exited ${app.exitCode}: ${diagnostics}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(connection, 'The app must start its MCP host. ' + diagnostics);
  const response = await fetch(`http://127.0.0.1:${connection.port}/integrations/mcp`, { headers: { authorization: `Bearer ${connection.token}` } });
  assert.equal(response.status, 200);
  const { config } = await response.json(), server = config.mcpServers.aegis;
  const resources = join(bundle, 'Contents/Resources');
  assert.equal(server.args[0], join(data, 'integrations/mcp/server.mjs'));
  assert.deepEqual(await readFile(server.args[0]), await readFile(join(resources, 'runtime/plugins/aegis/server.mjs')));
  assert.ok((await stat(join(resources, 'runtime/plugins/aegis/.claude-plugin/plugin.json'))).isFile());
  assert.equal(server.env.AEGIS_DATA, data);
  if (process.env.AEGIS_MCP_CLIENT === 'codex') client = await codexMcpClient(config);
  else {
    client = new Client({ name: 'native-bundle-check', version: '1' });
    await client.connect(new StdioClientTransport({ ...server, stderr: 'pipe' }));
  }
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, result.content?.[0]?.text);
    return result.structuredContent;
  };
  const board = await call('board_create', { name: 'Disposable native MCP check' });
  const doc = await call('document_write', { boardId: board.id, title: 'Native notes', body: 'Created through the bundled local MCP plugin.' });
  const read = await call('card_read', { boardId: board.id, cardId: doc.cardId });
  assert.match(read.content, /Created through the bundled local MCP plugin/);
  const saved = JSON.parse(await readFile(join(data, 'boards', board.id + '.json'), 'utf8'));
  assert.equal(saved.cards.find(c => c.id === doc.cardId).props.body, 'Created through the bundled local MCP plugin.');
  console.log('PASS actual Mac app bundle starts its host, includes the self-contained Claude plugin, and saves editable documents through MCP');
} finally {
  await client?.close();
  if (app.exitCode === null && app.pid) { const stopped = once(app, 'exit'); app.kill(); await stopped; }
  if (connection) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const running = await fetch(`http://127.0.0.1:${connection.port}/health`, { signal: AbortSignal.timeout(250) }).then(() => true, () => false);
      if (!running) break;
      await new Promise(resolve => setTimeout(resolve, 100));
      if (attempt === 39) throw new Error('The native host did not stop with its app.');
    }
  }
  await rm(data, { recursive: true, force: true });
}
