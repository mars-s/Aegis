import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AgentId } from '@aegis/domain/schema';
import { Conversation } from './Chat.js';
import { History } from './RequestHistory.js';
import { Orb } from './Orb.js';
import { agentName, shortTitle } from './results.js';
import type { AgentRuntime } from './runtime.js';
import type { AgentSnapshot } from './schema.js';
import { savedAgentWindow } from './scene.js';
import type { AgentScene } from './scene.js';
import type { EdgeSide } from './geometry.js';

export function AgentWindows({ runtime, scene }: { readonly runtime: AgentRuntime; readonly scene: AgentScene }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [identity, setIdentity] = useState<AgentId | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (identity && tip.current) { scene.identity(identity, tip.current); return () => scene.identity(identity, null); } }, [identity, scene]);
  const who = state.agents.find(agent => agent.id === identity);
  function identify(target: EventTarget | null): void {
    const id = target instanceof Element ? target.closest('.agent-window.collapsed')?.getAttribute('data-agent-id') : null;
    setIdentity(state.agents.find(agent => agent.id === id)?.id ?? null);
  }
  return <><div className="agent-windows" onPointerOver={event => identify(event.target)} onFocus={event => identify(event.target)}
    onPointerOut={event => { const window = event.target instanceof Element ? event.target.closest('.agent-window') : null; if (window && !(event.relatedTarget instanceof Node && window.contains(event.relatedTarget)) && !window.contains(document.activeElement)) setIdentity(null); }}
    onBlur={event => { const window = event.target instanceof Element ? event.target.closest('.agent-window') : null; if (!(event.relatedTarget instanceof Node && window?.contains(event.relatedTarget))) setIdentity(null); }}
    onClick={() => setIdentity(null)} onKeyDown={event => { if (event.key === 'Escape' && identity) { event.preventDefault(); event.stopPropagation(); setIdentity(null); } }}>
    {state.agents.map(agent => <AgentWindow key={agent.id} agent={agent} agents={state.agents} runtime={runtime} scene={scene} />)}</div><EdgeClusters runtime={runtime} scene={scene} />
    {who ? <div ref={tip} id="agentIdentity" className="agent-identity" role="tooltip" style={{ visibility: 'hidden' }}><p>{agentName(who, state.agents)} · {shortTitle(who)}</p><p>{who.error || who.status || 'Ready'}</p></div> : null}
  </>;
}
function AgentWindow({ agent, agents, runtime, scene }: { readonly agent: AgentSnapshot; readonly agents: readonly AgentSnapshot[]; readonly runtime: AgentRuntime; readonly scene: AgentScene }) {
  const [position] = useState(() => savedAgentWindow(agent.id));
  const [collapsed, setCollapsed] = useState(position?.collapsed ?? true);
  const [closed, setClosed] = useState(position?.closed ?? false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const windowRef = useRef<HTMLElement>(null), edgeRef = useRef<HTMLButtonElement>(null), toggleRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const initialAgent = useRef(agent);
  const [resolved, setResolved] = useState(false);
  const running = useRef(agent.running);
  useEffect(() => {
    if (running.current && !agent.running && !agent.error) setResolved(true);
    running.current = agent.running;
    if (!resolved) return;
    const timer = setTimeout(() => setResolved(false), 650);
    return () => clearTimeout(timer);
  }, [agent.running, agent.error, resolved]);
  useLayoutEffect(() => {
    const element = windowRef.current, edge = edgeRef.current;
    if (element && edge) return scene.bind(initialAgent.current, element, edge, () => { setClosed(false); setCollapsed(false); });
  }, [scene]);
  const collapse = (value: boolean): void => { setCollapsed(value); scene.collapsed(agent.id, value); };
  const name = `${agentName(agent, agents)} · ${shortTitle(agent)}`;
  return <>
    <section ref={windowRef} className={`agent-window${collapsed ? ' collapsed' : ''}${agent.running ? ' running' : ''}${agent.error ? ' failed' : ''}`} data-agent-id={agent.id} aria-label="Agent window" hidden={closed}
      onPointerDown={event => { if (event.button === 1 || document.querySelector('#stage.pan-ready')) return; event.stopPropagation(); runtime.select(agent.id); }}
      onFocus={() => runtime.select(agent.id)} onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key === 'Escape' && !collapsed) { event.preventDefault(); event.stopPropagation(); collapse(true); toggleRef.current?.focus({ preventScroll: true }); } if (['Enter', ' ', 'Backspace', 'Delete'].includes(event.key)) event.stopPropagation(); }}>
      <header className="agent-window-strip"
        onPointerDown={event => { if (event.button !== 0 || event.target instanceof Element && event.target.closest('.agent-close') || document.querySelector('#stage.pan-ready')) return; drag.current = { x: event.clientX, y: event.clientY, moved: false }; dragged.current = false; const capture = event.target instanceof Element ? event.target.closest('.agent-window-toggle') : null; (capture instanceof HTMLElement ? capture : event.currentTarget).setPointerCapture(event.pointerId); scene.drag(agent.id, 0, 0, true, false); }}
        onPointerMove={event => { const origin = drag.current; if (!origin) return; const dx = event.clientX - origin.x, dy = event.clientY - origin.y; if (Math.hypot(dx, dy) < 4 && !origin.moved) return; origin.moved = true; dragged.current = true; scene.drag(agent.id, dx, dy, false, false); }}
        onPointerUp={event => { const origin = drag.current; if (!origin) return; scene.drag(agent.id, event.clientX - origin.x, event.clientY - origin.y, false, true); drag.current = null; }}
        onPointerCancel={() => { if (drag.current) scene.drag(agent.id, 0, 0, false, true); drag.current = null; }}>
        <button ref={toggleRef} type="button" className="agent-window-toggle" aria-label={`${agentName(agent, agents)}: ${shortTitle(agent)}`} aria-controls={`agent-body-${agent.id}`} aria-expanded={!collapsed}
          onClick={() => { if (dragged.current) { dragged.current = false; return; } collapse(!collapsed); }}>
          <Orb resolved={resolved} /><span className="agent-window-title">{name}</span><span className="agent-window-status" role="status" title={agent.error || agent.status}>{agent.error || agent.status}</span>
        </button>
        <button type="button" className="text-btn agent-close" aria-label="Close agent window" onClick={() => { setClosed(true); scene.closed(agent.id, true); }}>×</button>
      </header>
      <div id={`agent-body-${agent.id}`} className="agent-window-body" hidden={collapsed}>
        <History agent={agent} undo={runtime.undo} /><Conversation agent={agent} className="agent-window-answer" />
        <form className="agent-follow" onSubmit={event => { event.preventDefault(); if (!draft.trim() || sending) return; setSending(true); void runtime.message(agent.id, draft).then(sent => { if (sent) setDraft(''); }).finally(() => setSending(false)); }}>
          <input aria-label="Follow up with agent" placeholder="Follow up…" value={draft} onChange={event => setDraft(event.target.value)} />
          <button className="text-btn" type="submit" disabled={sending || !draft.trim()}>Send</button><button className="text-btn agent-stop" type="button" hidden={!agent.running} onClick={() => { void runtime.stop(agent.id); }}>Stop</button>
        </form>
      </div>
    </section>
    <button ref={edgeRef} type="button" className="agent-edge" data-agent-id={agent.id} hidden aria-label={`Pan to ${agentName(agent, agents)}: ${shortTitle(agent)}`} title={`Pan to ${agentName(agent, agents)}`}
      onPointerDown={event => event.stopPropagation()} onClick={event => scene.recover(agent.id, event.detail === 0)}>
      <Orb /><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
    </button>
  </>;
}

function EdgeClusters({ runtime, scene }: { readonly runtime: AgentRuntime; readonly scene: AgentScene }) {
  const [chooser, setChooser] = useState<{ side: EdgeSide; ids: readonly string[] } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (chooser) { menu.current?.showPopover(); menu.current?.querySelector('button')?.focus({ preventScroll: true }); } }, [chooser]);
  function close(focus: boolean): void { menu.current?.hidePopover(); setChooser(null); if (focus) opener.current?.focus({ preventScroll: true }); }
  return <div className="agent-edges">
    {(['left', 'right', 'top', 'bottom'] as const).map(side => <button type="button" key={side} ref={node => { scene.cluster(side, node); }} className="agent-edge agent-edge-cluster" hidden
      onClick={event => { opener.current = event.currentTarget; setChooser({ side, ids: scene.group(side)?.entries.map(entry => entry.id) ?? [] }); }}
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); event.currentTarget.click(); } }}><span className="agent-edge-count" /></button>)}
    <div ref={menu} className="agent-edge-chooser aegis-dropdown-menu" popover="auto" role="menu" aria-label={`Off-screen agents, ${chooser?.side ?? 'right'}`}
      onToggle={event => { if (event.newState === 'closed') setChooser(null); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
        const buttons = [...event.currentTarget.querySelectorAll('button')];
        const index = buttons.findIndex(button => button === document.activeElement);
        const next = event.key === 'ArrowDown' ? buttons[(index + 1) % buttons.length] : event.key === 'ArrowUp' ? buttons[(index - 1 + buttons.length) % buttons.length] : event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : null;
        if (next) { event.preventDefault(); next.focus(); }
      }}>
      {chooser?.ids.map(id => { const agent = runtime.getSnapshot().agents.find(agent => agent.id === id); return agent ? <button type="button" key={id} role="menuitem" data-agent-id={id} onClick={event => { close(false); scene.recover(agent.id, event.detail === 0); }}>{agentName(agent, runtime.getSnapshot().agents)}: {shortTitle(agent)}</button> : null; })}
    </div>
  </div>;
}

export function AgentActivity({ runtime, show, close }: { readonly runtime: AgentRuntime; readonly show: (id: AgentId) => void; readonly close: () => void }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  return <section id="agentsPanel" className="agents-panel" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <header className="panel-head"><h2>Agent activity</h2><button id="closeAgents" type="button" aria-label="Close agent activity and panels" onClick={close}>×</button></header>
    <div id="agentList">{state.agents.length ? state.agents.map(agent => <section className="agent-summary" key={agent.id} data-id={agent.id}>
      <div className="agent-summary-head"><div><span>{agentName(agent, state.agents)} · {shortTitle(agent)}</span><small>{agent.error || agent.status}</small></div><button type="button" className="text-btn" onClick={() => show(agent.id)}>Show</button><button type="button" className="text-btn agent-summary-stop" hidden={!agent.running} onClick={() => { void runtime.stop(agent.id); }}>Stop</button></div>
      <History agent={agent} undo={runtime.undo} />
    </section>) : 'Ask from the orb to start an agent.'}</div>
  </section>;
}
