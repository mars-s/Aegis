import { createElement, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { BoardSchema, CardSchema, CardIdSchema, CommandSchema, RevisionSchema } from '@aegis/domain/schema';
import { applyBatch } from '@aegis/domain/commands';
import type { Board, Card, CardId, Command } from '@aegis/domain/schema';
import { createCanvas } from '../../../packages/scene/src/engine.js';
import type { CanvasEngine, CanvasWorkspace, SceneChange, SceneOrigin, SlotLease } from '../../../packages/scene/src/types.js';
import { replay } from './replay.js';
import type { ReplayResult } from './replay.js';
import { bindOrientationMenu } from '../../../app/src/canvas/orientation-menu.js';
import { wireframePolicies } from '../../../app/src/canvas/wireframe-policies.js';

interface Harness {
  readonly engine: CanvasEngine;
  readonly board: () => Board;
  readonly calls: readonly (readonly Command[])[];
  readonly submit: CanvasWorkspace['submit'];
  readonly select: (ids: readonly string[]) => void;
  readonly batch: (commands: unknown, origin: SceneOrigin) => void;
  readonly replace: (count: number) => void;
  readonly load: (board: unknown) => void;
  readonly update: (card: unknown) => void;
  readonly mounted: ReadonlyMap<string, HTMLElement>;
  readonly cleanups: readonly string[];
  readonly notifications: () => number;
  readonly navigationNotifications: () => number;
  readonly opened: () => number;
  readonly removePortals: () => void;
  readonly holdCleanup: (hold: boolean) => void;
  readonly acknowledgeReleased: (stale: boolean) => void;
  readonly replay: (scenario: ReplayResult['scenario'], frames?: number) => Promise<ReplayResult>;
}
declare global { interface Window { sceneHarness: Harness } }

const element = (id: string): HTMLElement => { const el = document.getElementById(id); if (!el) throw new Error(`Missing ${id}`); return el; };
const stage = element('stage'), world = element('world'), backdrop = element('backdrop'), overlay = element('overlay');
stage.classList.add('react-stage');
if (!(backdrop instanceof HTMLCanvasElement) || !(overlay instanceof HTMLCanvasElement)) throw new Error('Missing scene canvases');

function fixture(count: number): Board {
  const cards = Array.from({ length: count }, (_, i) => CardSchema.parse({ id: `note-${i}`, type: i === 0 ? 'title' : 'note', text: i === 0 ? 'Thinking table' : `Note ${i}`, color: 'plain', x: (i % 70) * 320 + 80, y: Math.floor(i / 70) * 240 + 80, w: 240, h: 160 }));
  return BoardSchema.parse({ id: `fixture-${count}`, name: 'Scene fixture', rev: 0, cards, links: [], view: { x: 0, y: 0, z: 1 } });
}

let current = fixture(10), selection: readonly CardId[] = [];
const listeners = new Set<(change: SceneChange) => void>(), selectionListeners = new Set<() => void>();
const calls: (readonly Command[])[] = [], mounted = new Map<string, HTMLElement>(), cleanups: string[] = [];
const wireframe = new URLSearchParams(location.search).has('wireframe');
let notifications = 0;
let navigationNotifications = 0;
let opened = 0;
let holdCleanup = false;
const released: SlotLease[] = [];
function update(cards: readonly Card[], removed: readonly CardId[] = []): void {
  const old = current, replaced = new Map(cards.map(card => [card.id, card])), excluded = new Set(removed);
  current = BoardSchema.parse({ ...current, rev: RevisionSchema.parse(current.rev + 1), cards: current.cards.flatMap(card => excluded.has(card.id) ? [] : [replaced.get(card.id) ?? card]) });
  for (const listener of listeners) listener({ kind: 'change', origin: 'local', boardId: current.id, baseRevision: old.rev, revision: current.rev, upserted: cards, removed, links: null, order: null });
}
function batch(value: unknown, origin: SceneOrigin): void {
  const previous = current, result = applyBatch(current, { commands: CommandSchema.array().parse(value) });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  current = result.board;
  const touched = new Set(result.touched), present = new Set(current.cards.map(card => card.id));
  for (const listener of listeners) listener({ kind: 'change', origin, boardId: current.id, baseRevision: previous.rev, revision: current.rev, upserted: current.cards.filter(card => touched.has(card.id)), removed: previous.cards.filter(card => !present.has(card.id)).map(card => card.id), links: current.links, order: current.cards.map(card => card.id) });
}
const workspace: CanvasWorkspace = {
  scene: { snapshot: () => current, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } },
  selection: { getSnapshot: () => selection, subscribe: listener => { selectionListeners.add(listener); return () => selectionListeners.delete(listener); } },
  act: intent => { selection = intent.ids; for (const listener of selectionListeners) listener(); },
  submit: commands => {
    calls.push(commands);
    if (wireframe) { batch(commands, 'local'); return { kind: 'applied' }; }
    const cards: Card[] = [];
    for (const command of commands) {
      const card = 'id' in command ? current.cards.find(candidate => candidate.id === command.id) : undefined;
      if (command.op === 'move' && card) cards.push(CardSchema.parse({ ...card, x: command.x, y: command.y }));
      if (command.op === 'measure' && card) cards.push(CardSchema.parse({ ...card, h: command.h }));
      if (command.op === 'update' && card) {
        const prior = cards.find(candidate => candidate.id === card.id) ?? card;
        const props = command.set.props;
        cards.push(CardSchema.parse({ ...prior, ...command.set, props: props && typeof props === 'object' && !Array.isArray(props) ? { ...prior.props, ...props } : prior.props }));
      }
    }
    if (cards.length) update(cards);
    return { kind: 'applied' };
  },
};
const insetArea = { x: 240, y: 68, width: 800, height: 600 };
const areaListeners = new Set<() => void>();
const engine = createCanvas({ onNavigation: () => { navigationNotifications++; }, onToolCommit: (boardId, commit) => { if (boardId === current.id) { workspace.submit(commit.commands); workspace.act({ kind: 'select', ids: commit.selection }); } }, stage, world, backdrop, overlay, workspace, warmLeases: 32, ...(new URLSearchParams(location.search).get('motion') === 'system' ? {} : { reducedMotion: new URLSearchParams(location.search).get('motion') !== 'on' }), snapGrid: 24,
  ...(new URLSearchParams(location.search).has('drop') ? {
    resolveCardDrop: () => ({
      highlight: stage,
      run: (moves?: readonly Command[]) => {
        workspace.submit([...(moves ?? []), { op: 'update', id: CardIdSchema.parse('note-2'), set: { text: 'Dropped into collection' } }]);
        return true;
      },
    }),
  } : {}),
  ...(wireframe ? { ...wireframePolicies(() => current), canLease: () => true } : {}),
  ...(new URLSearchParams(location.search).has('insets') ? { availableArea: { getSnapshot: () => insetArea, subscribe: (listener: () => void) => { areaListeners.add(listener); return () => { areaListeners.delete(listener); }; } } } : {}),
});
bindOrientationMenu(stage, engine, () => current.cards, () => {});

function Body({ lease }: { readonly lease: SlotLease }) {
  const card = current.cards.find(card => card.id === lease.cardId);
  useEffect(() => {
    mounted.set(lease.key, lease.host);
    return () => {
      mounted.delete(lease.key); cleanups.push(lease.key);
      if (holdCleanup) released.push(lease);
      else queueMicrotask(() => engine.leases.acknowledgeUnmount(lease.key, lease.generation));
    };
  }, [lease]);
  return createElement('div', null, createElement('div', { contentEditable: true, suppressContentEditableWarning: true, 'data-body': lease.cardId, ...(card?.type === 'frame' ? { className: 'wf-frame-name', style: { position: 'absolute', top: '-24px' } } : {}) }, card?.text ?? ''), lease.cardId === 'note-1' ? createElement('iframe', { title: 'Lifetime fixture', srcDoc: '<script>window.frameIdentity=Math.random()</script><p>Persistent frame</p><input value="one" aria-label="Sandbox text">' }) : null, lease.cardId === 'note-2' ? createElement('button', { className: 'win-open', onClick: () => { opened++; } }, 'Open fixture') : null);
}
function Portals() {
  const leases = useSyncExternalStore(engine.leases.subscribe, engine.leases.getSnapshot);
  return leases.map(lease => createPortal(createElement(Body, { lease }), lease.host, lease.key));
}
const root = createRoot(element('portals')); root.render(createElement(Portals));
engine.leases.subscribe(() => { notifications++; });
window.sceneHarness = {
  engine, board: () => current, calls, submit: workspace.submit, select: ids => workspace.act({ kind: 'select', ids: ids.map(id => CardIdSchema.parse(id)) }), mounted, cleanups, notifications: () => notifications, navigationNotifications: () => navigationNotifications, opened: () => opened,
  update: card => update([CardSchema.parse(card)]),
  batch,
  replace: count => {
    const old = current; current = fixture(count);
    for (const listener of listeners) listener({ kind: 'replace', origin: 'sync', boardId: current.id, baseRevision: old.rev, revision: current.rev, upserted: current.cards, removed: [], links: current.links, order: current.cards.map(card => card.id) });
  },
  load: value => {
    const old = current; current = BoardSchema.parse(value);
    for (const listener of listeners) listener({ kind: 'replace', origin: 'sync', boardId: current.id, baseRevision: old.rev, revision: current.rev, upserted: current.cards, removed: [], links: current.links, order: current.cards.map(card => card.id) });
  },
  removePortals: () => root.unmount(),
  holdCleanup: hold => { holdCleanup = hold; },
  acknowledgeReleased: stale => { for (const lease of released) engine.leases.acknowledgeUnmount(lease.key, lease.generation + (stale ? 1 : 0)); if (!stale) released.length = 0; },
  replay: (scenario, frames) => replay(engine, scenario, frames),
};
