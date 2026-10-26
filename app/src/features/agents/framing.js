import { cardRect } from './placement.js';
import { displayRotation } from '../settings/preferences.js';

// The island reserves its measured height, so a request never frames work behind the conversation.
export function frameAboveIsland(canvas, island, ids, instant = true) {
  const cards = canvas.board?.cards.filter(c => ids.includes(c.id)).map(c => cardRect(c, displayRotation(c)));
  if (!cards?.length) return;
  const area = canvas.viewportRect(), start = canvas.worldToScreen(area.x, area.y), scale = canvas.view.z;
  const rect = island.getBoundingClientRect(), height = island.querySelector('.island-morph').offsetHeight;
  const bottom = island.querySelector('#composer.open') ? rect.bottom - height - 24 : start.y + area.h * scale;
  const width = area.w * scale, room = Math.max(80, Math.min(start.y + area.h * scale, bottom) - start.y);
  const left = Math.min(...cards.map(c => c.x)), top = Math.min(...cards.map(c => c.y));
  const right = Math.max(...cards.map(c => c.x + c.w)), end = Math.max(...cards.map(c => c.y + c.h));
  const z = Math.max(.05, Math.min(1, (width - 48) / Math.max(1, right - left), (room - 48) / Math.max(1, end - top)));
  const view = { x: start.x + width / 2 - (left + right) / 2 * z, y: start.y + room / 2 - (top + end) / 2 * z, z };
  if (instant) canvas.setView(view); else canvas.glideTo(view, 240);
}

export function requestResult(agent) {
  const entry = agent?.history?.at(-1);
  if (!entry?.finished || entry.undone || !entry.changes.length) return null;
  const count = action => entry.changes.filter(c => c.actions.includes(action)).length;
  const created = count('Created'), deleted = count('Deleted');
  const updated = entry.changes.filter(c => !c.actions.includes('Created') && !c.actions.includes('Deleted')).length;
  const parts = [];
  if (created) parts.push(`Created ${created} window${created === 1 ? '' : 's'}`);
  if (updated) parts.push(`Updated ${updated}`);
  if (deleted) parts.push(`Deleted ${deleted}`);
  return { entry, label: parts.join(' · '), ids: entry.changes.filter(c => !c.actions.includes('Deleted')).map(c => c.id) };
}
