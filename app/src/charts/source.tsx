import { useSyncExternalStore } from 'react';
import type { CardContent, CardId } from '@aegis/domain/schema';
import type { FeatureWorkspace } from '../composition.js';

// All plots share one evidence subscription. Geometry edits compare only their
// changed IDs, and keep the same payload snapshot without a React publication.
const sources = new WeakMap<FeatureWorkspace, ReturnType<typeof chartSource>>();
function chartSource(workspace: FeatureWorkspace) {
  let cached: readonly CardContent[] = [];
  let byId = new Map<CardId, CardContent>();
  let lastCards: ReturnType<FeatureWorkspace['scene']['snapshot']>['cards'] | null = null;
  const getSnapshot = () => {
    const records = workspace.scene.snapshot().cards;
    if (records === lastCards) return cached;
    lastCards = records;
    const next = records.filter(card => card.kind === 'sheet' || card.kind === 'plot' || card.type === 'deck').flatMap(card => {
      const content = workspace.card(card.id).getSnapshot();
      return content ? [content] : [];
    });
    if (cached.length !== next.length || next.some((card, index) => card !== cached[index])) {
      cached = next;
      byId = new Map(next.map(card => [card.id, card]));
    }
    return cached;
  };
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void) | null = null;
  return { getSnapshot, subscribe: (notify: () => void) => {
    listeners.add(notify);
    unsubscribe ??= workspace.scene.subscribe(change => {
      if (change.kind !== 'replace' && !change.removed.some(id => byId.has(id)) && !change.upserted.some(card => (byId.has(card.id) || card.kind === 'sheet' || card.kind === 'plot' || card.type === 'deck') && workspace.card(card.id).getSnapshot() !== byId.get(card.id))) return;
      const previous = cached;
      if (getSnapshot() !== previous) for (const listener of listeners) listener();
    });
    return () => { listeners.delete(notify); if (!listeners.size) { unsubscribe?.(); unsubscribe = null; } };
  } };
}
export function chartCardsSource(workspace: FeatureWorkspace) {
  let source = sources.get(workspace);
  if (!source) { source = chartSource(workspace); sources.set(workspace, source); }
  return source;
}
export function useChartCards(workspace: FeatureWorkspace): readonly CardContent[] {
  const source = chartCardsSource(workspace);
  return useSyncExternalStore(source.subscribe, source.getSnapshot);
}
