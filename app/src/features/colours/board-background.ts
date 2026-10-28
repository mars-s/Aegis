import type { FeatureWorkspace } from '../../composition.js';
import { normHex } from './model.js';
// Board colours change on authored/store events. Camera frames never enter this adapter.
export function installBoardBackground(workspace: FeatureWorkspace): () => void {
  const root = document.documentElement, previous = root.style.getPropertyValue('--board-canvas'); let applied: string | null = null;
  const update = () => { const colour = normHex(workspace.scene.snapshot().bg) || ''; if (colour === applied) return; applied = colour; if (colour) root.style.setProperty('--board-canvas', colour); else root.style.removeProperty('--board-canvas'); };
  update(); const unsubscribe = workspace.scene.subscribe(update);
  return () => { unsubscribe(); if (previous) root.style.setProperty('--board-canvas', previous); else root.style.removeProperty('--board-canvas'); };
}
