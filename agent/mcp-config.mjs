const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

export function mcpConfiguration({ data, bridge, node, pluginDir, port }) {
  const config = { command: node, args: [bridge], env: { AEGIS_DATA: data } };
  return {
    endpoint: `http://127.0.0.1:${port}/mcp`,
    config: { mcpServers: { aegis: config } },
    codexCommand: `codex mcp add aegis --env ${quote(`AEGIS_DATA=${data}`)} -- ${quote(node)} ${quote(bridge)}`,
    codexConfig: [
      '[mcp_servers.aegis]',
      `command = ${JSON.stringify(node)}`,
      `args = ${JSON.stringify([bridge])}`,
      '', '[mcp_servers.aegis.env]',
      `AEGIS_DATA = ${JSON.stringify(data)}`, '',
    ].join('\n'),
    claudeCommand: `claude mcp add --transport stdio --scope user --env ${quote(`AEGIS_DATA=${data}`)} aegis -- ${quote(node)} ${quote(bridge)}`,
    pluginCommand: `AEGIS_DATA=${quote(data)} claude --plugin-dir ${quote(pluginDir)}`,
  };
}
