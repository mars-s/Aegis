<!-- The shared window strip and content for every object on the canvas. -->
<script lang="ts">
  import { setContext } from 'svelte';
  import Reply from './kinds/Reply.svelte';
  import Plot from './kinds/Plot.svelte';
  import Sheet from './kinds/Sheet.svelte';
  import Diagram from './kinds/Diagram.svelte';
  import Plan from './kinds/Plan.svelte';
  import List from './kinds/List.svelte';
  import Code from './kinds/Code.svelte';
  import Stats from './kinds/Stats.svelte';
  import Timeline from './kinds/Timeline.svelte';
  import Kanban from './kinds/Kanban.svelte';
  import Table from './kinds/Table.svelte';
  import Progress from './kinds/Progress.svelte';
  import Compare from './kinds/Compare.svelte';
  import Gallery from './kinds/Gallery.svelte';
  import Stages from './kinds/Stages.svelte';
  import Callout from './kinds/Callout.svelte';
  import Form from './kinds/Form.svelte';
  import Html from './kinds/Html.svelte';
  import type { Host } from '../lib/host';
  import { OBJECT_NAMES, canOpenObject } from './presentation.js';
  import './genui.css';
  // PM4 saving feedback: share the queue with the Open view.
  import { objectSaveState, canvasSaveVisible, objectSaveLabel, retryObjectSave } from './save-state.js';
  type Card = { id: string; kind: string; data: any; text: string; ver?: number; updated?: number };
  let { card, onset, onlink, post, assetUrl = (url: string) => url, onheight = () => {}, expanded = false, onescape = () => {} }: { card: Card; post: Host['post']; onset: (path: (string | number)[], value: unknown) => void; onlink: (url: string) => void; assetUrl?: (url: string) => string; onheight?: (height: number) => void; expanded?: boolean; onescape?: () => void } = $props();
  const NAMES: Record<string, string> = OBJECT_NAMES;
  const generative = $derived(['stats', 'timeline', 'kanban', 'table', 'progress', 'compare', 'gallery', 'stages', 'callout', 'form', 'html'].includes(card.kind));
  let editingText = $state(false);
  setContext('aegis:edit-generated-text', { get enabled() { return expanded && editingText; }, onset: (path: (string | number)[], value: unknown) => onset(path, value) });
  const time = (t?: number) => (t ? new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
  function open(event: MouseEvent) {
    // The selection toolbar forwards a click, so keep its actual focus modality.
    const keyboard = event.detail === 0 && (event.isTrusted || !!document.activeElement?.matches('button:focus-visible'));
    event.currentTarget instanceof HTMLElement && event.currentTarget.closest('.card')?.dispatchEvent(new CustomEvent('aegis:open-card', { bubbles: true, detail: { id: card.id, keyboard } }));
  }
  function keepControlsLocal(node: HTMLDivElement) {
    const pointer = (e: PointerEvent) => { if (e.target instanceof Element && e.target.closest('textarea, label, .ticket, .lane, .choices')) e.stopPropagation(); };
    const key = (e: KeyboardEvent) => { if (e.target instanceof Element && e.target.closest('input, textarea, summary, button')) e.stopPropagation(); };
    node.addEventListener('pointerdown', pointer);
    node.addEventListener('keydown', key);
    return { destroy() { node.removeEventListener('pointerdown', pointer); node.removeEventListener('keydown', key); } };
  }
</script>

<section class="object {card.kind}" class:expanded>
  {#if !expanded}
    <header class="win-strip">
      <h3>{card.text || NAMES[card.kind]}<span class="kind">{`\u00a0· ${NAMES[card.kind] || card.kind}`}</span></h3>
      {#if generative}
        <span class="updated" class:save-settled={!$canvasSaveVisible} aria-hidden={!$canvasSaveVisible} title={`Version ${card.ver}, updated ${time(card.updated)}`} role="status" data-object-saved>
          {objectSaveLabel($objectSaveState)}
          {#if $objectSaveState === 'not saved'}<button class="text-btn" type="button" aria-label="Retry save" onclick={retryObjectSave}>Retry</button>{/if}
        </span>
      {:else if (card.ver ?? 1) > 1}
        <span class="updated" title={`Version ${card.ver}`}>Updated · {time(card.updated)}</span>
      {/if}
      {#if canOpenObject(card.kind)}<button class="win-open" type="button" aria-label={`Open ${card.text || NAMES[card.kind]}`} onclick={open}>Open</button>{/if}
    </header>
  {/if}
  <div class="content" class:genui={generative} use:keepControlsLocal>
    {#if expanded && generative && card.kind !== 'html'}<div class="text-edit-actions"><button type="button" class="text-edit-toggle" aria-pressed={editingText} onclick={() => editingText = !editingText}>{editingText ? 'Done editing' : 'Edit text'}</button></div>{/if}
    {#if card.kind === 'reply'}<Reply data={card.data} />
    {:else if card.kind === 'plot'}<Plot data={card.data} title={card.text || 'Chart'} onsmooth={smooth => onset(['smooth'], smooth)} onsource={source => onset(['source'], source)} />
    {:else if card.kind === 'sheet'}<Sheet data={card.data} {onlink} />
    {:else if card.kind === 'diagram'}<Diagram data={card.data} />
    {:else if card.kind === 'plan'}<Plan data={card.data} oncheck={(i, done) => onset(['steps', i, 'done'], done)} />
    {:else if card.kind === 'list'}<List data={card.data} oncheck={(i, done) => onset(['items', i, 'done'], done)} />
    {:else if card.kind === 'code'}<Code data={card.data} />
    {:else if card.kind === 'stats'}<Stats data={card.data} {onset} />
    {:else if card.kind === 'timeline'}<Timeline data={card.data} {onset} />
    {:else if card.kind === 'kanban'}<Kanban data={card.data} {onset} />
    {:else if card.kind === 'table'}<Table data={card.data} {onset} />
    {:else if card.kind === 'progress'}<Progress data={card.data} {onset} />
    {:else if card.kind === 'compare'}<Compare data={card.data} />
    {:else if card.kind === 'gallery'}<Gallery data={card.data} {assetUrl} {expanded} />
    {:else if card.kind === 'stages'}<Stages data={card.data} {onset} />
    {:else if card.kind === 'callout'}<Callout data={card.data} />
    {:else if card.kind === 'form'}<Form data={card.data} {onset} />
    {:else if card.kind === 'html'}<Html cardId={card.id} data={card.data} title={card.text || 'Custom UI'} {post} {onset} {onheight} {onescape} />
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
  [data-object-saved] { opacity: 1; transition: opacity 180ms var(--ease-out); }
  .save-settled { opacity: 0; pointer-events: none; }
  .content { flex: 1; min-block-size: 0; overflow: auto; padding: 16px 20px; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
  .diagram .content { overflow: auto; }
  .sheet .content { padding: 0; }
  .unknown { color: var(--color-muted); }
  @media (hover: none), (pointer: coarse) { header { height: 44px; } .win-open { opacity: 1; min-height: 44px; } }
  @media (prefers-reduced-motion: reduce) { [data-object-saved] { transition: none; } .win-open { transition: none; } .win-open:active { transform: none; } }
  :global(body.motion-off) [data-object-saved] { transition: none; }
  :global(body.motion-off) .win-open { transition: none; transform: none; }
</style>
