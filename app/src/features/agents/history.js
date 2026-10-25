const UNDO = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3 2.5 6.5 6 10M3 6.5h6a4 4 0 0 1 0 8"/></svg>';
const duration = ms => ms < 1000 ? 'Under 1s' : ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s`;

// Round 2 history: the same compact timeline appears in each window and All agents.
export function renderHistory(el, agent, undo) {
  const signature = JSON.stringify([agent.history, agent.running]);
  if (el.dataset.history === signature) return;
  const expanded = new Set([...el.querySelectorAll('details[open]')].map(d => d.closest('[data-request-id]').dataset.requestId));
  el.dataset.history = signature;
  el.replaceChildren();
  for (const entry of [...(agent.history ?? [])].reverse()) {
    const row = document.createElement('li'); row.className = 'agent-history-entry'; row.dataset.requestId = entry.id;
    const content = document.createElement('div'), summary = document.createElement('p'), time = document.createElement('time');
    summary.className = 'agent-history-summary'; summary.textContent = entry.summary;
    time.dateTime = new Date(entry.started).toISOString();
    time.textContent = `${new Date(entry.started).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })} · ${entry.elapsedMs === null ? 'Working' : duration(entry.elapsedMs)}${entry.undone ? ' · Undone' : ''}`;
    time.title = entry.brief.replace(/^FAKE(?:TOOLS)?[\s\S]*/, 'Board request');
    content.append(summary, time);
    if (entry.undoBlockedReason) {
      const blocked = document.createElement('p'); blocked.className = 'agent-history-blocked'; blocked.textContent = entry.undoBlockedReason; content.append(blocked);
    }
    // Round 3 history: names reassure at a glance; the full change list is optional.
    if (entry.changes.length) {
      const details = document.createElement('details'); details.className = 'agent-history-details'; details.open = expanded.has(entry.id);
      const disclosure = document.createElement('summary'), preview = document.createElement('span');
      preview.className = 'agent-history-preview'; preview.textContent = entry.changes.slice(0, 3).map(c => c.title).join(', '); preview.title = preview.textContent;
      disclosure.append(preview);
      if (entry.changes.length > 3) { const more = document.createElement('span'); more.className = 'agent-history-more'; more.textContent = `+${entry.changes.length - 3} more`; disclosure.append(more); }
      details.append(disclosure);
      for (const change of entry.changes) {
        const title = document.createElement('p'); title.className = 'agent-history-window';
        title.textContent = `${change.actions.join(', ')}: ${change.previousTitle ? `${change.previousTitle} → ` : ''}${change.title}`;
        details.append(title);
      }
      content.append(details);
    }
    row.append(content);
    const reason = entry.undoBlockedReason || (agent.running ? 'Wait for the agent to finish' : '');
    if (entry.canUndo || entry.undone || entry.undoBlockedReason) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-btn agent-history-undo';
      button.innerHTML = `${UNDO}<span>Undo</span>`; button.disabled = !!reason || entry.undone;
      button.setAttribute('aria-label', entry.undone ? 'Request undone' : `Undo request: ${entry.summary}`);
      button.title = entry.undone ? 'Request undone' : reason || 'Undo this request';
      button.onclick = async () => { button.disabled = true; try { await undo(agent.id, entry.id); } finally { button.disabled = !!reason || entry.undone; } };
      row.append(button);
    }
    el.append(row);
  }
  el.hidden = !el.children.length;
}
