export function mountIntegrations(panel, { host, toast }) {
  const heading = document.createElement('h3'); heading.textContent = 'Local MCP';
  const intro = document.createElement('p');
  intro.textContent = 'Connect Codex, Claude or another local MCP client to your boards. Read imported documents and slides, draw diagrams, make cards and write documents you can keep editing here.';
  const status = document.createElement('p'); status.className = 'integration-status'; status.setAttribute('role', 'status');
  const scope = document.createElement('p'); scope.className = 'integration-hint'; scope.textContent = 'Keep Aegis open. Connected sessions can read and change all boards in this data folder.';
  const actions = document.createElement('div'); actions.className = 'integration-actions';
  const details = document.createElement('details'), summary = document.createElement('summary'), config = document.createElement('pre');
  summary.textContent = 'Other MCP clients (JSON)'; config.tabIndex = 0; config.setAttribute('aria-label', 'MCP configuration'); details.append(summary, config);
  panel.append(heading, intro, status, scope, actions, details);
  let info, loading;
  for (const [label, value] of [
    ['Copy Codex command', () => info.codexCommand],
    ['Copy Codex configuration', () => info.codexConfig],
    ['Copy Claude Code command', () => info.claudeCommand],
    ['Copy MCP configuration', () => JSON.stringify(info.config, null, 2)],
    ['Copy plugin launch command', () => info.pluginCommand],
  ]) {
    const button = document.createElement('button'); button.className = 'pill'; button.textContent = label; button.disabled = true;
    button.onclick = async () => {
      try { await host.copy(value()); toast('Copied. Paste it into your MCP client or terminal.'); }
      catch (error) { toast(`Could not copy: ${error.message}`); }
    };
    actions.append(button);
  }
  const retry = document.createElement('button'); retry.className = 'pill'; retry.textContent = 'Refresh connection'; retry.onclick = () => void refresh(); panel.append(retry);
  async function refresh() {
    if (loading) return loading;
    status.textContent = 'Checking local MCP…';
    loading = (async () => {
      try {
        info = await host.get('/integrations/mcp');
        status.textContent = 'Ready. Your local session can connect.';
        config.textContent = JSON.stringify(info.config, null, 2);
        for (const button of actions.children) button.disabled = false;
      } catch (error) {
        status.textContent = `Could not load the connection: ${error.message}`;
        for (const button of actions.children) button.disabled = true;
      } finally { loading = null; }
    })();
    return loading;
  }
  return { refresh };
}
