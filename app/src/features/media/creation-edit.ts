import type { CardId } from '@aegis/domain';
import type { FeatureWorkspace } from '../../composition.js';

const pending = new WeakMap<FeatureWorkspace, Set<CardId>>();

/** One authored creation may request editing when its real body first mounts. */
export function requestCardEdit(workspace: FeatureWorkspace, id: CardId): void {
  let ids = pending.get(workspace);
  if (!ids) {
    const created = new Set<CardId>(); ids = created; pending.set(workspace, created);
    workspace.scene.subscribe(change => { if (change.kind === 'replace') created.clear(); else for (const removed of change.removed) created.delete(removed); });
  }
  ids.add(id);
}

export function takeCardEdit(workspace: FeatureWorkspace, id: CardId): boolean {
  return pending.get(workspace)?.delete(id) ?? false;
}
