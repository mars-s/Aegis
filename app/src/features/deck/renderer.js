import { deckSlides, slideIndex, slideHTML, escapeHTML } from './slides.js';
import { openDeck } from './editor.js';
import { downloadOriginal } from '../imports/assets.js';

export function openDeckCard(card, options = {}) {
  if (globalThis.aegisCtx) openDeck(card, globalThis.aegisCtx, options);
}

export function renderDeck(el, card, api) {
  const slides = deckSlides(card), current = slideIndex(card.props?.current, slides.length);
  el.tabIndex = 0;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', `${card.text || 'Untitled deck'}, slides. Press Return to edit.`);
  el.innerHTML = `<div class="deck-title-strip"><span class="deck-name">${escapeHTML(card.text || 'Untitled deck')}</span><span class="deck-kind"> · Slides</span><button class="deck-open" type="button" aria-label="Open deck">Open</button></div>
    <div class="deck-view"><div class="deck-nums" aria-hidden="true">${slides.slice(0, 3).map((_, i) => `<span>${i + 1}</span>`).join('')}</div>
    <div class="deck-thumbs">${slides.slice(0, 3).map((slide, i) => `<button type="button" class="deck-thumb${i === current ? ' on' : ''}" data-i="${i}" aria-label="Preview slide ${i + 1}" aria-pressed="${i === current}">${slideHTML(slide)}</button>`).join('')}</div>
    <div class="deck-main" aria-hidden="true">${slides.length ? slideHTML(slides[current]) : '<p class="deck-empty">Open to add your first slide</p>'}</div></div>`;
  el.querySelector('.deck-open').onclick = event => openDeckCard(card, { viaKey: event.detail === 0 });
  // item 14: the original imported presentation is always reachable.
  if (card.props?.import?.original) {
    const source = document.createElement('a'); source.className = 'deck-source'; source.textContent = 'Original';
    source.href = api.resolveUrl(card.props.import.original); source.download = card.props.import.name || 'Presentation'; source.setAttribute('aria-label', 'Download original presentation');
    source.onclick = event => { event.preventDefault(); if (globalThis.aegisCtx) void downloadOriginal(globalThis.aegisCtx, card.props.import); };
    el.querySelector('.deck-open').before(source);
  }
  // end item 14
  el.querySelectorAll('.deck-thumb').forEach(button => {
    button.onclick = () => api.setProps(card.id, { current: Number(button.dataset.i) });
  });
}
