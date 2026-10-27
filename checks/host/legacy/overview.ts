import { z } from 'zod/v4';
import { legacyModule } from './module.ts';
const summary = await legacyModule(new URL('../../../app/src/features/overview/summary.js', import.meta.url).href);
const clusters = await legacyModule(new URL('../../../app/src/features/overview/clusters.js', import.meta.url).href);
export function diagramLayout(data: unknown, width: number, height?: number) {
  return z.object({
    edges: z.array(z.object({ from: z.number(), to: z.number() })),
    nodes: z.array(z.object({ x: z.number(), y: z.number(), w: z.number() })),
  }).nullable().parse(summary.call('diagramLayout', data, width, height));
}
export function boardClusters(board: unknown) {
  return z.array(z.object({ name: z.string(), count: z.number(), ids: z.array(z.string()) })).parse(clusters.call('boardClusters', board));
}
