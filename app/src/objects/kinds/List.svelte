<!-- List object: items without time order. Shape from Zephium's ListView (MPL-2.0). -->
<script lang="ts">
  import Inline from './Inline.svelte';
  type Item = { title: string; detail?: string; due?: string; done?: boolean; priority?: 'high' };
  let { data, oncheck }: { data: { style: string; items: Item[] }; oncheck?: (index: number, done: boolean) => void } = $props();
  const todo = $derived(data.style === 'todo');
</script>

<ul class="list {data.style}">
  {#each data.items as item, i (i)}
    <li class:done={item.done}>
      {#if todo}<input type="checkbox" checked={!!item.done} aria-label={`Done: ${item.title}`} onchange={e => oncheck?.(i, (e.currentTarget as HTMLInputElement).checked)} />
      {:else if data.style === 'questions'}<span class="mark">Q</span>{:else}<span class="mark">•</span>{/if}
      <div class="item">
        <div class="title"><Inline text={item.title} />{#if item.priority === 'high'}<span class="high">High</span>{/if}</div>
        {#if item.detail}<p class="detail"><Inline text={item.detail} /></p>{/if}
      </div>
      {#if item.due}<span class="due">{item.due}</span>{/if}
    </li>
  {/each}
</ul>

<style>
  .list { list-style: none; margin: 0; padding: 0; color: var(--color-text); font-size: var(--text-body); display: flex; flex-direction: column; }
  li { display: flex; gap: 10px; align-items: flex-start; padding: 8px 2px; border-block-end: 1px solid var(--color-border); }
  li:last-child { border-block-end: 0; }
  input { margin: 2px 0 0; accent-color: var(--chart-3); }
  .mark { color: var(--color-faint); inline-size: 14px; text-align: center; font-weight: 600; }
  .item { flex: 1; min-inline-size: 0; }
  .title { font-weight: 550; line-height: 1.35; }
  .done .title { color: var(--color-faint); text-decoration: line-through; }
  .detail { margin: 3px 0 0; color: var(--color-label-secondary); line-height: 1.45; }
  .questions .detail { color: var(--color-muted); }
  .due { color: var(--color-muted); font-size: var(--text-label); white-space: nowrap; }
  .high { margin-inline-start: 8px; padding: 0 6px; border-radius: var(--radius-capsule); background: color-mix(in srgb, var(--chart-8) 18%, transparent); color: var(--chart-8); font-size: var(--text-caption); font-weight: 600; }
</style>
