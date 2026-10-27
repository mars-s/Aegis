import { z } from 'zod/v4';
import { legacyModule } from './module.ts';
const geometry = await legacyModule(new URL('../../../app/src/canvas/geometry.js', import.meta.url).href);
const rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), screenSize: z.object({ w: z.number(), h: z.number() }).optional() });
const view = z.object({ x: z.number(), y: z.number(), z: z.number() });
export function projectCard(card: unknown, camera: unknown) { return rect.parse(geometry.call('projectCard', card, camera)); }
export function cardBounds(card: unknown, rotation: number) { return rect.parse(geometry.call('cardBounds', card, rotation)); }
export function fitView(cards: unknown, area: unknown, maxZ?: number) { return view.parse(geometry.call('fitView', cards, area, maxZ)); }
