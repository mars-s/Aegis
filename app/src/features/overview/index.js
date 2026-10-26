import { boardClusters } from './clusters.js';
import './overview.css';

export function mountOverview(canvas) {
  const stage = document.getElementById('stage');
  const layer = document.createElement('div'); layer.className = 'board-overview'; layer.setAttribute('role', 'group'); layer.setAttribute('aria-label', 'Board clusters'); layer.hidden = true; stage.append(layer);
  const back = document.createElement('button'); back.type = 'button'; back.className = 'overview-back'; back.textContent = 'Back to where you were'; back.hidden = true; stage.append(back);
  let boardId, clusters = [], working, bookmark, wasFar = false;
  const buttons = new Map();
  function reset() {
    if (boardId !== canvas.board.id) {
      boardId = canvas.board.id; working = null; bookmark = null; wasFar = false; back.hidden = true;
    }
    clusters = boardClusters(canvas.board);
    for (const [id, button] of buttons) if (!clusters.some(c => c.id === id)) { button.remove(); buttons.delete(id); }
    paint();
  }
  function paint() {
    const view = canvas.view, far = view.z < .2;
    if (!far && !wasFar && !bookmark) working = { ...view };
    if (far && !wasFar) bookmark = working ? { ...working } : null;
    wasFar = far; layer.hidden = !far || !clusters.length;
    back.hidden = !bookmark;
    if (!far) return;
    const occupied = [], width = stage.clientWidth, height = stage.clientHeight;
    for (const cluster of clusters) {
      const x = cluster.x * view.z + view.x, y = cluster.y * view.z + view.y;
      const w = (cluster.right - cluster.x) * view.z, h = (cluster.bottom - cluster.y) * view.z;
      let button = buttons.get(cluster.id);
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'overview-cluster'; button.dataset.cluster = cluster.id;
        button.innerHTML = '<strong></strong><span></span>';
        button.onclick = event => {
          const current = clusters.find(c => c.id === button.dataset.cluster); if (!current) return;
          bookmark ??= { ...canvas.view }; back.hidden = false;
          canvas.frameIds(current.ids, 1, false, event.detail === 0);
          stage.focus({ preventScroll: true });
        };
        layer.append(button); buttons.set(cluster.id, button);
      }
      button.hidden = x + w < 0 || y + h < 0 || x > width || y > height;
      if (button.hidden) continue;
      button.querySelector('strong').textContent = cluster.name;
      button.querySelector('span').textContent = `${cluster.count} ${cluster.count === 1 ? 'window' : 'windows'}`;
      button.setAttribute('aria-label', `Frame ${cluster.name}, ${cluster.count} ${cluster.count === 1 ? 'window' : 'windows'}`);
      const bw = Math.max(220, Math.min(320, w)), bh = Math.max(60, h + 38);
      const left = Math.max(16, Math.min(width - bw - 16, x - Math.max(0, bw - w) / 2));
      let top = Math.max(64, Math.min(height - bh - 100, y - 38));
      while (occupied.some(r => left < r.right + 8 && left + bw > r.left - 8 && top < r.bottom + 8 && top + bh > r.top - 8)) top += 68;
      // Crowded groups remain keyboard reachable in a scrolling stack.
      Object.assign(button.style, { left: `${left}px`, top: `${top}px`, width: `${bw}px`, minHeight: `${Math.min(220, bh)}px` });
      occupied.push({ left, right: left + bw, top, bottom: top + Math.min(220, bh) });
    }
  }
  back.onclick = () => {
    if (!bookmark) return;
    const target = bookmark; bookmark = null; working = target; wasFar = target.z < .2;
    canvas.glideTo(target, 0); back.hidden = true; stage.focus({ preventScroll: true });
  };
  layer.addEventListener('pointerdown', event => event.stopPropagation());
  back.addEventListener('pointerdown', event => event.stopPropagation());
  stage.addEventListener('canvaspaint', paint); stage.addEventListener('boardchange', reset);
  reset();
}
