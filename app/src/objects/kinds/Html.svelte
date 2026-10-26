<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import font from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline';
  import type { Host } from '../../lib/host';
  import { reportedHeight, reportedEscape, reportedState, THEME_KEYS } from './html-sandbox.js';
  let { cardId, data, title, post, onset, onheight, onescape = () => {} }: { cardId: string; data: { html: string; css: string; js: string; height?: number; state?: string }; title: string; post: Host['post']; onset: (path: (string | number)[], value: unknown) => void; onheight: (height: number) => void; onescape?: () => void } = $props();
  let frame = $state<HTMLIFrameElement>();
  let ready = $state(false);
  let height = $state(240);
  let channel = '';
  let src = $state('');
  let failure = $state('');
  // Only source edits replace the document. Preferences and geometry keep its live state.
  const source = $derived(JSON.stringify({ html: data.html, css: data.css, js: data.js }));
  function preferences() {
    const styles = getComputedStyle(frame!);
    return { theme: Object.fromEntries(THEME_KEYS.map(key => [key, styles.getPropertyValue(key)])), motionOff: document.body.classList.contains('motion-off'), scheme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark' };
  }
  function syncPreferences() {
    frame?.contentWindow?.postMessage({ type: 'aegis:html-preferences', channel, ...preferences() }, '*');
  }
  function syncState() {
    frame?.contentWindow?.postMessage({ type: 'aegis:html-restore', channel, state: data.state ?? null }, '*');
  }
  function loaded() { syncPreferences(); syncState(); }
  $effect(() => { if (ready) syncState(); });
  $effect(() => {
    if (!ready) return;
    const sourceData = JSON.parse(source);
    // A replaced document cannot publish a late snapshot into its replacement.
    channel = crypto.randomUUID();
    let current = true;
    untrack(() => {
      const { theme, motionOff, scheme } = preferences();
      return post<{ url: string }>('/sandbox', { ...sourceData, state: data.state, parentOrigin: location.origin, channel, font, theme: `color-scheme:${scheme};` + THEME_KEYS.map(key => `${key}:${theme[key]};`).join(''), motionOff });
    }).then(result => {
      if (current) { src = result.url; failure = ''; }
    }).catch(error => {
      if (current) failure = error instanceof Error ? error.message : 'Could not load custom UI';
    });
    return () => { current = false; };
  });
  onMount(() => {
    const receive = (event: MessageEvent) => {
      const initial = reportedState(event, frame?.contentWindow, channel, 'aegis:html-initial-state');
      if (initial !== null && data.state === undefined) frame?.dispatchEvent(new CustomEvent('aegis:html-initialise', { bubbles: true, detail: { id: cardId, source: JSON.parse(source), state: initial } }));
      const state = reportedState(event, frame?.contentWindow, channel);
      if (state !== null && state !== data.state) onset(['state'], state);
      if (reportedEscape(event, frame?.contentWindow, channel)) onescape();
      const next = reportedHeight(event, frame?.contentWindow, channel);
      if (next === null) return;
      height = next;
      onheight(next);
    };
    window.addEventListener('message', receive);
    height = data.height ?? 240;
    ready = true;
    const observer = new MutationObserver(syncPreferences);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => { window.removeEventListener('message', receive); observer.disconnect(); };
  });
</script>
<iframe bind:this={frame} title={title} sandbox="allow-scripts" referrerpolicy="no-referrer" src={src || undefined} onload={loaded} style:height={`${height}px`}></iframe>
{#if failure}<p role="status">Custom UI could not load: {failure}</p>{/if}
<style>
  iframe { display: block; width: 100%; border: 0; background: var(--card); }
</style>
