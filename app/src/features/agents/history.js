const UNDO = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3 2.5 6.5 6 10M3 6.5h6a4 4 0 0 1 0 8"/></svg>';
const duration = ms => ms < 1000 ? 'Under 1s' : ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s`;

// Round 2 history: the same compact timeline appears in each window and All agents.
export function renderHistory(el, agent, undo) {
  const signature = JSON.stringify([agent.history, agent.running]);
  if (el.dataset.history === signature) return;
  el.dataset.history = signature;
  el.replaceChildren();
  for (const entry of [...(agent.history ?? [])].reverse()) {
    const row = document.createElement('li'); row.className = 'agent-history-entry'; row.dataset.requestId = entry.id;
    const content = document.createElement('div'), summary = document.createElement('p'), time = document.createElement('time');
    summary.className = 'agent-history-summary'; summary.textContent = entry.summary;
    time.dateTime = new Date(entry.started).toISOString();
    time.textContent = `${new Date(entry.started).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })} · ${entry.elapsedMs === null ? 'Working' : duration(entry.elapsedMs)}${entry.undone ? ' · Undone' : ''}`;
    time.title = entry.brief.replace(/^FAKE(?:TOOLS)?[\s\S]*/, 'Board request');
    content.append(summary);
    for (const change of entry.changes) {
      const title = document.createElement('p'); title.className = 'agent-history-window';
      title.textContent = `${change.actions.join(', ')}: ${change.previousTitle ? `${change.previousTitle} → ` : ''}${change.title}`;
      content.append(title);
    }
    content.append(time); row.append(content);
    if (entry.canUndo || entry.undone) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-btn agent-history-undo';
      button.innerHTML = UNDO; button.disabled = agent.running || entry.undone;
      button.setAttribute('aria-label', entry.undone ? 'Request undone' : `Undo request: ${entry.summary}`);
      button.title = entry.undone ? 'Request undone' : agent.running ? 'Wait for the agent to finish' : 'Undo this request';
      button.onclick = async () => { button.disabled = true; try { await undo(agent.id, entry.id); } finally { button.disabled = agent.running || entry.undone; } };
      row.append(button);
    }
    el.append(row);
  }
  el.hidden = !el.children.length;
}
