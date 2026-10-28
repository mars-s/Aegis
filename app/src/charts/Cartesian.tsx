import { useHover } from './useHover.js';
// Adapted from Zephium Chart/Cartesian.svelte at 0eaad6d, MPL-2.0.
// Changes for Aegis: React, strict indexing and observer-based layout.
import { pointText, tickLabel, xText } from '@aegis/domain/charts';
import type { ChartSpec } from '@aegis/domain/charts';
import { areaPath, band, barPath, linear, linePath, runs } from './geometry.js';
import type { Point } from './geometry.js';
import { readout, shortValue } from './plan.js';
import type { Card, Plan, Row } from './plan.js';
import { Tip } from './Readout.js';
import type { EvidenceProps } from './Readout.js';
import { useBox } from './useBox.js';
export interface PlotProps extends EvidenceProps {
  readonly spec: ChartSpec;
  readonly shape: Plan;
  readonly detail: 'full' | 'overview' | 'tile';
  readonly summary: string;
  readonly height: number;
  readonly screenScale?: number;
}
export function Cartesian({ spec, shape, labels, detail, summary, height, screenScale = 1, ...evidence }: PlotProps & { readonly labels: Card }) {
  /** Reserve room for caption digits and currency symbols, including A$ prefixes. */
  const CHAR = 8;
  const { ref, width } = useBox<HTMLDivElement>();
  const hover = useHover();
  const activeIndex = hover.index;
  const setActiveIndex = hover.show;

  const quiet = (detail !== "full");
  const tile = (detail === "tile");
  const compact = (!!spec.compact || quiet);
  const trend = (spec.kind === "line" || spec.kind === "area");
  const lying = (shape.horizontal);
  const banded = (shape.scale === "band");
  const stacked = (shape.layout === "stack");
  /** Bars that carry their own values need no value axis. */
  const valued = (
    !quiet &&
      (spec.compact
        ? labels.values
        : (spec.kind === "bars" || spec.kind === "range") &&
          spec.series.length === 1 &&
          shape.rows.length <= 12)
  );
  const valueAxis = (!compact && !valued);
  /** A line's points are drawn while there are few enough to tell apart. */
  const dotted = (
    spec.kind === "line" && !tile && shape.rows.length <= 16 && spec.series.length <= 3
  );

  const valueText = (row: Row, order: number) =>
    spec.compact ? shortValue(row.points[order], spec.y) : pointText(row.points[order], spec.y);
  const tickRoom = (
    Math.max(24, ...shape.ticks.map((tick) => tickLabel(tick, spec.y).length * CHAR + 10))
  );
  const nameRoom = (
    Math.min(200, Math.max(...shape.rows.map((row) => row.label.length * CHAR), 0) + 12)
  );
  /** Room right of lying bars for the longest value written after one. */
  const valueRoom = (
    Math.max(
      24,
      ...shape.rows.flatMap((row) =>
        row.points.map((_, order) => valueText(row, order).length * CHAR + 12),
      ),
    )
  );
  const pad = (() => {
    if (tile) return { top: 2, right: 2, bottom: 2, left: 2 };
    if (lying)
      return {
        top: 4,
        right: valued || labels.values ? valueRoom : 8,
        bottom: valueAxis ? 22 : 4,
        left: quiet ? 4 : nameRoom,
      };
    const labelled = spec.compact && !quiet && (labels.categories || !!labels.ends);
    // The value axis reads on the left, where a reader looks for it; a line keeps room at both ends for its dots.
    return {
      top: valued || (spec.compact && labels.values && !quiet) ? 20 : 8,
      right: spec.compact && labels.ends && !quiet ? 36 : trend ? 14 : 4,
      bottom: quiet ? 4 : spec.compact ? (labelled ? 18 : 4) : 24,
      left: valueAxis ? tickRoom : trend ? 14 : 0,
    };
  })();
  const left = (pad.left);
  const right = (Math.max(left + 1, width - pad.right));
  const top = (pad.top);
  const bottom = (Math.max(top + 1, height - pad.bottom));
  // A short preview keeps its full series but draws only ticks that fit at 12px.
  const visibleTicks = (() => {
    const limit = Math.max(2, Math.floor((bottom - top) / 24) + 1);
    return shape.ticks.length <= limit ? shape.ticks : Array.from({ length: limit }, (_, i) => shape.ticks[Math.round(i * (shape.ticks.length - 1) / (limit - 1))] ?? 0);
  })();

  /** The value axis, up the plot or across it when the bars lie down. */
  const value = (
    lying ? linear(shape.domain, [left, right]) : linear(shape.domain, [bottom, top])
  );
  const zero = (value(Math.max(shape.domain[0], Math.min(0, shape.domain[1]))));
  const bands = (
    band(shape.rows.length, lying ? [top, bottom] : [left, right], tile ? 0.2 : 0.28, 0.1)
  );
  const span = ((): [number, number] => {
    const ats = shape.rows.map((row) => row.at);
    return [Math.min(...ats), Math.max(...ats)];
  })();
  const along = (
    shape.scale === "index"
      ? linear([0, Math.max(1, shape.rows.length - 1)], [left, right])
      : linear(span, [left, right])
  );
  /** Where a row stands across the plot: its band's middle, or its place on the axis. */
  function middle(row: Row): number {
    if (banded) return bands.start(row.index) + bands.width / 2;
    if (shape.rows.length === 1) return (left + right) / 2;
    return along(row.at);
  }

  type Bar = { key: string; d: string; color: string; origin: string; index: number };
  const radius = (() => {
    const across = groupWidth();
    return Math.max(2, Math.min(tile ? 3 : 6, across / 2));
  })();
  function groupWidth() {
    if (stacked || spec.series.length === 1) return bands.width;
    return band(spec.series.length, [0, bands.width], 0.14, 0).width;
  }
  const bars = ((): Bar[] => {
    if (trend) return [];
    const out: Bar[] = [];
    const inner = band(spec.series.length, [0, bands.width], 0.14, 0);
    spec.series.forEach((_, order) => {
      shape.rows.forEach((row) => {
        const point = row.points[order];
        if (!point || point.y === null) return;
        let from: number;
        let to: number;
        let corners: "end" | "all" | "none" = "end";
        if (stacked) {
          [from, to] = (shape.stacks[order]?.[row.index] ?? [0, 0]);
          if (from === to) return;
          const outward = to >= from;
          const later = shape.stacks.slice(order + 1).some((spans) => {
            const [a, b] = (spans[row.index] ?? [0, 0]);
            return a !== b && b >= a === outward;
          });
          if (later) corners = "none";
        } else if (spec.kind === "range") {
          from = point.y;
          to = point.y2 ?? point.y;
          corners = "all";
        } else {
          from = Math.max(shape.domain[0], Math.min(0, shape.domain[1]));
          to = point.y;
        }
        const offset = stacked || spec.series.length === 1 ? 0 : inner.start(order);
        const room = stacked || spec.series.length === 1 ? bands.width : inner.width;
        // A few bars in a wide plot stay bars, centred in their room, not slabs.
        const across = Math.min(room, lying ? 28 : 64);
        const start = bands.start(row.index) + offset + (room - across) / 2;
        let a = value(from);
        let b = value(to);
        // A range quoted as one figure is a capsule at that figure, never nothing.
        const least = Math.min(across, 8);
        if (spec.kind === "range" && Math.abs(b - a) < least) {
          const mid = (a + b) / 2;
          const half = (least / 2) * (b >= a ? 1 : -1);
          [a, b] = [mid - half, mid + half];
        }
        // Parts of a stack are parted by a 2px gap on the side away from the baseline.
        const gap = stacked && from !== 0 ? 2 : 0;
        let d: string;
        let origin: string;
        if (lying) {
          const forward = b >= a;
          const x0 = forward ? a + gap : b;
          const x1 = forward ? b : a - gap;
          d = barPath(x0, start, x1 - x0, across, radius, corners, forward ? "right" : "left");
          origin = spec.kind === "range" ? "center" : forward ? "left" : "right";
        } else {
          const upward = b <= a;
          const y0 = upward ? b : a + gap;
          const y1 = upward ? a - gap : b;
          d = barPath(start, y0, across, y1 - y0, radius, corners, upward ? "up" : "down");
          origin = spec.kind === "range" ? "center" : upward ? "bottom" : "top";
        }
        if (d)
          out.push({
            key: `${order}:${row.key}`,
            d,
            color: shape.series[order]?.color ?? 'var(--data)',
            origin,
            index: row.index,
          });
      });
    });
    return out;
  })();

  /** Each series' points along the plot: its top on a stack, nothing at a gap. */
  const lines = (() => {
    if (!trend) return [];
    return shape.series.map((series, order) => {
      const tops = shape.rows.map((row): Point | null => {
        const y = row.points[order]?.y;
        if (y === null || y === undefined) return null;
        return { x: middle(row), y: value(stacked ? (shape.stacks[order]?.[row.index] ?? [0, 0])[1] : y) };
      });
      const floors = shape.rows.map((row): Point | null =>
        stacked
          ? { x: middle(row), y: value((shape.stacks[order]?.[row.index] ?? [0, 0])[0]) }
          : { x: middle(row), y: zero },
      );
      const pieces = runs(
        tops.map((point, index) => (point ? { point, floor: floors[index] ?? { x: point.x, y: zero } } : null)),
      );
      return {
        key: series.key,
        color: series.color,
        line: pieces.map((piece) => linePath(piece.map((entry) => entry.point), spec.smooth)).join(""),
        area: pieces
          .map((piece) =>
            areaPath(
              piece.map((entry) => entry.point),
              piece.map((entry) => entry.floor),
              spec.smooth,
            ),
          )
          .join(""),
        dots: tops,
      };
    });
  })();

  const timeFormat = (
    new Intl.DateTimeFormat(
      undefined,
      span[1] - span[0] > 2 * 86_400_000
        ? { month: "short", day: "numeric" }
        : { hour: "numeric", minute: "2-digit" },
    )
  );
  function category(row: Row): string {
    if (shape.scale === "time") return timeFormat.format(row.at);
    if (shape.scale === "linear") return xText(row.at, "linear");
    return row.label;
  }
  /** Category names along their axis, thinned evenly so no two ever touch. */
  const shown = (() => {
    if (lying) return shape.rows;
    if (shape.scale === "index") {
      const every = Math.max(1, Math.ceil(shape.rows.length / 8));
      return shape.rows.filter((row) => row.index % every === 0);
    }
    const widest = Math.max(...shape.rows.map((row) => category(row).length * CHAR), 0) + 10;
    const room = Math.max(1, right - left);
    const every = Math.max(1, Math.ceil((shape.rows.length * widest) / room));
    return shape.rows.filter((_, index) => index % every === 0);
  })();
  /** A name cut to the room beside lying bars, whole in its title. */
  function fit(text: string, room: number) {
    const most = Math.max(3, Math.floor(room / CHAR));
    return text.length > most ? `${text.slice(0, most - 1).trimEnd()}…` : text;
  }
  /** Where a bar's value is written, in plot pixels. */
  function spot(row: Row, order: number) {
    const point = row.points[order];
    if (!point || point.y === null) return null;
    const end = point.y2 ?? point.y;
    const up = end >= 0;
    const many = spec.series.length > 1 && !stacked;
    const inner = band(spec.series.length, [0, bands.width], 0.14, 0);
    const offset = many ? inner.start(order) + inner.width / 2 : bands.width / 2;
    if (lying)
      return {
        x: value(end) + (up ? 6 : -6),
        y: bands.start(row.index) + offset,
        anchor: up ? ("start" as const) : ("end" as const),
      };
    return {
      x: bands.start(row.index) + offset,
      y: value(end) + (up ? -7 : 14),
      anchor: "middle" as const,
    };
  }
  const lastRow = shape.rows.findLast((row) => row.points[0] && row.points[0].y !== null);

  const active = activeIndex === null ? null : shape.rows[activeIndex];
  const tip = active ? readout(spec, shape, active.index) : null;
  const most = Math.max(0, ...active?.points.flatMap((point, order) => point?.y != null ? [stacked ? shape.stacks[order]?.[active.index]?.[1] ?? point.y : point.y2 ?? point.y] : []) ?? []);
  return <div ref={ref} className="cartesian" style={{ height }}>
    {width > 0 ? <svg width={width} height={height} role="img" aria-label={summary} className={lying ? 'lying' : ''}
      onPointerMove={quiet ? undefined : event => {
        const box = event.currentTarget.getBoundingClientRect();
        const position = lying ? (event.clientY - box.top) * height / box.height : (event.clientX - box.left) * width / box.width;
        const nearest = shape.rows.reduce<Row | null>((best, row) => !best || Math.abs((lying ? bands.start(row.index) + bands.width / 2 : middle(row)) - position) < Math.abs((lying ? bands.start(best.index) + bands.width / 2 : middle(best)) - position) ? row : best, null);
        setActiveIndex(nearest?.index ?? null);
      }} onPointerLeave={hover.hide}>
      {!tile && !(lying && valued) ? <g className="grid" aria-hidden="true">{visibleTicks.map(tick => lying ? <line key={tick} x1={value(tick)} x2={value(tick)} y1={top} y2={bottom} /> : <line key={tick} x1={left} x2={right} y1={value(tick)} y2={value(tick)} />)}</g> : null}
      {shape.domain[0] < 0 && shape.domain[1] > 0 ? lying ? <line className="zero" x1={zero} x2={zero} y1={top} y2={bottom} /> : <line className="zero" x1={left} x2={right} y1={zero} y2={zero} /> : null}
      {spec.target && !tile ? <g>{lying ? <line className="target" x1={value(spec.target.value)} x2={value(spec.target.value)} y1={top} y2={bottom} /> : <line className="target" x1={left} x2={right} y1={value(spec.target.value)} y2={value(spec.target.value)} />}<text className="tick" x={lying ? value(spec.target.value) + 4 : right} y={lying ? top + 10 : value(spec.target.value) - 6} textAnchor={lying ? 'start' : 'end'}>{spec.target.label || tickLabel(spec.target.value, spec.y)}</text></g> : null}
      {trend ? lines.map(series => <g key={series.key}>{spec.kind === 'area' ? <path d={series.area} className="mark area" fill={series.color} /> : null}<path d={series.line} className="mark line" stroke={series.color} />{dotted ? series.dots.map((dot, index) => dot ? <circle key={index} cx={dot.x} cy={dot.y} r={2.5 / screenScale} className="mark dot" stroke={series.color} /> : null) : null}</g>) : bars.map(bar => <path key={bar.key} d={bar.d} fill={bar.color} className={`mark bar${active && active.index !== bar.index ? ' dim' : ''}`} />)}
      {active && trend ? <line className="cursor-line" x1={middle(active)} x2={middle(active)} y1={top} y2={bottom} /> : null}
      {!trend && valued ? shape.series.flatMap((series, order) => shape.rows.map(row => { const at = spot(row, order); return at ? <text key={`${series.key}:${row.key}`} x={at.x} y={at.y} textAnchor={at.anchor} dominantBaseline={lying ? 'central' : 'auto'} className="value">{valueText(row, order)}</text> : null; })) : null}
      {valueAxis ? <g className="axis" aria-hidden="true">{visibleTicks.map(tick => lying ? <text key={tick} className="tick" x={value(tick)} y={bottom + 16} textAnchor="middle">{tickLabel(tick, spec.y)}</text> : <text key={tick} className="tick" x={left - 8} y={value(tick)} textAnchor="end" dominantBaseline="central">{tickLabel(tick, spec.y)}</text>)}</g> : null}
      {!quiet && (!compact || labels.categories) ? <g className="axis" aria-hidden="true">{shown.map(row => lying ? <text key={row.key} className="tick name" x={left - 8} y={bands.start(row.index) + bands.width / 2} textAnchor="end" dominantBaseline="central"><title>{row.label}</title>{fit(row.label, nameRoom - 12)}</text> : <text key={row.key} className="tick" x={middle(row)} y={bottom + 16} textAnchor={!banded && row.index === 0 && shape.rows.length > 1 ? 'start' : !banded && row.index === shape.rows.length - 1 && shape.rows.length > 1 ? 'end' : 'middle'}>{category(row)}</text>)}</g> : !quiet && labels.ends ? <g className="axis">{shape.rows.filter((_, i) => i === 0 || i === shape.rows.length - 1).map((row, i) => <text key={row.key} className="tick" x={middle(row)} y={bottom + 14} textAnchor={i ? 'end' : 'start'}>{category(row)}</text>)}{lastRow && lines[0]?.dots[lastRow.index] ? <text className="value end" x={(lines[0].dots[lastRow.index]?.x ?? 0) + 6} y={lines[0].dots[lastRow.index]?.y} dominantBaseline="central">{labels.ends.value}</text> : null}</g> : null}
    </svg> : null}
    {tip && active && !quiet ? <Tip indicator={trend ? 'line' : 'dot'} onhold={hover.hold} onhide={hover.hide} reading={tip} x={lying ? value(most) : middle(active)} y={lying ? bands.start(active.index) : Math.min(value(most), bottom)} width={width} {...evidence} /> : null}
  </div>;
}
