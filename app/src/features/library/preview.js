// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { cardTitle } from '@aegis/domain/summary';
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const colour = value => /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : `var(--c-${['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple'].includes(value) ? value : 'gray'}, var(--card))`;
const typeName = card => ({ doc: 'Document', deck: 'Slides', dataset: 'CSV', title: 'Heading', todo: 'Checklist', coll: 'Group', frame: 'Frame', note: 'Note', canvas: 'Board', plot: 'Chart', sheet: 'Sheet' })[card.kind || card.type] || card.kind || card.type;
export function boardPreview(board) {
  const cards = (board?.cards ?? []).filter(c => !c.props?.hidden);
  if (!cards.length) return '<svg viewBox="0 0 300 172" role="img" aria-label="Empty board"><text x="150" y="90" text-anchor="middle" fill="var(--muted)" font-size="12">Empty board</text></svg>';
  const x = Math.min(...cards.map(c => c.x)), y = Math.min(...cards.map(c => c.y));
  const w = Math.max(100, ...cards.map(c => c.x + c.w - x)), h = Math.max(80, ...cards.map(c => c.y + c.h - y));
  const scale = Math.min(276 / w, 148 / h), ox = (300 - w * scale) / 2, oy = (172 - h * scale) / 2;
  // Use a fixed preview coordinate system so titles stay readable as the board grows.
  const shapes = cards.slice(0, 400).map(c => {
    const left = ox + (c.x - x) * scale, top = oy + (c.y - y) * scale, width = c.w * scale, height = c.h * scale;
    const title = cardTitle(c), kind = c.kind || c.type, data = ['plot', 'sheet', 'dataset', 'stats', 'progress'].includes(kind);
    const fill = c.color && !['plain', 'gray'].includes(c.color) ? colour(c.color) : 'var(--preview-window, #252a30)';
    let content = '';
    if (width > 32 && height > 28) {
      if (['sheet', 'dataset'].includes(kind)) {
        content = [1, 2, 3].map(i => `<path d="M${left + 6} ${top + 16 + i * (height - 22) / 4}h${width - 12}" stroke="var(--preview-line, #606a77)" stroke-width=".6"/>`).join('') + `<path d="M${left + width * .45} ${top + 17}v${height - 23}" stroke="var(--data)" stroke-width=".6"/>`;
      } else if (kind === 'plot') {
        const points = c.data?.series?.[0]?.points ?? [];
        const values = points.map(p => Number(p.y)).filter(Number.isFinite), max = Math.max(1, ...values), min = Math.min(0, ...values);
        if (values.length > 1) content = `<polyline points="${values.map((v, i) => `${left + 7 + i / (values.length - 1) * (width - 14)},${top + height - 7 - (v - min) / (max - min) * (height - 28)}`).join(' ')}" fill="none" stroke="var(--data)" stroke-width="1.2"/>`;
      } else if (kind === 'deck') {
        const slide = c.props?.slides?.[0];
        content = `<text x="${left + 7}" y="${top + Math.min(height - 8, 32)}" fill="var(--text)" font-size="10">${escapeHtml((slide?.title || title).slice(0, Math.floor(width / 6)))}</text>`;
      } else {
        content = [0, 1, 2].map(i => `<path d="M${left + 7} ${top + 22 + i * 6}h${Math.max(0, (width - 14) * (i === 2 ? .5 : .8))}" stroke="var(--preview-line, #606a77)" stroke-width=".8"/>`).join('');
      }
    }
    const label = width >= 65 ? (title || typeName(c)).slice(0, Math.max(4, Math.floor((width - 10) / 5.6))) : '';
    return `<g><title>${escapeHtml(typeName(c) + ': ' + title)}</title><rect x="${left}" y="${top}" width="${width}" height="${Math.max(3, height)}" rx="2" fill="${fill}" stroke="var(--preview-line, #606a77)" stroke-width=".65"/>${content}${label ? `<rect x="${left + 1}" y="${top + 1}" width="${width - 2}" height="14" rx="1" fill="${fill}"/><text x="${left + 5}" y="${top + 11}" font-size="10" font-weight="500" fill="${data ? 'var(--data)' : 'var(--text)'}">${escapeHtml(label)}</text>` : ''}</g>`;
  }).join('');
  return `<svg viewBox="0 0 300 172" role="img" aria-label="${escapeHtml(board?.name || 'Board')} preview: ${cards.length} windows" preserveAspectRatio="xMidYMid meet">${shapes}</svg>`;
}
