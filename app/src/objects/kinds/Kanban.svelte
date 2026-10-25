<script lang="ts">
  import Text from './Text.svelte';
  import { getContext } from 'svelte';
  import Actions from './Actions.svelte';
  const textEditing = getContext<{ readonly enabled: boolean }>('aegis:edit-generated-text');
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
  {#each data.columns as column, c}
    <section class="lane" aria-label={column.title} ondragover={e => { if (dragging) e.preventDefault(); }} ondrop={e => drop(e, column.id)}>
      <h4><Text value={column.title} label={`Lane ${c + 1} title`} path={['columns', c, 'title']} maxlength={60} /><span>{data.cards.filter(c => c.column === column.id).length}</span></h4>
      {#each data.cards.filter(c => c.column === column.id) as item (item.id)}
        <article class="ticket" class:dragging={dragging === item.id}>
          {#if !textEditing?.enabled}<button class="handle" type="button" draggable="true" aria-label={`Drag ${item.title}`} ondragstart={e => { dragging = item.id; e.dataTransfer?.setData('text/aegis-kanban', item.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }} ondragend={() => dragging = null}>{item.title}</button>{:else}
          <p><Text value={item.title} label={`Card title: ${item.title}`} path={['cards', data.cards.indexOf(item), 'title']} maxlength={100} /></p>{/if}
          {#if item.detail}<p><Text value={item.detail} label={`Card detail: ${item.title}`} path={['cards', data.cards.indexOf(item), 'detail']} multiline maxlength={280} /></p>{/if}
          <Actions label={`Move ${item.title}`} heading={item.title} items={() => data.columns.map(target => ({ title: target.title, ariaLabel: `Move ${item.title} to ${target.title}`, checked: target.id === item.column, run: () => move(item.id, target.id) }))} />
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
  .ticket { position: relative; padding: 12px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
  .ticket .handle { background: none; border: 0; padding: 0 40px 0 0; min-height: 32px; text-align: left; font-size: 14px; color: var(--text); cursor: grab; width: 100%; }
  .handle:active { cursor: grabbing; }
  .ticket p { color: var(--muted); font-size: 12px; margin: 4px 0 8px; }
  .dragging { opacity: .5; }
</style>
