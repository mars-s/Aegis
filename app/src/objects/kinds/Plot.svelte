<!-- Plot object: maps the agent's plot data onto the chart spec and draws it with the ported Zephium chart. -->
<script lang="ts">
  import Chart from '../chart/Chart.svelte';
  import { styleSpec, type ChartSpec, type ChartStyle, type ChartFormat } from '../chart/chart';
  type Plot = {
    style: ChartStyle; basis: string; knowledge?: boolean;
    x: { label?: string; kind: 'category' | 'time' | 'linear' };
    y: { label?: string; unit?: string; format: ChartFormat; currency?: string };
    series: { name: string; points: { x: string; y: number | null; y2?: number | null }[] }[];
    headline?: { label: string; value: string };
  };
  let { data, title, detail = 'full' }: { data: Plot; title: string; detail?: 'full' | 'overview' | 'tile' } = $props();
  const spec: ChartSpec = $derived({
    ...styleSpec(data.style),
    x: data.x,
    y: data.y,
    basis: data.basis,
    knowledge: data.knowledge,
    headline: data.headline,
    series: data.series.map(s => ({
      name: s.name,
      points: s.points.map(p => ({ x: data.x.kind === 'linear' ? Number(p.x) : p.x, y: p.y, ...(p.y2 != null ? { y2: p.y2 } : {}) })),
    })),
  });
</script>

<Chart {spec} {title} {detail} />
