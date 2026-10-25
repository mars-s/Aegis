<script lang="ts">
  import Text from './Text.svelte';
  import Trend from './Trend.svelte';
  import Value from './Value.svelte';
  type Tile = { label: string; value: string; delta?: string; sparkline?: number[]; editable?: boolean };
  let { data, onset }: { data: { tiles: Tile[]; note?: string }; onset: (path: (string | number)[], value: unknown) => void } = $props();
</script>
<dl class="stats">
  {#each data.tiles as tile, i}
    <div class="stat">
      <dt><Text value={tile.label} label={`Stat ${i + 1} label`} path={['tiles', i, 'label']} maxlength={60} /></dt>
      <dd>
        <span class="value">{#if tile.editable}<Value value={tile.value} label={tile.label} onchange={value => onset(['tiles', i, 'value'], value)} />{:else}<Text value={tile.value} label={`Stat ${i + 1} value`} path={['tiles', i, 'value']} maxlength={40} />{/if}</span>
        {#if tile.delta}<span class="meta"><Text value={tile.delta} label={`Stat ${i + 1} change`} path={['tiles', i, 'delta']} maxlength={100} /></span>{/if}
        {#if tile.sparkline}<Trend values={tile.sparkline} label={`${tile.label} trend`} />{/if}
      </dd>
    </div>
  {/each}
</dl>
{#if data.note}<p class="footnote"><Text value={data.note} label="Stats note" path={['note']} multiline maxlength={200} /></p>{/if}
<style>
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 20px; margin: 0; }
  .stat { min-width: 0; }
  dt { color: var(--muted); font-size: 13px; margin-bottom: 6px; }
  dd { display: grid; gap: 8px; margin: 0; }
  .value { font-size: 30px; font-weight: 500; letter-spacing: -.025em; line-height: 1.2; overflow-wrap: anywhere; }
</style>
