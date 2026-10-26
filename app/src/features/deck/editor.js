import { deckSlides, slideIndex, slideHTML, escapeHTML, newSlide, observeSlideFits } from './slides.js';
import { openSide, centreCardInLeft } from '../docs/side.js';
import { downloadOriginal } from '../imports/assets.js';
import { createMenu } from '../../lib/ui/menu.js';
import '../../lib/ui/ribbon.css';

let active = null;
let keyboardInput = false;
const reducedMotion = () => document.body.classList.contains('motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches;
export const findDeck = (ctx, id) => ctx.canvas.board.cards.find(card => card.id === id && card.type === 'deck');
// Resolved source data changes independently of a person's slide edits.
const savedContent = props => JSON.stringify({ current: props.current, slides: props.slides?.map(slide => {
  if (!slide.chart?.sourceId) return slide;
  const { spec, sourceStatus, snapshotSourceId, ...chart } = slide.chart;
  return { ...slide, chart };
}) });

// The deck editor sits in the shared side editor panel.
export function openDeckPanel(card, ctx, { viaKey = false, onClose }) {
  // The shared side editor (features/docs/side.js) owns the panel, its motion, Full width and Escape.
  const shell = openSide({ title: card.text || 'Untitled deck', kind: 'Slides', card, ctx, keyboard: viaKey });
  shell.el.classList.add('deck-panel');
  shell.el.addEventListener('side-editor-close', () => onClose(), { once: true });
  centreCardInLeft(card, ctx, viaKey);
  return { panel: shell.el, body: shell.body, close: instant => shell.close({ keyboard: !!instant }) };
}

export function openDeck(card, ctx, { viaKey = keyboardInput } = {}) {
  if (!card || card.type !== 'deck') return;
  const boardId = ctx.canvas.board.id;
  if (active?.id === card.id && active.boardId === boardId) { active.focus(); return; }
  let slides = deckSlides(card), current = slideIndex(card.props?.current, slides.length);
  let dirty = false, saving = false, version = 0, timer, closed = false;
  let pending = Promise.resolve(), observed = JSON.stringify(card.props ?? {});
  let stopFitting = () => {};
  let overview = false, slideMotion = null, closePresentation = () => {};
  const shell = openDeckPanel(card, ctx, { viaKey, onClose: dispose });
  const icon = d => `<svg viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
  // A Keynote-style ribbon: slide, layout, arrange, present.
  shell.body.innerHTML = `<div class="office-ribbon deck-ribbon" role="toolbar" aria-label="Slide tools">
    <div class="ribbon-group"><button type="button" class="ribbon-btn" data-new title="New slide" aria-label="New slide">${icon('<rect x="2" y="3.5" width="9" height="7" rx="1"/><path d="M13 9v5M10.5 11.5h5"/>')}</button><button type="button" class="ribbon-btn" data-dup title="Duplicate slide" aria-label="Duplicate slide">${icon('<rect x="5" y="5" width="9" height="7" rx="1"/><path d="M11 3H3a1 1 0 0 0-1 1v6"/>')}</button></div>
    <div class="ribbon-group"><span class="ribbon-label">Layout</span><button type="button" class="ribbon-select" data-layout aria-haspopup="menu" title="Slide layout"><span data-layout-label>Title</span>${icon('<path d="m5 6 3 3 3-3"/>')}</button></div>
    <div class="ribbon-group"><button type="button" class="ribbon-select" data-background aria-label="Slide background" aria-haspopup="menu"><span data-background-label>Typography</span>${icon('<path d="m5 6 3 3 3-3"/>')}</button></div>
    <div class="ribbon-group"><button type="button" class="ribbon-select" data-relationship aria-label="Idea arrangement" aria-haspopup="menu"><span data-relationship-label>Columns</span>${icon('<path d="m5 6 3 3 3-3"/>')}</button></div>
    <div class="ribbon-group"><button type="button" class="ribbon-btn" data-up title="Move slide up" aria-label="Move slide up">${icon('<path d="M8 13V3M4 7l4-4 4 4"/>')}</button><button type="button" class="ribbon-btn" data-down title="Move slide down" aria-label="Move slide down">${icon('<path d="M8 3v10M4 9l4 4 4-4"/>')}</button><button type="button" class="ribbon-btn" data-del title="Delete slide" aria-label="Delete current slide">${icon('<path d="M2.5 4h11M6 4V2h4v2M4 4l.5 10h7L12 4"/>')}</button></div>
    <div class="ribbon-group ribbon-end"><button type="button" class="ribbon-btn" data-overview aria-label="Slide overview" aria-pressed="false" title="Scroll through all slides">${icon('<rect x="2" y="2" width="12" height="4" rx=".5"/><rect x="2" y="9" width="12" height="4" rx=".5"/>')}<span>Overview</span></button><button type="button" class="ribbon-select ribbon-present" data-present title="Present from the current slide">${icon('<path d="M5 3.5v9l7.5-4.5z"/>')}<span>Present</span></button></div>
  </div><div class="deck-ed"><div class="deck-stage" tabindex="0" aria-label="Active slide"></div><div class="deck-film" role="tablist" aria-label="Slide strip"></div></div>`;
  const { panel } = shell, stage = panel.querySelector('.deck-stage'), film = panel.querySelector('.deck-film');
  // item 14: retain the original file alongside the editable slide deck.
  if (card.props?.import?.original) {
    const source = document.createElement('a'); source.className = 'deck-source'; source.textContent = 'Original file';
    source.href = ctx.host.assetUrl(card.props.import.original); source.download = card.props.import.name || 'Presentation';
    source.onclick = event => { event.preventDefault(); void downloadOriginal(ctx, card.props.import); };
    panel.querySelector('.side-editor-tools').prepend(source);
  }
  // end item 14
  const status = panel.querySelector('[data-saved]');
  const boardStage = document.getElementById('stage');
  const state = { id: card.id, boardId, close: shell.close, focus: () => stage.focus({ preventScroll: true }) };
  active = state;

  function schedule() {
    dirty = true; version++; status.textContent = 'Saving…';
    clearTimeout(timer); timer = setTimeout(save, 350);
  }
  function save() {
    clearTimeout(timer);
    if (!dirty) return pending;
    dirty = false; saving = true;
    const revision = version, props = structuredClone({ slides, current }), snapshot = savedContent(props);
    pending = pending.catch(() => {}).then(async () => {
      const command = { op: 'update', id: card.id, set: { props } };
      if (ctx.canvas.board.id === boardId) {
        if (!findDeck(ctx, card.id)) throw new Error('This deck was deleted');
        ctx.apply([command]);
      } else await ctx.host.post(`/boards/${boardId}/batch`, { commands: [command] });
      // apply is optimistic. Saved means the host has stored the exact slide snapshot.
      for (let attempt = 0; attempt < 40; attempt++) {
        const stored = (await ctx.host.get(`/boards/${boardId}`)).cards.find(c => c.id === card.id);
        if (!stored) throw new Error('This deck was deleted');
        if (savedContent(stored.props || {}) === snapshot) {
          observed = JSON.stringify(stored.props);
          if (version === revision) { saving = false; status.textContent = 'Saved'; }
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      throw new Error('The host has not confirmed the save');
    }).catch(error => {
      if (version === revision) { saving = false; dirty = true; status.textContent = 'Not saved. Edit to retry.'; }
      ctx.toast(`Deck save failed: ${error.message}`);
    });
    return pending;
  }

  function render() {
    slideMotion?.cancel();
    stopFitting();
    stage.innerHTML = slides.length ? slides.map((slide, i) => `<section class="deck-slide-wrap" data-i="${i}" role="tabpanel" aria-label="Slide ${i + 1}"><div class="deck-slide-meta"><span>Slide ${i + 1}</span><div class="deck-slide-actions"><button type="button" data-move="-1" aria-label="Move slide ${i + 1} up" ${i === 0 ? 'disabled' : ''}>${icon('<path d="M8 13V3M4 7l4-4 4 4"/>')}</button><button type="button" data-move="1" aria-label="Move slide ${i + 1} down" ${i === slides.length - 1 ? 'disabled' : ''}>${icon('<path d="M8 3v10M4 9l4 4 4-4"/>')}</button><button type="button" data-delete aria-label="Delete slide ${i + 1}">${icon('<path d="M2.5 4h11M6 4V2h4v2M4 4l.5 10h7L12 4"/>')}</button></div></div>${slideHTML(slide, true, i + 1)}</section>`).join('') : '<p class="deck-empty">Add your first slide below.</p>';
    film.innerHTML = slides.map((slide, i) => `<button class="deck-film-item" type="button" role="tab" aria-label="Go to slide ${i + 1}" data-i="${i}" aria-keyshortcuts="ArrowLeft ArrowRight Home End Alt+ArrowUp Alt+ArrowDown Delete">${slideHTML(slide)}<span class="deck-film-caption"><span class="deck-film-number">${i + 1}</span><span class="deck-film-title">${escapeHTML(slide.title || 'Untitled slide')}</span></span></button>`).join('') + '<button class="deck-film-add" type="button">Add slide</button>';
    stopFitting = observeSlideFits(panel, { deckId: card.id, onChartSource: (slideId, sourceId) => {
      const slide = slides.find(slide => slide.id === slideId);
      if (slide) { slide.chart = { sourceId }; schedule(); render(); }
    } });
    mark(current, false);
  }
  function mark(index, persist = true) {
    const next = slideIndex(index, slides.length), changed = next !== current;
    current = next; paintRibbon();
    stage.querySelectorAll('.deck-slide-wrap').forEach((wrap, i) => {
      wrap.hidden = !overview && i !== current;
      if (overview) wrap.removeAttribute('role');
      else wrap.setAttribute('role', 'tabpanel');
    });
    film.querySelectorAll('.deck-film-item').forEach((button, i) => {
      button.classList.toggle('on', i === current);
      button.setAttribute('aria-selected', String(i === current));
      button.tabIndex = i === current ? 0 : -1;
    });
    const thumb = film.querySelector(`.deck-film-item[data-i="${current}"]`);
    if (thumb) {
      const left = thumb.offsetLeft - film.offsetLeft;
      if (left < film.scrollLeft) film.scrollLeft = left;
      else if (left + thumb.offsetWidth > film.scrollLeft + film.clientWidth) film.scrollLeft = left + thumb.offsetWidth - film.clientWidth;
    }
    if (changed && persist) schedule();
  }
  // Cancel an interrupted change immediately. Keyboard navigation stays instant.
  function transitionSlide(frame, direction, instant = keyboardInput) {
    const continuing = slideMotion?.effect?.target === frame;
    const style = continuing ? getComputedStyle(frame) : null;
    const from = style ? { opacity: style.opacity, transform: style.transform } : { opacity: .86, transform: `translateX(${direction * 6}px)` };
    slideMotion?.cancel(); slideMotion = null;
    if (!frame || instant || reducedMotion()) return;
    slideMotion = frame.animate([from, { opacity: 1, transform: 'translateX(0)' }], { duration: 160, easing: getComputedStyle(frame).getPropertyValue('--ease-out').trim() });
  }
  function jump(index) {
    const previous = current;
    mark(index);
    const wrap = stage.querySelector(`.deck-slide-wrap[data-i="${current}"]`);
    if (overview && wrap) stage.scrollTo({ top: stage.scrollTop + wrap.getBoundingClientRect().top - stage.getBoundingClientRect().top - 24, behavior: 'instant' });
    else if (wrap && previous !== current) transitionSlide(wrap.querySelector('.deck-fit'), Math.sign(current - previous));
  }
  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= slides.length) return;
    const [slide] = slides.splice(index, 1); slides.splice(target, 0, slide);
    current = target; schedule(); render(); jump(target);
    film.querySelector(`.deck-film-item[data-i="${target}"]`)?.focus({ preventScroll: true });
  }
  function remove(index) {
    slides.splice(index, 1); current = slideIndex(index, slides.length);
    schedule(); render(); jump(current);
    (film.querySelector(`.deck-film-item[data-i="${current}"]`) || film.querySelector('.deck-film-add')).focus({ preventScroll: true });
  }
  let scrollFrame = 0;
  stage.addEventListener('scroll', () => {
    if (!overview || scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (!overview) return;
      const y = stage.getBoundingClientRect().top + 24;
      let nearest = current, distance = Infinity;
      stage.querySelectorAll('.deck-slide-wrap').forEach(wrap => {
        const d = Math.abs(wrap.getBoundingClientRect().top - y);
        if (d < distance) { distance = d; nearest = Number(wrap.dataset.i); }
      });
      mark(nearest);
    });
  }, { passive: true });
  stage.addEventListener('input', event => {
    const field = event.target.closest('[data-k]'), wrap = field?.closest('.deck-slide-wrap');
    if (!wrap) return;
    const index = Number(wrap.dataset.i), key = field.dataset.k;
    if (field.hasAttribute('data-idea')) {
      const ideas = String(slides[index].body || '').split('\n');
      ideas[Number(field.dataset.idea)] = field.textContent.replace(/\n/g, ' ');
      slides[index].body = ideas.join('\n');
    } else slides[index][key] = field.textContent;
    mark(index); schedule();
    const thumb = film.querySelector(`.deck-film-item[data-i="${index}"] [data-k="${key}"]${field.hasAttribute('data-idea') ? `[data-idea="${field.dataset.idea}"]` : ''}`);
    if (thumb) thumb.textContent = field.textContent;
    if (key === 'title') film.querySelector(`.deck-film-item[data-i="${index}"] .deck-film-title`).textContent = field.textContent || 'Untitled slide';
  });
  stage.addEventListener('focusin', event => {
    const wrap = event.target.closest('.deck-slide-wrap'); if (wrap) mark(Number(wrap.dataset.i));
  });
  stage.addEventListener('click', event => {
    const wrap = event.target.closest('.deck-slide-wrap');
    if (!wrap) return;
    const index = Number(wrap.dataset.i), button = event.target.closest('button');
    if (button?.hasAttribute('data-delete')) remove(index);
    else if (button?.hasAttribute('data-move')) move(index, Number(button.dataset.move));
  });
  film.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.classList.contains('deck-film-add')) {
      slides.push(newSlide()); current = slides.length - 1; schedule(); render(); jump(current);
      stage.querySelector(`.deck-slide-wrap[data-i="${current}"] [data-k="title"]`)?.focus({ preventScroll: true });
    } else if (button?.classList.contains('deck-film-item')) jump(Number(button.dataset.i));
  });
  function keys(event) {
    if (document.querySelector('.deck-present')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); shell.close(true); return; }
    if (!panel.contains(event.target)) return;
    if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const index = Number(event.target.closest('[data-i]')?.dataset.i ?? current);
      move(index, event.key === 'ArrowUp' ? -1 : 1); return;
    }
    const thumb = event.target.closest('.deck-film-item');
    if (thumb && ['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); remove(Number(thumb.dataset.i)); return; }
    if (thumb && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : current + (event.key === 'ArrowLeft' ? -1 : 1);
      jump(next); film.querySelector(`.deck-film-item[data-i="${current}"]`)?.focus({ preventScroll: true });
    }
  }
  // Ribbon actions work on the current slide.
  const ribbon = panel.querySelector('.deck-ribbon');
  const LAYOUTS = { title: 'Title', text: 'Title and text', chart: 'Chart', three: 'Three ideas', image: 'Image' };
  ribbon.querySelector('[data-new]').onclick = () => { slides.splice(current + 1, 0, newSlide()); current++; schedule(); render(); jump(current); stage.querySelector(`.deck-slide-wrap[data-i="${current}"] [data-k="title"]`)?.focus({ preventScroll: true }); };
  ribbon.querySelector('[data-dup]').onclick = () => { if (!slides[current]) return; slides.splice(current + 1, 0, { ...structuredClone(slides[current]), id: crypto.randomUUID() }); current++; schedule(); render(); jump(current); };
  ribbon.querySelector('[data-up]').onclick = () => move(current, -1);
  ribbon.querySelector('[data-down]').onclick = () => move(current, 1);
  ribbon.querySelector('[data-del]').onclick = () => { if (slides.length) remove(current); };
  const layoutButton = ribbon.querySelector('[data-layout]');
  const layoutMenu = createMenu({ trigger: layoutButton, label: 'Slide layout', items: () => Object.entries(LAYOUTS).map(([layout, title]) => ({ title, checked: (slides[current]?.layout ?? 'text') === layout,
    run: () => { if (!slides[current]) return; slides[current].layout = layout; schedule(); render(); jump(current); } })) });
  const backgroundButton = ribbon.querySelector('[data-background]');
  const backgroundMenu = createMenu({ trigger: backgroundButton, label: 'Slide background', items: () => [['plain', 'Typography'], ['sci-fi-wave', 'Sci-fi wave']].map(([background, title]) => ({ title, checked: (slides[current]?.background ?? 'sci-fi-wave') === background,
    run: () => { if (!slides[current]) return; slides[current].background = background; schedule(); render(); jump(current); } })) });
  const relationshipButton = ribbon.querySelector('[data-relationship]');
  const relationshipMenu = createMenu({ trigger: relationshipButton, label: 'Idea arrangement', items: () => [['columns', 'Independent columns'], ['overlap', 'Overlapping circles']].map(([relationship, title]) => ({ title, checked: (slides[current]?.relationship ?? 'columns') === relationship,
    run: () => { if (!slides[current]) return; slides[current].relationship = relationship; schedule(); render(); jump(current); } })) });
  ribbon.querySelector('[data-overview]').onclick = () => {
    overview = !overview;
    stage.classList.toggle('is-overview', overview);
    stage.setAttribute('aria-label', overview ? 'Slide overview. Scroll through all slides.' : 'Active slide');
    ribbon.querySelector('[data-overview]').setAttribute('aria-pressed', String(overview));
    mark(current, false); jump(current);
    if (!overview) stage.scrollTop = 0;
  };
  ribbon.querySelector('[data-present]').onclick = () => present();
  function paintRibbon() {
    const slide = slides[current];
    ribbon.querySelector('[data-layout-label]').textContent = LAYOUTS[slide?.layout] ?? 'Title and text';
    backgroundButton.hidden = slide?.layout !== 'title';
    ribbon.querySelector('[data-background-label]').textContent = slide?.background === 'plain' ? 'Typography' : 'Sci-fi wave';
    relationshipButton.hidden = slide?.layout !== 'three';
    ribbon.querySelector('[data-relationship-label]').textContent = slide?.relationship === 'overlap' ? 'Circles' : 'Columns';
    ribbon.querySelector('[data-up]').disabled = !slide || current === 0;
    ribbon.querySelector('[data-down]').disabled = !slide || current >= slides.length - 1;
    for (const key of ['dup', 'del', 'layout', 'present']) ribbon.querySelector(`[data-${key}]`).disabled = !slide;
  }
  // Present: the current slide fills the screen; arrows, space and clicks advance, Escape returns.
  function present() {
    if (!slides.length) return;
    const show = document.createElement('div'); show.className = 'deck-present'; show.tabIndex = 0; show.setAttribute('role', 'dialog'); show.setAttribute('aria-label', 'Presenting slides');
    let at = current;
    const paint = () => { show.innerHTML = `${slideHTML(slides[at])}<span class="deck-present-count">${at + 1} / ${slides.length}</span>`; stopShow(); stopShow = observeSlideFits(show); };
    let stopShow = () => {};
    const step = d => { const next = Math.max(0, Math.min(slides.length - 1, at + d)); if (next !== at) { at = next; paint(); transitionSlide(show.querySelector('.deck-fit'), d); } };
    // Present owns the keyboard while open, ahead of the editor's own Escape and the board shortcuts.
    const onKey = e => {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.key === 'Escape') exit();
      else if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) step(1);
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) step(-1);
    };
    const exit = () => { removeEventListener('keydown', onKey, true); stopShow(); slideMotion?.cancel(); show.remove(); closePresentation = () => {}; if (!closed) { jump(at); stage.focus({ preventScroll: true }); } };
    closePresentation = exit;
    addEventListener('keydown', onKey, true);
    show.addEventListener('click', e => step(e.clientX < innerWidth / 3 ? -1 : 1));
    document.body.append(show); paint(); transitionSlide(show.querySelector('.deck-fit'), 0); show.focus();
  }
  shell.panel.addEventListener('side-editor-close', () => { layoutMenu.destroy(); backgroundMenu.destroy(); relationshipMenu.destroy(); }, { once: true });
  function changed() {
    if (ctx.canvas.board.id !== boardId || !findDeck(ctx, card.id)) { dirty = false; shell.close(true); return; }
    const next = findDeck(ctx, card.id), json = JSON.stringify(next.props ?? {});
    if (json === observed || dirty || saving) return;
    observed = json; slides = deckSlides(next); current = slideIndex(next.props?.current, slides.length);
    render(); jump(current);
  }
  function visibility() { if (document.hidden) save(); }
  function dispose() {
    save(); closed = true; clearTimeout(timer); cancelAnimationFrame(scrollFrame);
    closePresentation(); slideMotion?.cancel();
    stopFitting();
    window.removeEventListener('keydown', keys, true);
    window.removeEventListener('pagehide', save);
    document.removeEventListener('visibilitychange', visibility);
    boardStage.removeEventListener('boardchange', changed);
    if (active === state) active = null;
  }
  window.addEventListener('keydown', keys, true);
  // Keep board shortcuts out of the editor, while preserving native text editing and button activation.
  panel.addEventListener('keydown', event => event.stopPropagation());
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', visibility);
  boardStage.addEventListener('boardchange', changed);
  render();
  requestAnimationFrame(() => { if (!closed) { jump(current); state.focus(); } });
  return state;
}

export function installDeckOpenEvent() {
  window.addEventListener('keydown', () => { keyboardInput = true; }, true);
  window.addEventListener('pointerdown', () => { keyboardInput = false; }, true);
  window.addEventListener('aegis:open-card', event => {
    const ctx = globalThis.aegisCtx, id = event.detail?.id;
    if (!ctx || typeof id !== 'string') return;
    const card = findDeck(ctx, id);
    if (card) openDeck(card, ctx, { viaKey: event.detail?.viaKey ?? keyboardInput });
  });
}
