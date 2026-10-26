<!-- Plot object: maps the agent's plot data onto the chart spec and draws it with the ported Zephium chart. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { resolvePlot, chartCards } from '../chart/source.js';
  import Chart from '../chart/Chart.svelte';
  import { styleSpec, type ChartSpec, type ChartStyle, type ChartFormat } from '../chart/chart';
  type Plot = {
    smooth?: boolean;
    source?: { cardId: string; xColumn: number; yColumns: number[] };
    style: ChartStyle; basis: string; knowledge?: boolean;
    x: { label?: string; kind: 'category' | 'time' | 'linear' };
    y: { label?: string; unit?: string; format: ChartFormat; currency?: string };
    series: { name: string; points: { x: string; y: number | null; y2?: number | null }[] }[];
    headline?: { label: string; value: string };
    target?: ChartSpec['target'];
  };
  let { data, title, detail = 'full', onsmooth }: { data: Plot; title: string; onsmooth?: (smooth: boolean) => void; detail?: 'full' | 'overview' | 'tile' } = $props();
  let cards = $state(chartCards());
  onMount(() => {
    const stage = document.getElementById('stage');
    const refresh = () => { cards = chartCards(); };
    stage?.addEventListener('boardchange', refresh);
    return () => stage?.removeEventListener('boardchange', refresh);
  });
  const resolved: Plot = $derived(resolvePlot(data, cards));
  const spec: ChartSpec = $derived({
    ...styleSpec(data.style),
    smooth: data.smooth,
    x: data.x,
    y: data.y,
    basis: data.basis,
    knowledge: data.knowledge,
    headline: data.headline,
    target: data.target,
    series: resolved.series.map(s => ({
      name: s.name,
      points: s.points.map(p => ({ x: data.x.kind === 'linear' ? Number(p.x) : p.x, y: p.y, ...(p.y2 != null ? { y2: p.y2 } : {}) })),
    })),
  });
</script>

<Chart {spec} {title} {detail} />
{#if onsmooth && ['line', 'area', 'area_stacked'].includes(data.style)}
  <label class="smoothing"><input type="checkbox" checked={data.smooth === true} onchange={event => onsmooth?.(event.currentTarget.checked)} />Smooth line</label>
{/if}
<style>
  .smoothing { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 12px; color: var(--muted); }
  input { accent-color: var(--data); }
</style>
