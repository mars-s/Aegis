import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod/v4';
import { CardIdSchema } from '@aegis/domain/schema';
import type { AgentId, Command } from '@aegis/domain/schema';
import { Conversation } from './Chat.js';
import { Orb } from './Orb.js';
import { AgentDrafts } from './StreamingDrafts.js';
import { Options } from './Options.js';
import { AgentActivity, AgentWindows } from './Windows.js';
import { requestResult } from './results.js';
import { modelValue } from './model-choice.js';
import { createMorph, islandTiles } from './island-morph.js';
import { useOrbHint } from '../onboarding/OrbHint.js';
import type { AgentRuntime } from './runtime.js';
import type { AgentScene } from './scene.js';
import './style.css';
import './react-agents.css';

type Phase = 'idle' | 'hover' | 'typing' | 'conversation' | 'running' | 'done';
export interface AgentComposer {
  readonly open: (keyboard?: boolean) => void;
  readonly close: () => void;
  readonly ask: (text: string) => Promise<boolean>;
}
const SelectionRequestSchema = z.object({ ids: z.array(CardIdSchema).optional(), keyboard: z.boolean().optional() });
const CaptureRequestSchema = z.object({ text: z.string() });
export function Agents({ runtime, scene, attached, activityOpen = false, closeActivity, openActivity }: {
  readonly runtime: AgentRuntime; readonly scene: AgentScene; readonly attached: (composer: AgentComposer | null) => void;
  readonly activityOpen?: boolean; readonly closeActivity: () => void; readonly openActivity: () => void;
}) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [phase, setPhase] = useState<Phase>('idle');
  const [prompt, setPrompt] = useState('');
  const [resolved, setResolved] = useState(false);
  const composerRevision = useRef(0);
  const island = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), orb = useRef<HTMLButtonElement>(null);
  const morph = useRef<ReturnType<typeof createMorph> | null>(null);
  const composer = useRef<AgentComposer | null>(null);
  const composerHome = useRef<HTMLDivElement>(null);
  const [composerHost] = useState(() => {
    const host = document.createElement('div');
    host.className = 'agent-composer-host aegis-agents aegis-feature';
    return host;
  });
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoringFocus = useRef(false), suppressHover = useRef(false);
  const pendingOrbFocus = useRef(false);
  const previous = useRef<{ id: AgentId; running: boolean } | null>(null);
  const expanded = phase === 'typing' || phase === 'conversation';
  const agent = runtime.current(), result = requestResult(agent);
  const hint = useOrbHint(runtime, island);
  function change(next: Phase, instant: boolean): void { morph.current?.capture({ instant, crossfade: next !== phase }); setPhase(next); }
  function open(keyboard = false): void {
    composerRevision.current++;
    hint.dismiss(); change(runtime.current() ? 'conversation' : 'typing', keyboard);
  }
  function close(keyboard = false): void {
    composerRevision.current++;
    change(runtime.current()?.running ? 'running' : 'idle', keyboard);
    suppressHover.current = island.current?.matches(':hover') ?? false;
    pendingOrbFocus.current = island.current?.contains(document.activeElement) ?? false;
  }
  const framed = useRef<readonly import('@aegis/domain/schema').CardId[]>([]);
  function frameContext(): void {
    framed.current = state.pinned.length ? state.pinned : runtime.workspace.selection.getSnapshot().length ? runtime.workspace.selection.getSnapshot() : result?.ids ?? [];
    scene.frame(framed.current, island.current?.offsetHeight ?? 0, true);
  }
  useLayoutEffect(() => {
    composerHome.current?.append(composerHost);
    const dock = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const target: unknown = event.detail;
      if (target instanceof HTMLElement) { target.append(composerHost); composer.current?.open(true); }
      else if (target === null) { composerHome.current?.append(composerHost); composer.current?.close(); }
    };
    addEventListener('aegis:mobile-agent-composer', dock);
    return () => { removeEventListener('aegis:mobile-agent-composer', dock); composerHost.remove(); };
  }, [composerHost]);
  useLayoutEffect(() => {
    const root = island.current;
    const shell = root?.querySelector<HTMLElement>('.island-morph'), content = root?.querySelector<HTMLElement>('.island-content');
    if (!root || !shell || !content) return;
    const instance = createMorph(shell, content, [...root.querySelectorAll<HTMLElement>('.island-tile')]);
    morph.current = instance;
    return () => { instance.dispose(); morph.current = null; };
  }, []);
  useLayoutEffect(() => {
    const node = input.current;
    if (node && expanded) { node.style.height = '0px'; node.style.height = `${Math.min(Math.floor(innerHeight * .4), Math.max(26, node.scrollHeight))}px`; }
    morph.current?.layout(expanded);
    if (!expanded && pendingOrbFocus.current) {
      pendingOrbFocus.current = false; restoringFocus.current = true;
      orb.current?.focus({ preventScroll: true }); restoringFocus.current = false;
    }
  });
  useEffect(() => {
    if (expanded) { input.current?.focus({ preventScroll: true }); frameContext(); }
  }, [expanded]);
  useEffect(() => {
    const old = previous.current;
    if (old?.running && agent && !agent.running && agent.id === old.id && !agent.error && agent.history.at(-1)?.finished === null) return;
    previous.current = agent ? { id: agent.id, running: agent.running } : null;
    if (old?.running && agent && !agent.running && agent.id === old.id) {
      if (!agent.error) setResolved(true);
      if (!expanded) change('done', false);
    } else if (agent?.running && !expanded && phase !== 'running') change('running', false);
  }, [agent]);
  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(() => change('idle', false), 8000);
    return () => clearTimeout(timer);
  }, [phase]);
  useEffect(() => { if (!resolved) return; const timer = setTimeout(() => setResolved(false), 650); return () => clearTimeout(timer); }, [resolved]);
  useEffect(() => {
    const root = island.current; if (!root) return;
    const observer = new ResizeObserver(() => { if (['typing', 'conversation'].includes(root.dataset.state ?? '') && framed.current.length) scene.frame(framed.current, root.offsetHeight, true); });
    observer.observe(root); return () => observer.disconnect();
  }, [scene]);
  async function send(text: string, forceNew = false): Promise<boolean> {
    if (runtime.getSnapshot().sending) return false;
    const request = runtime.send(text, forceNew), submitting = runtime.getSnapshot().sending;
    if (submitting) { setPrompt(''); close(true); }
    const revision = composerRevision.current, sent = await request;
    if (revision !== composerRevision.current) return sent;
    if (!sent) { if (submitting) setPrompt(text); open(true); }
    return sent;
  }
  function addNotes(): void {
    const lines = (input.current?.value ?? prompt).split(/\n{2,}|\n/).map(line => line.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
    if (!lines.length) return;
    const commands: Command[] = lines.map((text, i) => /^https?:\/\/\S+$/.test(text) ? { op: 'create', type: 'link', text: '', url: text, ref: `n${i}` } : { op: 'create', type: 'note', text, ref: `n${i}` });
    commands.push({ op: 'layout', ids: lines.map((_, i) => CardIdSchema.parse(`$n${i}`)), shape: 'grid', cols: Math.min(4, lines.length) });
    const applied = runtime.workspace.submit(commands);
    if (applied.kind === 'applied') { setPrompt(''); close(true); }
  }
  const notes = useRef(addNotes); notes.current = addNotes;
  useEffect(() => {
    const form = input.current?.form; if (!form) return;
    const add = () => notes.current();
    form.addEventListener('add-as-notes', add);
    return () => form.removeEventListener('add-as-notes', add);
  }, []);
  composer.current = { open, close: () => close(true), ask: async text => { setPrompt(text); open(true); return send(text, true); } };
  useEffect(() => {
    const controller: AgentComposer = { open: keyboard => composer.current?.open(keyboard), close: () => composer.current?.close(), ask: text => composer.current?.ask(text) ?? Promise.resolve(false) };
    attached(controller);
    return () => attached(null);
  }, [attached]);
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (document.querySelector('dialog:modal')) return;
      const typing = event.target instanceof Element && !!event.target.closest('input, textarea, select, [contenteditable]');
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const selected = runtime.workspace.selection.getSnapshot();
        if (selected.length && !island.current?.querySelector('#composer.open')) runtime.pin(selected);
        composer.current?.open(true);
      } else if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); composer.current?.open(true); }
    };
    const selection = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      const parsed = SelectionRequestSchema.safeParse(detail); if (!parsed.success) return;
      runtime.pin(parsed.data.ids ?? runtime.workspace.selection.getSnapshot()); composer.current?.open(parsed.data.keyboard);
    };
    const capture = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      const parsed = CaptureRequestSchema.safeParse(detail); if (parsed.success) void composer.current?.ask(parsed.data.text);
    };
    const collapse = (event: PointerEvent): void => { if (event.target instanceof Element && event.target.closest('#stage') && !event.target.closest('.agent-window')) composer.current?.close(); };
    const visibility = (): void => { document.body.classList.toggle('agents-hidden', document.hidden); };
    addEventListener('keydown', key, true); document.addEventListener('ask-about-selection', selection); document.addEventListener('capture-to-agent', capture);
    document.addEventListener('pointerdown', collapse); document.addEventListener('visibilitychange', visibility); visibility();
    return () => { removeEventListener('keydown', key, true); document.removeEventListener('ask-about-selection', selection); document.removeEventListener('capture-to-agent', capture); document.removeEventListener('pointerdown', collapse); document.removeEventListener('visibilitychange', visibility); if (leave.current) clearTimeout(leave.current); };
  }, [runtime]);
  useEffect(() => {
    const pinned = new Set(state.pinned);
    function mark(): void { for (const node of document.querySelectorAll<HTMLElement>('#world .card[data-id]')) node.classList.toggle('in-context', state.pinned.some(id => id === node.dataset.id)); }
    mark();
    const world = document.getElementById('world');
    const observer = new MutationObserver(mark); if (world) observer.observe(world, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (pinned.size) for (const node of document.querySelectorAll('.card.in-context')) node.classList.remove('in-context'); };
  }, [state.pinned]);
  const cards = runtime.workspace.scene.snapshot().cards.filter(card => state.pinned.includes(card.id));
  const names = cards.map(card => (card.heading || card.text || (card.type === 'object' ? card.kind : card.type) || 'Window').split('\n')[0]?.trim().slice(0, 40) || 'Window');
  const show = (id: AgentId): void => { runtime.select(id); scene.show(id); };
  return <div className="aegis-agents aegis-feature" onKeyDown={event => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey && ['Enter', ' ', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key) && event.target instanceof Element && event.target.closest('button')) event.stopPropagation();
  }}>
    <AgentWindows runtime={runtime} scene={scene} />
    <AgentDrafts runtime={runtime} scene={scene} />
    <div ref={composerHome} />
    {createPortal(<div ref={island} id="agentIsland" className={`agent-island${agent?.running ? ' working' : ''}${agent?.error ? ' failed' : ''}${phase === 'done' && result ? ' has-result' : ''}`} data-state={phase}
      onPointerEnter={event => { hint.dismiss(); if (leave.current) clearTimeout(leave.current); if (!suppressHover.current && event.pointerType !== 'touch' && matchMedia('(hover: hover) and (pointer: fine)').matches && phase === 'idle') change('hover', false); }}
      onPointerLeave={() => { suppressHover.current = false; leave.current = setTimeout(() => { if (island.current?.dataset.state === 'hover') change('idle', false); }, 160); }}>
      <div className="island-morph"><div className="island-surface" aria-hidden="true">{islandTiles.map(name => <i className={`island-tile island-${name}`} key={name} />)}</div>
        <div className="island-content">
          <button ref={orb} id="askPill" type="button" className={`ask-orb${agent?.running ? ' working' : ''}`} hidden={expanded} aria-expanded={expanded} aria-label={phase === 'done' && result ? `${result.label}. Show changed windows.` : 'Ask the agent. Shortcut Cmd+K.'}
            onFocus={() => { if (!restoringFocus.current && phase !== 'done') open(true); }} onClick={event => { if (phase === 'done' && result) scene.frame(result.ids, 0, event.detail === 0); else open(event.detail === 0); }}>
            <Orb resolved={resolved} /><span className="orb-invite">Ask Aegis</span><span className="orb-key">⌘K</span><span id="orbStatus" className="orb-status">{agent?.running ? agent.status : result?.label || agent?.error || agent?.text.replace(/\s+/g, ' ').slice(0, 130) || 'Ready for your next request'}</span>
          </button>
          <form id="composer" className={`agent-composer${expanded ? ' open' : ''}`} inert={!expanded} onSubmit={event => { event.preventDefault(); if (!state.sending) void send(input.current?.value ?? prompt); }}
            onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); } }}>
            <div className="island-head"><Orb /><p className="orb-activity">{agent?.error || agent?.status || 'Aegis'}</p><button type="button" className="text-btn island-stop" hidden={!agent?.running} onClick={() => { if (agent) void runtime.stop(agent.id); }}>Stop</button><button type="button" className="island-icon island-collapse" aria-label="Collapse Ask" onClick={event => close(event.detail === 0)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button></div>
            <Conversation agent={agent} className="island-turns" />
            <div id="islandContext" className="island-context" hidden={!state.pinned.length} title={names.join('\n')}><span className="context-label">{names.length === 1 ? names[0] : `${names.length} windows · ${names.slice(0, 2).join(', ')}${names.length > 2 ? '…' : ''}`}</span><button type="button" className="context-clear" aria-label="Clear selected context" onClick={() => { runtime.pin([]); input.current?.focus({ preventScroll: true }); }}>×</button></div>
            <textarea ref={input} id="prompt" aria-label="Message" rows={1} value={prompt} placeholder={state.pinned.length ? state.pinned.length === 1 ? 'What should the agent do with this window?' : `What should the agent do with these ${state.pinned.length} windows?` : agent ? 'Follow up with this agent…' : 'Ask about your board…'}
              onChange={event => { composerRevision.current++; morph.current?.capture({ instant: false }); setPrompt(event.target.value); }}
              onKeyDown={event => { if (event.key !== 'Enter' || event.nativeEvent.isComposing) return; if (event.metaKey || event.ctrlKey) { event.preventDefault(); addNotes(); } else if (!event.shiftKey) { event.preventDefault(); if (!state.sending) void send(event.currentTarget.value, event.altKey); } }} />
            <div className="composer-row"><Options runtime={runtime} show={show} addNotes={() => { input.current?.form?.dispatchEvent(new Event('add-as-notes')); }} showAll={openActivity} changed={() => open(true)} /><span className="island-hint">Return to send <span>· Shift Return for a new line</span></span><span className="spacer" /><button id="send" type="submit" className="island-icon send" disabled={state.sending} aria-label={agent ? 'Send follow-up' : 'Start agent'}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3m-4 4 4-4 4 4" /></svg></button></div>
          </form>
          <button type="button" className="island-result-undo" hidden={phase !== 'done' || !result} disabled={!result?.entry.canUndo || !!agent?.running} title={result?.entry.undoBlockedReason || 'Undo this request'} onClick={() => { if (agent && result) void runtime.undo(agent.id, result.entry.id); }}>Undo</button>
        </div>
      </div>{hint.hint}
    </div>, composerHost)}
    <select id="model" hidden aria-label="Agent model source" value={state.model ? modelValue(state.model) : ''} onChange={event => runtime.model(event.target.value)}>{state.models.map(model => <option key={modelValue(model)} value={modelValue(model)}>{model.name}</option>)}</select>
    <select id="count" hidden aria-label="Agent count source" value={state.count} onChange={event => runtime.count(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8].map(count => <option key={count} value={count}>{count}</option>)}</select>
    {activityOpen ? <AgentActivity runtime={runtime} show={show} close={closeActivity} /> : null}
    {state.error ? <div className="agent-error" role="alert">{state.error}<button type="button" onClick={runtime.dismissError}>Dismiss</button></div> : null}
  </div>;
}
