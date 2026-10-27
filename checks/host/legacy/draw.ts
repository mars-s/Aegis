import { z } from 'zod/v4';
import { CommandSchema } from '@aegis/domain/schema';
import { legacyModule, point } from './module.ts';
const geometry = await legacyModule(new URL('../../../app/src/features/draw/geometry.js', import.meta.url).href);
const engine = await legacyModule(new URL('../../../app/src/canvas/engine.js', import.meta.url).href);
const model = await legacyModule(new URL('../../../app/src/features/draw/model.js', import.meta.url).href);
const pathPoint = point.extend({ ix: z.number().optional(), iy: z.number().optional(), ox: z.number().optional(), oy: z.number().optional(), r: z.number().optional() });
export function pathD(points: unknown, closed: boolean) { return z.string().parse(geometry.call('pathD', points, closed)); }
export function inkHit(card: unknown, at: unknown, radius: number) { return z.boolean().parse(geometry.call('inkHit', card, at, radius)); }
export function fitPoints(points: unknown) { return point.extend({ w: z.number(), h: z.number() }).parse(geometry.call('fitPoints', points)); }
export function shapePoints(shape: string) { return z.array(pathPoint).parse(geometry.call('shapePoints', shape)); }
export function splitSegment(points: unknown, index: number, t: number) { return z.array(pathPoint).parse(geometry.call('splitSegment', points, index, t)); }
export function pointOnSegment(a: unknown, b: unknown, t: number) { return point.parse(geometry.call('pointOnSegment', a, b, t)); }
export function localToWorld(card: unknown, at: unknown) { return point.parse(geometry.call('localToWorld', card, at)); }
export function worldToLocal(card: unknown, at: unknown) { return point.parse(geometry.call('worldToLocal', card, at)); }
export function squigPath(options: unknown) { return z.string().parse(geometry.call('squigPath', options)); }
export function outlineAttrs(options: unknown) {
  return z.object({ 'stroke-dasharray': z.string().optional(), 'stroke-width': z.number(), 'stroke-linecap': z.string().optional() }).parse(geometry.call('outlineAttrs', options));
}
export function linkGeometry(link: unknown, a: unknown, b: unknown) {
  return z.object({ handle: point, mid: point, p0: point }).parse(engine.call('linkGeometry', link, a, b));
}
export function shapePathCommands(board: unknown, card: unknown) { return z.array(CommandSchema).parse(model.call('shapePathCommands', board, card)); }
