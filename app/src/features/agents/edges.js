import { createPopup } from '../../lib/ui/dropdown.js';

const SPACING = 48, LIMIT = 4;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Keep direction order while giving every spatial window its own reachable target.
export function mountAgentEdges({ edges, recover, label }) {
  const clusters = new Map();
  for (const side of ['left', 'right', 'top', 'bottom']) {
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.tabIndex = 0; trigger.className = 'agent-edge agent-edge-cluster'; trigger.hidden = true;
    const count = document.createElement('span'); count.className = 'agent-edge-count'; trigger.append(count); edges.append(trigger);
    const menu = document.createElement('div'); menu.className = 'agent-edge-chooser'; menu.setAttribute('aria-label', `Off-screen agents, ${side}`);
    const cluster = { trigger, count, menu, entries: [], signature: '' };
    const popup = createPopup({ trigger, menu, portal: true, onToggle(open) {
      if (!open) return;
      menu.replaceChildren();
      for (const entry of cluster.entries) {
        const button = document.createElement('button'); button.type = 'button'; button.role = 'menuitem'; button.tabIndex = -1;
        button.textContent = label(entry.window.agent); button.dataset.agentId = entry.window.agent.id;
        button.onclick = event => { popup.close(); recover(entry.window, event); };
        menu.append(button);
      }
      menu.querySelector('button')?.focus({ preventScroll: true });
    } });
    trigger.addEventListener('keydown', event => {
      if (!popup.opened && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); popup.open(event);
        if (['ArrowUp', 'End'].includes(event.key)) popup.key({ key: 'End', preventDefault() {} });
      }
    });
    cluster.popup = popup; clusters.set(side, cluster);
  }
  return function paint(entries, width, height) {
    const bounds = { left: [], right: [], top: [], bottom: [] };
    const halfX = Math.max(1, width / 2 - 32), halfY = Math.max(1, height / 2 - 76);
    for (const entry of entries) {
      const { dx, dy, window: w } = entry;
      const kx = halfX / Math.max(1, Math.abs(dx)), ky = halfY / Math.max(1, Math.abs(dy));
      const vertical = kx <= ky, k = Math.min(kx, ky);
      const side = vertical ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'top' : 'bottom';
      const x = width / 2 + dx * k, y = height / 2 + dy * k;
      w.edge.style.setProperty('--direction', `${Math.atan2(dy, dx)}rad`);
      bounds[side].push({ ...entry, along: vertical ? y : x });
    }
    for (const [side, group] of Object.entries(bounds)) {
      const cluster = clusters.get(side), vertical = side === 'left' || side === 'right', length = vertical ? height : width;
      // Reserve the corners so cues on adjacent edges cannot collide either.
      const inset = Math.min(vertical ? 124 : 80, length / 2), low = inset, high = length - inset;
      const fixed = side === 'left' ? 32 : side === 'right' ? width - 32 : side === 'top' ? 76 : height - 76;
      group.sort((a, b) => a.along - b.along || a.window.agent.created - b.window.agent.created || a.window.agent.id.localeCompare(b.window.agent.id));
      const crowded = group.length > Math.min(LIMIT, Math.floor((high - low) / SPACING) + 1);
      cluster.trigger.hidden = !crowded;
      const signature = crowded ? group.map(entry => entry.window.agent.id).join(',') : '';
      if (signature !== cluster.signature) cluster.popup.close();
      cluster.signature = signature; cluster.entries = group;
      const position = (button, along) => { button.style.transform = `translate(${(vertical ? fixed : along) - 22}px, ${(vertical ? along : fixed) - 22}px)`; };
      if (crowded) {
        for (const entry of group) entry.window.edge.hidden = true;
        cluster.count.textContent = String(group.length);
        cluster.trigger.setAttribute('aria-label', `${group.length} agents off-screen ${side}`);
        cluster.trigger.title = `Show ${group.length} agents`;
        position(cluster.trigger, clamp(group[Math.floor(group.length / 2)].along, low, high));
      } else {
        const positions = group.map(entry => clamp(entry.along, low, high));
        for (let i = 1; i < positions.length; i++) positions[i] = Math.max(positions[i], positions[i - 1] + SPACING);
        if (positions.at(-1) > high) {
          positions[positions.length - 1] = high;
          for (let i = positions.length - 2; i >= 0; i--) positions[i] = Math.min(positions[i], positions[i + 1] - SPACING);
        }
        group.forEach((entry, i) => position(entry.window.edge, positions[i]));
      }
    }
  };
}
