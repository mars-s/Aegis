<!-- Sheet object: typed columns, click a header to sort, best values marked. Behaviour modelled on
     Zephium's Sheet (MPL-2.0); markup written for Aegis. -->
<script lang="ts">
  import { bests, cellOrder, figure, host, numeric, rating, yesNo, type Sheet } from './sheet';
  let { data, onlink }: { data: Sheet; onlink?: (url: string) => void } = $props();
  let sort = $state<{ col: number; dir: 1 | -1 } | null>(null);
  const best = $derived(bests(data));
  const order = $derived.by(() => {
    const rows = data.rows.map((row, index) => ({ row, index }));
    if (!sort) return rows;
    const { col, dir } = sort, column = data.columns[col]!;
    return rows.sort((a, b) => {
      const x = cellOrder(column, a.row.cells[col] ?? ''), y = cellOrder(column, b.row.cells[col] ?? '');
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  });
  const letter = (c: number) => (c >= 26 ? String.fromCharCode(64 + Math.floor(c / 26)) : '') + String.fromCharCode(65 + (c % 26));
  function toggle(col: number) {
    if (data.rows.length < 3) return;
    sort = sort?.col === col ? (sort.dir === 1 ? { col, dir: -1 } : null) : { col, dir: numeric(data.columns[col]!) ? -1 : 1 };
  }
</script>

<div class="sheet">
  <table>
    <thead>
      <tr class="letters" aria-hidden="true">
        <th class="rn"></th>
        {#each data.columns as _, c (c)}<th class="letter" class:num={numeric(data.columns[c]!)}>{letter(c)}</th>{/each}
      </tr>
      <tr>
        <th class="rn" aria-hidden="true">1</th>
        {#each data.columns as column, c (c)}
          <th class:num={numeric(column)} class:centre={column.kind === 'yes_no' || column.kind === 'rating'}
            aria-sort={sort?.col === c ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
            <button type="button" onclick={() => toggle(c)} disabled={data.rows.length < 3 || column.kind === 'link'}>
              {column.unit && column.kind !== 'money' ? `${column.label} (${column.unit})` : column.label}
              {#if sort?.col === c}<span class="arrow">{sort.dir === 1 ? '↑' : '↓'}</span>{/if}
            </button>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each order as { row, index }, i (index)}
        <tr>
          <th class="rn" scope="row" aria-hidden="true">{i + 2}</th>
          {#each data.columns as column, c (c)}
            {@const text = row.cells[c] ?? ''}
            <td class:num={numeric(column)} class:centre={column.kind === 'yes_no' || column.kind === 'rating'} class:best={best[c]?.has(index)} class:first={c === 0}>
              {#if !text.trim()}<span class="empty">–</span>
              {:else if column.kind === 'yes_no'}<span class="yn {yesNo(text)}">{yesNo(text) === 'yes' ? '✓' : yesNo(text) === 'no' ? '✕' : yesNo(text) === 'partial' ? '◐' : '?'}</span>
              {:else if column.kind === 'rating' && rating(text)}{@const r = rating(text)!}<span class="rating" title={text}>{r.value}<span class="of">/{r.max}</span></span>
              {:else if column.kind === 'link'}<button type="button" class="link" onclick={() => onlink?.(text)}>{host(text)}</button>
              {:else if column.kind === 'tag'}<span class="tag">{text}</span>
              {:else}{numeric(column) ? figure(column, text) : text}{/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  {#if data.note}<p class="note">{data.note}</p>{/if}
</div>

<style>
  /* Spreadsheet look from the locked comp: column letters, row numbers, quiet grid, tabular figures. */
  .sheet { inline-size: max-content; min-inline-size: 100%; color: var(--color-text); font-size: 12.5px; font-variant-numeric: tabular-nums; }
  table { inline-size: 100%; border-collapse: collapse; }
  th, td { height: 29px; padding: 0 10px; text-align: start; border-block-end: 1px solid var(--rule, var(--color-border)); border-inline-end: 1px solid var(--rule, var(--color-border)); white-space: nowrap; font-weight: 400; }
  thead th { color: var(--faint); background: var(--inset); font-size: 12px; }
  tr.letters th { position: sticky; inset-block-start: 0; z-index: 2; text-align: center; }
  thead tr:not(.letters) th { color: var(--muted); background: transparent; }
  th.rn { position: sticky; inset-inline-start: 0; z-index: 1; inline-size: 34px; min-inline-size: 34px; padding: 0 6px; text-align: center; color: var(--faint); background: var(--inset); font-size: 12px; }
  tr.letters th.rn { z-index: 3; }
  th button { all: unset; display: inline-flex; gap: 4px; align-items: center; cursor: default; }
  th button:focus-visible { outline: 1.5px solid var(--focus); outline-offset: 2px; }
  th button:not(:disabled):hover { color: var(--color-text); }
  .arrow { color: var(--color-text); }
  .num { text-align: end; }
  th.letter.num { text-align: center; }
  th.num button { flex-direction: row-reverse; }
  .centre { text-align: center; }
  td { min-inline-size: 86px; }
  td.best { color: var(--data); }
  .empty { color: var(--color-faint); }
  .yn.yes { color: var(--chart-3); } .yn.no { color: var(--chart-8); } .yn.partial { color: var(--chart-4); } .yn.unknown { color: var(--color-faint); }
  .rating .of { color: var(--color-faint); font-size: 0.85em; }
  .tag { padding: 1px 8px; border-radius: var(--radius-capsule); background: var(--color-fill); font-size: var(--text-label); }
  .link { all: unset; color: var(--data); text-decoration: underline; text-underline-offset: 2px; text-decoration-color: var(--color-border-strong); cursor: pointer; }
  @media (pointer: coarse) { th button, .link { min-height: 44px; min-width: 44px; } }
  .note { margin: 10px 12px; color: var(--color-faint); font-size: var(--text-caption); }
</style>
