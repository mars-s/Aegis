import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { OBJECT_SIZE } from '@aegis/domain/objects';
import type { AgentId, CardType } from '@aegis/domain/schema';
import type { AgentDraft } from './schema.js';
import type { AgentRuntime } from './runtime.js';
import type { AgentScene } from './scene.js';
import './drafts.css';

const sizes: Partial<Record<CardType, readonly [number, number]>> = { doc: [560, 520], deck: [660, 420], note: [240, 120], todo: [260, 180], title: [360, 56], image: [320, 220], link: [260, 76] };
const labels: Readonly<Record<string, string>> = { doc: 'Document', deck: 'Slides', note: 'Note', todo: 'Checklist', title: 'Title', sheet: 'Sheet', plot: 'Chart', diagram: 'Diagram', stats: 'Stats', table: 'Table', kanban: 'Board', timeline: 'Timeline', progress: 'Progress', compare: 'Comparison', stages: 'Stages', callout: 'Callout', form: 'Form', html: 'Custom UI', list: 'List', code: 'Code', plan: 'Plan', reply: 'Reply', gallery: 'Gallery' };
interface DraftView { readonly agentId: AgentId; readonly draft: AgentDraft; readonly index: number; readonly leaving: boolean }
export function AgentDrafts({ runtime, scene }: { readonly runtime: AgentRuntime; readonly scene: AgentScene }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [views, setViews] = useState<readonly DraftView[]>([]);
  useEffect(() => {
    const live = state.agents.filter(agent => agent.running).flatMap(agent => agent.drafts.map((draft, index) => ({ agentId: agent.id, draft, index, leaving: false })));
    setViews(previous => [...live, ...previous.filter(view => !live.some(next => next.agentId === view.agentId && next.draft.id === view.draft.id)).map(view => ({ ...view, leaving: true }))]);
    const timer = setTimeout(() => setViews(current => current.filter(view => !view.leaving)), matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('motion-off') ? 0 : 200);
    return () => clearTimeout(timer);
  }, [state.agents]);
  return <div className="agent-windows agent-drafts">{views.map(view => <Draft key={`${view.agentId}:${view.draft.id}`} view={view} scene={scene} />)}</div>;
}
function Draft({ view, scene }: { readonly view: DraftView; readonly scene: AgentScene }) {
  const ref = useRef<HTMLDivElement>(null);
  const d = view.draft, kind = d.kind ?? d.type;
  const size = d.type === 'object' && d.kind ? OBJECT_SIZE[d.kind] : sizes[d.type] ?? [420, 280];
  const width = size[0] * .5, height = size[1] * .5;
  useLayoutEffect(() => { if (ref.current && !view.leaving) return scene.draft(view.agentId, ref.current, view.index, width, height); }, [scene, view.agentId, view.index, view.leaving, width, height]);
  const label = labels[kind] ?? 'Window';
  return <div ref={ref} className={`agent-draft${!d.done && !view.leaving ? ' writing' : ''}${view.leaving ? ' leaving' : ''}`} aria-hidden="true" style={{ width, height }}>
    <div className="draft-strip"><span className="draft-title">{d.title || `New ${label.toLowerCase()}`}</span><span className="draft-kind"> · {label}</span></div>
    <div className="draft-body">{kind === 'sheet' || kind === 'table' ? <div className="draft-grid">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div> : kind === 'plot' ? <svg className="draft-plot" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 30 C 15 26 22 12 35 16 S 58 34 70 20 S 90 8 100 12" /></svg> : ['diagram', 'stages', 'kanban'].includes(kind) ? <div className="draft-row">{[0, 1, 2, 3].map(i => <i key={i} />)}</div> : <div className="draft-lines"><i /><i /><i /></div>}</div>
  </div>;
}
