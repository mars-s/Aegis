// Bridge between the canvas engine (plain DOM, culls off-screen cards) and Svelte object components.
// The engine calls render(el, card) when an object card is drawn or its data changes, and drop(el) when it unmounts.
import { mount, unmount } from 'svelte';
import ObjectCard from './ObjectCard.svelte';
import type { Host } from '../lib/host';

type Card = { id: string; kind: string; data: unknown; text: string; ver?: number; updated?: number };
type Apply = (commands: unknown[]) => void;

export function mountObjects({ host, apply }: { host: Host; apply: Apply }) {
  const live = new Map<Element, { instance: Record<string, any>; props: { card: Card } }>();
  return {
    render(el: HTMLElement, card: Card) {
      for (const [old, m] of live) if (!old.isConnected) { unmount(m.instance); live.delete(old); }
      const props = $stateProxy({ card });
      const instance = mount(ObjectCard, {
        target: el,
        props: {
          get card() { return props.card; },
          onset: (path: (string | number)[], value: unknown) => apply([{ op: 'object_set', id: card.id, path, value }]),
          onlink: (url: string) => { void host.openUrl(url).catch(() => {}); },
        },
      });
      live.set(el, { instance, props });
    },
    drop(el: Element) {
      const m = live.get(el); if (!m) return;
      unmount(m.instance); live.delete(el);
    },
    count: () => live.size,
  };
}
// Plain holder; the engine re-renders a card element when its data changes, so props need not be reactive.
function $stateProxy<T>(v: T): T { return v; }
