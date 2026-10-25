<script lang="ts">
  import { tick } from 'svelte';
  import { createMenu } from '../../lib/ui/menu.js';
  let { label, items }: { label: string; items: () => { title: string; checked?: boolean; run: () => void }[] } = $props();
  function menu(trigger: HTMLButtonElement) {
    const popup = createMenu({ trigger, label, items: () => items().map(item => ({ ...item, run: async () => {
      const region = trigger.closest('.genui');
      item.run();
      // Canvas data reaches its Svelte view during the next scheduled paint.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); await tick();
      if (!trigger.isConnected) [...region?.querySelectorAll<HTMLButtonElement>('.kind-more') ?? []].find(button => button.getAttribute('aria-label') === label)?.focus({ preventScroll: true });
    } })) });
    return { destroy: () => popup.destroy() };
  }
</script>
<button use:menu class="kind-more" type="button" aria-label={label} title={label}>
  <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r=".75"/><circle cx="8" cy="8" r=".75"/><circle cx="13" cy="8" r=".75"/></svg>
</button>
