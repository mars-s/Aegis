import { z } from 'zod/v4';
import { BoardIdSchema, CardSchema, LegacyCardSchema, LinkSchema } from '@aegis/domain';
import type { Board, Card, CardId } from '@aegis/domain';
import type { FeatureWorkspace } from '../workspace/index.js';
import { cloneCommands } from '../features/editing/operations.js';

const TrayBundleSchema = z.object({ bundle: z.object({ cards: z.array(CardSchema), links: z.array(LinkSchema) }).optional() });
export const TrayItemSchema: z.ZodType<Card & z.output<typeof TrayBundleSchema>> = z.intersection(LegacyCardSchema, TrayBundleSchema).transform(item => ({
  ...item, x: item.x ?? 0, y: item.y ?? 0, w: item.w ?? 268, h: item.h ?? 140, color: item.color ?? 'plain',
})).pipe(z.intersection(CardSchema, TrayBundleSchema));
export function capturedItems(board: Board) { return z.array(TrayItemSchema).parse(board.tray ?? []); }

export function releaseCaptured(workspace: FeatureWorkspace, id: CardId, at: { readonly x: number; readonly y: number }): boolean {
  const board = workspace.scene.snapshot(), entries = capturedItems(board), index = entries.findIndex(item => item.id === id), item = entries[index];
  if (!item) return false;
  const cloned = cloneCommands({ from: BoardIdSchema.parse('tray'), cards: item.bundle?.cards ?? [item], links: item.bundle?.links ?? [], text: item.text }, board, at, 0);
  const result = workspace.submit([{ op: 'board_set', set: { tray: (board.tray ?? []).filter((_, position) => position !== index) } }, ...cloned.commands]);
  if (result.kind === 'rejected') throw new Error(result.errors.map(error => error.reason).join('. '));
  workspace.act({ kind: 'select', ids: cloned.ids });
  return true;
}
