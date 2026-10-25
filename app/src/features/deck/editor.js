import { deckSlides, slideIndex, slideHTML, escapeHTML, newSlide, observeSlideFits } from './slides.js';
import { openSide, centreCardInLeft } from '../docs/side.js';
import { downloadOriginal } from '../imports/assets.js';

let active = null;
let keyboardInput = false;
const reducedMotion = () => document.body.classList.contains('motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches;
export const findDeck = (ctx, id) => ctx.canvas.board.cards.find(card => card.id === id && card.type === 'deck');

// The deck editor sits in the shared side editor panel.
export function openDeckPanel(card, ctx, { viaKey = false, onClose }) {
  // The shared side editor (features/docs/side.js) owns the panel, its motion, Full width and Escape.
  const shell = openSide({ title: card.text || 'Untitled deck', kind: 'Slides', keyboard: viaKey });
  shell.el.classList.add('deck-panel');
  shell.el.addEventListener('side-editor-close', () => onClose(), { once: true });
  centreCardInLeft(card, ctx, viaKey);
  return { panel: shell.el, body: shell.body, close: instant => shell.close({ keyboard: !!instant }) };
}

export function openDeck(card, ctx, { viaKey = keyboardInput } = {}) {
  if (!card || card.type !== 'deck') return;
  const boardId = ctx.canvas.board.id;
  if (active?.id === card.id && active.boardId === boardId) { active.focus(); return; }
  active?.close(true);
  let slides = deckSlides(card), current = slideIndex(card.props?.current, slides.length);
  let dirty = false, saving = false, version = 0, timer, closed = false;
  let pending = Promise.resolve(), observed = JSON.stringify(card.props ?? {});
  let stopFitting = () => {};
  const shell = openDeckPanel(card, ctx, { viaKey, onClose: dispose });
  shell.body.innerHTML = '<div class="deck-ed"><div class="deck-stage" tabindex="0" aria-label="Slides. Scroll to move through them."></div><div class="deck-film" role="tablist" aria-label="Slide strip"></div></div>';
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
    const revision = version, props = structuredClone({ slides, current }), snapshot = JSON.stringify(props);
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
        if (JSON.stringify({ slides: stored.props?.slides, current: stored.props?.current }) === snapshot) {
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
    stopFitting();
    stage.innerHTML = slides.length ? slides.map((slide, i) => `<section class="deck-slide-wrap" data-i="${i}" role="tabpanel" aria-label="Slide ${i + 1}"><div class="deck-slide-meta"><span>Slide ${i + 1}</span><div class="deck-slide-actions"><button type="button" data-move="-1" aria-label="Move slide ${i + 1} up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-move="1" aria-label="Move slide ${i + 1} down" ${i === slides.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-delete aria-label="Delete slide ${i + 1}">Delete</button></div></div>${slideHTML(slide, true, i + 1)}</section>`).join('') : '<p class="deck-empty">Add your first slide below.</p>';
    film.innerHTML = slides.map((slide, i) => `<button class="deck-film-item" type="button" role="tab" aria-label="Go to slide ${i + 1}" data-i="${i}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Delete">${slideHTML(slide)}<span>${i + 1}</span></button>`).join('') + '<button class="deck-film-add" type="button">Add slide</button>';
    stopFitting = observeSlideFits(panel);
    mark(current, false);
  }
  function mark(index, persist = true) {
    const next = slideIndex(index, slides.length), changed = next !== current;
    current = next;
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
  function jump(index) {
    mark(index);
    const wrap = stage.querySelector(`.deck-slide-wrap[data-i="${current}"]`);
    if (wrap) stage.scrollTo({ top: stage.scrollTop + wrap.getBoundingClientRect().top - stage.getBoundingClientRect().top - 20, behavior: 'instant' });
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
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const y = stage.getBoundingClientRect().top + 20;
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
    slides[index][key] = field.textContent;
    mark(index); schedule();
    const thumb = film.querySelector(`.deck-film-item[data-i="${index}"] [data-k="${key}"]`);
    if (thumb) thumb.textContent = field.textContent;
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
