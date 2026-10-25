<script lang="ts">
  import { getContext } from 'svelte';
  import Value from './Value.svelte';
  let { value = '', label, path, multiline = false, maxlength = 2000 }: { value?: string; label: string; path: (string | number)[]; multiline?: boolean; maxlength?: number } = $props();
  const editing = getContext<{ readonly enabled: boolean; onset: (path: (string | number)[], value: unknown) => void }>('aegis:edit-generated-text');
</script>
{#if editing?.enabled}<Value {value} {label} {multiline} {maxlength} display={value || 'Add text'} onchange={next => editing.onset(path, next)} />{:else}{value}{/if}
