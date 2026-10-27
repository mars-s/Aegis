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
    if (values.bg && normHex(values.bg)) set('--canvas', values.bg); if (values.dot && normHex(values.dot)) set('--dot', values.dot);
    if (values.panel && normHex(values.panel)) {
      const text = contrastText(values.panel), light = text === '#111111';
      for (const key of ['--bg', '--card', '--color-surface']) set(key, values.panel);
      for (const key of ['--text', '--color-text']) set(key, text);
      for (const key of ['--muted', '--color-label-secondary']) set(key, light ? '#56565d' : '#c4c4cd');
      set('--faint', light ? '#73737a' : '#a0a0ac');
      for (const key of ['--line', '--color-border']) set(key, light ? '#00000020' : '#ffffff30');
      for (const key of ['--line-strong', '--color-border-strong']) set(key, light ? '#00000040' : '#ffffff50');
      for (const key of ['--hover', '--color-fill-hover']) set(key, light ? '#0000000a' : '#ffffff12');
      for (const key of ['--press', '--color-fill']) set(key, light ? '#00000015' : '#ffffff20');
    }
    if (values.accent && normHex(values.accent)) { set('--accent', values.accent); set('--on-accent', contrastText(values.accent)); }
  };
  const observer = new MutationObserver(apply); observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  const storage = (event: StorageEvent) => { if (event.key === 'aegis:colour-settings') apply(); };
  window.addEventListener('aegis-colour-settings', apply); window.addEventListener('storage', storage); apply();
  return () => { observer.disconnect(); window.removeEventListener('aegis-colour-settings', apply); window.removeEventListener('storage', storage); restore(); };
}
