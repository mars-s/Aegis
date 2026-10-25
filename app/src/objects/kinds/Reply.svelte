<!-- Reply object. Markup and styles from Zephium (zephium-browser/Zephium @ 0eaad6d,
     frame/src/features/work/components/objects/Reply.svelte), MPL-2.0. Changes for Aegis: plain data props, no pending state. -->
<script lang="ts">
  import Inline from './Inline.svelte';
  type Reply = { headline: string; text: string; figures?: { label: string; value: string; note?: string }[]; points?: string[] };
  let { data }: { data: Reply } = $props();
</script>

<article class="reply" aria-label={data.headline}>
  <h2>{data.headline}</h2>
  {#if data.text}<p class="text"><Inline text={data.text} /></p>{/if}
  {#if data.figures?.length}
    <dl class="figures">
      {#each data.figures as figure (figure.label)}
        <div>
          <dt>{figure.label}</dt>
          <dd><span class="value">{figure.value}</span>{#if figure.note}<span class="note">{figure.note}</span>{/if}</dd>
        </div>
      {/each}
    </dl>
  {/if}
  {#if data.points?.length}
    <ul class="points">
      {#each data.points as point, i (i)}<li><Inline text={point} /></li>{/each}
    </ul>
  {/if}
</article>

<style>
  .reply { display: flex; flex-direction: column; gap: 14px; max-inline-size: 64ch; color: var(--color-text); }
  h2 { margin: 0; font-size: var(--text-headline); font-weight: 650; line-height: 1.18; letter-spacing: -0.022em; text-wrap: balance; }
  .text { margin: 0; color: var(--color-label-secondary); font-size: var(--text-reading); line-height: 1.55; text-wrap: pretty; }
  .figures { display: flex; flex-wrap: wrap; gap: 16px 40px; margin: 6px 0 0; }
  .figures div { display: flex; flex-direction: column; gap: 3px; }
  dt { order: 2; color: var(--color-muted); font-size: var(--text-label); }
  dd { display: contents; }
  .value { order: 1; font-size: var(--text-headline); font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1.1; }
  .note { order: 3; color: var(--color-faint); font-size: var(--text-caption); }
  .points { display: flex; flex-direction: column; gap: 8px; margin: 2px 0 0; padding: 0; list-style: none; color: var(--color-label-secondary); font-size: var(--text-reading); line-height: 1.45; }
  .points li { position: relative; padding-inline-start: 18px; }
  .points li::before { position: absolute; inset-block-start: 0.62em; inset-inline-start: 2px; inline-size: 5px; block-size: 5px; border-radius: var(--radius-capsule); background: var(--color-faint); content: ""; }
</style>
