// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { registerRenderer, registerDragHandler, registerCardDropTarget } from '../../canvas/engine.js';
import { registerTool, registerPanel, registerCardMenu, registerBoardMenu, selectionControls, onRegistryChange, cardMenu } from '../registry';
import { uid, bounds, descendants, effectiveFlag, makeClip, cloneCommands, createHistory, arrange, stackCommands, collectionLayout, collectionDrop, lineHeightDefault, snapRotation } from './model.js';
import '../../lib/board/types/editing.js';
import { mountNavigation } from './navigation.js';
import { exportBoard } from './export.js';
import { fontPicker } from './fonts.js';
import { selectionPosition } from './selection.js';
import { selectionToolbar } from './toolbar.js';
import { prepareImage } from '../media/images.js';
import { mountLayerDeletion } from './layer-delete.js';
import { mountNoteSizing } from './note-sizing.js';
import { createMenu } from '../../chrome/menu.js';

registerTool({ id: 'coll', title: 'Collection', key: 'g', group: 'editing', icon: '<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12"/>', place(at, ctx) { ctx.apply([{ op: 'create', type: 'coll', text: 'Collection', x: at.x, y: at.y, props: { kids: [] }, ref: 'collection' }], ids => ctx.canvas.select([ids.collection])); } });
registerRenderer('coll', { render(el, card, api) {
  const header = document.createElement('div'); header.className = 'collection-head'; header.contentEditable = 'plaintext-only'; header.textContent = card.text || 'Collection';
  header.onblur = () => { if (header.textContent !== card.text) api.apply([{ op: 'update', id: card.id, set: { text: header.textContent } }]); };
  header.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); header.blur(); } };
  header.hidden = card.props?.head === false; el.append(header);
} });
let trayMount;
registerPanel({ id: 'unsorted', title: 'Unsorted', side: 'right', mount(el, ctx) { trayMount?.(el, ctx); } });

const SQUARE_TYPES = new Set(['stamp', 'icon']);
export function mountEditing(ctx) {
  const { canvas, apply, toast } = ctx, stage = document.getElementById('stage');
  mountNoteSizing(ctx);
  let indexedCards, byId = new Map(), viaKeyboard = true;
  addEventListener('keydown', () => { viaKeyboard = true; }, true);
  const selectedCards = () => { const ids = canvas.selection(); if (!ids.length) return []; if (indexedCards !== canvas.board?.cards) { indexedCards = canvas.board?.cards; byId = new Map((indexedCards ?? []).map(c => [c.id, c])); } return ids.map(id => byId.get(id)).filter(Boolean); };
  const editableCards = () => selectedCards().filter(c => !effectiveFlag(canvas.board, c, 'locked'));
  const history = createHistory({ read: () => canvas.board, apply, busy: () => canvas.busy() || gesture });
  stage.addEventListener('boardchange', e => { history.observe(e.detail.board); if (e.detail.first) { focus = null; } renderTray(); renderBar(true); });
  stage.addEventListener('pointerdown', () => history.flush(), true);
  const storedClip = () => { try { const v = JSON.parse(localStorage.getItem('aegis:clip')); return v?.cards?.length && v.cards.every(c => c && typeof c.id === 'string' && typeof c.type === 'string' && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(c[k]))) && Array.isArray(v.links) ? v : null; } catch { return null; } };
  let pasteCount = 0, clipStamp = '', pendingPaste, copyEventSeen = false;
  function copy(event, cut = false) {
    if (!selectedCards().length) return;
    const clip = makeClip(canvas.board, canvas.selection()); localStorage.setItem('aegis:clip', JSON.stringify(clip)); pasteCount = 0;
    if (event?.clipboardData) { event.clipboardData.setData('text/x-aegis', JSON.stringify(clip)); event.clipboardData.setData('text/plain', clip.text); event.preventDefault(); event.stopImmediatePropagation(); }
    else (ctx.host.copy ? ctx.host.copy(clip.text) : navigator.clipboard?.writeText(clip.text))?.catch(() => {});
    if (cut) remove();
    return clip;
  }
  function paste(clip = storedClip(), at, offset) {
    if (!clip?.cards?.length) return;
    const stamp = JSON.stringify(clip); if (stamp !== clipStamp) { clipStamp = stamp; pasteCount = 0; }
    const result = cloneCommands(clip, canvas.board, at ?? canvas.centre(), offset ?? 30 * ++pasteCount);
    apply(result.commands, () => canvas.select(result.ids)); return result.ids;
  }
  function duplicate() { const clip = makeClip(canvas.board, canvas.selection()); return paste(clip, undefined, 30); }
  const typing = e => !!e.target.closest?.('input, textarea, select, [contenteditable]');
  for (const type of ['copy', 'cut']) addEventListener(type, e => { if (!typing(e)) { copyEventSeen = true; copy(e, type === 'cut'); } }, true);
  addEventListener('paste', e => {
    if (typing(e)) return;
    clearTimeout(pendingPaste);
    let clip; try { clip = JSON.parse(e.clipboardData.getData('text/x-aegis')); } catch {}
    if (!clip?.cards?.length) { const cached = storedClip(); if (cached && e.clipboardData.getData('text/plain') === cached.text) clip = cached; }
    if (clip?.cards?.length) { e.preventDefault(); e.stopImmediatePropagation(); paste(clip); }
  }, true);
  function remove() { const ids = editableCards().map(c => c.id); if (ids.length) apply([{ op: 'delete', ids }], () => canvas.select([])); }
  function group(ungroup = false) {
    const cards = editableCards(); if (!ungroup && cards.length < 2) return;
    const group = ungroup ? '' : uid(), groups = new Set(cards.map(c => c.group).filter(Boolean));
    const targets = ungroup ? canvas.board.cards.filter(c => groups.has(c.group)) : cards;
    if (targets.length) apply(targets.map(c => ({ op: 'update', id: c.id, set: { group } })));
  }
  function stack(direction) { const commands = stackCommands(canvas.board, editableCards().map(c => c.id), direction); if (commands.length) apply(commands); }
  const textCards = () => editableCards().filter(c => ['note', 'title', 'todo', 'shape', 'coll'].includes(c.type));
  function format(key, value) { const cards = textCards(); if (value === undefined) value = !cards.every(c => c.props?.[key]); if (cards.length) apply(cards.map(c => ({ op: 'update', id: c.id, set: { props: { [key]: value } } }))); }
  const navigation = mountNavigation(ctx, { exportBoard: (selection, format) => exportBoard(ctx, selection, format) });
  let focus = null;
  function toggleFocus() {
    if (focus) { focus = null; canvas.setFocus(null); return; }
    const ids = new Set(canvas.selection()); if (!ids.size) return toast('Select cards to focus on first');
    for (const l of canvas.board.links) { if (ids.has(l.a)) ids.add(l.b); if (ids.has(l.b)) ids.add(l.a); }
    focus = ids; canvas.setFocus([...ids]); canvas.frameIds([...ids]);
  }
  addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
    if (mod && key === 'k') { e.preventDefault(); e.stopImmediatePropagation(); navigation.capture(); return; }
    if (typing(e) || gesture || canvas.busy()) return;
    let handled = true;
    if (mod && key === 'z') { if (!history.travel(e.shiftKey ? 1 : -1)) toast(e.shiftKey ? 'Nothing left to redo' : 'Nothing left to undo'); }
    else if (mod && key === 'g' && !e.altKey) group(e.shiftKey);
    else if (mod && key === 'd') duplicate();
    else if (mod && (key === 'c' || key === 'x')) { const ids = canvas.selection(); setTimeout(() => { if (!copyEventSeen && ids.length) copy(null, key === 'x'); copyEventSeen = false; }, 50); handled = false; }
    else if (mod && key === 'v') { pendingPaste = setTimeout(() => paste(), 160); handled = false; }
    else if (mod && ['BracketRight', 'BracketLeft'].includes(e.code)) stack(e.code === 'BracketRight' ? e.shiftKey ? 'front' : 'forward' : e.shiftKey ? 'back' : 'backward');
    else if (mod && ['b', 'i', 'u'].includes(key)) format({ b: 'bold', i: 'italic', u: 'under' }[key]);
    else if (key === 'f' && !e.shiftKey && !mod) toggleFocus();
    else if (key === 'escape' && focus) { focus = null; canvas.setFocus(null); }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  let lastPointer = { x: 0, y: 0 };
  stage.addEventListener('pointerup', e => { lastPointer = { x: e.clientX, y: e.clientY }; }, true);
  registerDragHandler('editing', {
    select(ids, id, board, e) {
      if (e.metaKey || e.ctrlKey) return ids;
      const card = board.cards.find(c => c.id === id);
      if (card?.group && ids.includes(id)) return [...new Set([...ids, ...board.cards.filter(c => c.group === card.group).map(c => c.id)])];
      return ids;
    },
    start(cards, board, e) {
      cards = descendants(board, cards.map(c => c.id));
      if (e.altKey) { const ids = paste(makeClip(board, cards.map(c => c.id)), undefined, 0); return canvas.board.cards.filter(c => ids?.includes(c.id)); }
      return cards;
    },
    end(cards, board, kind) {
      const commands = [];
      if (kind === 'resize') for (const c of cards.filter(c => ['note', 'todo'].includes(c.type))) commands.push({ op: 'update', id: c.id, set: { props: { fixedHeight: true } } });
      for (const c of cards.filter(c => c.type === 'coll')) if (kind === 'resize') commands.push(...collectionLayout(board, c));
      if (kind === 'move') {
        if (cards.length) { commands.push(...collectionDrop(board, cards, canvas.screenToWorld(lastPointer.x, lastPointer.y))); }
      }
      return commands;
    },
  });

  const bar = document.createElement('div'); bar.id = 'selectionBar'; bar.className = 'selection-bar'; bar.hidden = true; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Selection controls'); document.body.append(bar);
  const outline = document.createElement('div'); outline.className = 'editing-outline'; outline.hidden = true; outline.innerHTML = '<i class="selection-move top"></i><i class="selection-move bottom"></i><i class="selection-move left"></i><i class="selection-move right"></i><button class="rotation-handle" title="Rotate selection" aria-label="Rotate selection">↻</button><output class="rotation-badge" hidden></output><button class="selection-resize" aria-label="Resize selection"></button>'; stage.append(outline);
  let barKey = '', cleanups = [], gesture = false, toolbar, pointerHeld = false, shownIds = '', settleTimer;
  const positionBar = selectionPosition(canvas, bar, outline);
  addEventListener('keydown', () => { viaKeyboard = true; bar.classList.remove('selection-enter'); }, true);
  addEventListener('pointerdown', () => { viaKeyboard = false; }, true);
  stage.addEventListener('pointerdown', e => { pointerHeld = canvas.busy() && !stage.classList.contains('panning'); if (pointerHeld) { bar.hidden = true; toolbar?.close(); } });
  const releaseBar = () => { pointerHeld = false; renderBar(); };
  for (const type of ['pointerup', 'pointercancel']) addEventListener(type, () => { if (pointerHeld) queueMicrotask(releaseBar); }, true);
  function openCard(card) {
    const el = canvas.mountedEl(card.id), open = el?.querySelector('.win-open');
    if (open) open.click();
    else el?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  }
  function replaceMedia(card) {
    if (card.type !== 'image') { apply([{ op: 'update', id: card.id, set: { props: { replacing: true } } }]); return; }
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/*';
    const boardId = canvas.board.id;
    picker.onchange = async () => {
      const file = picker.files?.[0]; if (!file) return;
      try { const prepared = await prepareImage(file), saved = await ctx.host.upload(prepared.file); if (canvas.board.id === boardId && canvas.board.cards.some(c => c.id === card.id)) apply([{ op: 'update', id: card.id, set: { url: saved.url, props: { crop: null } } }]); }
      catch (error) { toast(`Could not replace the image: ${error.message}`); }
    }; picker.click();
  }
  async function downloadMedia(card) {
    try {
      const source = card.type === 'audio' ? card.props?.src : card.url;
      if (!source) return toast('Record or import media first');
      const response = await fetch(ctx.host.assetUrl(source)); if (!response.ok) throw new Error('The media file is unavailable');
      const blob = await response.blob(), url = URL.createObjectURL(blob), a = document.createElement('a');
      const extension = blob.type.split('/')[1]?.split(';')[0]?.replace('jpeg', 'jpg') || 'bin';
      a.href = url; a.download = `${(card.text || card.type).replace(/[^a-z0-9 _.-]/gi, '')}.${extension}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) { toast(`Could not download the media: ${error.message}`); }
  }
  function renderBar(force = false) {
    const cards = selectedCards().filter(c => !effectiveFlag(canvas.board, c, 'hidden'));
    outline.hidden = !cards.length;
    document.body.classList.toggle('editing-context', !!cards.length);
    if (!cards.length) { bar.hidden = true; shownIds = ''; clearTimeout(settleTimer); settleTimer = null; toolbar?.close(); return; }
    const locked = cards.some(c => effectiveFlag(canvas.board, c, 'locked')), ids = cards.map(c => c.id).join();
    if (bar.dataset.ids !== ids) { clearTimeout(settleTimer); settleTimer = null; }
    const dragging = gesture || pointerHeld || cards.some(c => canvas.mountedEl(c.id)?.classList.contains('dragging'));
    if (dragging) { bar.hidden = true; shownIds = ''; clearTimeout(settleTimer); settleTimer = null; toolbar?.close(); }
    const key = JSON.stringify(cards.map(c => [c.id, c.type, c.group, c.heading, c.rot, c.props]));
    if (force || key !== barKey) {
      const keepingFocus = bar.dataset.ids === ids && bar.dataset.locked === String(locked) && (bar.contains(document.activeElement) || bar.querySelector('details[open]') || document.activeElement?.closest('.aegis-dropdown-menu') || document.activeElement?.closest('.editing-font-picker'));
      if (!keepingFocus) {
        bar.dataset.ids = ids; bar.dataset.locked = String(locked); barKey = key; cleanups.forEach(f => f()); cleanups = []; bar.replaceChildren();
        toolbar = selectionToolbar(bar, () => canvas.redraw()); cleanups.push(() => toolbar.destroy());
        const { button, input, select, stepper, popup, choices } = toolbar;
        const single = cards.length === 1, text = textCards(), textInline = single && text.length > 0, media = single && ['image', 'audio', 'video'].includes(cards[0].type);
        if (!single) { const count = document.createElement('span'); count.className = 'selection-count'; count.textContent = `${cards.length} selected`; bar.querySelector('.selection-inline').prepend(count); }
        if (!locked) {
          if (text.length) {
            for (const [label, prop] of [['Bold', 'bold'], ['Italic', 'italic'], ['Underline', 'under'], ['Strike through', 'strike']]) {
              const b = button(label, () => format(prop), { inline: textInline && ['bold', 'italic'].includes(prop), group: 'Typography', shortcut: { bold: '⌘B', italic: '⌘I', under: '⌘U' }[prop] }); b.dataset.format = prop; b.setAttribute('aria-pressed', String(text.every(c => c.props?.[prop])));
            }
            const size = text.every(c => c.props?.size === text[0].props?.size) ? text[0].props?.size || (text[0].type === 'title' ? 44 : 15) : '';
            stepper('Text size', size, v => format('size', Number(v)), { inline: textInline });
            select('Text size preset', [['', 'Custom'], ['12', 'Small'], ['15', 'Medium'], ['21', 'Large'], ['30', 'Extra large']], '', v => { if (v) format('size', Number(v)); });
            if (textInline) popup('Align', panel => choices(panel, 'Text alignment', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], text[0].props?.align || 'left', v => format('align', v)));
            else select('Text alignment', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], text[0].props?.align || 'left', v => format('align', v));
            if (textInline) popup('Colour', panel => {
              const palette = [['plain', 'Default'], ['gray', 'Grey'], ['blue', 'Blue'], ['green', 'Green'], ['yellow', 'Yellow'], ['orange', 'Orange'], ['red', 'Red'], ['purple', 'Purple']];
              const grid = document.createElement('div'); grid.className = 'selection-colours'; panel.append(grid);
              for (const [value, label] of palette) { const b = document.createElement('button'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', `${label} card colour`); b.setAttribute('aria-pressed', String((cards[0].color || 'plain') === value)); b.style.setProperty('--swatch', value === 'plain' ? 'var(--card)' : `var(--c-${value})`); b.onclick = () => { apply(editableCards().map(c => ({ op: 'update', id: c.id, set: { color: value } }))); [...grid.children].forEach(el => el.setAttribute('aria-pressed', String(el === b))); }; grid.append(b); }
            });
            const font = select('Font', [['', 'Default font'], ['system-ui', 'System'], ['serif', 'Serif'], ['monospace', 'Monospace']], text[0].props?.font || '', v => format('font', v || null));
            button('Fonts…', e => { const close = fontPicker(e.currentTarget, textCards(), ctx, value => format('font', value)); cleanups.push(close); }, { group: 'Typography' });
            if (!text.every(c => (c.props?.font || '') === (text[0].props?.font || ''))) font.setOptions([['__mixed', 'Mixed fonts'], ['', 'Default font'], ['system-ui', 'System'], ['serif', 'Serif'], ['monospace', 'Monospace']]), font.value = '__mixed';
            font.onkeydown = e => { if (e.key === 'Escape') { canvas.redraw(); font.blur(); } };
            const height = text[0].props?.lh ?? lineHeightDefault(text[0].type);
            const setHeight = v => { const value = Number(v); if (!Number.isFinite(value)) return; format('lh', value); for (const control of bar.querySelectorAll('[data-line-height]')) control.value = String(value); };
            const lineHeight = stepper('Line height', height, setHeight, { min: .8, max: 3, step: .05 }); lineHeight.dataset.lineHeight = '1'; lineHeight.oninput = () => { const v = Number(lineHeight.value); if (v >= .8 && v <= 3) setHeight(v); };
            const slider = input('Line height slider', height, setHeight, 'range', 'Typography'); slider.min = '.8'; slider.max = '3'; slider.step = '.05'; slider.dataset.lineHeight = '1'; slider.oninput = slider.onchange;
            select('Spacing', [['', 'Custom'], ['compact', 'Compact'], ['normal', 'Normal'], ['open', 'Open']], '', v => { if (v === 'normal') apply(textCards().map(c => ({ op: 'update', id: c.id, set: { props: { lh: null } } }))); else if (v) format('lh', { compact: 1.1, open: 1.8 }[v]); });
            stepper('Letter spacing', text[0].props?.ls || 0, v => format('ls', Number(v)), { min: -10, max: 50, step: .5 });
            select('Display case', [['', 'As typed'], ['upper', 'Uppercase'], ['lower', 'Lowercase'], ['title', 'Title case']], text[0].props?.tcase || '', v => format('tcase', v || null));
          }
          if (single && ['note', 'todo'].includes(cards[0].type)) button(cards[0].props?.fixedHeight ? 'Grow to fit text' : 'Keep current height', () => apply([{ op: 'update', id: cards[0].id, set: { props: { fixedHeight: !cards[0].props?.fixedHeight } } }]), { group: 'Card' });
          if (single && cards[0].type === 'note') input('Note name', cards[0].heading, v => apply([{ op: 'update', id: cards[0].id, set: { heading: v } }]));
          if (single && !['coll', 'swatch', 'ink'].includes(cards[0].type)) input(cards[0].type === 'image' ? 'Caption' : 'Label', cards[0].type === 'image' ? cards[0].props?.tagText ?? cards[0].props?.tag : cards[0].props?.tag, v => apply([{ op: 'update', id: cards[0].id, set: { props: cards[0].type === 'image' ? { tagText: v || null, tag: null } : { tag: v || null } } }]));
          if (single && cards[0].type === 'coll') button(cards[0].props?.head === false ? 'Show header' : 'Hide header', () => { const coll = { ...cards[0], props: { ...cards[0].props, head: cards[0].props?.head === false } }; apply([{ op: 'update', id: coll.id, set: { props: { head: coll.props.head } } }, ...collectionLayout(canvas.board, coll)]); }, { group: 'Card' });
          if (!cards.some(c => ['frame', 'section', 'coll', 'ink'].includes(c.type))) button('Tilt', e => openTilt(e.currentTarget), { group: 'Card', shortcut: `${Math.round(cards[0].rot || 0)}°` });
          if (!single) {
            popup('Align and distribute', panel => {
              for (const [value, label] of [['left', 'Align left'], ['centre', 'Align centre'], ['right', 'Align right'], ['top', 'Align top'], ['middle', 'Align middle'], ['bottom', 'Align bottom'], ...new Set(cards.map(c => c.group || c.id)).size >= 3 ? [['distribute-x', 'Distribute horizontally'], ['distribute-y', 'Distribute vertically']] : []]) {
                const b = document.createElement('button'); b.type = 'button'; b.className = 'selection-menu-action'; b.textContent = label; b.onclick = () => { const commands = arrange(canvas.board, canvas.selection(), value); if (commands.length) apply(commands); }; panel.append(b);
              }
            }, 'Align');
            button('Group', () => group(), { inline: true });
            button('Collect', () => { const b = bounds(cards), id = uid(); const coll = { id, type: 'coll', x: b.x - 12, y: b.y - 52, w: Math.max(300, b.right - b.x + 24), h: 180, props: { kids: cards.map(c => c.id) } }; apply([{ op: 'create', type: 'coll', newId: id, text: 'Collection', x: coll.x, y: coll.y, w: coll.w, h: coll.h, props: coll.props }, { op: 'order', ids: [id], to: 'back' }, ...collectionLayout(canvas.board, coll)], () => canvas.select([id])); }, { group: 'Arrange' });
          }
          if (cards.some(c => c.group)) button('Ungroup', () => group(true), { group: 'Arrange', shortcut: '⇧⌘G' });
          if (single && !textInline && !media) button('Open', () => openCard(cards[0]), { inline: true, text: true });
          if (media) { button('Replace', () => replaceMedia(cards[0]), { inline: true, text: true }); button('Download', () => downloadMedia(cards[0]), { inline: true }); }
          for (const control of selectionControls) if (!control.when || control.when(ctx)) { const host = document.createElement('div'); host.dataset.selectionControl = control.id; toolbar.section('Card').append(host); const cleanup = control.mount(host, ctx); if (cleanup) cleanups.push(cleanup); }
          button('Duplicate', duplicate, { inline: !single || !textInline && !media, shortcut: '⌘D' }); button('Delete', remove, { inline: !single || !textInline && !media, shortcut: '⌫' });
          for (const [label, direction] of [['Bring to front', 'front'], ['Bring forward', 'forward'], ['Send backward', 'backward'], ['Send to back', 'back']]) button(label, () => stack(direction), { group: 'Arrange' });
          button('Lock', () => apply(editableCards().map(c => ({ op: 'update', id: c.id, set: { props: { locked: true } } }))), { group: 'Arrange' });
        } else button('Unlock', () => apply(cards.map(c => ({ op: 'update', id: c.id, set: { props: { locked: false } } }))), { inline: true, text: true });
        button('PNG', () => exportBoard(ctx, true), { group: 'Export', shortcut: 'Image' }); button('PDF', () => exportBoard(ctx, true, 'pdf'), { group: 'Export', shortcut: 'Document' });
      }
    }
    for (const b of bar.querySelectorAll('[data-format]')) b.setAttribute('aria-pressed', String(textCards().every(c => c.props?.[b.dataset.format])));
    if (!dragging && (shownIds !== ids || bar.hidden) && !settleTimer) {
      const show = () => { settleTimer = null; if (gesture || pointerHeld) return; if (canvas.selection().join() !== ids) { renderBar(); return; } bar.hidden = false; positionBar(cards, locked); toolbar.positionMenus(); bar.classList.toggle('selection-enter', !viaKeyboard); shownIds = ids; };
      if (viaKeyboard) show(); else { bar.hidden = true; settleTimer = setTimeout(show, 45); }
    }
    positionBar(cards, locked); if (!bar.hidden) toolbar.positionMenus();
  }
  stage.addEventListener('canvaspaint', () => renderBar()); onRegistryChange(() => renderBar(true));
  outline.addEventListener('pointerdown', e => {
    const rotate = e.target.closest('.rotation-handle'), resize = e.target.closest('.selection-resize'), moving = e.target.closest('.selection-move'); if (!rotate && !resize && !moving) return;
    e.preventDefault(); e.stopPropagation(); history.flush(); gesture = true; bar.hidden = true; shownIds = ''; toolbar?.close();
    const cards = descendants(canvas.board, editableCards().map(c => c.id)).filter(c => !effectiveFlag(canvas.board, c, 'locked')).map(c => structuredClone(c)), b = bounds(cards), centre = { x: (b.x + b.right) / 2, y: (b.y + b.bottom) / 2 }, start = canvas.screenToWorld(e.clientX, e.clientY), angle = Math.atan2(start.y - centre.y, start.x - centre.x);
    const badge = outline.querySelector('output'); badge.hidden = !rotate;
    let last = [];
    const move = ev => { const p = canvas.screenToWorld(ev.clientX, ev.clientY);
      const raw = (Math.atan2(p.y - centre.y, p.x - centre.x) - angle) * 180 / Math.PI, base = cards.length === 1 ? cards[0].rot || 0 : 0;
      const deg = snapRotation(raw + base, ev.shiftKey, cards.length === 1) - base; badge.textContent = `${Math.round(deg)}°`;
      const t = deg * Math.PI / 180;
      let sx = Math.max(.1, (p.x - b.x) / Math.max(1, start.x - b.x)), sy = Math.max(.1, (p.y - b.y) / Math.max(1, start.y - b.y)); if (ev.shiftKey || cards.some(c => SQUARE_TYPES.has(c.type))) sx = sy = Math.max(sx, sy);
      last = cards.map(c => { const dx = c.x + c.w / 2 - centre.x, dy = c.y + c.h / 2 - centre.y;
        const set = moving ? { x: c.x + p.x - start.x, y: c.y + p.y - start.y } : rotate ? { x: centre.x + dx * Math.cos(t) - dy * Math.sin(t) - c.w / 2, y: centre.y + dx * Math.sin(t) + dy * Math.cos(t) - c.h / 2, rot: ((c.rot || 0) + deg + 540) % 360 - 180 } : { x: b.x + (c.x - b.x) * sx, y: b.y + (c.y - b.y) * sy, w: Math.max(40, c.w * sx), h: Math.max(24, c.h * sy), ...(['note', 'todo'].includes(c.type) ? { props: { fixedHeight: true } } : {}) };
        const el = canvas.mountedEl(c.id); if (el) { const n = { ...c, ...set }; el.style.transform = `translate(${n.x}px, ${n.y}px) rotate(${n.rot || 0}deg)`; el.style.width = `${n.w}px`; el.style.height = `${n.h}px`; }
        return { op: 'update', id: c.id, set };
      });
    };
    const end = commit => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel); removeEventListener('keydown', escape, true); gesture = false; badge.hidden = true; if (commit && last.length) { const layouts = !rotate ? last.flatMap(cmd => { const c = canvas.board.cards.find(c => c.id === cmd.id); return c.type === 'coll' ? collectionLayout(canvas.board, { ...c, ...cmd.set }) : []; }) : []; apply([...last, ...layouts]); } else { for (const c of cards) { const el = canvas.mountedEl(c.id); if (el) { el.style.transform = `translate(${c.x}px, ${c.y}px) rotate(${c.rot || 0}deg)`; el.style.width = `${c.w}px`; el.style.height = `${c.h}px`; } } canvas.redraw(); } renderBar(true); };
    const up = () => end(true), cancel = () => end(false), escape = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); end(false); } };
    addEventListener('pointermove', move); addEventListener('pointerup', up, { once: true }); addEventListener('pointercancel', cancel, { once: true }); addEventListener('keydown', escape, true);
  });

  const tiltPop = document.createElement('div'); tiltPop.className = 'editing-tilt'; tiltPop.hidden = true; tiltPop.setAttribute('aria-label', 'Tilt controls'); document.body.append(tiltPop);
  const setTilt = value => { const degrees = Math.max(-180, Math.min(180, Math.round(Number(value) || 0))); const cards = editableCards().filter(c => !['frame', 'section', 'coll', 'ink'].includes(c.type)); if (cards.length) apply(cards.map(c => ({ op: 'update', id: c.id, set: { rot: degrees } }))); tiltPop.querySelector('input').value = String(degrees); tiltPop.querySelectorAll('[data-deg]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.deg) === degrees))); };
  function openTilt(anchor) {
    tiltPop.replaceChildren(); const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'numeric'; input.value = String(Math.round(selectedCards()[0]?.rot || 0)); input.setAttribute('aria-label', 'Tilt in degrees'); input.oninput = () => { if (input.value !== '' && input.value !== '-') setTilt(input.value); }; tiltPop.append(input);
    for (const [label, deg] of [['Reset tilt', 0], ...[0, 5, 10, 15, 30, 45, 90, -5, -10, -15, -30, -45, -90].map(deg => [`${deg}°`, deg])]) { const b = document.createElement('button'); b.textContent = label; b.dataset.deg = String(deg); b.onclick = () => setTilt(deg); tiltPop.append(b); }
    const r = anchor.getBoundingClientRect(); Object.assign(tiltPop.style, { left: `${Math.max(10, Math.min(innerWidth - 290, r.left))}px`, top: `${Math.min(innerHeight - 200, r.bottom + 8)}px` }); tiltPop.hidden = false; input.focus(); input.select();
  }
  tiltPop.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Enter') tiltPop.hidden = true; });
  addEventListener('pointerdown', e => { if (!tiltPop.contains(e.target) && !e.target.closest('[aria-label="Tilt"]')) tiltPop.hidden = true; });
  let tiltSelection = '';
  stage.addEventListener('canvaspaint', () => { const ids = canvas.selection().join(); if (ids !== tiltSelection) { tiltPop.hidden = true; tiltSelection = ids; } });
  mountLayerDeletion(ctx, history);
  const layerMenu = createMenu();
  stage.addEventListener('layercontext', e => { const { x, y, ids } = e.detail; layerMenu.show(x, y, [...cardMenu.filter(m => !m.when || m.when(ctx, ids)).map(m => ({ ...m, run: () => m.id === 'delete' ? stage.dispatchEvent(new CustomEvent('layerdelete', { detail: { ids } })) : m.run(ctx, ids) })), { title: 'Delete', section: 'zz', run: () => stage.dispatchEvent(new CustomEvent('layerdelete', { detail: { ids } })) }, { title: 'Bring to front', section: 'Arrange', run: () => stack('front') }, { title: 'Send to back', section: 'Arrange', run: () => stack('back') }]); });

  let trayEl, traySig = '';
  trayMount = el => { trayEl = el; el.classList.add('unsorted-list'); renderTray(); };
  function renderTray() {
    if (!trayEl || !canvas.board) return;
    const sig = JSON.stringify([canvas.board.id, canvas.board.tray]); if (sig === traySig) return; traySig = sig;
    trayEl.replaceChildren(); const items = canvas.board.tray ?? [];
    const hint = document.createElement('p'); hint.className = 'muted small'; hint.textContent = items.length ? `${items.length} ideas. Drag onto the board.` : 'Capture ideas with ⌘K. Drag cards here to put them aside.'; trayEl.append(hint);
    for (const item of items) {
      const row = document.createElement('button'); row.className = 'tray-item'; row.textContent = item.text || item.heading || item.url || item.type; row.dataset.id = item.id;
      row.onclick = () => release(item, canvas.centre());
      row.onpointerdown = e => {
        const start = { x: e.clientX, y: e.clientY }; let moved = false;
        const move = ev => { if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 5) { moved = true; row.classList.add('dragging'); } };
        const up = ev => { removeEventListener('pointermove', move); row.classList.remove('dragging'); if (moved) { row.onclick = null; if (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#stage')) release(item, canvas.screenToWorld(ev.clientX, ev.clientY)); setTimeout(() => { row.onclick = () => release(item, canvas.centre()); }); } };
        addEventListener('pointermove', move); addEventListener('pointerup', up, { once: true });
      };
      trayEl.append(row);
    }
  }
  function release(item, at) {
    const result = cloneCommands({ from: 'tray', cards: item.bundle?.cards ?? [item], links: item.bundle?.links ?? [] }, canvas.board, at);
    apply([{ op: 'board_set', set: { tray: (canvas.board.tray ?? []).filter(c => c.id !== item.id) } }, ...result.commands], () => canvas.select(result.ids));
  }
  registerCardDropTarget(({ cards, x, y }) => {
    if (!cards.length || !trayEl) return;
    const r = trayEl.closest('.pbox').getBoundingClientRect(); if (x < r.left || x > r.right || y < r.top || y > r.bottom || !r.height) return;
    return () => { const clip = makeClip(canvas.board, cards.map(c => c.id)), first = clip.cards[0]; if (!first) return; const item = { ...first, id: uid(), bundle: { cards: clip.cards, links: clip.links } }; apply([{ op: 'board_set', set: { tray: [...(canvas.board.tray ?? []), item] } }, { op: 'delete', ids: clip.cards.map(c => c.id) }], () => canvas.select([])); };
  });
  for (const [id, title, run] of [['duplicate', 'Duplicate', duplicate], ['copy', 'Copy', () => copy()], ['cut', 'Cut', () => copy(null, true)], ['group', 'Group', () => group()], ['ungroup', 'Ungroup', () => group(true)], ['forward', 'Bring forward', () => stack('forward')], ['backward', 'Send backward', () => stack('backward')], ['export', 'Export selection as PNG', () => exportBoard(ctx, true)], ['export-pdf', 'Export selection as PDF', () => exportBoard(ctx, true, 'pdf')]]) registerCardMenu({ id: `editing-${id}`, title, section: 'Editing', run });
  registerCardMenu({ id: 'editing-reset-tilt', title: 'Reset tilts', section: 'Editing', when: () => editableCards().some(c => c.rot && !['frame', 'section', 'coll', 'ink'].includes(c.type)), run: () => { const cards = editableCards().filter(c => !['frame', 'section', 'coll', 'ink'].includes(c.type)); apply(cards.map(c => ({ op: 'update', id: c.id, set: { rot: 0 } }))); } });
  registerBoardMenu({ id: 'editing-export-board', title: 'Export board as PNG', section: 'Export', run: () => exportBoard(ctx, false) });
  registerBoardMenu({ id: 'editing-export-board-pdf', title: 'Export board as PDF', section: 'Export', run: () => exportBoard(ctx, false, 'pdf') });
  return { history, copy, paste, duplicate, group, arrange: how => { const commands = arrange(canvas.board, canvas.selection(), how); if (commands.length) apply(commands); }, stack, toggleFocus };
}
