import './register.ts';
import { z } from 'zod/v4';
import { LinkSchema } from '@aegis/domain/schema';
import { routeLink } from '@aegis/scene/links';
import { fixtureBoard, fixtureCard } from './inputs.ts';
import { withScenePage } from './scene-page.ts';
const art = await import('../../../app/src/features/draw/art.ts');
const geometry = await import('../../../app/src/features/draw/vector-geometry.ts');
const model = await import('../../../app/src/features/draw/commands.ts');
const point = art.VectorPointSchema.pick({ x: true, y: true });
export function pathD(points: unknown, closed: boolean) { return art.pathD(z.array(art.VectorPointSchema).parse(points), closed); }
export async function inkHit(card: unknown, at: unknown, radius: number) {
  return withScenePage(page => page.evaluate(raw => { const value: unknown = JSON.parse(raw); return window.hostScene.inkHit(value); }, JSON.stringify({ card: fixtureCard({ type: 'ink', ...z.record(z.string(), z.unknown()).parse(card) }), at: point.parse(at), radius })));
}
const fitPoint = z.union([art.VectorPointSchema, art.InkPointSchema.transform(([x, y]) => ({ x, y }))]);
export function fitPoints(points: unknown) { return geometry.fitPoints(z.array(fitPoint).parse(points)); }
export function shapePoints(shape: string) { return art.shapePoints(art.DrawingProps.shape.shape.parse(shape)); }
export function splitSegment(points: unknown, index: number, t: number) { return geometry.splitSegment(z.array(art.VectorPointSchema).parse(points), index, t); }
export function pointOnSegment(a: unknown, b: unknown, t: number) { return geometry.pointOnSegment(art.VectorPointSchema.parse(a), art.VectorPointSchema.parse(b), t); }
export function localToWorld(card: unknown, at: unknown) {
  return geometry.localToWorld(fixtureCard(card), point.parse(at));
}
export function worldToLocal(card: unknown, at: unknown) {
  return geometry.worldToLocal(fixtureCard(card), point.parse(at));
}
export function squigPath(options: unknown) { return art.squigPath({ ...art.DrawingProps.parse(options), id: 'host-squiggle' }); }
export function outlineAttrs(options: unknown) {
  const attrs = art.outlineAttributes(art.DrawingProps.parse(options));
  return { 'stroke-width': attrs.strokeWidth, 'stroke-dasharray': attrs.strokeDasharray, 'stroke-linecap': attrs.strokeLinecap };
}
const linkStyle = LinkSchema.pick({ bend: true, pa: true, pb: true });
export function linkGeometry(link: unknown, a: unknown, b: unknown) {
  const source = fixtureCard(a), target = fixtureCard(b), style = linkStyle.parse(link);
  const ar = { x: source.x, y: source.y, width: source.w, height: source.h }, br = { x: target.x, y: target.y, width: target.w, height: target.h };
  const route = routeLink(style, ar, br, source.rot, target.rot);
  return { handle: route.control, mid: routeLink({ ...style, bend: 0 }, ar, br, source.rot, target.rot).control, p0: route.p0 };
}
export function shapePathCommands(board: unknown, card: unknown) { return model.shapePathCommands(fixtureBoard(board), fixtureCard(card)); }
