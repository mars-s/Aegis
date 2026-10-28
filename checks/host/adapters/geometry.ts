import { z } from 'zod/v4';
import { project, rotatedBounds, fromBounds } from '@aegis/scene/geometry';
import { withScenePage } from './scene-page.ts';
const rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
const fitItem = rect.partial({ w: true, h: true }).extend({ screenSize: z.object({ w: z.number(), h: z.number() }).optional() });
const camera = z.object({ x: z.number(), y: z.number(), z: z.number() });
const toRect = (r: z.output<typeof rect>) => ({ x: r.x, y: r.y, width: r.w, height: r.h });
const fromRect = (r: ReturnType<typeof project>) => ({ x: r.x, y: r.y, w: r.width, h: r.height });
export function projectCard(card: unknown, view: unknown) {
  const v = camera.parse(view);
  return fromRect(project(toRect(rect.parse(card)), { x: v.x, y: v.y, zoom: v.z }));
}
export function cardBounds(card: unknown, rotation: number) { return fromRect(fromBounds(rotatedBounds(toRect(rect.parse(card)), rotation))); }
export function fitView(cards: unknown, area: unknown, maxZoom = 1) {
  return withScenePage(page => page.evaluate(args => window.hostScene.fit(args.cards, args.area, args.maxZoom), { cards: z.array(fitItem).parse(cards), area: rect.parse(area), maxZoom }));
}
