<script lang="ts">
  import { getContext } from 'svelte';
  import Value from './Value.svelte';
  let { value = '', label, path, multiline = false, maxlength = 2000 }: { value?: string; label: string; path: (string | number)[]; multiline?: boolean; maxlength?: number } = $props();
  const editing = getContext<{ readonly enabled: boolean; onset: (path: (string | number)[], value: unknown) => void }>('aegis:edit-generated-text');
  const hint = $derived(`Return to save · ${multiline ? 'Shift Return for a new line · ' : ''}Esc to cancel`);
  function describeField(node: HTMLElement) {
    const focus = (event: FocusEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.target.setAttribute('aria-description', hint);
    };
    node.addEventListener('focusin', focus);
    return { destroy: () => node.removeEventListener('focusin', focus) };
  }
</script>
{#if editing?.enabled}<span class="generated-text" class:multiline use:describeField><Value {value} {label} {multiline} {maxlength} display={value || 'Add text'} onchange={next => editing.onset(path, next)} /><span class="text-edit-hint">{hint}</span></span>{:else}{value}{/if}
