<!-- One object card: a title, the object, and "Updated" when an agent revised it. Fills the board card. -->
<script lang="ts">
  import Reply from './kinds/Reply.svelte';
  import Plot from './kinds/Plot.svelte';
  import Sheet from './kinds/Sheet.svelte';
  import Diagram from './kinds/Diagram.svelte';
  import Plan from './kinds/Plan.svelte';
  import List from './kinds/List.svelte';
  import Code from './kinds/Code.svelte';
  type Card = { id: string; kind: string; data: any; text: string; ver?: number; updated?: number };
  let { card, onset, onlink }: { card: Card; onset: (path: (string | number)[], value: unknown) => void; onlink: (url: string) => void } = $props();
  const NAMES: Record<string, string> = { reply: 'Answer', plot: 'Chart', sheet: 'Sheet', diagram: 'Diagram', plan: 'Plan', list: 'List', code: 'Code' };
  const time = (t?: number) => (t ? new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
</script>

<section class="object {card.kind}">
  {#if card.kind !== 'reply'}
    <header>
      <h3>{card.text || NAMES[card.kind]}</h3>
      {#if (card.ver ?? 1) > 1}<span class="updated" title={`Version ${card.ver}`}>Updated · {time(card.updated)}</span>{/if}
    </header>
  {/if}
  <div class="content">
    {#if card.kind === 'reply'}<Reply data={card.data} />
    {:else if card.kind === 'plot'}<Plot data={card.data} title={card.text || 'Chart'} />
    {:else if card.kind === 'sheet'}<Sheet data={card.data} {onlink} />
    {:else if card.kind === 'diagram'}<Diagram data={card.data} />
    {:else if card.kind === 'plan'}<Plan data={card.data} oncheck={(i, done) => onset(['steps', i, 'done'], done)} />
    {:else if card.kind === 'list'}<List data={card.data} oncheck={(i, done) => onset(['items', i, 'done'], done)} />
    {:else if card.kind === 'code'}<Code data={card.data} />
    {:else}<p class="unknown">Unknown object kind: {card.kind}</p>{/if}
  </div>
</section>

<style>
  .object { display: flex; flex-direction: column; gap: 12px; block-size: 100%; color: var(--color-text); font-family: var(--font); }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex: none; }
  h3 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
  .updated { color: var(--color-faint); font-size: var(--text-caption); white-space: nowrap; }
  .content { flex: 1; min-block-size: 0; overflow: auto; }
  .diagram .content { overflow: auto; }
  .unknown { color: var(--color-muted); }
</style>
