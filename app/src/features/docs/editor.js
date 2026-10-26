import { documentContent, wordCount, wordCountLabel } from '../../lib/board/words.js';
import { createStepper } from '../../lib/ui/stepper.js';
import { createColourPicker } from '../colors/colour-picker.js';
// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { Editor, generateJSON } from '@tiptap/core';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import { extensions } from './extensions.js';
import { cardContent, COPY_TYPES, documentUpdate, markdownHTML } from './content.js';
import { downloadWord, printPDF } from './export.js';
import { openSide, centreCardInLeft } from './side.js';
import { bindDisclosure, createPopup } from '../../lib/ui/dropdown.js';
import { writingFontChooser } from '../editing/writing-fonts.js';
import { chooser as select } from './menu.js';
import { OrbMark } from '../../lib/ui/orb-mark.js';
import '../../lib/ui/ribbon.css';

let active = null;
let rewrite = null;
/** Host adapters return replacement text. No provider credentials enter this module. */
export function registerDocRewriter(handler) { rewrite = handler; return () => { if (rewrite === handler) rewrite = null; }; }
export const currentDocument = () => active;
// Ribbon glyphs share the app's 16px, 1.4 stroke icon grid.
const GLYPH = {
  Undo: '<path d="M5.5 6H10a3.5 3.5 0 0 1 0 7H7M5.5 6l2.5-2.5M5.5 6 8 8.5"/>', Redo: '<path d="M10.5 6H6a3.5 3.5 0 0 0 0 7h3M10.5 6 8 3.5M10.5 6 8 8.5"/>',
  Bold: '<path d="M4.5 2.5h4a2.75 2.75 0 0 1 0 5.5h-4m0 0H9a2.75 2.75 0 0 1 0 5.5H4.5z"/>', Italic: '<path d="M7 2.5h6M3 13.5h6M10 2.5l-4 11"/>',
  Underline: '<path d="M4 2.5v5a4 4 0 0 0 8 0v-5M3 14h10"/>', Strikethrough: '<path d="M11.5 4c-1-2-6.5-2-6.5 1 0 1.5 1.5 2 3 2.5M3 8h10M5 11.5c1 2.5 7 2.5 7-.5 0-.7-.4-1.3-1-1.7"/>',
  Link: '<path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.5.5M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.5-.5"/>',
  'Bullet list': '<circle cx="3.5" cy="4.5" r=".8"/><circle cx="3.5" cy="8" r=".8"/><circle cx="3.5" cy="11.5" r=".8"/><path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7"/>',
  'Numbered list': '<path d="M3 3.5h1v3M3 6.5h2M2.8 9.5h1.7l-1.7 3h1.9M6.5 4.5h7M6.5 8h7M6.5 11.5h7"/>',
  'Task list': '<rect x="2.5" y="3" width="3" height="3" rx=".6"/><path d="m3 11 1 1 1.8-2M7.5 4.5h6M7.5 11h6"/>',
  'Insert image': '<rect x="2" y="2.5" width="12" height="11" rx="2"/><circle cx="6" cy="6.5" r="1.2"/><path d="m2.5 12 3.5-3.5 3 3 2-2 2.5 2.5"/>',
  'Insert table': '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M2 10h12M6.5 2.5v11"/>',
  Divider: '<path d="M2 8h12M5 4.5h6M5 11.5h6"/>', 'Clear formatting': '<path d="M3 13h10M5 10l5.5-6.5 2.5 2.5L7.5 12H5z"/>',
  'Decrease font size': '<path d="M4 8h8"/>', 'Increase font size': '<path d="M4 8h8M8 4v8"/>',
};
const button = (label, text, action) => {
  const el = document.createElement('button'); el.type = 'button'; el.title = label; el.setAttribute('aria-label', label);
  if (GLYPH[label]) { el.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${GLYPH[label]}</svg>`; el.classList.add('ribbon-btn'); }
  else el.textContent = text;
  el.onpointerdown = e => e.preventDefault(); el.onclick = action; return el;
};
const loadContent = documentContent;
const inRect = (el, x, y) => {
  const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};
const clipboardType = 'application/x-aegis-cards';
const contentForCard = card => {
  if (card.type === 'note' || (card.type === 'doc' && !card.props?.doc)) {
    const heading = card.type === 'doc' ? card.text : card.heading;
    return [...(heading ? cardContent({ type: 'title', text: heading }) : []),
      ...(generateJSON(markdownHTML(card.type === 'doc' ? card.props?.body : card.text), extensions()).content ?? [])];
  }
  return cardContent(card);
};

export function openDocument(card, ctx, { keyboard = false } = {}) {
  if (active?.id === card.id && active.boardId === ctx.canvas.board.id) { active.editor.commands.focus(); return; }
  const boardId = ctx.canvas.board.id;
  const side = openSide({ title: card.text || 'Untitled document', kind: 'Document', card, ctx, keyboard });
  const panel = side.el; panel.classList.add('docs-panel');
  panel.querySelector('[data-close]').setAttribute('aria-label', 'Close document');
  side.body.innerHTML = `<div class="office-ribbon docs-ribbon" role="toolbar" aria-label="Formatting"></div><div class="docs-scroll"><article class="docs-paper"><div class="docs-body"></div></article></div><footer class="docs-footer"><button type="button" data-back>← Back to board</button><span data-count></span><span class="docs-spacer"></span><button type="button" data-copy-cards>Copy selected board cards</button></footer>`;
  const title = document.createElement('input'); title.className = 'docs-title'; title.setAttribute('aria-label', 'Document title'); title.placeholder = 'Untitled document'; title.value = card.text;
  panel.querySelector('.side-editor-name').replaceWith(title);
  const menu = document.createElement('details'); menu.className = 'docs-more';
  menu.innerHTML = '<summary aria-label="Document options" aria-haspopup="true">…</summary><div class="docs-more-tools"><div class="docs-page-options"></div><button type="button" data-pdf>Export PDF</button><button type="button" data-word>Export Word</button></div>';
  panel.querySelector('.side-editor-tools').prepend(menu);
  // PM4.10: keep the board action beside writing only when it can copy something.
  const copyCards = panel.querySelector('[data-copy-cards]');
  function syncCopyAction() {
    const ids = ctx.selection();
    const applicable = ctx.canvas.board.id === boardId && ctx.canvas.board.cards.some(c => c.id !== card.id && ids.includes(c.id) && COPY_TYPES.has(c.type));
    const parent = applicable ? panel.querySelector('.docs-footer') : menu.querySelector('.docs-more-tools');
    if (copyCards.parentElement !== parent) parent.append(copyCards);
  }
  syncCopyAction();
  const menuPopup = bindDisclosure(menu, { label: 'Document options menu' }), colourPopups = [];
  const bubble = document.createElement('div'); bubble.className = 'docs-bubble'; bubble.setAttribute('role', 'toolbar'); bubble.setAttribute('aria-label', 'Selection formatting');
  const $ = selector => panel.querySelector(selector);
  let timer, version = 0, dirty = false, saving = false, closed = false, lastDoc, lastBody = card.props?.body, pendingSave = Promise.resolve();
  let minimumRev = ctx.canvas.board.rev;
  let editor;
  const setStatus = side.setSaved;
  const schedule = () => {
    dirty = true; version++; setStatus('Saving…'); clearTimeout(timer); timer = setTimeout(save, 350);
  };
  function save() {
    clearTimeout(timer);
    if (!dirty || editor.isDestroyed) return pendingSave;
    dirty = false; saving = true;
    const revision = version, doc = editor.getJSON(), name = title.value;
    const cmd = documentUpdate(card.id, doc); cmd.set.text = name;
    const snapshotJSON = JSON.stringify(doc);
    lastDoc = snapshotJSON;
    lastBody = cmd.set.props.body;
    // Use the captured board id if the library changed boards before this save ran.
    pendingSave = pendingSave.catch(() => {}).then(async () => {
      if (ctx.canvas.board.id === boardId) { ctx.apply([cmd]); minimumRev = Math.max(minimumRev, ctx.canvas.board.rev); }
      else await ctx.host.post(`/boards/${boardId}/batch`, { commands: [cmd] });
      // apply's callback is optimistic. Confirm the host stored the exact snapshot before saying Saved.
      for (let attempt = 0; attempt < 40; attempt++) {
        const board = await ctx.host.get(`/boards/${boardId}`);
        const stored = board.cards.find(c => c.id === card.id);
        if (!stored) throw new Error('This document was deleted');
        if (stored.text === name && JSON.stringify(stored.props?.doc) === snapshotJSON && stored.props?.body === cmd.set.props.body) {
          minimumRev = Math.max(minimumRev, board.rev);
          if (revision === version) { saving = false; setStatus('Saved'); } return;
        }
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      throw new Error('The host has not confirmed the save');
    }).catch(error => {
      if (revision === version) { saving = false; dirty = true; setStatus('Not saved. Edit to retry.'); }
      ctx.toast(`Document save failed: ${error.message}`);
    });
    return pendingSave;
  }
  const close = options => side.close(options);
  panel.addEventListener('side-editor-close', () => {
    panel.querySelector('.docs-math-source')?.blur();
    save(); closed = true; clearInterval(watch); clearTimeout(timer);
    document.removeEventListener('keydown', keys, true); document.removeEventListener('visibilitychange', visibility);
    menuPopup.destroy(); colourPopups.forEach(popup => popup.destroy());
    window.removeEventListener('pagehide', save);
    editor.destroy(); bubble.remove();
    fonts.destroy();
    if (active?.id === card.id) active = null;
  }, { once: true });
  function pasteCards(data) {
    try {
      const payload = JSON.parse(data);
      if (payload.boardId !== boardId || !Array.isArray(payload.ids)) return false;
      const cards = ctx.canvas.board.cards.filter(c => payload.ids.includes(c.id) && c.id !== card.id && COPY_TYPES.has(c.type));
      if (!cards.length) return false;
      editor.chain().focus().insertContent(cards.flatMap(contentForCard)).run(); return true;
    } catch { return false; }
  }
  function pasteClip(data) {
    try {
      const clip = JSON.parse(data);
      const cards = (clip.cards ?? []).filter(c => c && c.id !== card.id && COPY_TYPES.has(c.type));
      if (!cards.length) return false;
      editor.chain().focus().insertContent(cards.flatMap(contentForCard)).run(); return true;
    } catch { return false; }
  }
  async function image(file, pos) {
    if (!file?.type.startsWith('image/')) return;
    try {
      if (file.size > 600000) throw new Error('Choose an image smaller than 600 KB to fit the board document limit');
      let src = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
      if (!/^image\/(png|jpe?g|gif|bmp)$/.test(file.type)) {
        const picture = new Image(); picture.src = src; await picture.decode();
        const canvas = document.createElement('canvas'); canvas.width = picture.naturalWidth; canvas.height = picture.naturalHeight;
        canvas.getContext('2d').drawImage(picture, 0, 0); src = canvas.toDataURL('image/png');
      }
      if (editor.isDestroyed) return;
      const node = { type: 'image', attrs: { src, alt: file.name } };
      const nextSize = JSON.stringify(editor.getJSON()).length + src.length;
      if (nextSize > 950000) throw new Error('This image would exceed the board document limit');
      editor.chain().focus().insertContentAt(Math.min(pos ?? editor.state.selection.to, editor.state.doc.content.size), node).run();
    } catch (error) { ctx.toast(`Could not add image: ${error.message}`); }
  }
  editor = new Editor({
    element: $('.docs-body'), extensions: [...extensions(), BubbleMenu.configure({ element: bubble, appendTo: () => panel, options: { placement: 'top', offset: 8 }, shouldShow: ({ state }) => !state.selection.empty && !!state.doc.textBetween(state.selection.from, state.selection.to).trim() && !editor.isActive('image') })],
    content: loadContent(card),
    editorProps: {
      attributes: { class: 'docs-prose', spellcheck: 'true', 'aria-label': 'Document content' },
      handleKeyDown: (_view, event) => {
        if (event.metaKey || event.ctrlKey) {
          if (event.key.toLowerCase() === 'k') { event.preventDefault(); showLink(); return true; }
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const payload = event.clipboardData?.getData(clipboardType);
        if (payload && pasteCards(payload)) { event.preventDefault(); return true; }
        // The board's own clip (copied by the editing feature) carries whole cards, so it works across boards too.
        const clip = event.clipboardData?.getData('text/x-aegis');
        if (clip && pasteClip(clip)) { event.preventDefault(); return true; }
        const files = [...(event.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'));
        if (files.length) { event.preventDefault(); files.forEach(f => image(f)); return true; }
        const text = event.clipboardData?.getData('text/plain');
        const markdown = /(^|\n)(#{1,3} |[-*>] |\d+\. |```|\$\$|---)|\*\*.+\*\*|\[.+\]\(.+\)|\$[^$\n]+\$/m.test(text ?? '');
        if (!text || (event.clipboardData?.getData('text/html') && !markdown) || editor.isActive('codeBlock')) return false;
        event.preventDefault(); editor.chain().focus().insertContent(markdownHTML(text)).run(); return true;
      },
      handleDrop: (view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter(f => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault(); const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        files.forEach(f => image(f, pos)); return true;
      },
    },
    onUpdate: () => { schedule(); paint(); }, onSelectionUpdate: () => paint(),
  });
  lastDoc = JSON.stringify(editor.getJSON());
  // The formatting ribbon sits above the page in groups: history, style, type, paragraph, insert.
  const ribbon = $('.docs-ribbon'), group = () => { const g = document.createElement('div'); g.className = 'ribbon-group'; ribbon.append(g); return g; };
  const history = group(), styleGroup = group(), typeGroup = group(), markGroup = group(), paraGroup = group(), insertGroup = group();
  let tool = history;
  const toggles = [];
  const action = (label, text, fn, mark, parent = tool) => {
    const el = button(label, text, () => { editor.view.focus(); fn(); paint(); }); parent.append(el); if (mark) toggles.push([el, mark]); return el;
  };
  const undo = action('Undo', 'Undo', () => editor.chain().focus().undo().run());
  const redo = action('Redo', 'Redo', () => editor.chain().focus().redo().run());
  tool = styleGroup;
  const blocks = select('Block style', [['body', 'Body'], ['title', 'Title'], ['heading', 'Heading'], ['sub', 'Subheading'], ['lead', 'Lead'], ['caption', 'Caption'], ['quote', 'Quote'], ['code', 'Code']], value => {
    let chain = editor.chain().clearNodes();
    if (['title', 'heading', 'sub'].includes(value)) chain = chain.setHeading({ level: ['title', 'heading', 'sub'].indexOf(value) + 1 });
    else if (value === 'quote') chain = chain.setBlockquote();
    else if (value === 'code') chain = chain.setCodeBlock();
    else chain = chain.setParagraph().updateAttributes('paragraph', { kind: ['lead', 'caption'].includes(value) ? value : null });
    chain.run();
  }); tool.append(blocks);
  tool = typeGroup;
  const used = new Set();
  function collect(node) { for (const mark of node?.marks ?? []) if (mark.attrs?.fontFamily) used.add(mark.attrs.fontFamily); for (const child of node?.content ?? []) collect(child); }
  for (const c of ctx.canvas.board.cards) { collect(c.props?.doc); if (c.props?.font) used.add(c.props.font); }
  const fonts = writingFontChooser([...used]);
  // Keep form controls focused. TipTap's focus() queues a frame that can steal
  // focus from the next field and insert its typed value into the document.
  fonts.onchange = () => { if (fonts.fontFamily) editor.chain().setFontFamily(fonts.fontFamily).run(); }; tool.append(fonts);
  const sizes = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72];
  const { el: sizeControl, input: size } = createStepper({ label: 'Font size', min: 6, max: 200,
    next: (value, direction) => direction < 0 ? [...sizes].reverse().find(n => n < value) ?? value - 1 : sizes.find(n => n > value) ?? value + 1,
    onChange: value => editor.chain().setFontSize(`${value}px`).run(),
  }); tool.append(sizeControl);
  function inline(parent) {
    for (const [label, text, mark, command] of [['Bold', 'B', 'bold', 'toggleBold'], ['Italic', 'I', 'italic', 'toggleItalic'], ['Underline', 'U', 'underline', 'toggleUnderline'], ['Strikethrough', 'S̶', 'strike', 'toggleStrike']]) action(label, text, () => editor.chain().focus()[command]().run(), mark, parent);
    action('Link', 'Link', showLink, 'link', parent);
  }
  tool = markGroup; inline(tool); inline(bubble);
  const palette = ['#25252b', '#6b6370', '#e8590c', '#1f9d63', '#1f7ae0', '#6b4fe0', '#c0392b'];
  for (const c of ctx.canvas.board.cards) { const colour = c.props?.hex ?? c.color; if (/^#[0-9a-f]{6}$/i.test(colour)) palette.push(colour); }
  function colourPicker(label, highlight) {
    const menu = document.createElement('details'); menu.className = 'docs-colours';
    const summary = document.createElement('summary'); summary.title = label; summary.setAttribute('aria-label', label);
    // A letter with a colour bar for text, a marker for highlight.
    summary.innerHTML = highlight ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 11 6.5-6.5 2 2L6 13H4zM9 6l2 2"/><path d="M2.5 14.5h11" stroke="var(--warn)" stroke-width="2"/></svg>' : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 11 3.5-8.5 3.5 8.5M5.7 8.2h4.6"/><path d="M2.5 14.5h11" stroke="var(--data)" stroke-width="2"/></svg>';
    menu.append(summary);
    const choices = document.createElement('div'); menu.append(choices);
    const colourPopup = bindDisclosure(menu, { label: label + ' choices' }); colourPopups.push(colourPopup);
    const set = colour => { const chain = editor.chain().focus(); (highlight ? chain.setHighlight({ color: colour }) : chain.setColor(colour)).run(); menu.open = false; };
    for (const colour of highlight ? ['#fff1a8', '#ffd3e5', '#cdf2df', '#d4e8ff', '#e5dbff', ...palette.slice(7)] : palette) {
      const pick = button(`${label} ${colour}`, '', () => set(colour)); pick.style.background = colour; choices.append(pick);
    }
    const wheel = createColourPicker({ label: `Any ${label.toLowerCase()}`, value: highlight ? '#fff1a8' : '#25252b', board: () => ctx.canvas.board, onChange(colour) { const chain = editor.chain(); (highlight ? chain.setHighlight({ color: colour }) : chain.setColor(colour)).run(); } }); choices.append(wheel);
    choices.append(button(`Remove ${label.toLowerCase()}`, 'Reset', () => { const chain = editor.chain().focus(); (highlight ? chain.unsetHighlight() : chain.unsetColor()).run(); menu.open = false; }));
    tool.append(menu);
  }
  colourPicker('Text colour', false); colourPicker('Highlight', true);
  tool = paraGroup;
  const align = select('Text alignment', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['justify', 'Justified']], value => editor.chain().setTextAlign(value).run()); tool.append(align);
  action('Bullet list', 'List', () => editor.chain().focus().toggleBulletList().run(), 'bulletList');
  action('Numbered list', '1. List', () => editor.chain().focus().toggleOrderedList().run(), 'orderedList');
  action('Task list', 'Tasks', () => editor.chain().focus().toggleTaskList().run(), 'taskList');
  tool = insertGroup;
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
  file.onchange = () => { if (file.files[0]) image(file.files[0]); file.value = ''; }; panel.append(file);
  action('Insert image', 'Image', () => file.click());
  action('Insert table', 'Table', () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run());
  action('Divider', 'Divider', () => editor.chain().focus().setHorizontalRule().run());
  action('Clear formatting', 'Clear', () => editor.chain().focus().unsetAllMarks().clearNodes().run());
  const more = select('More formatting', [['', 'More'], ['1', 'Single spacing'], ['1.15', '1.15 spacing'], ['1.5', '1.5 spacing'], ['2', 'Double spacing'], ['superscript', 'Superscript'], ['subscript', 'Subscript']], value => {
    if (['superscript', 'subscript'].includes(value)) editor.chain().toggleMark(value).run();
    else if (value) editor.chain().updateAttributes(editor.isActive('heading') ? 'heading' : 'paragraph', { lineHeight: value }).run();
    more.value = '';
  }); tool.append(more);
  // Table tools appear as their own ribbon group only while the caret is in a table.
  const tableTools = group(); tableTools.classList.add('docs-table-tools');
  for (const [label, command] of [['Add row', 'addRowAfter'], ['Remove row', 'deleteRow'], ['Add column', 'addColumnAfter'], ['Remove column', 'deleteColumn'], ['Header row', 'toggleHeaderRow'], ['Delete table', 'deleteTable']]) action(label, label, () => editor.chain().focus()[command]().run(), null, tableTools);

  function openForm(form, label) {
    panel.append(form);
    const trigger = document.activeElement?.closest('button, summary') ?? ribbon;
    const popup = createPopup({ trigger, menu: form, role: 'dialog', bindTrigger: false, portal: true, onToggle(open) { if (!open) form.remove(); } });
    popup.menu.setAttribute('aria-label', label); colourPopups.push(popup); popup.open();
  }
  function showLink() {
    panel.querySelector('.docs-link-form')?.remove();
    const form = document.createElement('form'); form.className = 'docs-link-form';
    const input = document.createElement('input'); input.type = 'url'; input.placeholder = 'https://example.com'; input.setAttribute('aria-label', 'Link address'); input.value = editor.getAttributes('link').href ?? '';
    const submit = document.createElement('button'); submit.textContent = 'Apply link'; submit.type = 'submit'; form.append(input, submit);
    form.append(button('Remove link', 'Remove', () => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); form.remove(); }));
    form.append(button('Open link', 'Open', () => { if (/^(https?:|mailto:)/i.test(input.value)) ctx.host.openUrl(input.value); }));
    form.append(button('Close link menu', '×', () => { form.remove(); editor.commands.focus(); }));
    form.onsubmit = event => { event.preventDefault(); if (!/^(https?:|mailto:)/i.test(input.value)) return ctx.toast('Use an https, http or email link'); editor.chain().focus().extendMarkRange('link').setLink({ href: input.value }).run(); form.remove(); };
    openForm(form, 'Edit document link'); input.focus();
  }
  let rewriting = false;
  async function requestRewrite(how) {
    if (rewriting) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return ctx.toast('Select some words to rewrite first');
    if (!rewrite) return ctx.toast('Document rewriting needs an Aegis agent host adapter');
    const original = editor.state.doc.textBetween(from, to, '\n'), snapshot = editor.state.doc;
    setStatus('Rewriting…');
    rewriting = true;
    for (const control of [ai, bubble]) control.setAttribute('aria-busy', 'true');
    try {
      const result = await rewrite({ text: original, how, title: title.value, around: editor.state.doc.textBetween(Math.max(0, from - 700), Math.min(editor.state.doc.content.size, to + 700), '\n'), boardId, cardId: card.id, host: ctx.host });
      if (closed) return;
      if (!editor.state.doc.eq(snapshot)) return ctx.toast('The document changed. Select the words and try again');
      if (typeof result !== 'string' || !result.trim()) throw new Error('The agent returned no text');
      editor.chain().focus().insertContentAt({ from, to }, { type: 'text', text: result }).setTextSelection({ from, to: from + result.length }).run();
    } catch (error) { ctx.toast(`Could not rewrite: ${error.message}`); }
    finally {
      rewriting = false;
      for (const control of [ai, bubble]) control.setAttribute('aria-busy', 'false');
      if (!dirty && !saving) setStatus('Saved');
    }
  }
  function rewriteMenu(parent) {
    const chooser = select('Rewrite selection', [['', 'Rewrite'], ...['Shorter', 'Clearer', 'Friendlier', 'More confident', 'More professional', 'Fix spelling & grammar', 'Into bullet points', 'Custom instruction'].map(v => [v, v])], value => {
      chooser.value = ''; if (!value) return;
      if (value === 'Custom instruction') {
        const form = document.createElement('form'); form.className = 'docs-link-form';
        const input = document.createElement('input'); input.setAttribute('aria-label', 'Rewrite instruction'); input.placeholder = 'How should the selection change?';
        const submit = document.createElement('button'); submit.textContent = 'Rewrite'; form.append(input, submit);
        form.append(button('Cancel rewrite', 'Cancel', () => form.remove()));
        form.onsubmit = event => { event.preventDefault(); if (input.value.trim()) requestRewrite(input.value.trim()); form.remove(); }; openForm(form, 'Rewrite instruction'); input.focus();
      } else requestRewrite(value);
    });
    chooser.querySelector('button').insertAdjacentHTML('afterbegin', OrbMark());
    parent.append(chooser);
  }
  const ai = group(); ai.classList.add('ribbon-ai'); rewriteMenu(ai); rewriteMenu(bubble);
  function commandPopover(label, content, className) {
    const details = document.createElement('details'); details.className = className;
    const summary = document.createElement('summary'); summary.textContent = label; summary.setAttribute('aria-label', `${label} document`);
    const body = document.createElement('div'); body.className = 'docs-command-menu'; body.append(...content);
    details.append(summary, body); colourPopups.push(bindDisclosure(details, { label: `${label} document controls` })); return details;
  }
  const advanced = document.createElement('div'); advanced.className = 'ribbon-group';
  for (const control of [...markGroup.children]) if (!['Bold', 'Italic'].includes(control.getAttribute('aria-label'))) advanced.append(control);
  advanced.append(align);
  const clear = insertGroup.querySelector('[aria-label="Clear formatting"]'); advanced.append(clear, more);
  for (const control of insertGroup.querySelectorAll('button')) {
    const name = document.createElement('span'); name.textContent = control.getAttribute('aria-label'); control.append(name);
  }
  const insert = commandPopover('Insert', [insertGroup], 'docs-insert');
  const format = commandPopover('Format', [typeGroup, advanced, tableTools, history], 'docs-format');
  ribbon.replaceChildren(styleGroup, markGroup, paraGroup, insert, ai, format);
  function paint() {
    if (!editor || editor.isDestroyed || !tableTools) return;
    const attrs = editor.getAttributes('textStyle');
    if (document.activeElement !== fonts) fonts.setFont(attrs.fontFamily || 'Inter Variable');
    if (document.activeElement !== size) size.value = String(parseFloat(attrs.fontSize) || 18);
    blocks.value = editor.isActive('heading') ? ['title', 'heading', 'sub'][editor.getAttributes('heading').level - 1] : editor.isActive('blockquote') ? 'quote' : editor.isActive('codeBlock') ? 'code' : editor.getAttributes('paragraph').kind || 'body';
    align.value = editor.getAttributes('paragraph').textAlign || editor.getAttributes('heading').textAlign || 'left';
    for (const [el, mark] of toggles) el.setAttribute('aria-pressed', String(editor.isActive(mark)));
    undo.disabled = !editor.can().undo(); redo.disabled = !editor.can().redo(); tableTools.hidden = !editor.isActive('table');
    $('[data-count]').textContent = wordCountLabel(wordCount(editor.getJSON()));
    syncCopyAction();
  }
  title.oninput = schedule;
  title.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); editor.commands.focus('start'); editor.view.focus(); } };
  $('[data-back]').onclick = event => close({ keyboard: event.detail === 0 });
  const pageColour = select('Page colour', [['auto', 'Auto page'], ['light', 'Light page'], ['dark', 'Dark page']], () => colourPage());
  $('.docs-page-options').append(pageColour); pageColour.value = localStorage.getItem('aegis:doc-page') || 'auto';
  const colourPage = () => { panel.dataset.page = pageColour.value; localStorage.setItem('aegis:doc-page', pageColour.value); }; pageColour.onchange = colourPage; colourPage();
  const paper = select('Paper size', [['a4', 'A4'], ['letter', 'Letter']], () => localStorage.setItem('aegis:doc-paper', paper.value));
  $('.docs-page-options').append(paper); paper.value = localStorage.getItem('aegis:doc-paper') || 'a4';
  async function exportDoc(word) {
    save(); const el = word ? $('[data-word]') : $('[data-pdf]'); el.disabled = true;
    ctx.toast(word ? 'Preparing Word document…' : 'Preparing print preview. Choose Save as PDF in the print dialogue.');
    try { await (word ? downloadWord(editor, title.value, paper.value) : printPDF(editor, title.value, paper.value)); menu.open = false; }
    catch (error) { ctx.toast(`Could not export: ${error.message}`); } finally { el.disabled = false; }
  }
  $('[data-pdf]').onclick = () => exportDoc(false); $('[data-word]').onclick = () => exportDoc(true);
  copyCards.onclick = () => { copyIntoDocument(ctx.canvas.board.cards.filter(c => ctx.selection().includes(c.id)), ctx); menu.open = false; };
  function keys(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.target.closest?.('.docs-math-source')) { event.target.blur(); editor.commands.focus(); return; }
    const choice = event.target.closest?.('.docs-choice');
    if (choice?.querySelector('[aria-expanded=true]')) { choice.close(); choice.querySelector('button').focus(); return; }
    const popup = panel.querySelector('.docs-link-form');
    if (popup) { popup.remove(); editor.commands.focus(); } else if (menu.open) { menu.open = false; menu.querySelector('summary').focus(); } else close({ keyboard: true });
  }
  const visibility = () => { if (document.hidden) save(); };
  document.addEventListener('keydown', keys, true); document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', save);
  const watch = setInterval(() => {
    if (ctx.canvas.board.id !== boardId) { close(); return; }
    syncCopyAction();
    const latest = ctx.canvas.board.cards.find(c => c.id === card.id);
    if (ctx.canvas.board.rev < minimumRev) return;
    if (!latest) { dirty = false; close(); return; }
    if (!dirty && !saving && (JSON.stringify(latest.props?.doc) !== lastDoc || latest.props?.body !== lastBody || title.value !== latest.text)) {
      const content = loadContent(latest);
      editor.commands.setContent(content, { emitUpdate: false });
      lastDoc = JSON.stringify(latest.props?.doc); lastBody = latest.props?.body; title.value = latest.text;
      if (content !== latest.props?.doc && !latest.props?.docTitleMigrated) schedule();
      paint();
    }
  }, 500);
  active = { id: card.id, boardId, editor, panel, close, save, ctx };
  if (!card.props?.docTitleMigrated) schedule();
  paint(); title.focus({ preventScroll: true }); centreCardInLeft(card, ctx, keyboard);
}

export function copyIntoDocument(cards, ctx, target = active?.id, point) {
  const supported = cards.filter(c => c.id !== target && COPY_TYPES.has(c.type));
  if (!supported.length) { ctx.toast('Select notes, headings, checklists, links or other text cards to copy'); return; }
  const content = supported.flatMap(contentForCard);
  if (active?.id === target && active.boardId === ctx.canvas.board.id) {
    const ed = active.editor;
    const pos = point ? ed.view.posAtCoords({ left: point.x, top: point.y })?.pos : null;
    ed.chain().focus().insertContentAt(pos ?? ed.state.doc.content.size, content).run(); active.save();
    ctx.toast(`Copied ${supported.length} card${supported.length === 1 ? '' : 's'} into the document. Use Undo to restore.`);
  } else {
    const card = ctx.canvas.board.cards.find(c => c.id === target); if (!card) return;
    const before = { doc: card.props?.doc ?? null, body: card.props?.body ?? null, docTitleMigrated: card.props?.docTitleMigrated ?? null };
    const ed = new Editor({ extensions: extensions(), content: loadContent(card) });
    ed.commands.insertContentAt(ed.state.doc.content.size, content);
    const after = ed.getJSON(), boardId = ctx.canvas.board.id;
    ctx.apply([documentUpdate(target, after)]); ed.destroy();
    document.querySelector('.docs-copy-notice')?.remove();
    const notice = document.createElement('div'); notice.className = 'docs-copy-notice'; notice.setAttribute('role', 'status');
    notice.append('Cards copied into document. ', button('Undo card copy', 'Undo', () => {
      const current = ctx.canvas.board.cards.find(c => c.id === target);
      if (ctx.canvas.board.id !== boardId || JSON.stringify(current?.props?.doc) !== JSON.stringify(after)) {
        ctx.toast('The document changed after copying. Open it to review the changes'); notice.remove(); return;
      }
      ctx.apply([{ op: 'update', id: target, set: { props: before } }]); notice.remove();
    }));
    document.body.append(notice); setTimeout(() => notice.remove(), 8000);
    ctx.toast(`Copied ${supported.length} card${supported.length === 1 ? '' : 's'} into the document`);
  }
}

export function resolveDocumentDrop({ cards, x, y }) {
  document.querySelectorAll('.docs-drop-target').forEach(el => el.classList.remove('docs-drop-target'));
  const ctx = globalThis.aegisCtx;
  if (!ctx || !cards.length || !cards.every(c => COPY_TYPES.has(c.type))) return;
  if (active && !cards.some(c => c.id === active.id) && inRect(active.panel, x, y)) {
    active.panel.classList.add('docs-drop-target');
    return () => copyIntoDocument(cards, ctx, active.id, { x, y });
  }
  const moving = new Set(cards.map(c => c.id));
  const target = [...document.querySelectorAll('.card.doc')].reverse().find(el => !moving.has(el.dataset.id) && inRect(el, x, y));
  if (target) { target.classList.add('docs-drop-target'); return () => copyIntoDocument(cards, ctx, target.dataset.id); }
}

export function installDocumentClipboard() {
  document.addEventListener('copy', event => {
    if (event.target.closest?.('input, textarea, [contenteditable]') || String(window.getSelection())) return;
    const ctx = globalThis.aegisCtx; if (!ctx?.canvas.board) return;
    const cards = ctx.canvas.board.cards.filter(c => ctx.selection().includes(c.id) && COPY_TYPES.has(c.type));
    if (!cards.length) return;
    event.clipboardData.setData(clipboardType, JSON.stringify({ boardId: ctx.canvas.board.id, ids: cards.map(c => c.id) }));
    event.clipboardData.setData('text/plain', cards.map(c => c.props?.body ?? c.text).join('\n\n')); event.preventDefault();
  });
}
