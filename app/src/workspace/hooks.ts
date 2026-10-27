import { useSyncExternalStore } from 'react';
import type { AgentId, CardId, Source } from '@aegis/domain/schema';
import type { Workspace } from './types.js';

export function useSource<T>(source: Source<T>): T {
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
}

export function useCard(workspace: Workspace, id: CardId) {
  return useSource(workspace.card(id));
}

export function useWorkspaceMetadata(workspace: Workspace) {
  return useSource(workspace.metadata);
}

export function useSaveState(workspace: Workspace) {
  return useSource(workspace.saving);
}

export function useSelection(workspace: Workspace) {
  return useSource(workspace.selection);
}

export function useAgent(workspace: Workspace, id: AgentId) {
  return useSource(workspace.agent(id));
}
