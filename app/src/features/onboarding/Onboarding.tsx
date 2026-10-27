import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { BoardId, CardId } from '@aegis/domain/schema';
import type { FeatureContext } from '../../composition.js';
import './onboarding.css';

type Tour = { readonly kind: 'thought' } | { readonly kind: 'plan'; readonly thought: string; readonly boardId: BoardId } | { readonly kind: 'results'; readonly boardId: BoardId; readonly before: ReadonlySet<CardId> };
export function Onboarding({ open, close, context, ask, openAsk }: {
  readonly open: boolean; readonly close: () => void; readonly context: FeatureContext;
  readonly ask: (prompt: string) => Promise<boolean>; readonly openAsk: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), focus = useRef<HTMLElement | null>(null);
  const [tour, setTour] = useState<Tour>({ kind: 'thought' });
  const [thought, setThought] = useState('I want a calmer week, with time for focused work and a proper break.');
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const metadata = useSyncExternalStore(context.workspace.metadata.subscribe, context.workspace.metadata.getSnapshot);
  const count = useSyncExternalStore(context.workspace.scene.subscribe, () => context.workspace.scene.snapshot().cards.length);
  const latest = useRef(tour); latest.current = tour;
  function finish(): void {
    localStorage.setItem('aegis:onboarded', '1'); close();
  }
  useLayoutEffect(() => {
    const node = dialog.current; if (!node) return;
    if (open && !node.open) {
      focus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setTour({ kind: 'thought' }); setThought('I want a calmer week, with time for focused work and a proper break.'); setError(null);
      document.body.classList.add('onboarding-open'); node.showModal();
    } else if (!open && node.open) {
      node.close(); document.body.classList.remove('onboarding-open');
      if (focus.current?.isConnected) focus.current.focus({ preventScroll: true }); else document.getElementById('stage')?.focus({ preventScroll: true });
    }
  }, [open]);
  useEffect(() => () => { document.body.classList.remove('onboarding-open'); }, []);
  useEffect(() => { if (tour.kind !== 'thought' && metadata.id !== tour.boardId) finish(); }, [metadata.id, tour]);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent): void => {
      const modal = document.querySelector('dialog:modal');
      if (modal && modal !== dialog.current) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(); }
    };
    addEventListener('keydown', key, true); return () => removeEventListener('keydown', key, true);
  }, [open, close]);
  const results = tour.kind === 'results' && metadata.id === tour.boardId ? context.workspace.scene.snapshot().cards.filter(card => !tour.before.has(card.id)) : [];
  const step = tour.kind === 'thought' ? 1 : tour.kind === 'plan' ? 2 : 3;
  void count;
  return <dialog ref={dialog} className={`onboarding aegis-feature${tour.kind !== 'thought' ? ' touring' : ''}`} aria-label="Welcome to Aegis" onCancel={event => { event.preventDefault(); finish(); }}>
    <section className="tour-card"><header><span className="tour-progress">{step} of 3</span><button type="button" onClick={finish}>Skip</button></header>
      <h2>{tour.kind === 'thought' ? 'A thought becomes a plan.' : tour.kind === 'plan' ? 'Give your thought a next step.' : results.length ? 'Your plan has a place.' : 'Watch your plan take shape.'}</h2>
      <p role={tour.kind === 'results' ? 'status' : undefined}>{tour.kind === 'thought' ? 'Start with something on your mind. Aegis can turn it into windows you can edit.' : tour.kind === 'plan' ? 'Ask Aegis for a short plan and a checklist. They will appear beside your thought.' : results.length ? 'These are real windows. Open one to make it yours, or ask Aegis to change it.' : 'Aegis is working on the board. You can keep using the canvas while it works. If it needs a sign-in or more detail, open Ask.'}</p>
      {tour.kind === 'thought' ? <label>Your first thought<textarea rows={3} aria-label="Your first thought" value={thought} onChange={event => setThought(event.target.value)} /></label> : null}
      {error ? <p role="alert">{error}</p> : null}
      <nav>{tour.kind === 'thought' ? <button type="button" disabled={!thought.trim()} onClick={() => {
        const engine = context.engine(), at = engine?.screenToWorld({ x: innerWidth / 2, y: innerHeight / 2 }) ?? { x: 0, y: 0 };
        const result = context.workspace.submit([{ op: 'create', type: 'note', text: thought.trim(), x: Math.round(at.x - 160), y: Math.round(at.y - 100), ref: 'thought' }]);
        if (result.kind === 'rejected') { setError(result.errors.map(error => error.reason).join('. ')); return; }
        const id = result.created.thought; if (id) context.workspace.act({ kind: 'select', ids: [id] });
        const node = dialog.current; node?.close(); node?.show();
        setTour({ kind: 'plan', thought: thought.trim(), boardId: metadata.id });
      }}>Add thought</button> : tour.kind === 'plan' ? <button type="button" disabled={pending} onClick={() => {
        const before = new Set(context.workspace.scene.snapshot().cards.map(card => card.id)), boardId = tour.boardId;
        setPending(true);
        void ask(`Turn this thought into a practical plan: ${tour.thought}\n\nCreate a short editable document and a checklist on this board. Use suggestions, not claims about my life. Keep the original thought.`).then(sent => { if (sent && context.workspace.metadata.getSnapshot().id === boardId && latest.current.kind === 'plan') setTour({ kind: 'results', boardId, before }); }).finally(() => setPending(false));
      }}>Ask for a plan</button> : <><button type="button" onClick={() => { if (results.length) { context.engine()?.navigate({ kind: 'fit', ids: results.map(card => card.id), motion: 'instant' }); finish(); } else openAsk(); }}>{results.length ? 'See my plan' : 'Open Ask'}</button><button type="button" onClick={finish}>Done</button></>}</nav>
    </section>
  </dialog>;
}

export interface ShortcutReference { readonly id: string; readonly label: string; readonly text: string }
export function Shortcuts({ open, close, shortcuts }: { readonly open: boolean; readonly close: () => void; readonly shortcuts: readonly ShortcutReference[] }) {
  const dialog = useRef<HTMLDialogElement>(null), previous = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const node = dialog.current; if (!node) return;
    if (open && !node.open) { previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; node.showModal(); }
    if (!open && node.open) { node.close(); previous.current?.focus({ preventScroll: true }); }
  }, [open]);
  return <dialog ref={dialog} className="shortcuts-sheet aegis-feature" aria-labelledby="shortcuts-title" onCancel={event => { event.preventDefault(); close(); }}><header><h2 id="shortcuts-title">Keyboard shortcuts</h2><button type="button" onClick={close}>Done</button></header><dl>{shortcuts.flatMap(item => [<dt key={`${item.id}:label`}>{item.label}</dt>, <dd key={`${item.id}:keys`} data-shortcut={item.id}>{item.text}</dd>])}<dt>Keyboard shortcuts</dt><dd>?</dd></dl></dialog>;
}
