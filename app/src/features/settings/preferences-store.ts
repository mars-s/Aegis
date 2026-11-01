import { z } from 'zod/v4';
import { gridShapes } from '@aegis/scene';
import type { Source } from '@aegis/domain/schema';

export const PreferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('dark'),
  motion: z.enum(['on', 'off']).default('on'),
  gridVisible: z.enum(['on', 'off']).default('on'),
  gridShape: z.enum(gridShapes.map(([shape]) => shape)).exclude(['none']).default('dots'),
  snap: z.enum(['on', 'off']).default('off'), tilt: z.enum(['on', 'off']).default('off'),
});
export type Preferences = z.output<typeof PreferencesSchema>;
const keys = { theme: 'theme', motion: 'motion', gridVisible: 'grid-visible', gridShape: 'grid-shape', snap: 'snap', tilt: 'tilt' } as const satisfies Record<keyof Preferences, string>;
export interface PreferenceStore extends Source<Preferences> {
  readonly set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  readonly attach: () => () => void;
}
export function readPreferences(): Preferences {
  const fields = Object.fromEntries(Object.entries(keys).map(([field, key]) => [field, localStorage.getItem(`aegis:${key}`) ?? undefined]));
  const legacyGrid = localStorage.getItem('aegis:grid');
  if (fields.gridVisible === undefined && legacyGrid === 'none') fields.gridVisible = 'off';
  if (fields.gridShape === undefined && legacyGrid !== null) fields.gridShape = legacyGrid;
  if (fields.gridShape === 'crosses') fields.gridShape = 'cross';
  const clean = Object.fromEntries(Object.entries(PreferencesSchema.shape).map(([name, schema]) => {
    const parsed = schema.safeParse(fields[name]);
    return [name, parsed.success ? parsed.data : undefined];
  }));
  return PreferencesSchema.parse(clean);
}

export function createPreferenceStore(): PreferenceStore {
  let snapshot = readPreferences();
  const listeners = new Set<() => void>();
  const appearance = (): void => {
    document.body.classList.toggle('motion-off', snapshot.motion === 'off');
    localStorage.setItem('aegis:grid', snapshot.gridVisible === 'off' ? 'none' : snapshot.gridShape);
    document.documentElement.dataset.theme = snapshot.theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : snapshot.theme;
  };
  const publish = (): void => { appearance(); for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(key, value) {
      snapshot = PreferencesSchema.parse({ ...snapshot, [key]: value });
      localStorage.setItem(`aegis:${keys[key]}`, String(value)); publish();
      window.dispatchEvent(new CustomEvent('aegis:preferences-changed', { detail: snapshot }));
    },
    attach() {
      const media = matchMedia('(prefers-color-scheme: dark)');
      const storage = (event: StorageEvent): void => { if (event.storageArea === localStorage && event.key?.startsWith('aegis:')) { snapshot = readPreferences(); publish(); } };
      media.addEventListener('change', appearance); addEventListener('storage', storage); appearance();
      return () => { media.removeEventListener('change', appearance); removeEventListener('storage', storage); };
    },
  };
}
