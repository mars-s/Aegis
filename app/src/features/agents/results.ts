import type { AgentSnapshot } from './schema.js';

export function shortTitle(agent: AgentSnapshot): string {
  return (agent.title || agent.brief.split('\n')[0] || 'Board assistant').replace(/^FAKE(?:TOOLS)?[\s\S]*/, 'Board assistant').slice(0, 42);
}
export function agentName(agent: AgentSnapshot, agents: readonly AgentSnapshot[]): string {
  if (agent.title) return agent.title;
  const ordered = agents.filter(item => item.boardId === agent.boardId).toSorted((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  return `Agent ${ordered.findIndex(item => item.id === agent.id) + 1}`;
}
export function requestResult(agent: AgentSnapshot | null) {
  const entry = agent?.history.at(-1);
  if (!entry || entry.finished === null || entry.undone || !entry.changes.length) return null;
  const created = entry.changes.filter(change => change.actions.includes('Created')).length;
  const deleted = entry.changes.filter(change => change.actions.includes('Deleted')).length;
  const updated = entry.changes.filter(change => !change.actions.includes('Created') && !change.actions.includes('Deleted')).length;
  const parts: string[] = [];
  if (created) parts.push(`Created ${created} window${created === 1 ? '' : 's'}`);
  if (updated) parts.push(`Updated ${updated}`);
  if (deleted) parts.push(`Deleted ${deleted}`);
  return { entry, label: parts.join(' · '), ids: entry.changes.filter(change => !change.actions.includes('Deleted')).map(change => change.id) };
}
