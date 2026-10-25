<script lang="ts">
  type Column = { id: string; title: string };
  type Item = { id: string; title: string; detail?: string; column: string };
  let { data, onset }: { data: { columns: Column[]; cards: Item[] }; onset: (path: (string | number)[], value: unknown) => void } = $props();
  let dragging = $state<string | null>(null);
  function move(id: string, column: string) {
    const i = data.cards.findIndex(c => c.id === id);
    if (i >= 0 && data.cards[i]?.column !== column) onset(['cards', i, 'column'], column);
    dragging = null;
  }
  function drop(event: DragEvent, column: string) {
    event.preventDefault();
    if (dragging && event.dataTransfer?.getData('text/aegis-kanban') === dragging) move(dragging, column);
  }
</script>
<div class="kanban">
  {#each data.columns as column}
    <section class="lane" aria-label={column.title} ondragover={e => { if (dragging) e.preventDefault(); }} ondrop={e => drop(e, column.id)}>
      <h4>{column.title}<span>{data.cards.filter(c => c.column === column.id).length}</span></h4>
      {#each data.cards.filter(c => c.column === column.id) as item (item.id)}
        <article class="ticket" class:dragging={dragging === item.id}>
          <button class="handle" type="button" draggable="true" aria-label={`Drag ${item.title}`} ondragstart={e => { dragging = item.id; e.dataTransfer?.setData('text/aegis-kanban', item.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }} ondragend={() => dragging = null}>{item.title}</button>
          {#if item.detail}<p>{item.detail}</p>{/if}
          <details><summary>Move<span class="sr-only"> {item.title}</span></summary>
            <div class="destinations">{#each data.columns.filter(c => c.id !== item.column) as target}<button type="button" aria-label={`Move ${item.title} to ${target.title}`} onclick={() => move(item.id, target.id)}>{target.title}</button>{/each}</div>
          </details>
        </article>
      {:else}<p class="empty">No cards</p>{/each}
    </section>
  {/each}
</div>
<style>
  .kanban { display: flex; gap: 20px; overflow-x: auto; align-items: start; }
  .lane { flex: 1 0 180px; min-width: 0; }
  h4 { display: flex; justify-content: space-between; margin: 0 0 12px; font-size: 13px; font-weight: 500; }
  h4 span { color: var(--muted); font-weight: 400; }
  .ticket { padding: 12px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
  .ticket .handle { background: none; border: 0; padding: 0; min-height: 32px; text-align: left; font-size: 14px; color: var(--text); cursor: grab; width: 100%; }
  .handle:active { cursor: grabbing; }
  .ticket p { color: var(--muted); font-size: 12px; margin: 4px 0 8px; }
  .dragging { opacity: .5; }
  summary { display: flex; align-items: center; width: fit-content; min-height: 32px; text-decoration: underline; text-underline-offset: 3px; }
  .destinations { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .sr-only { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); overflow: hidden; }
</style>
