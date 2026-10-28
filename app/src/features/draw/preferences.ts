// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { z } from 'zod/v4';
import type { SHAPES } from './art.js';
export const EMOJI = ['⭐', '❤️', '👍', '🎉', '🌱', '💡', '🔥', '✅', '😀', '😂', '🥹', '😍', '🤔', '😎', '😴', '👀', '👋', '👏', '🙌', '💪', '🧠', '✨', '💯', '❓', '❗', '🚀', '🎯', '🏆', '🎨', '📌', '📚', '☕', '🍎', '🍓', '🌈', '☀️', '🌙', '🌻', '🌳', '🍀', '🐈', '🐕', '🦊', '🐝', '🦋', '🐢', '🐙', '🦉', '🎵', '🎸', '⚽', '🏀', '🎲', '🎁', '🛠️', '🔑', '💎', '💬', '📍', '🏠', '🌏', '✈️', '🚲', '🧩'];
export const PEN_RANGE = { pen: [2, 48], marker: [2, 40], hi: [8, 72], eraser: [10, 90] } as const;
const PenSchema = z.enum(['pen', 'marker', 'hi', 'eraser']);
const emojis = z.array(z.unknown()).transform(values => values.filter((value): value is string => typeof value === 'string' && EMOJI.includes(value)));
export const PreferencesSchema = z.object({
  pen: PenSchema.catch('pen'), ink: z.string().refine(value => ['ink', 'pink', 'coral', 'butter', 'mint', 'sky', 'lilac', 'white'].includes(value) || /^#[0-9a-f]{6}$/i.test(value)).catch('ink'),
  sizes: z.object({ pen: z.number().finite().transform(value => Math.max(2, Math.min(48, value))).catch(9), marker: z.number().finite().transform(value => Math.max(2, Math.min(40, value))).catch(8), hi: z.number().finite().transform(value => Math.max(8, Math.min(72, value))).catch(24), eraser: z.number().finite().transform(value => Math.max(10, Math.min(90, value))).catch(28) }).catch({ pen: 9, marker: 8, hi: 24, eraser: 28 }),
  favourites: emojis.catch(EMOJI.slice(0, 8)).transform(values => values.slice(0, 8)), recent: emojis.catch([]).transform(values => values.slice(0, 12)),
});
export type DrawPreferences = z.output<typeof PreferencesSchema>;
export interface DrawSettings extends DrawPreferences { readonly shape: keyof typeof SHAPES; readonly fill: string; readonly stroke: string; readonly sw: number; readonly sdash: 'solid' | 'dash' | 'dot' | 'none'; readonly dl: number; readonly dg: number; readonly emoji: string }
export function readPreferences(): DrawPreferences {
  try { const boundary: unknown = JSON.parse(localStorage.getItem('aegis:draw') || '{}'); const parsed = PreferencesSchema.parse(boundary); if (typeof boundary === 'object' && boundary !== null && !('favourites' in boundary)) parsed.favourites = EMOJI.slice(0, 8); return parsed; }
  catch { return PreferencesSchema.parse({ favourites: EMOJI.slice(0, 8) }); }
}
export function savePreferences(preferences: DrawPreferences): void { try { const { pen, ink, sizes, favourites, recent } = preferences; localStorage.setItem('aegis:draw', JSON.stringify({ pen, ink, sizes, favourites, recent })); } catch { /* Drawing remains available when preference storage is full. */ } }
export function pickEmoji(preferences: DrawPreferences, emoji: string, fromPicker: boolean): DrawPreferences { return { ...preferences, favourites: fromPicker && !preferences.favourites.includes(emoji) ? [emoji, ...preferences.favourites].slice(0, 8) : preferences.favourites, recent: [emoji, ...preferences.recent.filter(value => value !== emoji)].slice(0, 12) }; }
