// Bridge between the canvas engine (plain DOM, culls off-screen cards) and Svelte object components.
// The engine calls render(el, card) when an object card is drawn or its data changes, and drop(el) when it unmounts.
import { mount, unmount } from 'svelte';
import { writable, fromStore } from 'svelte/store';
import ObjectCard from './ObjectCard.svelte';
import type { Host } from '../lib/host';
import { mountIntrinsicSizing } from './intrinsic-sizing.js';
import { emptyBoard } from '../lib/board/commands.js';

type Card = { id: string; kind: string; data: unknown; text: string; ver?: number; updated?: number; h?: number };
type Apply = (commands: unknown[]) => void;

export function mountObjects({ host, apply, getBoard }: { host: Host; apply: Apply; getBoard: () => ReturnType<typeof emptyBoard> }) {
  mountIntrinsicSizing({ getBoard, apply });
  const live = new Map<Element, { instance: ReturnType<typeof mount>; update: (card: Card) => void }>();
  return {
    render(el: HTMLElement, card: Card) {
      const existing = live.get(el);
      if (existing) { existing.update(card); return; }
      for (const [old, m] of live) if (!old.isConnected) { unmount(m.instance); live.delete(old); }
      const value = writable(card), current = fromStore(value);
      let lastHeight = card.h;
      const instance = mount(ObjectCard, {
        target: el,
        props: {
          get card() { return current.current; },
          onset: (path: (string | number)[], value: unknown) => apply([{ op: 'object_set', id: card.id, path, value }]),
          onlink: (url: string) => { void host.openUrl(url).catch(() => {}); },
          assetUrl: host.assetUrl,
          post: host.post,
          onheight: (height: number) => {
            if (!el.isConnected) return;
            const content = el.querySelector('.content'), strip = el.querySelector('.win-strip');
            if (!(content instanceof HTMLElement) || !(strip instanceof HTMLElement)) return;
            const styles = getComputedStyle(content), window = el.closest('.card');
            const border = window instanceof HTMLElement ? window.offsetHeight - window.clientHeight : 0;
            const h = height + strip.offsetHeight + parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom) + border;
            if (h === lastHeight) return;
            lastHeight = h;
            apply([{ op: 'update', id: card.id, set: { h } }]);
          },
        },
      });
      live.set(el, { instance, update: value.set });
    },
    drop(el: Element) {
      const m = live.get(el); if (!m) return;
      unmount(m.instance); live.delete(el);
    },
    count: () => live.size,
  };
}
