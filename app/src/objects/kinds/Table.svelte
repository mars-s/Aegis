<script lang="ts">
  import Trend from './Trend.svelte';
  type Column = { label: string; kind: string; max?: number; editable?: boolean };
  type Cell = string | number | number[] | null;
  let { data, onset }: { data: { columns: Column[]; rows: { cells: Cell[] }[]; note?: string }; onset: (path: (string | number)[], value: unknown) => void } = $props();
  function change(input: HTMLInputElement, r: number, c: number, column: Column) {
    const value = column.kind === 'text' ? input.value : input.value === '' ? null : input.valueAsNumber;
    if (typeof value === 'number' && (!Number.isFinite(value) || (column.kind === 'bar' && value < 0))) { input.reportValidity(); return; }
    onset(['rows', r, 'cells', c], value);
  }
</script>
<div class="table-scroll">
  <table aria-label="Data table">
    <thead><tr>{#each data.columns as column}<th class:numeric={column.kind !== 'text'} scope="col">{column.label}</th>{/each}</tr></thead>
    <tbody>{#each data.rows as row, r}<tr>{#each data.columns as column, c}
      {@const value = row.cells[c] ?? null}
      <td class:numeric={column.kind !== 'text'}>
        {#if column.kind === 'sparkline' && Array.isArray(value)}<Trend values={value} label={column.label} />
        {:else if column.editable && column.kind !== 'sparkline'}<input aria-label={`${column.label}, row ${r + 1}`} type={column.kind === 'text' ? 'text' : 'number'} min={column.kind === 'bar' ? 0 : undefined} step="any" maxlength="2000" value={Array.isArray(value) ? '' : value ?? ''} onchange={e => change(e.currentTarget, r, c, column)} />
        {:else}<span class:meta={value === null}>{typeof value === 'number' ? value.toLocaleString('en-AU') : value ?? '-'}</span>{/if}
        {#if column.kind === 'bar' && typeof value === 'number'}<span class="track" role="meter" aria-label={column.label} aria-valuemin="0" aria-valuemax={Math.max(value, column.max ?? 1)} aria-valuenow={value} aria-valuetext={`${value} of ${column.max}`}><span style:width={`${Math.min(100, value / (column.max ?? 1) * 100)}%`}></span></span>{/if}
      </td>
    {/each}</tr>{:else}<tr><td colspan={data.columns.length} class="empty">No rows yet</td></tr>{/each}</tbody>
  </table>
</div>
{#if data.note}<p class="footnote">{data.note}</p>{/if}
<style>
  .table-scroll { overflow-x: auto; }
  td { min-width: 96px; }
  td:first-child { min-width: 150px; }
  .numeric :global(input) { text-align: right; min-width: 80px; }
  .numeric :global(.trend) { margin-left: auto; }
  .track { margin-top: 8px; }
</style>
