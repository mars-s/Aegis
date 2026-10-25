<!-- The shared window strip and content for every object on the canvas. -->
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
  const NAMES: Record<string, string> = { reply: 'Reply', plot: 'Plot', sheet: 'Sheet', diagram: 'Diagram', plan: 'Plan', list: 'List', code: 'Code', inline: 'Inline' };
  const time = (t?: number) => (t ? new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
  function open(event: MouseEvent) {
    event.currentTarget instanceof HTMLElement && event.currentTarget.closest('.card')?.dispatchEvent(new CustomEvent('aegis:open-card', { bubbles: true, detail: { id: card.id } }));
  }
</script>

<section class="object {card.kind}">
    <header class="win-strip">
      <h3>{card.text || NAMES[card.kind]}<span class="kind">{` · ${NAMES[card.kind] || card.kind}`}</span></h3>
      {#if (card.ver ?? 1) > 1}<span class="updated" title={`Version ${card.ver}`}>Updated · {time(card.updated)}</span>{/if}
      <button class="win-open" type="button" aria-label={`Open ${card.text || NAMES[card.kind]}`} onclick={open}>Open</button>
    </header>
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
  .object { display: flex; flex-direction: column; block-size: 100%; inline-size: 100%; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: var(--text); font-family: var(--font); --chart-1: var(--data); --color-term: var(--text); --color-ring: var(--focus); }
  header { display: flex; align-items: center; gap: 8px; flex: none; height: 36px; padding: 0 8px 0 15px; background: var(--strip); box-shadow: inset 0 1px 0 var(--edge-top); cursor: grab; }
  header:active { cursor: grabbing; }
  h3 { flex: 1; min-width: 0; margin: 0; font-size: 14.5px; font-weight: 400; letter-spacing: -0.005em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kind { color: var(--ink-2); }
  .win-open { flex: none; min-width: 44px; height: 28px; padding: 0 10px; border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px; opacity: 0; transition: opacity 150ms var(--ease-out), transform 120ms var(--ease-out); }
  :global(.card:hover) .win-open, :global(.card:focus-within) .win-open, :global(.card.window-focus) .win-open { opacity: 1; }
  .win-open:hover { background: var(--hover); color: var(--text); }
  .win-open:active { transform: scale(0.97); }
  .updated { color: var(--color-faint); font-size: var(--text-caption); white-space: nowrap; }
  .content { flex: 1; min-block-size: 0; overflow: auto; padding: 16px 20px; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
  .diagram .content { overflow: auto; }
  .unknown { color: var(--color-muted); }
  @media (hover: none), (pointer: coarse) { header { height: 44px; } .win-open { opacity: 1; min-height: 44px; } }
  @media (prefers-reduced-motion: reduce) { .win-open { transition: none; } .win-open:active { transform: none; } }
  :global(body.motion-off) .win-open { transition: none; transform: none; }
</style>
