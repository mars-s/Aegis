import type { Card } from "@aegis/domain";
import { plotToDeckChart, resolvePlot } from "@aegis/domain/chart-source";
import { Chart } from "../../charts/Chart.js";
import { SourceStatus } from "../../charts/SourceStatus.js";
import { renderChartSpec } from "../../charts/normalise.js";

export function ReferenceChart({ card, cards }: {
  readonly card: Extract<Card, { kind: "plot" }>;
  readonly cards: readonly Card[];
}) {
  const data = resolvePlot(card.data, cards);
  const spec = renderChartSpec(plotToDeckChart(card.data, cards).spec);
  const beside = spec.kind === "donut" || spec.kind === "radial";
  const legendHeight = data.series.length > 1 && !beside ? 24 : 0;
  return <>
    <SourceStatus status={data.sourceStatus || ""} />
    <Chart title={card.text || "Chart"} height={164 - legendHeight - (data.sourceStatus ? 32 : 0)}
      spec={{ ...spec, headline: undefined, basis: undefined, values: false }} />
  </>;
}
