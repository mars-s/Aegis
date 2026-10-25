<script lang="ts">
  import Trend from './Trend.svelte';
  type Tile = { label: string; value: string; delta?: string; sparkline?: number[]; editable?: boolean };
  let { data, onset }: { data: { tiles: Tile[]; note?: string }; onset: (path: (string | number)[], value: unknown) => void } = $props();
</script>
<dl class="stats">
  {#each data.tiles as tile, i}
    <div class="stat">
      <dt>{tile.label}</dt>
      <dd>
        {#if tile.editable}<input class="value" aria-label={tile.label} value={tile.value} maxlength="40" onchange={e => onset(['tiles', i, 'value'], e.currentTarget.value)} />{:else}<span class="value">{tile.value}</span>{/if}
        {#if tile.delta}<span class="meta">{tile.delta}</span>{/if}
        {#if tile.sparkline}<Trend values={tile.sparkline} label={`${tile.label} trend`} />{/if}
      </dd>
    </div>
  {/each}
</dl>
{#if data.note}<p class="footnote">{data.note}</p>{/if}
<style>
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 20px; margin: 0; }
  .stat { min-width: 0; }
  dt { color: var(--muted); font-size: 13px; margin-bottom: 6px; }
  dd { display: grid; gap: 8px; margin: 0; }
  .value { font-size: 30px; font-weight: 500; letter-spacing: -.025em; line-height: 1.2; overflow-wrap: anywhere; }
  .stats input.value { font-size: 30px; padding: 0 4px; }
</style>
