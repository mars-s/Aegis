import type { ChartSpec } from '@aegis/domain/charts';
import type { DeckChartModel } from '@aegis/domain/schema';

// The stored schema permits omitted values for older plots. Both mean a gap.
export function renderChartSpec(spec: NonNullable<DeckChartModel['spec']>): ChartSpec {
  return { ...spec, series: spec.series.map(series => ({ ...series, points: series.points.map(point => ({ ...point, y: point.y ?? null, y2: point.y2 ?? undefined })) })) };
}
