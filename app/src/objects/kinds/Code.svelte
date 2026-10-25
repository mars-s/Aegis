<!-- Code object: exact text with notes on line ranges. -->
<script lang="ts">
  type Code = { language: string; text: string; notes?: { from: number; to: number; text: string }[] };
  let { data }: { data: Code } = $props();
  const lines = $derived(data.text.replace(/\n$/, '').split('\n'));
  const noteAt = (n: number) => data.notes?.find(note => note.to === n);
  const marked = (n: number) => data.notes?.some(note => n >= note.from && n <= note.to);
</script>

<div class="code">
  <span class="lang">{data.language}</span>
  <pre>{#each lines as line, i (i)}<span class="line" class:marked={marked(i + 1)}><span class="no">{i + 1}</span>{line || ' '}</span>{#if noteAt(i + 1)}<span class="note">{noteAt(i + 1)?.text}</span>{/if}{/each}</pre>
</div>

<style>
  .code { position: relative; color: var(--color-text); }
  .lang { position: absolute; inset-block-start: 0; inset-inline-end: 0; color: var(--color-faint); font-size: var(--text-caption); }
  pre { margin: 0; font: 12px/1.6 var(--font-mono); overflow: auto; }
  .line { display: block; padding-inline-end: 8px; }
  .line.marked { background: color-mix(in srgb, var(--chart-1) 12%, transparent); }
  .no { display: inline-block; inline-size: 3ch; margin-inline-end: 12px; color: var(--color-faint); text-align: end; user-select: none; }
  .note { display: block; margin: 2px 0 6px 5ch; padding: 4px 8px; border-inline-start: 1px solid var(--line-strong); color: var(--color-label-secondary); font-family: var(--font); white-space: normal; }
</style>
