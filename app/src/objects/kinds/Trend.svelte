<script lang="ts">
  let { values, label }: { values: number[]; label: string } = $props();
  const points = $derived.by(() => {
    const scale = Math.max(1, ...values.map(Math.abs)), normalised = values.map(v => v / scale);
    const low = Math.min(...normalised), span = Math.max(...normalised) - low;
    return normalised.map((v, i) => `${values.length === 1 ? 60 : 2 + i * 116 / (values.length - 1)},${span ? 30 - (v - low) * 26 / span : 17}`).join(' ');
  });
</script>
<svg class="trend" viewBox="0 0 120 34" role="img" aria-label={`${label}: ${values.join(', ')}`}>
  {#if values.length === 1}<circle cx="60" cy="17" r="2" />{:else}<polyline {points} />{/if}
</svg>
<style>
  .trend { display: block; width: 100%; max-width: 120px; height: 34px; overflow: visible; }
  polyline { fill: none; stroke: var(--data); stroke-width: 1.4; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
  circle { fill: var(--data); }
</style>
