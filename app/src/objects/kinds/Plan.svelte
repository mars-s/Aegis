<!-- Plan object: time-ordered steps as a timeline; tick off when checkable. Shape from Zephium's PlanView (MPL-2.0). -->
<script lang="ts">
  import Inline from './Inline.svelte';
  type Step = { when?: string; date?: string; title: string; detail?: string; kind: string; cost?: string; place?: string; done?: boolean };
  type Plan = { steps: Step[]; total?: { label: string; value: string }; checkable?: boolean };
  let { data, oncheck }: { data: Plan; oncheck?: (index: number, done: boolean) => void } = $props();
  const GLYPH: Record<string, string> = { travel: '→', stay: '⌂', event: '◆', task: '○', milestone: '★', note: '·' };
</script>

<ol class="plan">
  {#each data.steps as step, i (i)}
    <li class="step {step.kind}" class:done={step.done}>
      <span class="when">{step.when ?? step.date ?? ''}</span>
      <span class="rail"><span class="dot">{#if data.checkable}<input type="checkbox" checked={!!step.done} aria-label={`Done: ${step.title}`} onchange={e => oncheck?.(i, (e.currentTarget as HTMLInputElement).checked)} />{:else}{GLYPH[step.kind] ?? '·'}{/if}</span></span>
      <div class="item">
        <div class="title"><Inline text={step.title} /></div>
        {#if step.detail}<p class="detail"><Inline text={step.detail} /></p>{/if}
        {#if step.place || step.cost}<p class="meta">{[step.place, step.cost].filter(Boolean).join(' · ')}</p>{/if}
      </div>
    </li>
  {/each}
</ol>
{#if data.total}<p class="total"><span>{data.total.label}</span><strong>{data.total.value}</strong></p>{/if}

<style>
  .plan { list-style: none; margin: 0; padding: 0; color: var(--color-text); font-size: var(--text-body); }
  .step { display: grid; grid-template-columns: 72px 22px 1fr; gap: 0 10px; position: relative; }
  .when { color: var(--color-muted); font-size: var(--text-label); font-variant-numeric: tabular-nums; padding-block-start: 2px; text-align: end; }
  .rail { position: relative; display: flex; justify-content: center; }
  .rail::before { content: ""; position: absolute; inset-block: 0; inset-inline-start: 50%; inline-size: 1px; background: var(--color-border-strong); }
  .step:first-child .rail::before { inset-block-start: 10px; }
  .step:last-child .rail::before { inset-block-end: calc(100% - 10px); }
  .dot { position: relative; z-index: 1; display: grid; place-items: center; inline-size: 18px; block-size: 18px; border-radius: 50%; background: var(--color-surface); border: 1px solid var(--color-border-strong); font-size: 10px; color: var(--color-muted); }
  .milestone .dot { color: var(--chart-4); border-color: var(--chart-4); }
  .dot input { margin: 0; accent-color: var(--chart-3); }
  .item { padding-block-end: 14px; min-inline-size: 0; }
  .title { font-weight: 600; line-height: 1.35; }
  .done .title { color: var(--color-faint); text-decoration: line-through; }
  .detail { margin: 3px 0 0; color: var(--color-label-secondary); line-height: 1.45; }
  .meta { margin: 3px 0 0; color: var(--color-faint); font-size: var(--text-caption); }
  .total { display: flex; justify-content: space-between; margin: 4px 0 0; padding-block-start: 10px; border-block-start: 1px solid var(--color-border); color: var(--color-muted); }
  .total strong { color: var(--color-text); font-variant-numeric: tabular-nums; }
</style>
