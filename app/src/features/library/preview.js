// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const colour = value => /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : `var(--c-${['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple'].includes(value) ? value : 'gray'}, var(--hover))`;
export function boardPreview(board) {
  const cards = board?.cards ?? [];
  if (!cards.length) return '<svg viewBox="0 0 260 150" aria-label="Empty board"><text x="130" y="80" text-anchor="middle" fill="currentColor" font-size="12">Empty board</text></svg>';
  const x = Math.min(...cards.map(c => c.x)), y = Math.min(...cards.map(c => c.y));
  const w = Math.max(100, ...cards.map(c => c.x + c.w - x)), h = Math.max(80, ...cards.map(c => c.y + c.h - y));
  return `<svg viewBox="${x - 20} ${y - 20} ${w + 40} ${h + 40}" aria-label="Board preview" preserveAspectRatio="xMidYMid meet">${cards.map(c => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.type === 'title' ? Math.min(c.h, 24) : c.h}" rx="4" fill="${colour(c.color)}" stroke="var(--line-strong, #999)" stroke-width="2"${c.rot ? ` transform="rotate(${c.rot} ${c.x + c.w / 2} ${c.y + c.h / 2})"` : ''}/>`).join('')}</svg>`;
}
