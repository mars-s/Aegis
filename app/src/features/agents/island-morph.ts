/** Chrome-only FLIP. Counter-scaling keeps conversation text crisp as the dock changes size. */
export function createMorph(shell: HTMLElement, content: HTMLElement) {
  let animations: Animation[] = [];
  let before = shell.getBoundingClientRect();
  let instant = true, crossfade = false, captured = true;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const gentle = (): boolean => reduced.matches || document.body.classList.contains('motion-off');
  function cancel(): void { for (const animation of animations) animation.cancel(); animations = []; }
  function capture(options: { readonly instant: boolean; readonly crossfade?: boolean }): void {
    captured = true; before = shell.getBoundingClientRect();
    instant = options.instant; crossfade = options.crossfade ?? false;
  }
  function layout(): void {
    if (!captured) return;
    captured = false; cancel();
    const after = shell.getBoundingClientRect();
    if (instant || gentle() || !before.width || !after.width || document.hidden) { before = after; return; }
    const changed = Math.abs(before.width - after.width) > .5 || Math.abs(before.height - after.height) > .5;
    if (!changed && !crossfade) return;
    const styles = getComputedStyle(shell);
    const duration = Number.parseFloat(styles.getPropertyValue('--motion-base')) || 0;
    const easing = styles.getPropertyValue('--ease-out').trim();
    const frames: Keyframe[] = [], counters: Keyframe[] = [];
    // Reciprocal samples prevent text distortion. WAAPI applies the shared ease-out to both tracks.
    const samples = 36;
    for (let i = 0; i <= samples; i++) {
      const offset = i / samples;
      const sx = Math.max(.001, (before.width + (after.width - before.width) * offset) / after.width);
      const sy = Math.max(.001, (before.height + (after.height - before.height) * offset) / after.height);
      frames.push({ offset, transform: `scale(${sx}, ${sy})` });
      counters.push({ offset, transform: `scale(${1 / sx}, ${1 / sy})` });
    }
    animations.push(shell.animate(frames, { duration, easing }), content.animate(counters, { duration, easing }));
    if (crossfade) animations.push(content.animate([{ opacity: .35 }, { opacity: 1 }], { duration, easing }));
    const time = document.timeline.currentTime;
    if (typeof time === 'number') for (const animation of animations) animation.startTime = time;
    before = after;
  }
  const settle = (): void => { if (gentle()) cancel(); };
  reduced.addEventListener('change', settle);
  const observer = new MutationObserver(settle);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return { capture, layout, dispose() { cancel(); reduced.removeEventListener('change', settle); observer.disconnect(); } };
}
