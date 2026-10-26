// Dependency-free stdio transport. The running app owns storage and all MCP tools.
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const data = process.env.AEGIS_DATA || join(homedir(), 'Library', 'Application Support', 'Aegis');
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
const pending = new Set();
const send = value => process.stdout.write(JSON.stringify(value) + '\n');

async function forward(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); return;
  }
  if (!request || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    send({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32600, message: 'Invalid MCP request' } }); return;
  }
  try {
    // Discover for every call so an app restart can rotate its port and token.
    const connection = JSON.parse(await readFile(join(data, 'mcp-connection.json'), 'utf8'));
    if (!Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535 || typeof connection.token !== 'string' || !connection.token) throw new Error('Invalid local connection file');
    const response = await fetch(`http://127.0.0.1:${connection.port}/mcp`, {
      method: 'POST', headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(request), signal: AbortSignal.timeout(30000),
    });
    if (response.status === 202 || response.status === 204) return;
    const payload = await response.json();
    if (payload.jsonrpc === '2.0') { if (Object.hasOwn(request, 'id')) send(payload); return; }
    throw new Error(response.status === 401 ? 'Aegis restarted. Retry the request.' : payload.error || `HTTP ${response.status}`);
  } catch (error) {
    if (Object.hasOwn(request, 'id')) send({ jsonrpc: '2.0', id: request.id, error: {
      code: -32000, message: `Could not reach Aegis. Open the app and retry. For a custom data folder, set AEGIS_DATA in the MCP configuration. ${error.code === 'ENOENT' ? 'No running app connection was found.' : error.message}`,
    } });
  }
}
lines.on('line', line => {
  if (!line.trim()) return;
  const task = forward(line); pending.add(task); void task.finally(() => pending.delete(task));
});
lines.on('close', async () => { await Promise.allSettled(pending); });
