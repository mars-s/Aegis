import { JsonRecordSchema } from '@aegis/domain/schema';
import type { BoardId, CardId, Slide } from '@aegis/domain/schema';
import type { FeatureContext, FeatureWorkspace } from '../../composition.js';
import { deckSlides, identifiedSlide, newSlide, slideIndex } from './model.js';
import type { IdentifiedSlide } from './model.js';

type Patch = Partial<Pick<Slide, 'title' | 'sub' | 'body' | 'layout' | 'background' | 'chart'>> & { readonly relationship?: 'columns' | 'overlap' };
type Operation =
  | { readonly kind: 'patch'; readonly id: string; readonly before: IdentifiedSlide; readonly patch: Patch }
  | { readonly kind: 'insert'; readonly slide: IdentifiedSlide; readonly after: string | null }
  | { readonly kind: 'remove'; readonly id: string }
  | { readonly kind: 'move'; readonly id: string; readonly after: string | null };
export interface DeckDraft {
  readonly slides: readonly IdentifiedSlide[];
  readonly current: number;
  readonly overview: boolean;
  readonly scroll: number;
  readonly dirty: boolean;
  readonly composing: boolean;
  readonly error: string;
}
const sessions = new WeakMap<FeatureWorkspace, Map<BoardId, Map<CardId, DeckSession>>>();
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const fields = ['title', 'sub', 'body', 'layout', 'background', 'chart', 'relationship'] as const;

function createSession(workspace: FeatureWorkspace, cardId: CardId, boardId: BoardId) {
  const card = () => workspace.metadata.getSnapshot().id === boardId ? workspace.card(cardId).getSnapshot() : null;
  const initial = card();
  let snapshot: DeckDraft = { slides: deckSlides(initial), current: slideIndex(initial?.props?.current, deckSlides(initial).length), overview: false, scroll: 0, dirty: false, composing: false, error: '' };
  let operations: Operation[] = [], currentChanged = false, timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  let stop: (() => void) | undefined;
  const update = (patch: Partial<DeckDraft>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const refresh = () => {
    if (snapshot.dirty || snapshot.composing) return;
    const latest = card();
    const slides = deckSlides(latest), current = slideIndex(latest?.props?.current, slides.length);
    if (!equal(slides, snapshot.slides) || current !== snapshot.current) update({ slides, current });
  };
  const flush = (): boolean => {
    clearTimeout(timer); timer = undefined;
    if (!snapshot.dirty) return true;
    if (snapshot.composing) return false;
    const latest = card();
    if (latest?.type !== 'deck') { update({ error: 'This deck is no longer open. Your unfinished slides are retained.' }); return false; }
    let slides = deckSlides(latest);
    for (const op of operations) {
      switch (op.kind) {
        case 'patch': {
          const index = slides.findIndex(slide => slide.id === op.id), slide = slides[index];
          if (!slide || fields.some(key => key in op.patch && !equal(slide[key], op.before[key]) && !equal(slide[key], op.patch[key]))) {
            update({ error: 'This slide changed while you were editing. Copy your text, then use the latest slides.' }); return false;
          }
          slides[index] = identifiedSlide({ ...slide, ...op.patch });
          break;
        }
        case 'insert': {
          if (!slides.some(slide => slide.id === op.slide.id)) slides.splice(op.after === null ? 0 : Math.max(0, slides.findIndex(slide => slide.id === op.after) + 1), 0, op.slide);
          break;
        }
        case 'remove': slides = slides.filter(slide => slide.id !== op.id); break;
        case 'move': {
          const moving = slides.find(slide => slide.id === op.id);
          if (!moving) { update({ error: 'This slide was deleted while you were arranging it. Use the latest slides to continue.' }); return false; }
          slides = slides.filter(slide => slide.id !== op.id);
          slides.splice(op.after === null ? 0 : Math.max(0, slides.findIndex(slide => slide.id === op.after) + 1), 0, moving);
          break;
        }
        default: { const exhaustive: never = op; return exhaustive; }
      }
    }
    const activeId = snapshot.slides[snapshot.current]?.id;
    const current = currentChanged ? slideIndex(slides.findIndex(slide => slide.id === activeId), slides.length) : slideIndex(latest.props?.current, slides.length);
    const result = workspace.submit([{ op: 'update', id: cardId, set: JsonRecordSchema.parse({ props: { ...latest.props, slides, current } }) }]);
    if (result.kind === 'rejected') { update({ error: result.errors.map(error => error.reason).join('. ') }); return false; }
    operations = []; currentChanged = false;
    update({ dirty: false, error: '' }); refresh();
    return true;
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(flush, 350); };
  const change = (slides: readonly IdentifiedSlide[], current: number, operation?: Operation) => {
    if (operation) operations.push(operation);
    currentChanged = true;
    update({ slides, current: slideIndex(current, slides.length), dirty: true, error: '' }); schedule();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!stop) { refresh(); stop = workspace.card(cardId).subscribe(refresh); }
      return () => { listeners.delete(listener); if (!listeners.size) { flush(); stop?.(); stop = undefined; } };
    },
    flush,
    select: (index: number) => { const next = slideIndex(index, snapshot.slides.length); if (next !== snapshot.current) change(snapshot.slides, next); },
    overview: (overview: boolean) => update({ overview }),
    scroll: (scroll: number) => { snapshot = { ...snapshot, scroll }; },
    compose: (composing: boolean) => { update({ composing }); if (!composing && snapshot.dirty) schedule(); },
    patch: (id: string, patch: Patch) => {
      const before = snapshot.slides.find(slide => slide.id === id);
      if (!before || fields.every(key => !(key in patch) || equal(before[key], patch[key]))) return;
      change(snapshot.slides.map(slide => slide.id === id ? identifiedSlide({ ...slide, ...patch }) : slide), snapshot.slides.findIndex(slide => slide.id === id), { kind: 'patch', id, before, patch });
    },
    add: (at = snapshot.slides.length, duplicate = false) => {
      const source = duplicate ? snapshot.slides[snapshot.current] : undefined;
      const slide = source ? identifiedSlide({ ...structuredClone(source), id: crypto.randomUUID() }) : newSlide();
      const slides = [...snapshot.slides]; slides.splice(at, 0, slide);
      change(slides, at, { kind: 'insert', slide, after: snapshot.slides[at - 1]?.id ?? null });
    },
    remove: (index: number) => {
      const slide = snapshot.slides[index]; if (!slide) return;
      change(snapshot.slides.filter(item => item.id !== slide.id), index, { kind: 'remove', id: slide.id });
    },
    move: (index: number, delta: number) => {
      const target = index + delta, slide = snapshot.slides[index];
      if (!slide || target < 0 || target >= snapshot.slides.length) return;
      const slides = snapshot.slides.filter(item => item.id !== slide.id); slides.splice(target, 0, slide);
      change(slides, target, { kind: 'move', id: slide.id, after: slides[target - 1]?.id ?? null });
    },
    useLatest: () => { operations = []; currentChanged = false; clearTimeout(timer); update({ dirty: false, composing: false, error: '' }); refresh(); },
  };
}
export type DeckSession = ReturnType<typeof createSession>;
export function deckSession(workspace: FeatureWorkspace, cardId: CardId): DeckSession {
  let boards = sessions.get(workspace);
  if (!boards) { boards = new Map(); sessions.set(workspace, boards); }
  const boardId = workspace.metadata.getSnapshot().id;
  let cards = boards.get(boardId);
  if (!cards) { cards = new Map(); boards.set(boardId, cards); }
  let session = cards.get(cardId);
  if (!session) { session = createSession(workspace, cardId, boardId); cards.set(cardId, session); }
  return session;
}
export function flushDeck(context: FeatureContext, id: CardId): boolean {
  return deckSession(context.workspace, id).flush();
}
