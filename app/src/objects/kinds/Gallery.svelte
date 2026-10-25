<script lang="ts">
  import { tick } from 'svelte';
  import Text from './Text.svelte';
  let { data, assetUrl, expanded = false }: { data: { images: { url: string; alt: string; caption?: string }[] }; assetUrl: (url: string) => string; expanded?: boolean } = $props();
  let failed = $state<string[]>([]);
  let selected = $state<number | null>(null);
  let inspection = $state<HTMLDivElement>();
  let opener: HTMLButtonElement;
  let closing = $state(false);
  let animated = $state(false);
  const image = $derived(selected === null ? null : data.images[selected]);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('motion-off');
  async function open(event: MouseEvent, index: number) {
    if (!(event.currentTarget instanceof HTMLButtonElement)) return;
    opener = event.currentTarget; animated = event.detail > 0 && !reduced();
    selected = index;
    await tick(); inspection?.querySelector<HTMLButtonElement>('[data-inspection-close]')?.focus({ preventScroll: true });
  }
  async function close(keyboard: boolean) {
    if (closing || !inspection) return;
    if (!keyboard && !reduced()) {
      closing = true;
      await inspection.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 200, easing: getComputedStyle(inspection).getPropertyValue('--ease-drawer').trim() }).finished.catch(() => {});
    }
    selected = null; closing = false;
    await tick(); opener?.focus({ preventScroll: true });
  }
  function controls(node: HTMLDivElement) {
    const key = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); void close(true); }
      else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); selected = ((selected ?? 0) + (event.key === 'ArrowRight' ? 1 : -1) + data.images.length) % data.images.length;
      } else if (event.key === 'Tab') {
        const buttons = [...node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = buttons.findIndex(button => button === document.activeElement);
        const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        event.preventDefault(); buttons[next]?.focus();
      }
    };
    node.addEventListener('keydown', key);
    return { destroy: () => node.removeEventListener('keydown', key) };
  }
</script>
<div class="gallery" inert={selected !== null}>
  {#each data.images as image, i}
    <figure>
      {#if expanded}<button class="inspect-image" type="button" aria-label={`Inspect ${image.alt}`} onclick={event => open(event, i)}>
        {#if failed.includes(image.url)}<span class="missing" role="img" aria-label={image.alt}>Image unavailable</span>{:else}<img src={assetUrl(image.url)} alt={image.alt} loading="lazy" onerror={() => failed = [...failed, image.url]} />{/if}
      </button>
      {:else if failed.includes(image.url)}<div class="missing" role="img" aria-label={image.alt}>Image unavailable</div>{:else}<img src={assetUrl(image.url)} alt={image.alt} loading="lazy" onerror={() => failed = [...failed, image.url]} />{/if}
      {#if image.caption}<figcaption><Text value={image.caption} label={`Image ${i + 1} caption`} path={['images', i, 'caption']} multiline maxlength={200} /></figcaption>{/if}
    </figure>
  {/each}
</div>
{#if image}
  <div bind:this={inspection} use:controls class="gallery-inspection" class:animated role="dialog" aria-modal="true" aria-label="Image inspection" tabindex="-1">
    <button type="button" class="inspection-close" data-inspection-close aria-label="Close image inspection" onclick={event => close(event.detail === 0)}>Close</button>
    <figure class="inspection-art">
      {#if failed.includes(image.url)}<div class="missing" role="img" aria-label={image.alt}>Image unavailable</div>{:else}<img src={assetUrl(image.url)} alt={image.alt} onerror={() => failed = [...failed, image.url]} />{/if}
      <figcaption aria-live="polite">{image.caption || image.alt}</figcaption>
    </figure>
    <div class="inspection-nav"><button type="button" aria-label="Previous image" disabled={data.images.length < 2} onclick={() => selected = ((selected ?? 0) - 1 + data.images.length) % data.images.length}>Previous</button><span>{(selected ?? 0) + 1} of {data.images.length}</span><button type="button" aria-label="Next image" disabled={data.images.length < 2} onclick={() => selected = ((selected ?? 0) + 1) % data.images.length}>Next</button></div>
  </div>
{/if}
<style>
  .gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; }
  figure { margin: 0; min-width: 0; }
  img, .missing { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: var(--inset); border-radius: 4px; }
  .missing { display: grid; place-items: center; color: var(--muted); font-size: 12px; }
  figcaption { margin-top: 8px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
  .gallery .inspect-image { display: block; padding: 0; width: 100%; border: 0; border-radius: 4px; background: transparent; cursor: zoom-in; }
  .gallery-inspection { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; gap: 16px; padding: 16px; background: #000; color: var(--text); }
  .gallery-inspection.animated { animation: inspect-open 200ms var(--ease-out); }
  .gallery-inspection .inspection-close { align-self: end; flex: none; }
  .inspection-art { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
  .inspection-art img, .inspection-art .missing { flex: 1; min-height: 0; width: 100%; height: 100%; aspect-ratio: auto; object-fit: contain; background: transparent; border-radius: 0; }
  .inspection-art figcaption { flex: none; max-height: 25%; overflow: auto; text-align: center; margin: 0; }
  .inspection-nav { display: flex; align-items: center; justify-content: center; gap: 20px; flex: none; color: var(--muted); font-size: 12px; }
  .gallery-inspection button { min-height: 44px; min-width: 44px; background: transparent; border: 0; }
  @keyframes inspect-open { from { opacity: 0; transform: scale(.97); } to { opacity: 1; transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) { .gallery-inspection.animated { animation: none; } }
  :global(body.motion-off) .gallery-inspection.animated { animation: none; }
</style>
