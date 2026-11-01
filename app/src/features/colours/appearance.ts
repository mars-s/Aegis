import { z } from 'zod/v4';
import { normHex } from './model.js';
import { contrastText } from './contrast.js';
export { contrastText } from './contrast.js';
const ModeSchema = z.object({ bg: z.string().optional(), dot: z.string().optional(), panel: z.string().optional(), accent: z.string().optional() });
export const AppearanceSettingsSchema = z.object({ light: ModeSchema.catch({}), dark: ModeSchema.catch({}) });
export type AppearanceSettings = z.output<typeof AppearanceSettingsSchema>;
export function readAppearanceSettings(): AppearanceSettings { try { const boundary: unknown = JSON.parse(localStorage.getItem('aegis:colour-settings') || '{}'); return AppearanceSettingsSchema.parse(boundary); } catch { return { light: {}, dark: {} }; } }
export function installAppearance(): () => void {
  const root = document.documentElement, original = new Map<string, string>(), owned = new Set<string>();
  const restore = () => { for (const key of owned) { const previous = original.get(key); if (previous) root.style.setProperty(key, previous); else root.style.removeProperty(key); } owned.clear(); };
  const set = (key: string, value: string) => { if (!original.has(key)) original.set(key, root.style.getPropertyValue(key)); root.style.setProperty(key, value); owned.add(key); };
  const apply = () => {
    restore(); const values = readAppearanceSettings()[root.dataset.theme === 'dark' ? 'dark' : 'light'];
    if (values.bg && normHex(values.bg)) set('--bg', values.bg);
    if (values.dot && normHex(values.dot)) set('--dot', values.dot);
    if (values.panel && normHex(values.panel)) {
      const text = contrastText(values.panel);
      set('--surface', values.panel); set('--surface-overlay', values.panel);
      set('--glass-bg', `color-mix(in srgb, ${values.panel} 90%, transparent)`);
      set('--ink', text); set('--text-1', text);
      set('--text-2', `color-mix(in srgb, ${text} 85%, ${values.panel})`);
      set('--text-3', `color-mix(in srgb, ${text} 80%, ${values.panel})`);
      for (const [key, strength] of [['--border-subtle', 6], ['--border-weak', 10], ['--border-default', 15], ['--border-strong', 30], ['--fill-secondary', 6], ['--fill-hover', 5], ['--fill-active', 9], ['--glass-border', 15]] as const) {
        set(key, `color-mix(in srgb, ${text} ${strength}%, transparent)`);
      }
    }
    if (values.accent && normHex(values.accent)) { set('--accent', values.accent); set('--accent-deep', values.accent); set('--accent-sub', `color-mix(in srgb, ${values.accent} 12%, transparent)`); set('--on-accent', contrastText(values.accent)); }
  };
  const observer = new MutationObserver(apply); observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  const storage = (event: StorageEvent) => { if (event.key === 'aegis:colour-settings') apply(); };
  window.addEventListener('aegis-colour-settings', apply); window.addEventListener('storage', storage); apply();
  return () => { observer.disconnect(); window.removeEventListener('aegis-colour-settings', apply); window.removeEventListener('storage', storage); restore(); };
}
