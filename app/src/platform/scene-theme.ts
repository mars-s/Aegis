import type { SceneTheme, Source } from '@aegis/scene';
import { readPreferences } from '../features/settings/preferences-store.js';
/** CSS is read only at attachment and discrete theme changes, never while painting. */
export function createSceneTheme(): Source<SceneTheme> {
  const root = document.documentElement;
  function read(): SceneTheme {
    const css = getComputedStyle(root), token = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
    const preferences = readPreferences();
    return { grid: preferences.gridVisible === 'off' ? 'none' : preferences.gridShape, tilt: preferences.tilt === 'on', dot: preferences.gridVisible === 'off' ? 'transparent' : token('--dot', '#80899d99'), text: token('--text', '#eeeeef'), muted: token('--muted', '#b5b5bd'), focus: token('--focus', '#3f8dfd'), card: token('--card', '#151517'), press: token('--press', '#303035') };
  }
  let current = read(); const listeners = new Set<() => void>();
  const refresh = (): void => { const next = read(); if ((['dot', 'text', 'muted', 'focus', 'card', 'press', 'grid', 'tilt'] as const).every(key => next[key] === current[key])) return; current = next; for (const listener of listeners) listener(); };
  const observer = new MutationObserver(refresh);
  return { getSnapshot: () => current, subscribe: listener => {
    listeners.add(listener); if (listeners.size === 1) { observer.observe(root, { attributes: true, attributeFilter: ['style', 'data-theme'] }); addEventListener('aegis:preferences-changed', refresh); refresh(); }
    return () => { listeners.delete(listener); if (!listeners.size) { observer.disconnect(); removeEventListener('aegis:preferences-changed', refresh); } };
  } };
}
