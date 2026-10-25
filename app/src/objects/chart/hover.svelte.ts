// From Zephium (zephium-browser/Zephium @ 0eaad6d, frame/src/shared/ui/data/Chart/hover.svelte.ts), MPL-2.0.
// Changes for Aegis: local imports. See https://mozilla.org/MPL/2.0/
/** What the pointer rests on: shown at once, let go after a beat so the readout can be reached. */
export class Hover {
  index = $state<number | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(index: number) {
    clearTimeout(this.timer);
    this.index = index;
  }

  hide(delay = 160) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.index = null), delay);
  }

  hold() {
    clearTimeout(this.timer);
  }

  dispose() {
    clearTimeout(this.timer);
  }
}
