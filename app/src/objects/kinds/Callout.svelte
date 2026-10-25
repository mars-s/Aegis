<script lang="ts">
  import Text from './Text.svelte';
  let { data }: { data: { tone: string; text: string; attribution?: string } } = $props();
  const names: Record<string, string> = { quote: 'Quote', note: 'Note', warning: 'Warning', tip: 'Tip' };
</script>
<aside class="callout" aria-label={names[data.tone]}>
  {#if data.tone === 'quote'}<blockquote><Text value={data.text} label="Callout text" path={['text']} multiline /></blockquote>{:else}<strong>{names[data.tone]}</strong><p><Text value={data.text} label="Callout text" path={['text']} multiline /></p>{/if}
  {#if data.attribution}<p class="attribution"><Text value={data.attribution} label="Attribution" path={['attribution']} maxlength={120} /></p>{/if}
</aside>
<style>
  .callout { max-width: 65ch; overflow-wrap: anywhere; }
  strong { display: block; font-size: 13px; font-weight: 500; margin-bottom: 10px; }
  p, blockquote { margin: 0; white-space: pre-wrap; font-size: 16px; line-height: 1.55; }
  blockquote { font-size: 20px; letter-spacing: -.015em; }
  p.attribution { font-size: 12px; color: var(--muted); margin-top: 16px; }
</style>
