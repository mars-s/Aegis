import './register.ts';
import { z } from 'zod/v4';
import { CardIdSchema, CardTypeSchema, preserve } from '@aegis/domain/schema';
import type { Board } from '@aegis/domain/schema';
import { fixtureBoard, fixtureCard } from './inputs.ts';
const model = await import('../../../app/src/features/editing/operations.ts');
const collections = await import('../../../app/src/features/editing/collection-operations.ts');
const layers = await import('../../../app/src/features/editing/layers.ts');
const ids = z.array(CardIdSchema);
export function makeClip(board: unknown, selected: string[]) { return model.makeClip(fixtureBoard(board), ids.parse(selected)); }
export function cloneCommands(clip: unknown, board: unknown, centre: { x: number; y: number }, offset?: number) {
  return model.cloneCommands(preserve(model.ClipSchema, clip), fixtureBoard(board), centre, offset);
}
const arrangement = z.enum(['left', 'centre', 'right', 'top', 'middle', 'bottom', 'distribute-x', 'distribute-y']);
export function arrange(board: unknown, selected: string[], how: string) { return model.arrange(fixtureBoard(board), ids.parse(selected), arrangement.parse(how)); }
export function stackCommands(board: unknown, selected: string[], direction: string) {
  return model.stackCommands(fixtureBoard(board), ids.parse(selected), z.enum(['front', 'back', 'forward', 'backward']).parse(direction));
}
const layoutUpdate = z.object({ op: z.literal('update'), id: CardIdSchema, set: z.object({ x: z.number().optional(), y: z.number().optional(), w: z.number().optional(), h: z.number().optional() }).loose() });
const layoutResult = z.array(z.union([layoutUpdate, z.object({ op: z.literal('order'), ids: z.array(CardIdSchema), to: z.number() })]));
export function collectionLayout(board: unknown, card: unknown, kids?: unknown, width?: number) {
  return layoutResult.parse(collections.collectionLayout(fixtureBoard(board), fixtureCard(card), kids === undefined ? undefined : ids.parse(kids), width));
}
export function collectionDrop(board: unknown, cards: unknown, at: { x: number; y: number }) {
  return collections.collectionDrop(fixtureBoard(board), z.array(z.unknown()).parse(cards).map(fixtureCard), at);
}
export function effectiveFlag(board: unknown, card: unknown, flag: string) { return model.effectiveFlag(fixtureBoard(board), fixtureCard(card), z.enum(['hidden', 'locked']).parse(flag)); }
export const snapRotation = model.snapRotation;
export function lineHeightDefault(type: string) { return model.lineHeightDefault(CardTypeSchema.parse(type)); }
export const toolbarOrder = model.toolbarOrder;
const { createWorkspace } = await import('../../../app/src/workspace/store.ts');
export { createWorkspace };
const { historyCommands } = await import('../../../app/src/workspace/projection.ts');
// Translate observed host snapshots into real workspace transactions. History,
// branching and the capacity limit are owned exclusively by the workspace.
export function createHistory(options: { read: () => Board; apply: (commands: unknown[]) => void; busy?: () => boolean }) {
  let workspace = createWorkspace({ board: options.read() });
  function observe(next: Board): void {
    const current = workspace.scene.snapshot();
    if (next.id !== current.id) { workspace.dispose(); workspace = createWorkspace({ board: next }); return; }
    if (options.busy?.() || JSON.stringify(historyCommands(next)) === JSON.stringify(historyCommands(current))) return;
    const result = workspace.submit(historyCommands(next));
    if (result.kind === 'rejected') throw new Error(JSON.stringify(result.errors));
  }
  return {
    observe,
    flush: () => observe(options.read()),
    travel(direction: number): boolean {
      observe(options.read());
      const result = direction < 0 ? workspace.undo() : workspace.redo();
      if (result.kind === 'rejected') return false;
      options.apply([...historyCommands(workspace.scene.snapshot())]);
      return true;
    },
    get status() { return { length: historyStateCount(workspace) }; },
  };
}
export function layerParents(board: unknown) { return new Map<string, string>(layers.layerParents(fixtureBoard(board))); }
export function layerDescendants(board: unknown, selected: string[]) { return layers.layerDescendants(fixtureBoard(board), ids.parse(selected)); }

export function historyStateCount(workspace: ReturnType<typeof createWorkspace>): number {
  let count = 0;
  while (workspace.history.getSnapshot().undo) {
    const result = workspace.undo();
    if (result.kind === 'rejected') throw new Error(JSON.stringify(result.errors));
    count++;
  }
  for (let index = 0; index < count; index++) {
    const result = workspace.redo();
    if (result.kind === 'rejected') throw new Error(JSON.stringify(result.errors));
  }
  return count + 1;
}
