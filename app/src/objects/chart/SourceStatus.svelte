<script lang="ts">
  let { status, sources = [], onchoose }: {
    status: string;
    sources?: { id: string; text?: string }[];
    onchoose?: (id: string) => void;
  } = $props();
  // The shared picker keeps its native select off-DOM, outside Svelte's event delegation.
  function chooseSource(node: HTMLSelectElement) {
    const change = () => onchoose?.(node.value);
    node.addEventListener('change', change);
    return { destroy: () => node.removeEventListener('change', change) };
  }
</script>

{#if status}
  <div class="chart-source-status">
    <p role="status">{status}</p>
    {#if onchoose}
      <label>Choose source
        <select aria-label="Choose chart source" value="" use:chooseSource>
          <option value="" disabled>{sources.length ? 'Select a source' : 'Add a source to this board'}</option>
          {#each sources as source (source.id)}<option value={source.id}>{source.text || 'Untitled source'}</option>{/each}
        </select>
      </label>
    {/if}
  </div>
{/if}

<style>
  .chart-source-status { display: flex; flex-direction: column; gap: 4px; color: var(--color-muted); font: 400 12px/16px var(--font); }
  p { margin: 0; }
  label { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  select { min-width: 0; max-width: 100%; min-height: 28px; border: 1px solid var(--line); border-radius: 4px; background: var(--card); color: var(--text); font: inherit; }
  select:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
