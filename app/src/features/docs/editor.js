// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { Editor, generateJSON } from '@tiptap/core';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import { extensions } from './extensions.js';
import { cardContent, COPY_TYPES, documentUpdate, markdownHTML } from './content.js';
import { downloadWord, printPDF } from './export.js';

let active = null;
let rewrite = null;
/** Host adapters return replacement text. No provider credentials enter this module. */
export function registerDocRewriter(handler) { rewrite = handler; return () => { if (rewrite === handler) rewrite = null; }; }
export const currentDocument = () => active;
const button = (label, text, action) => {
  const el = document.createElement('button'); el.type = 'button'; el.title = label; el.setAttribute('aria-label', label);
  el.textContent = text; el.onpointerdown = e => e.preventDefault(); el.onclick = action; return el;
};
const select = (label, items, change) => {
  const el = document.createElement('select'); el.setAttribute('aria-label', label); el.title = label;
  for (const [value, name] of items) el.add(new Option(name, value));
  el.onchange = () => change(el.value); return el;
};
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

export function openDocument(card, ctx) {
  if (active?.id === card.id && active.boardId === ctx.canvas.board.id) { active.editor.commands.focus(); return; }
  active?.close();
  const boardId = ctx.canvas.board.id;
  const panel = document.createElement('aside'); panel.className = 'docs-panel'; panel.setAttribute('aria-label', 'Document editor');
  panel.innerHTML = `<header class="docs-header"><button type="button" data-back>← Back to board</button><span class="docs-crumb"></span><span class="docs-spacer"></span><select aria-label="Page colour"><option value="auto">Auto page</option><option value="light">Light page</option><option value="dark">Dark page</option></select><details class="docs-download"><summary>Download</summary><div><label>Paper <select aria-label="Paper size"><option value="a4">A4</option><option value="letter">Letter</option></select></label><button type="button" data-pdf>Download PDF</button><button type="button" data-word>Download Word</button></div></details><button type="button" data-expand aria-label="Full page" aria-pressed="false">⤢</button><button type="button" data-close aria-label="Close document">×</button></header><div class="docs-toolbar" role="toolbar" aria-label="Document formatting"></div><div class="docs-scroll"><article class="docs-paper"><input class="docs-title" aria-label="Document title" placeholder="Untitled document"><div class="docs-body"></div></article></div><footer class="docs-footer"><span data-count></span><span data-saved role="status">Saved</span><span class="docs-spacer"></span><button type="button" data-copy-cards>Copy selected board cards</button></footer>`;
  const bubble = document.createElement('div'); bubble.className = 'docs-bubble'; bubble.setAttribute('role', 'toolbar'); bubble.setAttribute('aria-label', 'Selection formatting');
  document.body.append(panel); panel.append(bubble); document.body.classList.add('docs-open');
  const $ = selector => panel.querySelector(selector);
  $('.docs-crumb').textContent = `${ctx.canvas.board.name} > ${card.text || 'Untitled document'}`;
  const title = $('.docs-title'); title.value = card.text;
  const saved = $('[data-saved]');
  let timer, version = 0, dirty = false, saving = false, closed = false, lastDoc, pendingSave = Promise.resolve();
  let minimumRev = ctx.canvas.board.rev;
  let editor;
  const setStatus = text => { saved.textContent = text; };
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
  function close() {
    if (closed) return; save(); closed = true; clearInterval(watch); clearTimeout(timer);
    document.removeEventListener('keydown', keys, true); document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', save);
    editor.destroy(); panel.remove(); bubble.remove(); document.body.classList.remove('docs-open', 'docs-full');
    if (active?.id === card.id) active = null;
  }
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
    element: $('.docs-body'), extensions: [...extensions(), BubbleMenu.configure({ element: bubble, appendTo: () => panel, options: { placement: 'top', offset: 8 }, shouldShow: ({ state }) => !state.selection.empty && !editor.isActive('image') })],
    content: card.props?.doc ?? markdownHTML(card.props?.body ?? ''),
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
        if (!files.length) return false;
        event.preventDefault(); files.forEach(f => image(f)); return true;
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
  const tool = $('.docs-toolbar');
  const toggles = [];
  const action = (label, text, fn, mark, parent = tool) => {
    const el = button(label, text, () => { fn(); paint(); }); parent.append(el); if (mark) toggles.push([el, mark]); return el;
  };
  const undo = action('Undo', '↶', () => editor.chain().focus().undo().run());
  const redo = action('Redo', '↷', () => editor.chain().focus().redo().run());
  const blocks = select('Block style', [['body', 'Body'], ['title', 'Title'], ['heading', 'Heading'], ['sub', 'Subheading'], ['lead', 'Lead'], ['caption', 'Caption'], ['quote', 'Quote'], ['code', 'Code']], value => {
    let chain = editor.chain().focus().clearNodes();
    if (['title', 'heading', 'sub'].includes(value)) chain = chain.setHeading({ level: ['title', 'heading', 'sub'].indexOf(value) + 1 });
    else if (value === 'quote') chain = chain.setBlockquote();
    else if (value === 'code') chain = chain.setCodeBlock();
    else chain = chain.setParagraph().updateAttributes('paragraph', { kind: ['lead', 'caption'].includes(value) ? value : null });
    chain.run();
  }); tool.append(blocks);
  const fonts = document.createElement('input'); fonts.setAttribute('aria-label', 'Font family'); fonts.title = 'Font family'; fonts.setAttribute('list', 'docs-fonts');
  const fontList = document.createElement('datalist'); fontList.id = 'docs-fonts';
  const used = new Set(['Arial', 'Helvetica Neue', 'Georgia', 'Times New Roman', 'Menlo', 'monospace', 'sans-serif', 'serif']);
  function collect(node) { for (const mark of node?.marks ?? []) if (mark.attrs?.fontFamily) used.add(mark.attrs.fontFamily); for (const child of node?.content ?? []) collect(child); }
  for (const c of ctx.canvas.board.cards) { collect(c.props?.doc); if (c.props?.font) used.add(c.props.font); }
  for (const name of used) fontList.append(new Option(name, name));
  fonts.onchange = () => { if (fonts.value.trim()) editor.chain().focus().setFontFamily(fonts.value.trim()).run(); }; tool.append(fonts, fontList);
  const sizes = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72];
  const size = document.createElement('input'); size.type = 'number'; size.min = '6'; size.max = '200'; size.setAttribute('aria-label', 'Font size');
  const setSize = value => { const n = Math.max(6, Math.min(200, Number(value) || 16)); editor.chain().focus().setFontSize(`${n}px`).run(); size.value = String(n); };
  action('Decrease font size', '−', () => setSize([...sizes].reverse().find(n => n < Number(size.value)) ?? Number(size.value) - 1));
  size.onchange = () => setSize(size.value); tool.append(size);
  action('Increase font size', '+', () => setSize(sizes.find(n => n > Number(size.value)) ?? Number(size.value) + 1));
  function inline(parent) {
    for (const [label, text, mark, command] of [['Bold', 'B', 'bold', 'toggleBold'], ['Italic', 'I', 'italic', 'toggleItalic'], ['Underline', 'U', 'underline', 'toggleUnderline'], ['Strikethrough', 'S̶', 'strike', 'toggleStrike']]) action(label, text, () => editor.chain().focus()[command]().run(), mark, parent);
    action('Link', 'Link', showLink, 'link', parent);
  }
  inline(tool); inline(bubble);
  const palette = ['#25252b', '#6b6370', '#e8590c', '#1f9d63', '#1f7ae0', '#6b4fe0', '#c0392b'];
  for (const c of ctx.canvas.board.cards) { const colour = c.props?.hex ?? c.color; if (/^#[0-9a-f]{6}$/i.test(colour)) palette.push(colour); }
  function colourPicker(label, highlight) {
    const menu = document.createElement('details'); menu.className = 'docs-colours';
    const summary = document.createElement('summary'); summary.textContent = label; menu.append(summary);
    const choices = document.createElement('div'); menu.append(choices);
    const set = colour => { const chain = editor.chain().focus(); (highlight ? chain.setHighlight({ color: colour }) : chain.setColor(colour)).run(); menu.open = false; };
    for (const colour of highlight ? ['#fff1a8', '#ffd3e5', '#cdf2df', '#d4e8ff', '#e5dbff', ...palette.slice(7)] : palette) {
      const pick = button(`${label} ${colour}`, '', () => set(colour)); pick.style.background = colour; choices.append(pick);
    }
    const wheel = document.createElement('input'); wheel.type = 'color'; wheel.setAttribute('aria-label', `Any ${label.toLowerCase()}`); wheel.oninput = () => set(wheel.value); choices.append(wheel);
    choices.append(button(`Remove ${label.toLowerCase()}`, 'Reset', () => { const chain = editor.chain().focus(); (highlight ? chain.unsetHighlight() : chain.unsetColor()).run(); menu.open = false; }));
    tool.append(menu);
  }
  colourPicker('Text colour', false); colourPicker('Highlight', true);
  const align = select('Text alignment', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['justify', 'Justified']], value => editor.chain().focus().setTextAlign(value).run()); tool.append(align);
  action('Bullet list', '• List', () => editor.chain().focus().toggleBulletList().run(), 'bulletList');
  action('Numbered list', '1. List', () => editor.chain().focus().toggleOrderedList().run(), 'orderedList');
  action('Task list', '☑ Tasks', () => editor.chain().focus().toggleTaskList().run(), 'taskList');
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
  file.onchange = () => { if (file.files[0]) image(file.files[0]); file.value = ''; }; panel.append(file);
  action('Insert image', 'Image', () => file.click());
  action('Insert table', 'Table', () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run());
  action('Divider', 'Divider', () => editor.chain().focus().setHorizontalRule().run());
  action('Clear formatting', 'Clear', () => editor.chain().focus().unsetAllMarks().clearNodes().run());
  const more = select('More formatting', [['', 'More'], ['1', 'Single spacing'], ['1.15', '1.15 spacing'], ['1.5', '1.5 spacing'], ['2', 'Double spacing'], ['superscript', 'Superscript'], ['subscript', 'Subscript']], value => {
    if (['superscript', 'subscript'].includes(value)) editor.chain().focus().toggleMark(value).run();
    else if (value) editor.chain().focus().updateAttributes(editor.isActive('heading') ? 'heading' : 'paragraph', { lineHeight: value }).run();
    more.value = '';
  }); tool.append(more);
  const tableTools = document.createElement('span'); tableTools.className = 'docs-table-tools'; tool.append(tableTools);
  for (const [label, command] of [['Add row', 'addRowAfter'], ['Remove row', 'deleteRow'], ['Add column', 'addColumnAfter'], ['Remove column', 'deleteColumn'], ['Header row', 'toggleHeaderRow'], ['Delete table', 'deleteTable']]) action(label, label, () => editor.chain().focus()[command]().run(), null, tableTools);

  function showLink() {
    panel.querySelector('.docs-link-form')?.remove();
    const form = document.createElement('form'); form.className = 'docs-link-form';
    const input = document.createElement('input'); input.type = 'url'; input.placeholder = 'https://example.com'; input.setAttribute('aria-label', 'Link address'); input.value = editor.getAttributes('link').href ?? '';
    const submit = document.createElement('button'); submit.textContent = 'Apply link'; submit.type = 'submit'; form.append(input, submit);
    form.append(button('Remove link', 'Remove', () => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); form.remove(); }));
    form.append(button('Open link', 'Open', () => { if (/^(https?:|mailto:)/i.test(input.value)) ctx.host.openUrl(input.value); }));
    form.append(button('Close link menu', '×', () => { form.remove(); editor.commands.focus(); }));
    form.onsubmit = event => { event.preventDefault(); if (!/^(https?:|mailto:)/i.test(input.value)) return ctx.toast('Use an https, http or email link'); editor.chain().focus().extendMarkRange('link').setLink({ href: input.value }).run(); form.remove(); };
    panel.append(form); input.focus();
  }
  async function requestRewrite(how) {
    const { from, to, empty } = editor.state.selection;
    if (empty) return ctx.toast('Select some words to rewrite first');
    if (!rewrite) return ctx.toast('Document rewriting needs an Aegis agent host adapter');
    const original = editor.state.doc.textBetween(from, to, '\n'), snapshot = editor.state.doc;
    setStatus('Rewriting…');
    try {
      const result = await rewrite({ text: original, how, title: title.value, around: editor.state.doc.textBetween(Math.max(0, from - 700), Math.min(editor.state.doc.content.size, to + 700), '\n'), boardId, cardId: card.id, host: ctx.host });
      if (closed) return;
      if (!editor.state.doc.eq(snapshot)) return ctx.toast('The document changed. Select the words and try again');
      if (typeof result !== 'string' || !result.trim()) throw new Error('The agent returned no text');
      editor.chain().focus().insertContentAt({ from, to }, { type: 'text', text: result }).setTextSelection({ from, to: from + result.length }).run();
    } catch (error) { ctx.toast(`Could not rewrite: ${error.message}`); }
    finally { if (!dirty && !saving) setStatus('Saved'); }
  }
  function rewriteMenu(parent) {
    const chooser = select('Rewrite selection', [['', 'Rewrite'], ...['Shorter', 'Clearer', 'Friendlier', 'More confident', 'More professional', 'Fix spelling & grammar', 'Into bullet points', 'Custom instruction'].map(v => [v, v])], value => {
      chooser.value = ''; if (!value) return;
      if (value === 'Custom instruction') {
        const form = document.createElement('form'); form.className = 'docs-link-form';
        const input = document.createElement('input'); input.setAttribute('aria-label', 'Rewrite instruction'); input.placeholder = 'How should the selection change?';
        const submit = document.createElement('button'); submit.textContent = 'Rewrite'; form.append(input, submit);
        form.append(button('Cancel rewrite', 'Cancel', () => form.remove()));
        form.onsubmit = event => { event.preventDefault(); if (input.value.trim()) requestRewrite(input.value.trim()); form.remove(); }; panel.append(form); input.focus();
      } else requestRewrite(value);
    }); parent.append(chooser);
  }
  rewriteMenu(tool); rewriteMenu(bubble);
  function paint() {
    if (!editor || editor.isDestroyed || !tableTools) return;
    const attrs = editor.getAttributes('textStyle');
    if (document.activeElement !== fonts) fonts.value = attrs.fontFamily || 'Arial';
    if (document.activeElement !== size) size.value = String(parseFloat(attrs.fontSize) || 16);
    blocks.value = editor.isActive('heading') ? ['title', 'heading', 'sub'][editor.getAttributes('heading').level - 1] : editor.isActive('blockquote') ? 'quote' : editor.isActive('codeBlock') ? 'code' : editor.getAttributes('paragraph').kind || 'body';
    align.value = editor.getAttributes('paragraph').textAlign || editor.getAttributes('heading').textAlign || 'left';
    for (const [el, mark] of toggles) el.setAttribute('aria-pressed', String(editor.isActive(mark)));
    undo.disabled = !editor.can().undo(); redo.disabled = !editor.can().redo(); tableTools.hidden = !editor.isActive('table');
    const words = editor.storage.characterCount.words(); $('[data-count]').textContent = `${words.toLocaleString()} word${words === 1 ? '' : 's'}`;
  }
  title.oninput = () => { $('.docs-crumb').textContent = `${ctx.canvas.board.name} > ${title.value || 'Untitled document'}`; schedule(); };
  title.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); editor.commands.focus('start'); editor.view.focus(); } };
  $('[data-back]').onclick = close; $('[data-close]').onclick = close;
  $('[data-expand]').onclick = () => { const full = document.body.classList.toggle('docs-full'); $('[data-expand]').setAttribute('aria-pressed', String(full)); };
  const pageColour = $('[aria-label="Page colour"]'); pageColour.value = localStorage.getItem('aegis:doc-page') || 'auto';
  const colourPage = () => { panel.dataset.page = pageColour.value; localStorage.setItem('aegis:doc-page', pageColour.value); }; pageColour.onchange = colourPage; colourPage();
  const paper = $('[aria-label="Paper size"]'); paper.value = localStorage.getItem('aegis:doc-paper') || 'a4'; paper.onchange = () => localStorage.setItem('aegis:doc-paper', paper.value);
  async function exportDoc(word) {
    save(); const el = word ? $('[data-word]') : $('[data-pdf]'); el.disabled = true;
    ctx.toast(word ? 'Preparing Word document…' : 'Preparing print preview. Choose Save as PDF in the print dialogue.');
    try { await (word ? downloadWord(editor, title.value, paper.value) : printPDF(editor, title.value, paper.value)); $('.docs-download').open = false; }
    catch (error) { ctx.toast(`Could not export: ${error.message}`); } finally { el.disabled = false; }
  }
  $('[data-pdf]').onclick = () => exportDoc(false); $('[data-word]').onclick = () => exportDoc(true);
  $('[data-copy-cards]').onclick = () => copyIntoDocument(ctx.canvas.board.cards.filter(c => ctx.selection().includes(c.id)), ctx);
  function keys(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const popup = panel.querySelector('.docs-link-form');
    if (popup) { popup.remove(); editor.commands.focus(); } else close();
  }
  const visibility = () => { if (document.hidden) save(); };
  document.addEventListener('keydown', keys, true); document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', save);
  const watch = setInterval(() => {
    if (ctx.canvas.board.id !== boardId) { close(); return; }
    const latest = ctx.canvas.board.cards.find(c => c.id === card.id);
    if (ctx.canvas.board.rev < minimumRev) return;
    if (!latest) { dirty = false; close(); return; }
    if (!dirty && !saving && (JSON.stringify(latest.props?.doc) !== lastDoc || title.value !== latest.text)) {
      editor.commands.setContent(latest.props?.doc ?? markdownHTML(latest.props?.body ?? ''), { emitUpdate: false });
      lastDoc = JSON.stringify(latest.props?.doc); title.value = latest.text;
      $('.docs-crumb').textContent = `${ctx.canvas.board.name} > ${latest.text || 'Untitled document'}`; paint();
    }
  }, 500);
  active = { id: card.id, boardId, editor, panel, close, save, ctx };
  paint(); title.focus();
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
    const before = { doc: card.props?.doc ?? null, body: card.props?.body ?? null };
    const ed = new Editor({ extensions: extensions(), content: card.props?.doc ?? markdownHTML(card.props?.body ?? '') });
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
