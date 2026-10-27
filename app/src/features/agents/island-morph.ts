const names = ['middle', 'left', 'right', 'tl', 'tr', 'bl', 'br', 'top', 'bottom', 'edge-left', 'edge-right'];
export const islandTiles = names;
const spring = (t: number): number => (1 - (1 + 10 * t) * Math.exp(-10 * t)) / (1 - 11 * Math.exp(-10));
function shapes(w: number, h: number, r: number, sx = 1, sy = 1): string[] {
  const rect = (x: number, y: number, width: number, height: number): string => `translate(${x / sx}px, ${y / sy}px) scale(${Math.max(.001, width) / sx}, ${Math.max(.001, height) / sy})`;
  return [rect(r, 0, w - 2 * r, h), rect(0, r, r, h - 2 * r), rect(w - r, r, r, h - 2 * r),
    ...[{ x: 0, y: 0 }, { x: w - r, y: 0 }, { x: 0, y: h - r }, { x: w - r, y: h - r }].map(p => `translate(${p.x / sx}px, ${p.y / sy}px) scale(${r / 24 / sx}, ${r / 24 / sy})`),
    rect(r, 0, w - 2 * r, 1), rect(r, h - 1, w - 2 * r, 1), rect(0, r, 1, h - 2 * r), rect(w - 1, r, 1, h - 2 * r)];
}

/** Chrome-only FLIP. The browser samples WAAPI frames; React changes only discrete states. */
export function createMorph(shell: HTMLElement, content: HTMLElement, tiles: readonly HTMLElement[]) {
  let animations: Animation[] = [];
  let before = shell.getBoundingClientRect();
  let fromRadius = 22;
  let radius = 22;
  let instant = true;
  let crossfade = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function cancel(): void { for (const animation of animations) animation.cancel(); animations = []; }
  function capture(options: { readonly instant: boolean; readonly crossfade?: boolean }): void {
    before = shell.getBoundingClientRect();
    fromRadius = radius;
    instant = options.instant; crossfade = options.crossfade ?? false;
  }
  function layout(expanded: boolean): void {
    cancel();
    const after = shell.getBoundingClientRect();
    radius = expanded ? 24 : 22;
    shapes(after.width, after.height, radius).forEach((transform, i) => { const tile = tiles[i]; if (tile) tile.style.transform = transform; });
    if (instant || !before.width || !after.width || document.hidden) { before = after; return; }
    const changed = Math.abs(before.width - after.width) > .5 || Math.abs(before.height - after.height) > .5;
    if (!changed && !crossfade) return;
    if (reduced.matches || document.body.classList.contains('motion-off')) {
      animations.push(content.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 160 }));
    } else {
      const frames: Keyframe[] = [], counters: Keyframe[] = [];
      const slices: Keyframe[][] = tiles.map(() => []);
      for (let i = 0; i <= 40; i++) {
        const offset = i / 40, t = spring(offset);
        const w = before.width + (after.width - before.width) * t, h = before.height + (after.height - before.height) * t;
        const sx = Math.max(.001, w / after.width), sy = Math.max(.001, h / after.height);
        frames.push({ offset, transform: `scale(${sx}, ${sy})` }); counters.push({ offset, transform: `scale(${1 / sx}, ${1 / sy})` });
        shapes(w, h, fromRadius + (radius - fromRadius) * t, sx, sy).forEach((transform, j) => slices[j]?.push({ offset, transform }));
      }
      const duration = after.width * after.height < before.width * before.height ? 200 : 260;
      const options = { duration, easing: 'linear' };
      animations.push(shell.animate(frames, options), content.animate(counters, options));
      tiles.forEach((tile, i) => { const sequence = slices[i]; if (sequence) animations.push(tile.animate(sequence, options)); });
      if (crossfade) animations.push(content.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 160 }));
      const time = document.timeline.currentTime;
      if (typeof time === 'number') for (const animation of animations) animation.startTime = time;
    }
    before = after;
  }
  const settle = (): void => { if (reduced.matches || document.body.classList.contains('motion-off')) cancel(); };
  reduced.addEventListener('change', settle);
  const observer = new MutationObserver(settle);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return { capture, layout, dispose() { cancel(); reduced.removeEventListener('change', settle); observer.disconnect(); } };
}
