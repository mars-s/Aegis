import { freeAgentRect, WINDOW_WIDTH, COLLAPSED_HEIGHT } from './placement.js';

// PM 3.6: measure and find free space on hover or focus, never on the canvas paint path.
export function mountAgentIdentity({ canvas, stage, overlay, edges, windows, occupied, label }) {
  const tip = document.createElement('div'); tip.className = 'agent-identity'; tip.id = 'agentIdentity'; tip.role = 'tooltip'; tip.hidden = true;
  const name = document.createElement('p'), status = document.createElement('p'); tip.append(name, status); edges.append(tip);
  let active = null, view = null;
  function hide() {
    active?.el.querySelector('.agent-window-toggle').removeAttribute('aria-describedby');
    active = null; tip.hidden = true;
  }
  function show(w) {
    if (stage.dataset.zoomTier && stage.dataset.zoomTier !== 'detail') return hide();
    if (!w || !w.collapsed || w.closed || w.el.hidden || canvas.view.z >= 12 / 13) return hide();
    if (active === w) return;
    hide();
    name.textContent = label(w.agent); status.textContent = w.agent.error || w.agent.status || 'Ready';
    tip.hidden = false;
    const z = canvas.view.z, width = tip.offsetWidth / z, height = tip.offsetHeight / z, area = canvas.viewportRect();
    const neighbours = [...windows.values()].filter(n => !n.el.hidden).map(n => ({ x: n.x, y: n.y, w: WINDOW_WIDTH, h: n.height ?? COLLAPSED_HEIGHT }));
    const p = freeAgentRect(occupied(), neighbours, { x: w.x, y: w.y + COLLAPSED_HEIGHT + 8 / z }, height, null, area, width);
    // A full canvas can lack a free label-sized gap. Keep the work unobscured.
    if (p.x < area.x || p.y < area.y || p.x + width > area.x + area.w || p.y + height > area.y + area.h) { tip.hidden = true; return; }
    const screen = canvas.worldToScreen(p.x, p.y);
    tip.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
    active = w; view = { ...canvas.view };
    w.el.querySelector('.agent-window-toggle').setAttribute('aria-describedby', tip.id);
  }
  const windowAt = target => windows.get(target.closest('.agent-window')?.dataset.agentId);
  overlay.addEventListener('pointerover', e => show(windowAt(e.target)));
  overlay.addEventListener('pointerout', e => {
    if (active && !active.el.contains(e.relatedTarget) && !active.el.contains(document.activeElement)) hide();
  });
  overlay.addEventListener('focusin', e => show(windowAt(e.target)));
  overlay.addEventListener('focusout', () => queueMicrotask(() => {
    if (active && !active.el.contains(document.activeElement) && !active.el.matches(':hover')) hide();
  }));
  overlay.addEventListener('click', hide);
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape' && active) { hide(); e.preventDefault(); e.stopPropagation(); } });
  stage.addEventListener('boardchange', hide);
  stage.addEventListener('canvaspaint', () => {
    if (active && (canvas.view.x !== view.x || canvas.view.y !== view.y || canvas.view.z !== view.z)) hide();
  });
  addEventListener('resize', hide);
}
