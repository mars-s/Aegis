<script lang="ts">
  import { tick } from 'svelte';
  let { value, label, numeric = false, display, onchange }: { value: string | number; label: string; numeric?: boolean; display?: string; onchange: (value: string | number) => void } = $props();
  let editing = $state(false);
  let field = $state<HTMLInputElement>();
  let trigger: HTMLButtonElement;
  async function begin() {
    editing = true;
    await tick();
    field?.focus({ preventScroll: true }); field?.select();
  }
  function commit() {
    if (!editing || !field) return true;
    if (!field.reportValidity() || numeric && field.value === '') return false;
    const next = numeric ? field.valueAsNumber : field.value;
    editing = false;
    if (next !== value) onchange(next);
    return true;
  }
  function controls(node: HTMLElement) {
    const key = async (event: KeyboardEvent) => {
      event.stopPropagation();
      if (!editing || !field || event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault(); editing = false;
        await tick(); trigger.focus({ preventScroll: true });
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const stops = [...document.querySelectorAll<HTMLElement>('button, input, textarea, a[href], [tabindex="0"]')].filter(el => !el.closest('[inert], [hidden]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.matches(':disabled'));
        const next = event.key === 'Tab' ? stops[stops.indexOf(field) + (event.shiftKey ? -1 : 1)] : trigger;
        if (!commit()) return;
        await tick(); (next ?? trigger).focus({ preventScroll: true });
      }
    };
    node.addEventListener('keydown', key);
    return { destroy() { node.removeEventListener('keydown', key); } };
  }
</script>
<span class="inline-value" class:editing use:controls>
  <button bind:this={trigger} type="button" class="value-trigger" aria-label={label} tabindex={editing ? -1 : 0} onclick={begin}>{display ?? String(value)}</button>
  {#if editing}<input bind:this={field} aria-label={label} type={numeric ? 'number' : 'text'} required={numeric} min={numeric ? 0 : undefined} step="any" maxlength="40" value={value} onblur={commit} />{/if}
</span>
