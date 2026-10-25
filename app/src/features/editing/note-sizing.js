// Measure only edited or newly mounted notes, never every card during a canvas frame.
export function mountNoteSizing({ canvas, apply }) {
  const world = document.getElementById('world'), stage = document.getElementById('stage');
  let indexed, cardsById = new Map();
  const cardFor = el => { if (indexed !== canvas.board?.cards) { indexed = canvas.board?.cards; cardsById = new Map((indexed ?? []).map(c => [c.id, c])); } return cardsById.get(el.dataset.id); };
  function size(el, save = false) {
    const card = cardFor(el); if (!card || !['note', 'todo'].includes(card.type)) return;
    el.dataset.fixedHeight = String(!!card.props?.fixedHeight);
    if (card.props?.fixedHeight) { el.style.height = `${card.h}px`; return; }
    const style = getComputedStyle(el), vertical = n => parseFloat(n) || 0;
    const content = [...el.children].filter(c => c.matches('.heading, .body, .items, .add-item')).reduce((sum, child) => { const css = getComputedStyle(child); return sum + Math.max(child.scrollHeight, child.offsetHeight) + vertical(css.marginTop) + vertical(css.marginBottom); }, 0);
    const height = Math.ceil(Math.max(card.props?.autoHeightMin ?? card.h, content + vertical(style.paddingTop) + vertical(style.paddingBottom) + vertical(style.borderTopWidth) + vertical(style.borderBottomWidth)));
    el.style.height = `${height}px`;
    if (save && height !== card.h) apply([{ op: 'update', id: card.id, set: { h: height, ...(!card.props?.autoHeightMin ? { props: { autoHeightMin: card.h } } : {}) } }]);
  }
  function saveInput(e) {
    const el = e.target.closest('.card.note, .card.todo'); if (!el) return;
    size(el);
    const card = cardFor(el); if (!card) return;
    const set = {};
    if (e.target.matches('.body, .heading, .badge')) set[e.target.matches('.heading') ? 'heading' : e.target.matches('.badge') ? 'badge' : 'text'] = e.target.innerText;
    else if (e.target.matches('.todo-item span')) { const index = [...el.querySelectorAll('.todo-item span')].indexOf(e.target); set.items = card.items.map((item, i) => i === index ? { ...item, text: e.target.innerText } : item); }
    if (!card.props?.fixedHeight) { const height = parseFloat(el.style.height); if (height !== card.h) { set.h = height; if (card.props?.autoHeightMin == null) set.props = { autoHeightMin: card.h }; } }
    for (const key of Object.keys(set)) if (JSON.stringify(set[key]) === JSON.stringify(card[key])) delete set[key];
    if (Object.keys(set).length) apply([{ op: 'update', id: card.id, set }]);
  }
  stage.addEventListener('input', saveInput);
  stage.addEventListener('blur', e => {
    if (!e.target.matches('[contenteditable]') || !e.target.closest('.card.note, .card.todo')) return;
    // Plaintext editing may contain browser-created line breaks. Save the visible lines.
    e.stopPropagation(); saveInput(e);
  }, true);
  const observer = new MutationObserver(records => {
    for (const record of records) for (const el of record.addedNodes) if (el.nodeType === 1 && el.matches('.card.note, .card.todo')) {
      for (const scroller of el.querySelectorAll('.body, .items')) scroller.addEventListener('wheel', e => { if (el.dataset.fixedHeight === 'true' && scroller.scrollHeight > scroller.clientHeight) e.stopPropagation(); }, { passive: true });
      const card = cardFor(el); el.dataset.fixedHeight = String(!!card?.props?.fixedHeight);
      // Mounting happens inside paint. Measure once after that paint has placed the card.
      requestAnimationFrame(() => { if (el.isConnected) size(el, true); });
    }
  }); observer.observe(world, { childList: true });
}
