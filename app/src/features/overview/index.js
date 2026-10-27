import { boardClusters } from './clusters.js';
import { cardSummary } from '@aegis/domain/summary';
import { effectiveFlag } from '../editing/model.js';
import { summarisedCard } from './zoom.js';
import { summaryContent } from './summary.js';
import './overview.css';

export function mountOverview(canvas) {
  const stage = document.getElementById('stage');
  const layer = document.createElement('div'); layer.className = 'board-overview'; layer.setAttribute('role', 'group'); layer.setAttribute('aria-label', 'Board clusters'); stage.append(layer);
  const summaries = document.createElement('div'); summaries.className = 'semantic-summaries'; summaries.setAttribute('role', 'group'); summaries.setAttribute('aria-label', 'Window summaries'); stage.append(summaries);
  const back = document.createElement('button'); back.type = 'button'; back.className = 'overview-back'; back.textContent = 'Back to where you were'; back.hidden = true; stage.append(back);
  let boardId, clusters = [], cards = [], agents = [], working, bookmark, wasFar = false, revision = 0;
  const buttons = new Map(), windows = new Map(), content = new Map();
  function renderMembers(button) {
    const list = button.querySelector('.overview-members'), ids = button.memberIds;
    // Two spare rows on either side keep scrolling smooth without mounting thousands of entries.
    const start = Math.min(Math.max(0, ids.length - 1), Math.max(0, Math.floor((button.memberScrollTop || 0) / 128) - 2)), end = Math.min(ids.length, start + 8);
    if (list.dataset.start === String(start) && list.dataset.revision === String(revision)) return;
    const spacer = height => { const node = document.createElement('span'); node.className = 'overview-spacer'; node.style.height = `${height}px`; return node; };
    list.replaceChildren(spacer(start * 128), ...ids.slice(start, end).map(id => summaryContent(content.get(id))), spacer((ids.length - end) * 128));
    list.dataset.start = String(start); list.dataset.revision = String(revision);
  }
  function reset() {
    if (boardId !== canvas.board.id) {
      boardId = canvas.board.id; working = null; bookmark = null; wasFar = false; back.hidden = true;
    }
    cards = canvas.board.cards.filter(c => summarisedCard(c) && !effectiveFlag(canvas.board, c, 'hidden'));
    content.clear();
    for (const card of cards) content.set(card.id, cardSummary(card, canvas.board.cards));
    clusters = boardClusters(canvas.board); revision++;
    for (const [id, button] of buttons) if (!clusters.some(c => c.id === id)) { button.remove(); buttons.delete(id); }
    // All visual writes happen in the canvas's existing animation frame, including board changes.
    canvas.redraw();
  }
  function paint() {
    const view = canvas.view, tier = stage.dataset.zoomTier, far = tier === 'cluster';
    // Read viewport geometry once, before changing any summary or cluster styles.
    const { width, height } = canvas.viewportSize;
    if (!far && !wasFar && !bookmark) working = { ...view };
    if (far && !wasFar) bookmark = working ? { ...working } : null;
    wasFar = far;
    if (layer.inert !== !far) { layer.inert = !far; layer.setAttribute('aria-hidden', String(!far)); }
    const hasSummaries = !far && [...canvas.representations.values()].some(r => r.summary);
    if (summaries.inert !== !hasSummaries) { summaries.inert = !hasSummaries; summaries.setAttribute('aria-hidden', String(!hasSummaries)); }
    back.hidden = !bookmark;
    // Keep outgoing nodes for the crossfade. Build and place only visible summaries.
    if (!far) {
      const keep = new Set();
      for (const card of cards) {
        const rect = canvas.representations.get(card.id);
        if (!rect?.summary || rect.x + rect.w < 0 || rect.y + rect.h < 0 || rect.x > width || rect.y > height) continue;
        keep.add(card.id);
        let button = windows.get(card.id);
        if (!button) {
          button = document.createElement('button'); button.type = 'button'; button.className = 'semantic-window'; button.dataset.cardId = card.id;
          button.onclick = event => canvas.activateSummary(card.id, event.detail === 0, event);
          summaries.append(button); windows.set(card.id, button);
        }
        if (button.revision !== revision) {
          button.replaceChildren(summaryContent(content.get(card.id))); button.revision = revision;
          button.setAttribute('aria-label', `Frame ${content.get(card.id).title}`);
          button.title = [content.get(card.id).title, ...content.get(card.id).facts, content.get(card.id).disclosure].filter(Boolean).join('\n');
        }
        button.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
        button.style.width = `${rect.w}px`; button.style.height = `${rect.h}px`;
        button.setAttribute('aria-pressed', String(canvas.selection().includes(card.id)));
      }
      for (const [id, button] of windows) if (!keep.has(id)) { button.remove(); windows.delete(id); }
    }
    if (!far) return;
    const occupied = [];
    for (const cluster of clusters) {
      const x = cluster.x * view.z + view.x, y = cluster.y * view.z + view.y;
      const w = (cluster.right - cluster.x) * view.z;
      let button = buttons.get(cluster.id);
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'overview-cluster'; button.dataset.cluster = cluster.id;
        button.innerHTML = '<span class="overview-heading"><strong></strong><span></span></span><span class="overview-members"></span>';
        button.querySelector('.overview-members').addEventListener('wheel', event => {
          if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
        }, { passive: true });
        let scrollFrame = 0;
        button.querySelector('.overview-members').addEventListener('scroll', event => {
          button.memberScrollTop = event.currentTarget.scrollTop;
          if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; renderMembers(button); });
        }, { passive: true });
        button.addEventListener('keydown', event => {
          if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const list = button.querySelector('.overview-members');
          if (event.key === 'Home') list.scrollTop = 0;
          else if (event.key === 'End') list.scrollTop = button.memberIds.length * 128;
          else list.scrollTop += (['ArrowUp', 'PageUp'].includes(event.key) ? -1 : 1) * (event.key.startsWith('Page') ? 224 : 128);
        });
        button.onclick = event => {
          const current = clusters.find(c => c.id === button.dataset.cluster); if (!current) return;
          bookmark ??= { ...canvas.view }; back.hidden = false;
          canvas.frameIds(current.ids, 1, false, event.detail === 0);
          stage.focus({ preventScroll: true });
        };
        layer.append(button); buttons.set(cluster.id, button);
      }
      if (button.revision !== revision) {
        button.querySelector('.overview-heading strong').textContent = cluster.name;
        button.querySelector('.overview-heading > span').textContent = `${cluster.count} ${cluster.count === 1 ? 'window' : 'windows'}`;
        button.setAttribute('aria-label', `Frame ${cluster.name}, ${cluster.count} ${cluster.count === 1 ? 'window' : 'windows'}`);
        button.memberIds = cluster.ids.filter(id => content.has(id));
        button.querySelector('.overview-members').dataset.count = String(button.memberIds.length);
        renderMembers(button);
        button.revision = revision;
      }
      const h = (cluster.bottom - cluster.y) * view.z;
      button.hidden = x + w < 0 || y + h < 0 || x > width || y > height;
      if (button.hidden) continue;
      const bw = Math.min(width - 32, 320);
      const frameHeight = Math.min(280, 64 + cluster.count * 92, height - 180);
      const left = Math.max(16, Math.min(width - bw - 16, x - Math.max(0, bw - w) / 2));
      const preferred = Math.max(64, Math.min(height - frameHeight - 100, y - 38));
      const blocked = top => [...occupied, ...agents].some(r => left < r.right + 12 && left + bw > r.left - 12 && top < r.bottom + 12 && top + frameHeight > r.top - 12);
      let top = [0, -1, 1, -2, 2, -3, 3].map(i => preferred + i * (frameHeight + 16)).find(top => top >= 64 && top + frameHeight <= height - 100 && !blocked(top));
      if (top === undefined) { top = preferred; while (blocked(top)) top += frameHeight + 16; }
      // Crowded groups remain keyboard reachable in a scrolling stack.
      Object.assign(button.style, { transform: `translate3d(${left}px, ${top}px, 0)`, width: `${bw}px`, height: `${frameHeight}px` });
      occupied.push({ left, right: left + bw, top, bottom: top + frameHeight });
    }
  }
  back.onclick = () => {
    if (!bookmark) return;
    const target = bookmark; bookmark = null; working = target; wasFar = false;
    canvas.glideTo(target, 0); back.hidden = true; stage.focus({ preventScroll: true });
  };
  for (const overlay of [layer, summaries, back]) overlay.addEventListener('pointerdown', event => event.stopPropagation());
  stage.addEventListener('canvaspaint', paint); stage.addEventListener('boardchange', reset);
  stage.addEventListener('agentpaint', event => { agents = event.detail; });
  reset();
}
