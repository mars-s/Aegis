import { createElement, Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import { BoardSchema, CardIdSchema } from '@aegis/domain';
import { createCanvas } from '@aegis/scene';
import type { CanvasEngine } from '@aegis/scene';
import { CardPortals } from '../../../app/src/canvas/CardPortals.js';
import type { CardBodyProps } from '../../../app/src/canvas/CardPortals.js';
import type { Composition } from '../../../app/src/composition.js';
import { createWorkspace, useCard } from '../../../app/src/workspace/index.js';

const count = new Map<string, number>();
const committed = (id: string): void => { count.set(id, (count.get(id) ?? 0) + 1); };
function Body({ cardId, workspace }: CardBodyProps) {
  const card = useCard(workspace, cardId);
  return createElement(Profiler, { id: cardId, onRender: committed }, createElement('div', { 'data-portal-body': cardId }, card?.text));
}
const composition: Composition = { cards: [{ kind: 'note', Body }], tools: [], panels: [], menus: [], editors: [] };
const first = CardIdSchema.parse('portal-a');
const workspace = createWorkspace({ board: BoardSchema.parse({
  id: 'portal-commits', name: 'Portal commits', rev: 0, links: [], view: { x: 0, y: 0, z: 1 },
  cards: [
    { id: first, type: 'note', text: 'Retained body', color: 'plain', x: 100, y: 100, w: 240, h: 160 },
    { id: 'portal-b', type: 'note', text: 'Entering body', color: 'plain', x: 1540, y: 100, w: 240, h: 160 },
  ],
}) });
const element = (id: string): HTMLElement => { const result = document.getElementById(id); if (!result) throw new Error(`Missing ${id}`); return result; };
const backdrop = element('backdrop'), overlay = element('overlay');
if (!(backdrop instanceof HTMLCanvasElement) || !(overlay instanceof HTMLCanvasElement)) throw new Error('Missing real scene canvases');
const engine = createCanvas({ stage: element('stage'), world: element('world'), backdrop, overlay, workspace });
const root = createRoot(element('react'));
root.render(createElement(CardPortals, { workspace, engine, composition }));
window.portalCheck = {
  engine, count: id => count.get(id) ?? 0,
  update: () => { workspace.submit([{ op: 'update', id: first, set: { text: 'Updated retained body' } }]); },
};
window.addEventListener('pagehide', () => { root.unmount(); engine.dispose(); workspace.dispose(); }, { once: true });
declare global { interface Window { portalCheck: { readonly engine: CanvasEngine; readonly count: (id: string) => number; readonly update: () => void } } }
