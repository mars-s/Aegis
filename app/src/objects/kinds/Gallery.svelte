<script lang="ts">
  let { data, assetUrl }: { data: { images: { url: string; alt: string; caption?: string }[] }; assetUrl: (url: string) => string } = $props();
  let failed = $state<string[]>([]);
</script>
<div class="gallery">
  {#each data.images as image}
    <figure>
      {#if failed.includes(image.url)}<div class="missing" role="img" aria-label={image.alt}>Image unavailable</div>{:else}<img src={assetUrl(image.url)} alt={image.alt} loading="lazy" onerror={() => failed = [...failed, image.url]} />{/if}
      {#if image.caption}<figcaption>{image.caption}</figcaption>{/if}
    </figure>
  {/each}
</div>
<style>
  .gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; }
  figure { margin: 0; min-width: 0; }
  img, .missing { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: var(--inset); border-radius: 4px; }
  .missing { display: grid; place-items: center; color: var(--muted); font-size: 12px; }
  figcaption { margin-top: 8px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
</style>
