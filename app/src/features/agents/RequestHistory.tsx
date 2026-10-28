import { useState } from 'react';
import type { AgentId, RequestId } from '@aegis/domain/schema';
import type { AgentRequest, AgentSnapshot } from './schema.js';

const duration = (ms: number): string => ms < 1000 ? 'Under 1s' : ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s`;
export type UndoRequest = (agentId: AgentId, requestId: RequestId) => Promise<void>;

function Request({ entry, agent, undo }: { readonly entry: AgentRequest; readonly agent: AgentSnapshot; readonly undo: UndoRequest }) {
  const [pending, setPending] = useState(false);
  const reason = entry.undoBlockedReason || (agent.running ? 'Wait for the agent to finish' : '');
  return <li className="agent-history-entry" data-request-id={entry.id}>
    <div><p className="agent-history-summary">{entry.summary}</p>
      <time dateTime={new Date(entry.started).toISOString()} title={entry.brief.replace(/^FAKE(?:TOOLS)?[\s\S]*/, 'Board request')}>
        {new Date(entry.started).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })} · {entry.elapsedMs === null ? 'Working' : duration(entry.elapsedMs)}{entry.undone ? ' · Undone' : ''}
      </time>
      {entry.undoBlockedReason ? <p className="agent-history-blocked">{entry.undoBlockedReason}</p> : null}
      {entry.changes.length ? <details className="agent-history-details">
        <summary><span className="agent-history-preview" title={entry.changes[0]?.title}>{entry.changes[0]?.title}</span>
          {entry.changes.length > 1 ? <span className="agent-history-more">+{entry.changes.length - 1} more</span> : null}</summary>
        {entry.changes.map(change => <p className="agent-history-window" key={change.id}>{change.actions.join(', ')}: {change.previousTitle ? `${change.previousTitle} → ` : ''}{change.title}</p>)}
      </details> : null}
    </div>
    {entry.canUndo || entry.undone || entry.undoBlockedReason ? <button type="button" className="icon-btn agent-history-undo" disabled={pending || !!reason || entry.undone}
      aria-label={entry.undone ? 'Request undone' : `Undo request: ${entry.summary}`} title={entry.undone ? 'Request undone' : reason || 'Undo this request'}
      onClick={() => { setPending(true); void undo(agent.id, entry.id).finally(() => setPending(false)); }}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3 2.5 6.5 6 10M3 6.5h6a4 4 0 0 1 0 8" /></svg><span>Undo</span>
    </button> : null}
  </li>;
}
export function History({ agent, undo }: { readonly agent: AgentSnapshot; readonly undo: UndoRequest }) {
  return <ol className="agent-history" aria-label="Request changes" hidden={!agent.history.length}>{agent.history.toReversed().map(entry => <Request key={entry.id} entry={entry} agent={agent} undo={undo} />)}</ol>;
}
