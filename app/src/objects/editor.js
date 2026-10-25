import { mount, unmount, flushSync } from 'svelte';
import { writable, fromStore } from 'svelte/store';
import { registerCommand } from '../features/registry';
import { openSide, centreCardInLeft } from '../features/docs/side.js';
import ObjectCard from './ObjectCard.svelte';
import { OBJECT_NAMES, expandsObject } from './presentation.js';
import { watchObjectSave } from './save-state.js';

let active;

export function openObject(card, ctx, { keyboard = false } = {}) {
  if (!expandsObject(card)) return;
  const boardId = ctx.canvas.board.id;
  if (active?.id === card.id && active.boardId === boardId) { active.focus(); return; }
  const kind = OBJECT_NAMES[card.kind];
  const shell = openSide({ title: card.text || kind, kind, keyboard });
  shell.el.classList.add('object-editor');
  const stopSaveStatus = watchObjectSave(shell);
  shell.body.tabIndex = -1;
  const value = writable(card), current = fromStore(value);
  const stage = document.getElementById('stage');
  let closed = false;
  const instance = mount(ObjectCard, {
    target: shell.body,
    props: {
      get card() { return current.current; },
      expanded: true,
      onset: (path, value) => {
        if (ctx.canvas.board.id === boardId && !closed && ctx.canvas.board.cards.some(c => c.id === card.id && c.kind === card.kind)) ctx.apply([{ op: 'object_set', id: card.id, path, value }]);
      },
      onlink: url => { void ctx.host.openUrl(url).catch(() => {}); },
      assetUrl: ctx.host.assetUrl,
      post: ctx.host.post,
      onescape: () => shell.close({ keyboard: true }),
    },
  });
  flushSync();
  const content = shell.body.querySelector('.content');
  content.tabIndex = 0;
  content.setAttribute('role', 'region');
  content.setAttribute('aria-label', `${kind} content`);
  function sync() {
    const latest = ctx.canvas.board.cards.find(c => c.id === card.id);
    if (ctx.canvas.board.id !== boardId || !expandsObject(latest) || latest.kind !== card.kind) {
      shell.close({ keyboard: true }); return;
    }
    value.set(latest);
    shell.el.querySelector('.side-editor-name').textContent = latest.text || kind;
  }
  stage.addEventListener('boardchange', sync);
  shell.el.addEventListener('side-editor-close', () => {
    // Change events fire on blur. Flush the current field before unmounting it.
    const field = document.activeElement;
    if (field instanceof HTMLElement && shell.el.contains(field)) field.blur();
    closed = true;
    stopSaveStatus();
    stage.removeEventListener('boardchange', sync);
    if (active?.el === shell.el) active = null;
    unmount(instance);
  }, { once: true });
  active = { id: card.id, boardId, el: shell.el, close: shell.close, focus: () => content.focus({ preventScroll: true }) };
  active.focus();
  centreCardInLeft(card, ctx, keyboard);
}

window.addEventListener('aegis:open-card', event => {
  const ctx = globalThis.aegisCtx;
  const card = ctx?.canvas.board.cards.find(c => c.id === event.detail?.id);
  if (expandsObject(card)) openObject(card, ctx, { keyboard: event.detail?.keyboard ?? !!document.activeElement?.matches('button:focus-visible') });
});

window.addEventListener('dblclick', event => {
  if (!(event.target instanceof Element)) return;
  // The canvas captures the pointer while selecting, so a double-click can target the stage.
  const target = event.target.closest('.card') ? event.target : document.elementFromPoint(event.clientX, event.clientY);
  if (!target || target.closest('button, input, textarea, summary, a, [contenteditable], [role="gridcell"]')) return;
  const el = target.closest('#stage .card.object');
  if (!el || el.classList.contains('locked')) return;
  const ctx = globalThis.aegisCtx, card = ctx?.canvas.board.cards.find(c => c.id === el.dataset.id);
  if (!expandsObject(card)) return;
  event.preventDefault(); event.stopImmediatePropagation(); openObject(card, ctx);
}, true);

const selectedObject = ctx => ctx.selection().length === 1 && ctx.canvas.board.cards.find(c => c.id === ctx.selection()[0] && expandsObject(c));
registerCommand({ id: 'object-open', title: 'Open selected window', keys: 'enter', when: ctx => !document.activeElement?.closest('.side-editor, button, summary, a, [role="gridcell"]') && !!selectedObject(ctx), run: ctx => openObject(selectedObject(ctx), ctx, { keyboard: true }) });

// The expanded content is a working view, so its keys must not trigger canvas tools or deletion.
window.addEventListener('keydown', event => {
  if (!active || !(event.target instanceof Element) || !active.el.contains(event.target)) return;
  // Table cells own their navigation and first Escape while editing.
  if (event.target.closest('[role="gridcell"]') && (event.key !== 'Escape' || event.target.closest('input'))) return;
  // R4 polish: inline values own their draft keys; icon menus own their activation keys.
  if (event.target.closest('.inline-value, .kind-more') && (event.key !== 'Escape' || event.target.closest('.inline-value input'))) return;
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopImmediatePropagation(); active.close({ keyboard: true });
  } else if (!event.target.closest('input, textarea, select, [contenteditable]')) {
    if ((event.metaKey || event.ctrlKey) && ['k', 'z'].includes(event.key.toLowerCase())) return;
    event.stopImmediatePropagation();
  }
}, true);
