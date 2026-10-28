import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CardId } from '@aegis/domain/schema';
import type { FeatureContext } from '../../composition.js';
import type { AgentRuntime } from './runtime.js';
import type { AgentScene } from './scene.js';
import { agentName } from './results.js';

export function FollowControls({ context, runtime, scene }: { readonly context: FeatureContext; readonly runtime: AgentRuntime; readonly scene: AgentScene }) {
  const agents = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot).agents;
  const running = agents.filter(agent => agent.running).length;
  const [follow, setFollow] = useState(() => localStorage.getItem('aegis:follow') !== 'off');
  const [pending, setPending] = useState<{ readonly ids: readonly CardId[]; readonly description: string } | null>(null);
  const touched = useRef(performance.now());
  const enabled = useRef(follow); enabled.current = follow;
  const applied = useRef(-1);
  useEffect(() => {
    const touch = (): void => { touched.current = performance.now(); };
    for (const type of ['pointerdown', 'wheel', 'keydown']) addEventListener(type, touch, { capture: true, passive: true });
    const off = context.workspace.events.subscribe(() => {
      const event = context.workspace.events.getSnapshot();
      if (event?.type !== 'board' || event.boardId !== context.workspace.metadata.getSnapshot().id || event.rev <= applied.current || event.author.kind === 'user') return;
      applied.current = event.rev;
      const agent = runtime.getSnapshot().agents.find(agent => agent.id === event.author.conversationId);
      if (agent) scene.near(agent.id, event.touched);
      if (event.author.undoRequest || !event.focus || Date.now() - event.focus.at >= 5000) return;
      const ids = event.focus.ids.filter(id => context.workspace.scene.snapshot().cards.some(card => card.id === id));
      if (!ids.length) return;
      const stage = document.getElementById('stage');
      const busy = stage?.classList.contains('panning') || !!document.querySelector('input:focus, textarea:focus, [contenteditable]:focus');
      if (enabled.current && !busy && performance.now() - touched.current > 1500) { scene.frame(ids, 0, false); setPending(null); }
      else setPending({ ids, description: `${agent ? `Show what ${agentName(agent, runtime.getSnapshot().agents)} changed` : 'Show changes'}: ${ids.length} ${ids.length === 1 ? 'window' : 'windows'}` });
    });
    return () => { off(); for (const type of ['pointerdown', 'wheel', 'keydown']) removeEventListener(type, touch, true); };
  }, [context, runtime, scene]);
  const reveal = useCallback((instant: boolean): void => { if (pending) scene.frame(pending.ids, 0, instant); setPending(null); }, [pending, scene]);
  const toggle = useCallback((instant: boolean): void => {
    const next = !enabled.current; enabled.current = next;
    setFollow(next); localStorage.setItem('aegis:follow', next ? 'on' : 'off');
    if (next) reveal(instant);
  }, [reveal]);
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || !event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.key.toLowerCase() !== 'f' || document.querySelector('dialog:modal') || event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]')) return;
      event.preventDefault(); toggle(true);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [toggle]);
  return <><span className="status" id="status" aria-live="polite">{running ? `${running} agent${running > 1 ? 's' : ''} working` : ''}</span><button type="button" id="followBtn" role="switch" aria-label="Follow agents" aria-checked={follow} onClick={event => toggle(event.detail === 0)}>Follow</button><button type="button" id="showChip" hidden={!pending} aria-description={pending?.description} onClick={event => reveal(event.detail === 0)}>Show changes</button></>;
}
