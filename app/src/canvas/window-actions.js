// Window actions live beside the canvas transform, so zoom never shrinks their targets.
export function mountWindowActions({ stage, getSelection, mountedEl, getZoom }) {
  const strip = document.createElement('div'); strip.className = 'window-actions'; strip.hidden = true; strip.setAttribute('role', 'toolbar'); stage.append(strip);
  let hovered = null, currentId = null, sources = [];
  function redraw() {
    if (stage.classList.contains('connecting') || stage.classList.contains('placing')) { strip.hidden = true; return; }
    const focused = document.activeElement?.closest('#world > .card')?.dataset.id;
    const id = strip.contains(document.activeElement) ? currentId : hovered || focused || getSelection().at(-1);
    const card = id && mountedEl(id);
    const actions = card && !card.classList.contains('editor-source') ? [...card.querySelectorAll('.win-open, .deck-open, .canvas-open')] : [];
    if (!actions.length) { strip.hidden = true; return; }
    const rect = card.getBoundingClientRect();
    if (rect.right < 0 || rect.left > innerWidth || rect.bottom < 44 || rect.top > innerHeight) { strip.hidden = true; return; }
    if (id !== currentId || actions.some((button, i) => button !== sources[i]) || actions.length !== sources.length) {
      strip.replaceChildren(); currentId = id; sources = actions;
      for (const source of actions) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = source.textContent.trim() || 'Open'; button.setAttribute('aria-label', source.getAttribute('aria-label') || button.textContent); button.dataset.windowAction = id;
        button.onclick = event => source.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: event.detail })); strip.append(button);
      }
    }
    strip.setAttribute('aria-label', `${card.querySelector('.win-name, .deck-name, h3, .canvas-title')?.textContent || 'Window'} actions`);
    [...strip.children].forEach((button, i) => { button.disabled = actions[i].disabled; });
    strip.hidden = false;
    const width = strip.offsetWidth, height = strip.offsetHeight, zoom = getZoom();
    const left = zoom < .9 && rect.width < 180 ? rect.right + 8 : rect.right - width - 4;
    Object.assign(strip.style, { left: `${Math.max(8, Math.min(innerWidth - width - 8, left))}px`, top: `${Math.max(48, Math.min(innerHeight - height - 8, zoom < .9 ? rect.top - height - 8 : rect.top + 2))}px` });
  }
  stage.addEventListener('pointermove', event => { if (strip.contains(event.target)) return; const id = event.target.closest('#world > .card')?.dataset.id || null; if (id !== hovered) { hovered = id; redraw(); } });
  stage.addEventListener('pointerleave', () => { hovered = null; redraw(); });
  stage.addEventListener('focusin', () => redraw());
  strip.addEventListener('pointerdown', event => event.stopPropagation());
  new MutationObserver(redraw).observe(stage, { attributes: true, attributeFilter: ['class'] });
  return { redraw };
}
