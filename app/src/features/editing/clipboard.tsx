import type { FeatureContext } from '../../composition.js';
import type { Clip } from './operations.js';
import { ClipSchema, cloneCommands, makeClip } from './operations.js';
export async function copySelection(context: FeatureContext): Promise<Clip | null> {
  const board = context.workspace.scene.snapshot(), ids = context.workspace.selection.getSnapshot();
  if (!ids.length) return null;
  const clip = makeClip(board, ids);
  try { localStorage.setItem('aegis:clip', JSON.stringify(clip)); } catch { /* The system clipboard can still carry the selected text. */ }
  try { await navigator.clipboard.writeText(clip.text); } catch { /* A local board copy remains available without clipboard permission. */ }
  return clip;
}
export function readClip(): Clip | null {
  try { const parsed = ClipSchema.safeParse(JSON.parse(localStorage.getItem('aegis:clip') ?? 'null')); return parsed.success ? parsed.data : null; } catch { return null; }
}
export function pasteSelection(context: FeatureContext, clip = readClip(), offset = 30): boolean {
  if (!clip) return false;
  const engine = context.engine();
  if (!engine) return false;
  const centre = engine.screenToWorld({ x: innerWidth / 2, y: innerHeight / 2 });
  const cloned = cloneCommands(clip, context.workspace.scene.snapshot(), centre, offset);
  if (!cloned.commands.length) return false;
  const result = context.workspace.submit(cloned.commands);
  if (result.kind === 'rejected') return false;
  context.workspace.act({ kind: 'select', ids: cloned.ids }); return true;
}
export function duplicateSelection(context: FeatureContext, offset = 30): boolean {
  const ids = context.workspace.selection.getSnapshot();
  return ids.length > 0 && pasteSelection(context, makeClip(context.workspace.scene.snapshot(), ids), offset);
}
