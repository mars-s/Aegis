import { useEffect, useRef, useState } from 'react';
import type { CardId } from '@aegis/domain/schema';
import type { FeatureContext } from '../../composition.js';
import type { AgentRuntime } from './runtime.js';
import type { AgentScene } from './scene.js';
import { agentName } from './results.js';

export function FollowControls({ context, runtime, scene }: { readonly context: FeatureContext; readonly runtime: AgentRuntime; readonly scene: AgentScene }) {
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
  const reveal = (): void => { if (pending) scene.frame(pending.ids, 0, false); setPending(null); };
  return <><button type="button" id="followBtn" role="switch" aria-label="Follow agents" aria-checked={follow} onClick={() => { const next = !follow; setFollow(next); localStorage.setItem('aegis:follow', next ? 'on' : 'off'); if (next) reveal(); }}>Follow</button><button type="button" id="showChip" hidden={!pending} aria-description={pending?.description} onClick={reveal}>Show changes</button></>;
}
