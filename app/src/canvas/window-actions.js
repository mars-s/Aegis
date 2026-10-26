// Window actions live beside the canvas transform, so zoom never shrinks their targets.
export function mountWindowActions({ stage, getSelection, mountedEl, getZoom }) {
  const strip = document.createElement('div'); strip.className = 'window-actions'; strip.hidden = true; strip.setAttribute('role', 'toolbar'); stage.append(strip);
  let hovered = null, currentId = null, sources = [], leaveTimer = 0;
  function redraw(requestedId) {
    if (stage.classList.contains('connecting') || stage.classList.contains('placing')) { strip.hidden = true; return; }
    const focused = document.activeElement?.closest('#world > .card')?.dataset.id;
    const editorSource = stage.querySelector('#world > .card.editor-source')?.dataset.id;
    const id = editorSource || (strip.contains(document.activeElement) ? currentId : requestedId || (strip.matches(':hover') ? currentId : hovered || focused || getSelection().at(-1)));
    const card = id && mountedEl(id), actions = card ? [...card.querySelectorAll('.win-open, .deck-open, .canvas-open')] : [];
    if (!actions.length) { strip.hidden = true; return; }
    const rect = card.getBoundingClientRect();
    if (rect.right < 0 || rect.left > innerWidth || rect.bottom < 44 || rect.top > innerHeight) { strip.hidden = true; return; }
    if (id !== currentId || actions.length !== sources.length) {
      strip.replaceChildren(); currentId = id;
      for (const [index, source] of actions.entries()) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = source.textContent.trim() || 'Open'; button.dataset.windowAction = id;
        button.onclick = event => {
          button.focus({ preventScroll: true });
          const owner = mountedEl(id), action = owner?.querySelectorAll('.win-open, .deck-open, .canvas-open')[index];
          if (action?.classList.contains('canvas-open')) action.click();
          else window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id, keyboard: event.detail === 0 } }));
        }; strip.append(button);
      }
    }
    sources = actions;
    strip.setAttribute('aria-label', `${card.querySelector('.win-name, .deck-name, h3, .canvas-title')?.textContent || 'Window'} actions`);
    [...strip.children].forEach((button, i) => { button.disabled = actions[i].disabled; button.setAttribute('aria-label', actions[i].getAttribute('aria-label') || button.textContent); });
    strip.hidden = false;
    const width = strip.offsetWidth, height = strip.offsetHeight, zoom = getZoom();
    const left = zoom < .9 && rect.width < 180 ? rect.right + 8 : rect.right - width - 4;
    Object.assign(strip.style, { left: `${Math.max(8, Math.min(innerWidth - width - 8, left))}px`, top: `${Math.max(48, Math.min(innerHeight - height - 8, zoom < .9 ? rect.top - height - 8 : rect.top + 2))}px` });
  }
  function approach(event) {
    if (strip.contains(event.target)) { clearTimeout(leaveTimer); leaveTimer = 0; return; }
    const id = event.target.closest('#world > .card')?.dataset.id;
    if (id) { clearTimeout(leaveTimer); leaveTimer = 0; if (hovered !== id) { hovered = id; redraw(id); } }
    else if (!leaveTimer) leaveTimer = setTimeout(() => { leaveTimer = 0; if (strip.matches(':hover')) return; hovered = null; redraw(); }, 160);
  }
  stage.addEventListener('pointermove', approach);
  stage.addEventListener('pointerover', approach);
  stage.addEventListener('pointerleave', () => { hovered = stage.querySelector('#world > .card:hover')?.dataset.id || null; redraw(hovered); });
  stage.addEventListener('focusin', () => redraw());
  strip.addEventListener('pointerdown', event => event.stopPropagation());
  new MutationObserver(() => redraw()).observe(stage, { attributes: true, attributeFilter: ['class'] });
  return { redraw: () => redraw() };
}
