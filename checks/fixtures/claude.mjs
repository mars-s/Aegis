#!/usr/bin/env node
// A disposable CLI double. Checks copy it beside a state file; it never reads accounts.
import { readFile, appendFile } from 'node:fs/promises';
const line = value => new Promise((resolve, reject) => { process.stdout.write(value + '\n', error => { if (error) reject(error); else resolve(); }); });
async function main() {
const executable = process.argv[1], args = process.argv.slice(2);
const state = (await readFile(executable + '.state', 'utf8').catch(() => 'signed-out')).trim();
await appendFile(executable + '.calls', JSON.stringify({ args, env: Object.keys(process.env), cwd: process.cwd() }) + '\n');
if (args.includes('--version')) { await line('2.1.0 (Claude Code check)'); return; }
if (args[0] === 'auth') {
  if (state === 'text' && args.includes('--json')) { process.exitCode = 1; return; }
  if (state === 'fail') { process.exitCode = 1; return; }
  if (state === 'slow') { await new Promise(resolve => setTimeout(resolve, 15000)); return; }
  await line(state === 'text' ? 'Logged in with Claude Pro' : JSON.stringify({ loggedIn: state === 'ready' }));
  process.exitCode = state === 'signed-out' ? 1 : 0; return;
}
let prompt = ''; for await (const chunk of process.stdin) prompt += chunk;
if (prompt.includes('WAIT_FOR_CANCEL')) { await new Promise(resolve => setTimeout(resolve, 30000)); return; }
if (prompt.includes('PROFILE_THROUGH_MCP')) {
  const config = JSON.parse(await readFile(args[args.indexOf('--mcp-config') + 1], 'utf8'));
  const data = config.mcpServers.aegis.env.AEGIS_DATA;
  const connection = JSON.parse(await readFile(data + '/mcp-connection.json', 'utf8'));
  const response = await fetch(`http://127.0.0.1:${connection.port}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'profile_update', arguments: { name: 'Avi', workflow: 'Design and study', goals: 'Calmer work', canvasHelp: 'Arrange my thinking' } } }) });
  if (!response.ok) { process.exitCode = 1; return; }
}
const reply = prompt.includes('Passage to rewrite:') ? 'A clearer passage.' : prompt.includes('Welcome introduction:') ? 'Hello. Who are you, what is your workflow, what do you want from Aegis and how could the canvas help?' : 'Claude Code checked the canvas.';
for (const text of reply.match(/\S+\s*/g) ?? []) {
  await line(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } }));
  await new Promise(resolve => setTimeout(resolve, 5));
}
await line(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: reply }] } }));
await line(JSON.stringify({ type: 'result', is_error: false, result: reply }));

}
await main();
