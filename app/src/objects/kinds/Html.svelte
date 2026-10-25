<script lang="ts">
  import { onMount } from 'svelte';
  import font from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline';
  import type { Host } from '../../lib/host';
  import { reportedHeight, THEME_KEYS } from './html-sandbox.js';
  let { data, title, post, onheight }: { data: { html: string; css: string; js: string; height?: number }; title: string; post: Host['post']; onheight: (height: number) => void } = $props();
  let frame = $state<HTMLIFrameElement>();
  let theme = $state<string | null>(null);
  let height = $state(240);
  let motionOff = $state(false);
  const channel = crypto.randomUUID();
  let src = $state('');
  let failure = $state('');
  // A geometry-only update must not register or reload the widget again.
  const source = $derived(theme === null ? '' : JSON.stringify({ html: data.html, css: data.css, js: data.js, channel, theme, font, motionOff }));
  $effect(() => {
    if (!source) return;
    let current = true;
    post<{ url: string }>('/sandbox', JSON.parse(source)).then(result => {
      if (current) { src = result.url; failure = ''; }
    }).catch(error => {
      if (current) failure = error instanceof Error ? error.message : 'Could not load custom UI';
    });
    return () => { current = false; };
  });
  onMount(() => {
    const receive = (event: MessageEvent) => {
      const next = reportedHeight(event, frame?.contentWindow, channel);
      if (next === null) return;
      height = next;
      onheight(next);
    };
    window.addEventListener('message', receive);
    const syncTheme = () => {
      if (!frame) return;
      const styles = getComputedStyle(frame);
      theme = THEME_KEYS.map(key => `${key}:${styles.getPropertyValue(key)};`).join('');
      motionOff = document.body.classList.contains('motion-off');
    };
    height = data.height ?? 240;
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => { window.removeEventListener('message', receive); observer.disconnect(); };
  });
</script>
<iframe bind:this={frame} title={title} sandbox="allow-scripts" referrerpolicy="no-referrer" src={src || undefined} style:height={`${height}px`}></iframe>
{#if failure}<p role="status">Custom UI could not load: {failure}</p>{/if}
<style>
  iframe { display: block; width: 100%; border: 0; background: var(--card); color-scheme: dark; }
</style>
