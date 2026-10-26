import { createTooltip } from '../../lib/ui/index.js';
import { reduceMotion } from '../../lib/ui/interaction.js';
import { menuShortcut } from '../../lib/shortcuts.js';
import { editorContext } from './context.js';

let current = null;

function captureScroll(stage) {
  const saved = [];
  for (const card of stage.querySelectorAll('#world > .card')) for (const node of card.querySelectorAll('*')) {
    if (!node.scrollTop && !node.scrollLeft) continue;
    const path = [];
    for (let el = node; el !== card; el = el.parentElement) path.unshift([...el.parentElement.children].indexOf(el));
    saved.push({ id: card.dataset.id, path, top: node.scrollTop, left: node.scrollLeft });
  }
  return saved;
}

/** Shared, non-modal editor shell. Captures the board before moving its camera.
 * Listen for side-editor-close to flush edits and dispose the editor content.
 * Replacing an editor on the same board keeps the original camera bookmark.
 */
export function openSide({ title, kind, card, ctx, keyboard = false }) {
  const canvas = ctx.canvas, stage = document.getElementById('stage');
  const boardId = canvas.board.id;
  const bookmark = current?.bookmark.boardId === boardId ? current.bookmark : {
    boardId, view: { ...canvas.view }, width: stage.clientWidth, height: stage.clientHeight, scroll: captureScroll(stage), selection: [...ctx.selection()],
  };
  const selection = bookmark.selection;
  // Focus returns to the control that opened the editor when it still exists (an Open action or toolbar button).
  const previousFocus = current?.previousFocus ?? document.activeElement;
  const opener = previousFocus?.matches?.('[data-window-action], #selectionBar [aria-label="Open"], .win-open, .deck-open, .canvas-open') ? previousFocus : null;
  const openerAction = opener?.dataset.windowAction ? `.window-actions [data-window-action="${opener.dataset.windowAction}"]` : opener?.matches('#selectionBar [aria-label="Open"]') ? '#selectionBar [aria-label="Open"]' : null;
  current?.close({ keyboard: true, restoreFocus: false });
  canvas.setView(canvas.view);
  const el = document.createElement('aside');
  el.className = `side-editor${keyboard ? ' instant' : ''}`;
  el.setAttribute('aria-label', `${kind} editor`);
  el.innerHTML = `<header class="side-editor-head"><p class="side-editor-title"><span class="side-editor-name"></span><span class="side-editor-kind"></span></p><span class="side-editor-saved" data-saved role="status">Saved</span><div class="side-editor-tools"><button type="button" data-expand aria-pressed="false" aria-keyshortcuts="Control+Shift+F Meta+Shift+F"><svg viewBox="0 0 16 16" aria-hidden="true"><path data-width-icon/></svg><span data-width-label>Full width</span><kbd aria-hidden="true"></kbd></button><button type="button" data-close aria-label="Close editor"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></div></header><div class="side-editor-body"></div>`;
  el.querySelector('.side-editor-name').textContent = title;
  el.querySelector('.side-editor-kind').textContent = ` · ${kind}`;
  const body = el.querySelector('.side-editor-body'), expand = el.querySelector('[data-expand]');
  expand.querySelector('kbd').textContent = menuShortcut('editorWidth');
  const widthTip = createTooltip(expand, `Toggle editor width (${menuShortcut('editorWidth')})`);
  const doc = kind === 'Document';
  let closed = false;
  function returnToBoard() {
    if (canvas.board.id !== boardId) return;
    const restoredSelection = selection.filter(id => canvas.board.cards.some(c => c.id === id));
    canvas.select(restoredSelection);
    const invoker = opener?.isConnected ? opener : openerAction && document.querySelector(openerAction);
    if (invoker && !invoker.closest('[hidden]')) invoker.focus({ preventScroll: true });
    const held = invoker && document.activeElement === invoker;
    if (!held) stage.focus({ preventScroll: true });
    const focusSource = () => requestAnimationFrame(() => {
      if (canvas.board.id !== boardId || current) return;
      const selected = canvas.selection();
      if (selected.length !== restoredSelection.length || selected.some((id, index) => id !== restoredSelection[index]) || ['x', 'y', 'z'].some(key => canvas.view[key] !== target[key])) return;
      for (const saved of bookmark.scroll) {
        const node = saved.path.reduce((el, index) => el?.children[index], canvas.mountedEl(saved.id));
        if (node) { node.scrollTop = saved.top; node.scrollLeft = saved.left; }
      }
      if (held || document.activeElement !== stage) return;
      const source = canvas.mountedEl(card.id);
      if (source) { if (!source.hasAttribute('tabindex')) source.tabIndex = -1; source.focus({ preventScroll: true }); }
    });
    // Preserve the world point at the centre if the window was resized while editing.
    const target = { ...bookmark.view, x: bookmark.view.x + (stage.clientWidth - bookmark.width) / 2, y: bookmark.view.y + (stage.clientHeight - bookmark.height) / 2 };
    canvas.glideTo(target, reduceMotion() ? 0 : 250, focusSource);
  }
  function close({ keyboard = false, restoreFocus = true } = {}) {
    if (closed) return;
    closed = true;
    context.destroy();
    el.dispatchEvent(new Event('side-editor-close'));
    document.removeEventListener('keydown', widthKeys, true);
    document.removeEventListener('keydown', keys);
    widthTip.destroy();
    el.inert = true;
    el.classList.toggle('instant', keyboard);
    el.classList.remove('is-open');
    document.body.classList.remove('editor-open', 'editor-wide', 'docs-open', 'docs-full');
    // Clear the editor source first: it hides the window action strip that focus may return to.
    canvas.setEditorSource(null);
    if (current?.el === el) current = null;
    if (restoreFocus) returnToBoard();
    if (keyboard) el.remove(); else setTimeout(() => el.remove(), reduceMotion() ? 160 : 200);
  }
  function paintWidth(wide) {
    expand.setAttribute('aria-pressed', String(wide));
    expand.querySelector('[data-width-label]').textContent = wide ? 'Side panel' : 'Full width';
    expand.querySelector('[data-width-icon]').setAttribute('d', wide ? 'M2 3h12v10H2zM9 3v10' : 'M6 2H2v4M10 2h4v4M14 10v4h-4M6 14H2v-4');
  }
  function toggleWidth() {
    const wide = el.classList.toggle('is-wide');
    document.body.classList.toggle('editor-wide', wide);
    if (doc) document.body.classList.toggle('docs-full', wide);
    paintWidth(wide);
  }
  function widthKeys(event) {
    if (event.defaultPrevented || document.querySelector('.deck-present, dialog[open]')) return;
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.code === 'KeyF') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat) toggleWidth();
    }
  }
  function keys(event) {
    if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('.deck-present, dialog[open]')) return;
    event.preventDefault(); event.stopImmediatePropagation(); close({ keyboard: true });
  }
  el.querySelector('[data-close]').onclick = event => close({ keyboard: event.detail === 0 });
  expand.onclick = toggleWidth;
  paintWidth(false);
  document.body.append(el);
  document.body.classList.add('editor-open');
  if (doc) document.body.classList.add('docs-open');
  if (!keyboard) el.getBoundingClientRect();
  el.classList.add('is-open');
  document.addEventListener('keydown', widthKeys, true);
  document.addEventListener('keydown', keys);
  const shell = { el, body, close, bookmark, previousFocus, setSaved: text => { el.querySelector('[data-saved]').textContent = text; } };
  current = shell;
  canvas.setEditorSource(card.id);
  const context = editorContext(canvas, card, el);
  shell.frameContext = context.frame;
  return shell;
}

export function centreCardInLeft(card, ctx, keyboard = false) {
  // Existing editor callers share the shell's context and its original bookmark.
  current?.frameContext();
}
