<!-- Plot object: maps the agent's plot data onto the chart spec and draws it with the ported Zephium chart. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { resolvePlot, type ResolvedPlot } from '@aegis/domain/chart-source';
  import {chartCards,renderChartSpec} from '../chart/context.js';
  import Chart from '../chart/Chart.svelte';
  import SourceStatus from '../chart/SourceStatus.svelte';
  import { styleSpec, type ChartSpec } from '@aegis/domain/charts';
  import type {ObjectData} from '@aegis/domain/objects';
  type Plot = ObjectData['plot'] & {target?:ChartSpec['target']};
  let { data, title, detail = 'full', onsmooth, onsource }: { data: Plot; title: string; onsmooth?: (smooth: boolean) => void; onsource?: (source: Plot['source']) => void; detail?: 'full' | 'overview' | 'tile' } = $props();
  let cards = $state(chartCards());
  onMount(() => {
    const stage = document.getElementById('stage');
    const refresh = () => { cards = chartCards(); };
    stage?.addEventListener('boardchange', refresh);
    return () => stage?.removeEventListener('boardchange', refresh);
  });
  const resolved: ResolvedPlot = $derived(resolvePlot(data, cards));
  const spec: ChartSpec = $derived(renderChartSpec({
    ...styleSpec(data.style),
    smooth: data.smooth,
    x: data.x,
    y: data.y,
    basis: data.basis,
    knowledge: data.knowledge,
    headline: resolved.headline,
    target: data.target,
    series: resolved.series.map(s => ({
      name: s.name,
      points: s.points.map(p => ({ x: data.x.kind === 'linear' ? Number(p.x) : p.x, y: p.y, ...(p.y2 != null ? { y2: p.y2 } : {}) })),
    })),
  }));
</script>

<SourceStatus status={resolved.sourceStatus || ''} sources={cards.filter(card => card.kind === 'sheet')} onchoose={onsource ? id => onsource?.({ cardId: id, xColumn: data.source?.xColumn ?? 0, yColumns: data.source?.yColumns ?? [1] }) : undefined} />
<Chart {spec} {title} {detail} />
{#if onsmooth && ['line', 'area', 'area_stacked'].includes(data.style)}
  <label class="smoothing"><input type="checkbox" checked={data.smooth === true} onchange={event => onsmooth?.(event.currentTarget.checked)} />Smooth line</label>
{/if}
<style>
  .smoothing { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 12px; color: var(--muted); }
  input { accent-color: var(--data); }
</style>
