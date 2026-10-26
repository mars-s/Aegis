// Round 2 demo: measure mounted content only, outside the canvas paint and pan paths.
export function mountIntrinsicSizing({ getBoard, apply }) {
  const world = document.getElementById('world');
  const pending = new Set(), watched = new Map();
  let indexed, byId = new Map();
  const cards = () => {
    const board = getBoard();
    if (board?.cards !== indexed) { indexed = board?.cards; byId = new Map((indexed ?? []).map(card => [card.id, card])); }
    return byId;
  };
  let frame = 0;
  const queue = el => {
    if (!el?.isConnected) return;
    pending.add(el);
    if (!frame) frame = requestAnimationFrame(measure);
  };
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) queue(entry.target.closest('.card'));
  });
  function watch(el) {
    if (!el.matches('.card.object, .card.doc, .card.note, .card.todo')) return;
    if (!el.matches('.object') && !cards().get(el.dataset.id)?.props?.contentFit) return;
    const roots = el.matches('.object') ? [...el.querySelectorAll('.content > *')] : [...el.querySelectorAll('.doc-page, .body, .heading, .items, .add-item')];
    const previous = watched.get(el) ?? new Set();
    for (const node of previous) if (!roots.includes(node)) { observer.unobserve(node); previous.delete(node); }
    for (const node of roots) if (!previous.has(node)) { observer.observe(node); previous.add(node); }
    watched.set(el, previous);
    queue(el);
  }
  function measure() {
    frame = 0;
    const board = getBoard(); if (!board) { pending.clear(); return; }
    const byId = cards(), commands = [];
    for (const el of pending) {
      if (!el.isConnected) continue;
      const card = byId.get(el.dataset.id);
      if (!card || card.props?.fixedHeight || el.classList.contains('dragging')) continue;
      // Existing notes keep their editing behaviour unless content fitting was requested.
      if (card.type !== 'object' && !card.props?.contentFit) continue;
      const content = el.querySelector('.content, .doc-view');
      const roots = content ? [...content.children] : [...el.children].filter(node => node.matches('.badge, .heading, .body, .items, .add-item'));
      if (!roots.length || !el.offsetWidth) continue;
      const scale = el.getBoundingClientRect().width / el.offsetWidth;
      if (!scale) continue;
      const origin = (content ?? el).getBoundingClientRect();
      const css = getComputedStyle(content ?? el), px = name => parseFloat(css[name]) || 0;
      // Child bounds stay intrinsic even when the parent is a flex scroller. Diagram .fit uses
      // the laid-out graph height, and HTML uses its verified iframe height report.
      const bottom = Math.max(...roots.map(node => (node.getBoundingClientRect().bottom - origin.top) / scale + (parseFloat(getComputedStyle(node).marginBottom) || 0))) + (content?.scrollTop ?? 0);
      const strip = el.querySelector('.win-strip');
      const chrome = (strip?.offsetHeight ?? 0) + el.offsetHeight - el.clientHeight;
      const h = Math.max(card.type === 'object' ? 80 : 96, Math.min(1600, Math.ceil(chrome + bottom + px('paddingBottom'))));
      el.dataset.intrinsicHeight = String(h);
      if (Math.abs(h - card.h) > 1) commands.push({ op: 'measure', id: card.id, h, baseHeight: card.h });
    }
    pending.clear();
    if (commands.length) apply(commands);
  }
  const mutations = new MutationObserver(records => {
    for (const [el, roots] of watched) if (!el.isConnected) { for (const node of roots) observer.unobserve(node); watched.delete(el); }
    for (const record of records) {
      const el = record.target instanceof Element ? record.target.closest('.card') : record.target.parentElement?.closest('.card');
      if (el) watch(el);
      for (const node of record.addedNodes) if (node instanceof Element && node.matches('.card')) watch(node);
    }
  });
  mutations.observe(world, { childList: true, subtree: true, characterData: true });
  document.fonts.ready.then(() => { for (const el of watched.keys()) queue(el); });
}
