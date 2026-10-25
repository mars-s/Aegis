// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { node, button, field, dialog } from './dom.js';
import { mediaContext, report } from './context.js';
export function spotifyOf(value) {
  const uri = /^spotify:(track|album|playlist|episode|show|artist):([a-z0-9]{10,40})$/i.exec(String(value).trim());
  if (uri) return { kind: uri[1].toLowerCase(), sid: uri[2] };
  try {
    const url = new URL(value);
    if (!['http:','https:'].includes(url.protocol) || url.hostname !== 'open.spotify.com') return null;
    const m = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([a-z0-9]{10,40})\/?$/i.exec(url.pathname);
    return m ? { kind: m[1].toLowerCase(), sid: m[2] } : null;
  } catch { return null; }
}
export function normaliseLink(value) {
  const s = spotifyOf(value); if (s) return `https://open.spotify.com/${s.kind}/${s.sid}`;
  const u = new URL(/^[a-z][\w+.-]*:/i.test(value) ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Use an HTTP or HTTPS link'); return u.href;
}
const spotifyHeight = kind => (['track','episode'].includes(kind) ? 152 : 352) + 76;
const pending = new Set();
function loadPreview(c, api) {
  const ctx = mediaContext(), boardId = api.board.id, key = `${boardId}:${c.id}:${c.url}`;
  if (!ctx || pending.has(key) || c.props?.previewFor === c.url || !c.url) return;
  pending.add(key);
  ctx.host.get('/link-preview?url=' + encodeURIComponent(c.url)).then(preview => {
    const current = api.board.cards.find(v => v.id === c.id);
    if (api.board.id !== boardId || current?.url !== c.url) return;
    const sp = spotifyOf(c.url), h = sp ? spotifyHeight(sp.kind) : preview.image ? 270 : 130;
    api.apply([{ op: 'update', id: c.id, set: { ...(c.h <= 76 || c.h === 130 || sp && c.h < spotifyHeight(sp.kind) ? { h } : {}), props: { preview, previewFor: c.url, previewError: null } } }]);
  }).catch(error => {
    if (api.board.id === boardId && api.board.cards.find(v => v.id === c.id)?.url === c.url) api.setProps(c.id, { previewFor: c.url, previewError: error.message });
  }).finally(() => pending.delete(key));
}
export function editLink(c, api) {
  const boardId = api.board.id, d = dialog('Edit link'), url = field('Link address', 'url', c.url || '', d), title = field('Title', 'text', c.props?.title || c.text || c.props?.preview?.title || '', d), desc = field('Description', 'text', c.props?.description ?? c.props?.preview?.description ?? '', d);
  button('Save link', () => {
    try {
      const value = normaliseLink(url.value.trim()), sp = spotifyOf(value), changed = value !== c.url;
      if (api.board.id === boardId) api.apply([{ op: 'update', id: c.id, set: { url: value, ...(changed && sp ? { h: spotifyHeight(sp.kind), w: 340 } : {}), props: { title: changed && title.value === (c.props?.title || c.text || c.props?.preview?.title || '') ? '' : title.value, description: changed && desc.value === (c.props?.description ?? c.props?.preview?.description ?? '') ? '' : desc.value, ...(changed ? { preview: null, previewFor: null, previewError: null } : {}) } } }]); d.close();
    } catch (e) { url.setCustomValidity(e.message); url.reportValidity(); }
  }, d); button('Cancel', () => d.close(), d); url.focus();
}
export function renderLink(el, c, api) {
  if (!c.url) {
    const input = node('input', 'url-input'); input.placeholder = 'Paste a link'; input.setAttribute('aria-label', 'Link address'); el.append(input);
    input.onkeydown = e => { e.stopPropagation(); if (e.key !== 'Enter') return;
      try { const url = normaliseLink(input.value.trim()), sp = spotifyOf(url); api.apply([{ op: 'update', id: c.id, set: { url, h: sp ? spotifyHeight(sp.kind) : 130, ...(sp ? { w: 340 } : {}) } }]); } catch (error) { report(error); }
    }; return;
  }
  const s = spotifyOf(c.url), p = c.props?.preview || {}, title = node('div', 'media-head');
  if (p.favicon && !s) { const icon = node('img', 'link-favicon'); icon.src = p.favicon; icon.alt = ''; icon.referrerPolicy = 'no-referrer'; icon.onerror = () => icon.remove(); title.append(icon); }
  title.append(node('strong', '', c.props?.title || c.text || p.title || (s ? 'Spotify' : new URL(c.url).hostname))); el.append(title);
  if (s) {
    el.classList.add('spotify-embed'); const frame = node('iframe'); frame.src = `https://open.spotify.com/embed/${s.kind}/${s.sid}`; frame.title = 'Spotify player'; frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'; frame.style.minHeight = (['track','episode'].includes(s.kind) ? 152 : 352) + 'px'; frame.loading = 'lazy'; frame.referrerPolicy = 'strict-origin-when-cross-origin'; el.append(frame);
  } else {
    if (p.image) { const image = node('img', 'link-image'); image.src = p.image; image.alt = ''; image.referrerPolicy = 'no-referrer'; image.onerror = () => image.remove(); el.append(image); }
    const desc = c.props?.description ?? p.description; if (desc) el.append(node('p', 'link-description', desc));
    const a = node('a', 'link-address', c.url); a.href = c.url; a.onclick = e => { e.preventDefault(); api.openUrl(c.url); }; el.append(a);
  }
  const controls = node('div', 'media-actions'); button('Open link', () => api.openUrl(c.url), controls); button('Edit link', () => editLink(c, api), controls);
  if (c.props?.previewError) { const retry = button('Retry preview', () => api.setProps(c.id, { previewFor: null, previewError: null }), controls); retry.title = c.props.previewError; }
  el.append(controls); queueMicrotask(() => loadPreview(c, api));
}
