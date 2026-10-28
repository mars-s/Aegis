import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { BoardSchema, CardSchema } from '@aegis/domain/schema';
import type { Card } from '@aegis/domain/schema';
import { emptyBoard } from '@aegis/domain/commands';
import { createCanvas } from '@aegis/scene';
import type { CanvasEngine, Rect, ToolPointer } from '@aegis/scene';
import { createWorkspace } from '../../../app/src/workspace/store.ts';
import { DrawingBody } from '../../../app/src/cards/creative/Drawing.tsx';
import { drawingTool } from '../../../app/src/features/draw/tool.ts';
import { PreferencesSchema } from '../../../app/src/features/draw/preferences.ts';
import '../../../app/src/styles/react.css';
import { z } from 'zod/v4';

export const rectSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export const pointSchema = rectSchema.pick({ x: true, y: true });
export const fitItemSchema = rectSchema.partial({ w: true, h: true }).extend({ screenSize: z.object({ w: z.number(), h: z.number() }).optional() });
type FitItem = z.output<typeof fitItemSchema>;
const toRect = (value: z.output<typeof rectSchema>): Rect => ({ x: value.x, y: value.y, width: value.w, height: value.h });
function scene(cards: Card[], area: Rect) {
  const stage = document.createElement('div'), world = document.createElement('div'), backdrop = document.createElement('canvas'), overlay = document.createElement('canvas');
  stage.id = 'stage'; world.id = 'world';
  Object.assign(stage.style, { position: 'fixed', left: '0', top: '0', width: '1280px', height: '900px', overflow: 'hidden' });
  Object.assign(world.style, { position: 'absolute', inset: '0', transformOrigin: '0 0' });
  stage.append(backdrop, world, overlay); document.body.append(stage);
  const workspace = createWorkspace({ board: BoardSchema.parse({ ...emptyBoard('host-scene'), cards }) });
  const engine = createCanvas({ stage, world, backdrop, overlay, workspace,
    onToolCommit: (boardId, commit) => {
      if (workspace.metadata.getSnapshot().id !== boardId) throw new Error('Stale test tool commit');
      const result = workspace.submit(commit.commands);
      if (result.kind === 'rejected') throw new Error(JSON.stringify(result.errors));
      workspace.act({ kind: 'select', ids: commit.selection });
    },
    availableArea: { getSnapshot: () => area, subscribe: () => () => {} }, canLease: () => true, reducedMotion: true });
  return { workspace, engine, dispose() { engine.dispose(); workspace.dispose(); stage.remove(); } };
}
async function idle(engine: CanvasEngine): Promise<void> {
  for (let count = 0; count < 120; count++) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (engine.inspect().pendingFrames === 0) { await new Promise<void>(resolve => setTimeout(resolve, 0)); return; }
  }
  throw new Error('The real scene did not settle');
}
async function fit(items: readonly FitItem[], area: z.output<typeof rectSchema>, maxZoom = 1) {
  const cards = items.flatMap((item, index) => item.screenSize ? [] : [CardSchema.parse({ id: `fit-${index}`, type: 'note', text: '', color: 'plain', ...item })]);
  const running = scene(cards, toRect(area));
  try {
    running.engine.registerFrameParticipant({ fitBounds: zoom => items.flatMap(item => item.screenSize
      ? [{ x: item.x, y: item.y, width: item.screenSize.w / zoom, height: item.screenSize.h / zoom }] : []) });
    running.engine.navigate({ kind: 'fit', ids: [], motion: 'instant', maximumZoom: maxZoom });
    await idle(running.engine);
    const camera = running.engine.camera();
    return { x: camera.x, y: camera.y, z: camera.zoom };
  } finally { running.dispose(); }
}
function pointer(at: { x: number; y: number }): ToolPointer {
  return { world: at, screen: at, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', pressure: .5, time: 1, shift: false, alt: false, bypass: false };
}
async function inkHit(value: unknown): Promise<boolean> {
  const { card, at, radius } = z.object({ card: CardSchema, at: pointSchema, radius: z.number() }).parse(value);
  const running = scene([card], { x: 0, y: 0, width: 1280, height: 900 });
  try {
    const preferences = PreferencesSchema.parse({ pen: 'eraser', sizes: { eraser: radius * 2 } });
    const tool = drawingTool(running.engine, running.workspace, 'ink', () => ({ ...preferences, shape: 'rect', fill: 'none', stroke: 'ink', sw: 2.5, sdash: 'solid', dl: 8, dg: 6, emoji: '⭐' }), () => {});
    running.engine.tool(tool); tool.down(pointer(at), null); tool.up(pointer(at));
    await idle(running.engine);
    return running.workspace.record(card.id).getSnapshot() === null;
  } finally { running.dispose(); }
}
async function worldToLocal(value: unknown) {
  const { card, at } = z.object({ card: CardSchema, at: pointSchema }).parse(value);
  const running = scene([card], { x: 0, y: 0, width: 1280, height: 900 });
  let unmount: (() => void) | undefined;
  try {
    await idle(running.engine);
    const lease = running.engine.leases.getSnapshot().find(value => value.cardId === card.id);
    if (!lease) throw new Error(`No lease for the real DrawingBody: ${JSON.stringify(running.engine.inspect())}`);
    const root = createRoot(lease.host); unmount = () => root.unmount();
    flushSync(() => root.render(<DrawingBody cardId={card.id} workspace={running.workspace} engine={running.engine} />));
    const art = lease.host.querySelector('svg');
    if (!(art instanceof SVGSVGElement)) throw new Error('DrawingBody has no SVG');
    const transform = art.getScreenCTM();
    if (!transform) throw new Error('DrawingBody has no rendered transform');
    const result = new DOMPoint(at.x, at.y).matrixTransform(transform.inverse());
    return { x: result.x, y: result.y };
  } finally { unmount?.(); running.dispose(); }
}
window.hostScene = { fit, inkHit, worldToLocal };
declare global { interface Window { hostScene: { readonly fit: typeof fit; readonly inkHit: typeof inkHit; readonly worldToLocal: typeof worldToLocal } } }
