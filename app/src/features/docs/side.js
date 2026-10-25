let current = null;

/** Shared, non-modal editor shell for documents, sheets and slides.
 * openSide({ title, kind, keyboard }) replaces the previous editor and returns
 * { el, body, close, setSaved }. Append content to body. Listen on el for
 * 'side-editor-close' to flush edits and dispose listeners before it leaves.
 * close({ keyboard: true }) is instant; setSaved accepts a status string.
 * Header hooks: .side-editor-name, [data-expand], [data-close], [data-saved].
 */
export function openSide({ title, kind, keyboard = false }) {
  current?.close({ keyboard: true, restoreFocus: false });
  const previousFocus = document.activeElement;
  // PM 7: saved source content can rebuild the selection toolbar while editing.
  const selectionOpener = previousFocus?.matches('#selectionBar [aria-label="Open"]');
  // end PM 7
  const el = document.createElement('aside');
  el.className = `side-editor${keyboard ? ' instant' : ''}`;
  el.setAttribute('aria-label', `${kind} editor`);
  el.innerHTML = `<header class="side-editor-head"><p class="side-editor-title"><span class="side-editor-name"></span><span class="side-editor-kind"></span></p><span class="side-editor-saved" data-saved role="status">Saved</span><div class="side-editor-tools"><button type="button" data-expand aria-pressed="false">Full width</button><button type="button" data-close aria-label="Close editor"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></div></header><div class="side-editor-body"></div>`;
  el.querySelector('.side-editor-name').textContent = title;
  el.querySelector('.side-editor-kind').textContent = ` · ${kind}`;
  const body = el.querySelector('.side-editor-body');
  const doc = kind === 'Document';
  let closed = false;
  function close({ keyboard = false, restoreFocus = true } = {}) {
    if (closed) return;
    closed = true;
    const heldFocus = el.contains(document.activeElement);
    el.dispatchEvent(new Event('side-editor-close'));
    document.removeEventListener('keydown', keys);
    el.inert = true;
    el.classList.toggle('instant', keyboard);
    el.classList.remove('is-open');
    document.body.classList.remove('editor-open', 'editor-wide', 'docs-open', 'docs-full');
    // PM 7: restore selection furniture before returning focus to its Open action.
    shell.sourceCanvas?.setEditorSource(null);
    // end PM 7
    if (current?.el === el) current = null;
    if (restoreFocus && heldFocus) {
      const target = previousFocus?.isConnected ? previousFocus : selectionOpener ? document.querySelector('#selectionBar [aria-label="Open"]') : document.getElementById('stage');
      target?.focus({ preventScroll: true });
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('motion-off');
    if (keyboard) el.remove(); else setTimeout(() => el.remove(), reduced ? 160 : 200);
  }
  function keys(event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault(); event.stopImmediatePropagation(); close({ keyboard: true });
  }
  el.querySelector('[data-close]').onclick = event => close({ keyboard: event.detail === 0 });
  el.querySelector('[data-expand]').onclick = () => {
    const wide = el.classList.toggle('is-wide');
    document.body.classList.toggle('editor-wide', wide);
    if (doc) document.body.classList.toggle('docs-full', wide);
    el.querySelector('[data-expand]').setAttribute('aria-pressed', String(wide));
  };
  document.body.append(el);
  document.body.classList.add('editor-open');
  if (doc) document.body.classList.add('docs-open');
  // Measure the closed state once so pointer opens transition from the edge.
  if (!keyboard) el.getBoundingClientRect();
  el.classList.add('is-open');
  document.addEventListener('keydown', keys);
  const shell = { el, body, close, setSaved: text => { el.querySelector('[data-saved]').textContent = text; } };
  current = shell;
  return shell;
}

export function centreCardInLeft(card, ctx, keyboard = false) {
  // PM 7: all shared editors call this hook, including keyboard and phone opens.
  if (current) { current.sourceCanvas = ctx.canvas; ctx.canvas.setEditorSource(card.id); }
  // end PM 7
  if (keyboard || innerWidth <= 760 || document.body.classList.contains('editor-wide')) return;
  const stage = document.getElementById('stage').getBoundingClientRect();
  const view = ctx.canvas.view;
  const centre = ctx.canvas.worldToScreen(card.x + card.w / 2, card.y + card.h / 2);
  const target = { x: view.x + innerWidth / 4 - stage.left - centre.x, y: view.y + innerHeight / 2 - 30 - stage.top - centre.y, z: view.z };
  if (document.body.classList.contains('motion-off')) ctx.canvas.setView(target);
  else ctx.canvas.glideTo(target, 380);
}
