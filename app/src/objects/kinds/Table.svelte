<script lang="ts">
  import Text from './Text.svelte';
  import { tick } from 'svelte';
  import Trend from './Trend.svelte';
  type Column = { label: string; kind: string; max?: number; editable?: boolean };
  type Cell = string | number | number[] | null;
  let { data, onset }: { data: { columns: Column[]; rows: { cells: Cell[] }[]; note?: string }; onset: (path: (string | number)[], value: unknown) => void } = $props();
  let grid: HTMLTableElement;
  let editing = $state<{ r: number; c: number; draft: string } | null>(null);
  let overflow = $state(false);
  function scrollCue(node: HTMLElement) {
    const update = () => overflow = node.scrollWidth - node.clientWidth - node.scrollLeft > 1;
    const observer = new ResizeObserver(update);
    observer.observe(node); observer.observe(grid);
    update();
    return { destroy: () => observer.disconnect() };
  }
  const cellAt = (r: number, c: number) => grid.querySelector<HTMLTableCellElement>(`[data-row="${r}"][data-column="${c}"]`);
  function controls(node: HTMLTableElement) {
    // Handle keys before the shared object shell stops native control events.
    const keydown = (event: KeyboardEvent) => {
      const cell = event.target instanceof Element ? event.target.closest('[data-row][data-column]') : null;
      if (cell instanceof HTMLTableCellElement) void key(event, Number(cell.dataset.row), Number(cell.dataset.column));
    };
    const pointerdown = (event: PointerEvent) => { if (event.target instanceof Element && event.target.closest('[role="gridcell"]')) event.stopPropagation(); };
    node.addEventListener('keydown', keydown);
    node.addEventListener('pointerdown', pointerdown);
    return { destroy() { node.removeEventListener('keydown', keydown); node.removeEventListener('pointerdown', pointerdown); } };
  }
  async function begin(r: number, c: number, text?: string) {
    const column = data.columns[c];
    if (!column.editable || column.kind === 'sparkline' || editing?.r === r && editing.c === c) return;
    const value = data.rows[r].cells[c];
    editing = { r, c, draft: text ?? (Array.isArray(value) ? '' : String(value ?? '')) };
    await tick();
    const input = cellAt(r, c)?.querySelector('input');
    input?.focus({ preventScroll: true });
    if (text === undefined) input?.select();
  }
  function commit(input: HTMLInputElement, r: number, c: number) {
    if (!editing || editing.r !== r || editing.c !== c) return true;
    const column = data.columns[c];
    if (!input.reportValidity()) return false;
    const value = column.kind === 'text' ? input.value : input.value === '' ? null : input.valueAsNumber;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    editing = null;
    if (value !== (data.rows[r].cells[c] ?? null)) onset(['rows', r, 'cells', c], value);
    return true;
  }
  async function key(event: KeyboardEvent, r: number, c: number) {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input && (event.metaKey || event.ctrlKey) && ['k', 'z'].includes(event.key.toLowerCase())) return;
    event.stopPropagation();
    if (event.isComposing) return;
    if (input) {
      if (event.key === 'Escape') {
        event.preventDefault();
        editing = null;
        await tick();
        cellAt(r, c)?.focus({ preventScroll: true });
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        const index = r * data.columns.length + c + (event.shiftKey ? -1 : 1) * (event.key === 'Enter' ? data.columns.length : 1);
        const next = index >= 0 && index < data.rows.length * data.columns.length ? cellAt(Math.floor(index / data.columns.length), index % data.columns.length) : null;
        if (next || event.key === 'Enter') event.preventDefault();
        if (!commit(input, r, c)) { event.preventDefault(); return; }
        await tick();
        if (next || event.key === 'Enter') (next ? cellAt(Math.floor(index / data.columns.length), index % data.columns.length) : cellAt(r, c))?.focus({ preventScroll: true });
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
    if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); void begin(r, c); }
    else if (event.key.length === 1 && data.columns[c].editable && data.columns[c].kind !== 'sparkline') { event.preventDefault(); void begin(r, c, event.key); }
    else if (event.key.startsWith('Arrow')) {
      const row = r + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0);
      const column = c + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0);
      event.preventDefault(); cellAt(row, column)?.focus({ preventScroll: true });
    }
  }
</script>
<div class="table-viewport" class:overflow>
<div class="table-scroll" use:scrollCue onscroll={event => overflow = event.currentTarget.scrollWidth - event.currentTarget.clientWidth - event.currentTarget.scrollLeft > 1}>
  <table bind:this={grid} use:controls class="data-grid" role="grid" aria-label="Data table">
    <thead><tr>{#each data.columns as column, c}<th role="columnheader" class:numeric={column.kind !== 'text'} scope="col"><Text value={column.label} label={`Column ${c + 1} label`} path={['columns', c, 'label']} maxlength={60} /></th>{/each}</tr></thead>
    <tbody>{#each data.rows as row, r}<tr>{#each data.columns as column, c}
      {@const value = row.cells[c] ?? null}
      {@const active = editing?.r === r && editing.c === c}
      <td role="gridcell" tabindex="0" aria-label={`${column.label}, row ${r + 1}`} aria-readonly={!column.editable || column.kind === 'sparkline'} data-row={r} data-column={c} class:numeric={column.kind !== 'text'} class:editing={active} onclick={() => begin(r, c)}>
        {#if column.kind === 'sparkline' && Array.isArray(value)}<Trend values={value} label={column.label} />
        {:else}<span class:meta={value === null} class="cell-value">{typeof value === 'number' ? value.toLocaleString('en-AU') : value ?? '-'}</span>{/if}
        {#if active}<input aria-label={`Edit ${column.label}, row ${r + 1}`} type={column.kind === 'text' ? 'text' : 'number'} min={column.kind === 'bar' ? 0 : undefined} step="any" maxlength="2000" value={editing!.draft} oninput={event => { if (editing) editing.draft = event.currentTarget.value; }} onblur={event => commit(event.currentTarget, r, c)} />{/if}
        {#if column.kind === 'bar' && typeof value === 'number'}<span class="track" role="meter" aria-label={column.label} aria-valuemin="0" aria-valuemax={Math.max(value, column.max ?? 1)} aria-valuenow={value} aria-valuetext={`${value} of ${column.max}`}><span style:width={`${Math.min(100, value / (column.max ?? 1) * 100)}%`}></span></span>{/if}
      </td>
    {/each}</tr>{:else}<tr><td role="gridcell" colspan={data.columns.length} class="empty">No rows yet</td></tr>{/each}</tbody>
  </table>
</div>
</div>
{#if data.note}<p class="footnote"><Text value={data.note} label="Table note" path={['note']} multiline maxlength={200} /></p>{/if}
<style>
  .table-scroll { overflow-x: auto; }
  .table-viewport { position: relative; }
  .table-viewport::after { content: ''; position: absolute; inset: 0 0 0 auto; width: 28px; background: linear-gradient(to right, transparent, var(--card)); pointer-events: none; opacity: 0; }
  .table-viewport.overflow::after { opacity: 1; }
  .numeric :global(.trend) { margin-left: auto; }
  .track { margin-top: 4px; }
</style>
