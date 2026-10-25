// FLIP measures once per change. Only transforms and opacity change during a morph.
// Nine surface slices keep circular corners and a one-pixel edge at every aspect ratio.
export function createIslandMorph(island) {
  const shell = island.querySelector('.island-morph'), content = island.querySelector('.island-content');
  const surface = island.querySelector('.island-surface');
  const names = ['middle', 'left', 'right', 'tl', 'tr', 'bl', 'br', 'top', 'bottom', 'edge-left', 'edge-right'];
  const tiles = names.map(name => {
    const el = document.createElement('i'); el.className = `island-tile island-${name}`; surface.append(el); return el;
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const gentle = () => reduced.matches || document.body.classList.contains('motion-off');
  let animations = [], flight = null, ghost = null;
  const spring = t => (1 - (1 + 10 * t) * Math.exp(-10 * t)) / (1 - 11 * Math.exp(-10));
  const radius = () => ['idle', 'hover', 'running', 'done'].includes(island.dataset.state) ? 22 : 24;
  function cancel() { for (const a of animations) a.cancel(); animations = []; flight = null; ghost?.remove(); ghost = null; }
  function shapes(w, h, r, sx = 1, sy = 1) {
    const rect = (x, y, width, height) => `translate(${x / sx}px, ${y / sy}px) scale(${Math.max(0.001, width) / sx}, ${Math.max(0.001, height) / sy})`;
    return [rect(r, 0, w - 2 * r, h), rect(0, r, r, h - 2 * r), rect(w - r, r, r, h - 2 * r),
      ...[[0, 0], [w - r, 0], [0, h - r], [w - r, h - r]].map(([x, y]) => `translate(${x / sx}px, ${y / sy}px) scale(${r / 24 / sx}, ${r / 24 / sy})`),
      rect(r, 0, w - 2 * r, 1), rect(r, h - 1, w - 2 * r, 1), rect(0, r, 1, h - 2 * r), rect(w - 1, r, 1, h - 2 * r)];
  }
  function layout(change, { instant = false, crossfade = false } = {}) {
    const before = shell.getBoundingClientRect();
    const progress = flight ? spring(Math.min(1, Number(animations[0]?.currentTime ?? 0) / flight.duration)) : 1;
    const fromR = flight ? flight.fromR + (flight.toR - flight.fromR) * progress : radius();
    const opacity = getComputedStyle(content).opacity;
    const oldContent = crossfade && !instant && before.width > 0 && before.height > 0 && !document.hidden ? content.cloneNode(true) : null;
    const oldState = island.dataset.state, oldWidth = shell.offsetWidth, oldHeight = shell.offsetHeight;
    cancel();
    if (oldContent) {
      ghost = document.createElement('div'); ghost.className = 'agent-island island-ghost'; ghost.dataset.state = oldState;
      ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
      for (const el of oldContent.querySelectorAll('[id]')) el.removeAttribute('id');
      // Copying IDs would make form and accessibility lookups ambiguous during the fade.
      oldContent.querySelector('form')?.classList.add('island-form-copy');
      oldContent.style.transform = `scale(${oldWidth / before.width}, ${oldHeight / before.height})`;
      Object.assign(ghost.style, { left: `${before.left + before.width / 2}px`, top: `${before.bottom - oldHeight}px`, bottom: 'auto', width: `${oldWidth}px`, transformOrigin: '50% 100%', transform: `scale(${before.width / oldWidth}, ${before.height / oldHeight})`, opacity });
      ghost.append(oldContent); document.body.append(ghost);
    }
    change();
    const after = shell.getBoundingClientRect(), toR = radius();
    shapes(after.width, after.height, toR).forEach((transform, i) => { tiles[i].style.transform = transform; });
    if (instant || !before.width || document.hidden) return;
    const changed = Math.abs(before.width - after.width) > .5 || Math.abs(before.height - after.height) > .5;
    const duration = after.width * after.height < before.width * before.height ? 200 : 260;
    if (gentle()) {
      if (changed || crossfade) animations.push(content.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 160 }));
      if (ghost) { const outgoing = ghost; outgoing.animate([{ opacity }, { opacity: 0 }], { duration: 160 }).onfinish = () => outgoing.remove(); }
      return;
    }
    if (!changed && !crossfade) return;
    const frames = [], counter = [], slices = tiles.map(() => []);
    for (let i = 0; i <= 40; i++) {
      const offset = i / 40, t = spring(offset);
      const w = before.width + (after.width - before.width) * t, h = before.height + (after.height - before.height) * t;
      const sx = w / after.width, sy = h / after.height, r = fromR + (toR - fromR) * t;
      frames.push({ offset, transform: `scale(${sx}, ${sy})` });
      counter.push({ offset, transform: `scale(${1 / sx}, ${1 / sy})` });
      shapes(w, h, r, sx, sy).forEach((transform, j) => slices[j].push({ offset, transform }));
    }
    const options = { duration, easing: 'linear' };
    animations.push(shell.animate(frames, options), content.animate(counter, options));
    tiles.forEach((el, i) => animations.push(el.animate(slices[i], options)));
    if (crossfade) animations.push(content.animate([{ opacity: Math.min(.35, Number(opacity)) }, { opacity: 1 }], { duration: 160 }));
    if (ghost) { const outgoing = ghost; outgoing.animate([{ opacity }, { opacity: 0 }], { duration: 140 }).onfinish = () => outgoing.remove(); }
    flight = { duration, fromR, toR };
    animations[0].onfinish = () => { cancel(); };
  }
  const settle = () => { if (gentle()) cancel(); };
  reduced.addEventListener('change', settle);
  new MutationObserver(settle).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  layout(() => {}, { instant: true });
  return layout;
}
