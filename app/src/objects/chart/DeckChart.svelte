<script lang="ts">
  import { onMount } from 'svelte';
  import Chart from './Chart.svelte';
  import SourceStatus from './SourceStatus.svelte';
  import { chartCards, resolveDeckChart } from './source.js';
  import type { ChartSpec } from './chart';

  let { chart, slideId, deckId, title, miniature = false, onchoose }: {
    chart: { sourceId?: string; spec?: ChartSpec; sourceStatus?: string };
    slideId: string; deckId?: string; title: string; miniature?: boolean;
    onchoose?: (id: string) => void;
  } = $props();
  let cards = $state(chartCards());
  let height = $state(0), width = $state(0);
  onMount(() => {
    const stage = document.getElementById('stage');
    const refresh = () => { cards = chartCards(); };
    stage?.addEventListener('boardchange', refresh);
    return () => stage?.removeEventListener('boardchange', refresh);
  });
  const current = $derived(cards.find(card => card.id === deckId)?.props?.slides?.find(slide => slide.id === slideId)?.chart);
  const resolved = $derived(resolveDeckChart({ ...chart, ...(current?.sourceId === chart.sourceId ? current : {}) }, cards));
  const spec = $derived(resolved.spec);
  const quiet = $derived(miniature || (!onchoose && height < 112));
  const round = $derived(spec?.kind === 'donut' || spec?.kind === 'radial');
  const legendRows = $derived(round ? 0 : Math.ceil((spec?.series.length || 0) / 3));
  const overhead = $derived(quiet ? 0 : 32 + legendRows * 24 + (resolved.sourceStatus ? onchoose ? 64 : 32 : 0));
  const plotHeight = $derived(Math.max(16, Math.min(height - overhead, round && !quiet ? width * .52 : Infinity)));
</script>

<div class="deck-evidence" class:miniature data-chart-kind={spec?.kind} role="group" aria-label={[title, spec?.kind, spec?.series.map(series => series.name).join(', '), resolved.sourceStatus].filter(Boolean).join('. ')}>
  <div class="deck-chart-content" bind:clientHeight={height} bind:clientWidth={width}>
    {#if !miniature}<SourceStatus status={resolved.sourceStatus || ''} sources={cards.filter(card => card.kind === 'plot')} {onchoose} />{/if}
    {#if spec && height}
      {#if !quiet && (spec.x?.label || spec.y?.label || spec.y?.unit)}
        <p class="deck-axis-meaning">{[spec.x?.label, spec.y?.label, spec.y?.unit].filter(Boolean).join(' · ')}</p>
      {/if}
      <Chart spec={{ ...spec, compact: false, values: false, basis: undefined }} {title} height={plotHeight} detail={quiet ? 'tile' : 'full'} />
    {:else if !resolved.sourceStatus}<p class="deck-chart-empty">Add chart values to this slide</p>{/if}
  </div>
</div>

<style>
  .deck-evidence { width: 100%; height: 100%; overflow: hidden; --color-text: #fff; --color-muted: #abb2bf; --color-label-secondary: #d8dbe0; --color-border: rgb(255 255 255 / .12); --color-border-strong: rgb(255 255 255 / .2); --color-fill: #18191b; --card: #08090a; --text-title: 20px; --text-caption: 12px; --text-label: 12px; }
  /* Scale the complete chart, including its label gutters, from the slide height. */
  .deck-chart-content { width: calc(100% / var(--deck-chart-scale, 1)); height: calc(100% / var(--deck-chart-scale, 1)); transform: scale(var(--deck-chart-scale, 1)); transform-origin: top left; }
  .deck-chart-content :global(.plot-body.beside) { justify-content: center; gap: 32px; }
  .deck-chart-content :global(.chart-legend.list) { flex: 0 1 auto; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
  .deck-chart-content :global(.chart-legend.list li) { display: flex; gap: 8px; }
  .deck-axis-meaning { margin: 0 0 8px; color: #abb2bf; font: 400 12px/16px var(--font); }
  .miniature { pointer-events: none; }
  .deck-chart-empty { color: #abb2bf; font-size: 12px; }
</style>
