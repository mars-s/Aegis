// R4 orientation: collect at most 30 names during the existing visible-card pass.
export function createOrientation(stage, getView, schedule) {
  // Keep the engine importable by host geometry checks, which do not load stylesheets.
  const style = document.createElement('style');
  style.textContent = '.canvas-orientation { position: absolute; inset: 0; z-index: 100005; pointer-events: none; overflow: hidden; } .canvas-orientation span { position: absolute; max-width: 160px; padding: 2px 4px; border-radius: 3px; background: rgb(0 0 0 / .8); color: var(--muted); font: 400 11px/16px var(--font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .8; }';
  stage.append(style);
  const layer = document.createElement('div'); layer.className = 'canvas-orientation'; layer.hidden = true;
  layer.setAttribute('aria-hidden', 'true'); stage.append(layer);
  let edge = false, active = false, candidates = [], minimum = 0;
  let width = 0, height = 0, view;
  addEventListener('pointermove', event => {
    const next = !event.buttons && Math.min(event.clientX, event.clientY, innerWidth - event.clientX, innerHeight - event.clientY) < 48;
    if (next !== edge) { edge = next; if (getView().z < .2) schedule(); }
  }, { passive: true });
  stage.addEventListener('focus', () => schedule());
  stage.addEventListener('blur', () => schedule());
  stage.addEventListener('keydown', () => { if (getView().z < .2) schedule(); });
  addEventListener('blur', () => { edge = false; if (getView().z < .2) schedule(); });
  return {
    get active() { return active; },
    begin() {
      active = getView().z < .2 && document.hasFocus() && (edge || document.activeElement === stage && stage.matches(':focus-visible'));
      candidates = []; minimum = 0;
      if (active) { width = stage.clientWidth; height = stage.clientHeight; view = getView(); }
    },
    consider(card) {
      const x = card.x * view.z + view.x, y = card.y * view.z + view.y;
      const w = card.w * view.z, h = card.h * view.z, area = w * h;
      if (x + w <= 0 || y + h <= 0 || x >= width || y >= height || area <= minimum) return;
      candidates.push({ card, x, y, area });
      candidates.sort((a, b) => b.area - a.area);
      if (candidates.length > 30) candidates.pop();
      if (candidates.length === 30) minimum = candidates[29].area;
    },
    paint() {
      layer.hidden = !active;
      if (!active) { if (layer.childElementCount) layer.replaceChildren(); return; }
      const occupied = [];
      layer.replaceChildren(...candidates.flatMap(({ card, x, y }) => {
        const label = document.createElement('span'); label.dataset.cardId = card.id;
        label.textContent = String(card.props?.layerName || card.heading || card.text?.split('\n').find(Boolean) || card.kind || card.type).slice(0, 80);
        const left = Math.max(8, Math.min(width - 168, x)), w = Math.min(160, label.textContent.length * 6.5 + 8);
        const top = [0, -20, 20, -40, 40, -60, 60].map(offset => Math.max(8, Math.min(height - 24, y - 20 + offset))).find(top => !occupied.some(r => left < r.x + r.w && left + w > r.x && top < r.y + 20 && top + 20 > r.y));
        if (top === undefined) return [];
        occupied.push({ x: left, y: top, w });
        label.style.left = `${left}px`; label.style.top = `${top}px`;
        return [label];
      }));
    },
  };
}
