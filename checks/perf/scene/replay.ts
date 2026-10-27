import type { CanvasEngine, FrameSample } from '../../../packages/scene/src/types.js';

export interface ReplayResult {
  readonly scenario: 'detail-pan' | 'summary-pan' | 'cluster-pan';
  readonly samples: readonly FrameSample[];
  readonly interval: { readonly p50: number; readonly p95: number; readonly max: number };
  readonly cpu: { readonly p50: number; readonly p95: number; readonly max: number };
}
export function quantiles(values: readonly number[]): { readonly p50: number; readonly p95: number; readonly max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0, p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0, max: sorted.at(-1) ?? 0 };
}

/** Input replay uses a timer. Timing samples come only from the engine callback. */
export async function replay(engine: CanvasEngine, scenario: ReplayResult['scenario'], frames = 120): Promise<ReplayResult> {
  const zoom = scenario === 'detail-pan' ? 1 : scenario === 'summary-pan' ? 0.45 : 0.05;
  engine.recordMetrics(true);
  await new Promise<void>(resolve => {
    let frame = 0;
    const timer = setInterval(() => {
      engine.navigate({ kind: 'restore', camera: { x: -frame * 3, y: -frame * 2, zoom }, motion: 'instant' });
      frame++;
      if (frame >= frames) { clearInterval(timer); setTimeout(resolve, 50); }
    }, 16);
  });
  const samples = engine.samples();
  return { scenario, samples, interval: quantiles(samples.filter(sample => sample.interval > 0).map(sample => sample.interval)), cpu: quantiles(samples.map(sample => sample.cpu)) };
}
