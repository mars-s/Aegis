import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mcpConfiguration } from '../mcp-config.mjs';

test('Codex setup commands preserve paths with spaces, apostrophes and shell syntax', () => {
  const data = "/tmp/Avi's uni $AEGIS_CONFIG_CHECK `printf accidental`";
  const bridge = '/tmp/Aegis config/server.mjs', node = '/tmp/Node installation/node';
  const info = mcpConfiguration({ data, bridge, node, pluginDir: '/tmp/Plugin folder', port: 1234 });
  const output = execFileSync('/bin/sh', ['-c', `set -- ${info.codexCommand}; printf '%s\\0' "$@"`]);
  assert.deepEqual(output.toString().split('\0').slice(0, -1), ['codex', 'mcp', 'add', 'aegis', '--env', `AEGIS_DATA=${data}`, '--', node, bridge]);
  assert.equal(info.config.mcpServers.aegis.env.AEGIS_DATA, data);
  assert.match(info.codexConfig, /^\[mcp_servers\.aegis\]\ncommand = "\/tmp\/Node installation\/node"/);
  assert.ok(info.codexConfig.includes(`AEGIS_DATA = ${JSON.stringify(data)}`));
});
