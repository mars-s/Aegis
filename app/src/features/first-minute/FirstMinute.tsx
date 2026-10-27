import { useRef, useState, useSyncExternalStore } from 'react';
import type { BoardId } from '@aegis/domain/schema';
import type { FeatureContext } from '../../composition.js';
import type { AgentRuntime } from '../agents/runtime.js';
import './first-minute.css';
import './react-first-minute.css';

export const weeklyPrompt = 'Help me plan my week. Ask about my priorities if you need more detail. Make an editable weekly plan and a short checklist on this board. Clearly label any example schedule as a suggestion.';
export function startDocument(context: FeatureContext): void {
  const engine = context.engine();
  const point = engine?.screenToWorld({ x: innerWidth / 2, y: innerHeight / 2 }) ?? { x: 0, y: 0 };
  const result = context.workspace.submit([{ op: 'create', type: 'doc', ref: 'document', text: 'Untitled', props: { body: '' }, x: Math.round(point.x - 280), y: Math.round(point.y - 260) }]);
  const id = result.kind === 'applied' ? result.created.document : null;
  if (id) { context.workspace.act({ kind: 'select', ids: [id] }); context.openEditor(id); }
}
export function FirstMinute({ context, agents, ask, importCsv }: {
  readonly context: FeatureContext; readonly agents: AgentRuntime; readonly ask: (prompt: string) => Promise<boolean>;
  readonly importCsv: (file: File, boardId: BoardId) => Promise<void>;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const count = useSyncExternalStore(context.workspace.scene.subscribe, () => context.workspace.scene.snapshot().cards.length);
  const state = useSyncExternalStore(agents.subscribe, agents.getSnapshot);
  const [error, setError] = useState<string | null>(null);
  const busy = state.sending || state.agents.some(agent => agent.running);
  return <div id="empty" className="empty aegis-feature" hidden={count > 0 || busy} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <p className="empty-title">A thought becomes a plan.</p><div className="empty-actions"><button type="button" data-start="plan" onClick={() => { void ask(weeklyPrompt); }}>Plan my week</button><button type="button" data-start="csv" onClick={() => picker.current?.click()}>Explore a CSV</button><button type="button" data-start="doc" onClick={() => startDocument(context)}>Start a document</button></div>
    <input ref={picker} type="file" accept=".csv,text/csv" hidden aria-label="Import a CSV" onChange={event => {
      const file = event.currentTarget.files?.[0], boardId = context.workspace.metadata.getSnapshot().id; event.currentTarget.value = '';
      if (file) { setError(null); void importCsv(file, boardId).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not import that CSV. Try another file.')); }
    }} />{error ? <p role="alert">{error}</p> : null}
  </div>;
}
