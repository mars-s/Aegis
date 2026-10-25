import { createDropdown } from '../../lib/ui/dropdown.js';
import { createMenu } from '../../lib/ui/menu.js';
import { SHORTCUTS, shortcutText } from '../../lib/shortcuts.js';
// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { uid, toolbarOrder } from './model.js';
import { gridShapes } from './grid.js';
export function mountNavigation(ctx, { exportBoard }) {
  const { canvas, apply } = ctx, stage = document.getElementById('stage'), settings = document.getElementById('settings');
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };
  const capture = document.createElement('dialog'); capture.className = 'editing-capture'; capture.setAttribute('aria-label', 'Quick capture');
  capture.innerHTML = '<form><h2>Quick capture</h2><input aria-label="Capture idea" placeholder="An idea or link for Unsorted" autocomplete="off"><div><span class="muted small">Enter to save to Unsorted</span><button type="button">Cancel</button></div></form>';
  document.body.append(capture);
  capture.querySelector('button').onclick = () => capture.close();
  capture.addEventListener('click', e => { if (e.target === capture) capture.close(); });
  capture.querySelector('form').onsubmit = e => {
    e.preventDefault(); const input = capture.querySelector('input'), text = input.value.trim(); if (!text) return;
    const link = /^https?:\/\/\S+$/i.test(text);
    const item = { id: uid(), type: link ? 'link' : 'note', text: link ? '' : text, ...(link ? { url: text } : {}), color: 'plain', x: 0, y: 0, w: link ? 260 : 220, h: 96 };
    apply([{ op: 'board_set', set: { tray: [item, ...(canvas.board.tray ?? [])] } }]);
    // R4 sidebar: reveal the captured idea through its containing disclosure too.
    const panel = document.querySelector('[data-panel="unsorted"]'); panel?.dispatchEvent(new CustomEvent('panelreveal', { bubbles: true }));
    if (panel?.hidden || panel?.closest('aside')?.hidden) ctx.toast('Saved to Unsorted. Show it in Settings, Side bar panels.');
    capture.close(); stage.focus();
  };
  const showPanels = document.createElement('button'); showPanels.className = 'show-panels pill'; showPanels.textContent = 'Show panels'; showPanels.hidden = true; document.body.append(showPanels);
  const clean = on => { document.body.classList.toggle('just-board', on); showPanels.hidden = !on; canvas.redraw(); };
  showPanels.onclick = () => clean(false);
  const hints = document.createElement('div'); hints.className = 'editing-hints';
  hints.innerHTML = '<button aria-label="Hide keyboard hints" title="Hide keyboard hints">×</button>';
  for (const id of ['ask', 'quickCapture', 'newNote', 'focus', 'follow', 'justBoard', 'pan']) {
    const hint = document.createElement('span'), key = document.createElement('span'); key.dataset.shortcut = id; key.dataset.shortcutFormat = 'mac'; key.textContent = shortcutText(id, 'mac');
    hint.append(key, document.createTextNode(` ${SHORTCUTS[id].label}`)); hints.append(hint);
  }
  document.body.append(hints);
  hints.hidden = localStorage.getItem('aegis:hints') === 'hide';
  hints.querySelector('button').onclick = () => { hints.hidden = true; localStorage.setItem('aegis:hints', 'hide'); };
  const zoom = document.createElement('button'); zoom.className = 'text-btn zoom-readout'; zoom.title = 'Zoom'; zoom.setAttribute('aria-label', 'Zoom menu'); document.querySelector('.bar-right').prepend(zoom);
  const zoomMenu = document.createElement('div'); zoomMenu.className = 'editing-zoom-menu'; zoomMenu.hidden = true; document.body.append(zoomMenu);
  function zoomTo(z) { const c = canvas.centre(), v = canvas.view; canvas.glideTo({ x: v.x + c.x * (v.z - z), y: v.y + c.y * (v.z - z), z }); }
  const stops = [.25, .5, .75, 1, 1.25, 1.5, 2, 3, 4];
  function zoomStep(dir) { const z = canvas.view.z; zoomTo(dir > 0 ? stops.find(n => n > z + .01) ?? 4 : stops.findLast(n => n < z - .01) ?? .05); }
  const zoomActions = [['Zoom in', () => zoomStep(1)], ['Zoom out', () => zoomStep(-1)], ['100%', () => zoomTo(1)], ['Fit board', () => canvas.fit()], ['50%', () => zoomTo(.5)], ['200%', () => zoomTo(2)]];
  createMenu({ trigger: zoom, menu: zoomMenu, label: 'Zoom', items: zoomActions.map(([title, run]) => ({ title, run })) });
  stage.addEventListener('canvaspaint', () => { zoom.textContent = `${Math.round(canvas.view.z * 100)}%`; });
  addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    let handled = true;
    if (mod && e.code === 'Backslash') clean(!document.body.classList.contains('just-board'));
    else if (e.key === 'Escape' && document.body.classList.contains('just-board')) clean(false);
    else if (mod && ['=', '+', '-', '_'].includes(e.key)) zoomStep(['=', '+'].includes(e.key) ? 1 : -1);
    else if (mod && e.key === '0') zoomTo(1);
    else if (e.shiftKey && !mod && e.code === 'Digit1') canvas.fit();
    else handled = false;
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  const section = document.createElement('section'); section.className = 'sheet-sec editing-settings'; section.innerHTML = '<h3>Board</h3><label><input type="checkbox" data-hints> Shortcut hints</label><label>Grid <span data-grid-slot></span></label><label><input type="checkbox" data-crisp> Crisp zoom</label><h3>Your toolbar</h3><label>Tool size <span data-size-slot></span></label><div class="toolbar-options"></div><button type="button" data-reset>Reset toolbar</button><h3>Export</h3><button type="button" data-export>Download board as PNG</button><button type="button" data-pdf>Download board as PDF</button>';
  settings.append(section);
  const hintsInput = section.querySelector('[data-hints]'); hintsInput.checked = !hints.hidden;
  hintsInput.onchange = () => { hints.hidden = !hintsInput.checked; localStorage.setItem('aegis:hints', hints.hidden ? 'hide' : 'show'); };
  const grid = createDropdown({ label: 'Grid', options: gridShapes }); grid.dataset.grid = ''; section.querySelector('[data-grid-slot]').replaceWith(grid); grid.value = localStorage.getItem('aegis:grid') || 'dots'; grid.onchange = () => { localStorage.setItem('aegis:grid', grid.value); canvas.redraw(); };
  const crisp = section.querySelector('[data-crisp]'); crisp.checked = localStorage.getItem('aegis:crisp') === 'on';
  const setCrisp = () => { document.body.classList.toggle('crisp-zoom', crisp.checked); canvas.redraw(); };
  crisp.onchange = () => { localStorage.setItem('aegis:crisp', crisp.checked ? 'on' : 'off'); setCrisp(); }; setCrisp();
  const tools = document.getElementById('tools'), options = section.querySelector('.toolbar-options'), size = createDropdown({ label: 'Tool size', options: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']] }); size.dataset.size = ''; section.querySelector('[data-size-slot]').replaceWith(size);
  const more = document.createElement('button'); more.className = 'tools-more'; more.textContent = '···'; more.title = 'More tools'; more.setAttribute('aria-label', 'More tools'); more.hidden = true; tools.querySelector('.tools-fold').before(more);
  const overflow = document.createElement('div'); overflow.className = 'editing-tool-overflow'; overflow.hidden = true; document.body.append(overflow);
  function fitTools() {
    tools.querySelectorAll('[data-overflow]').forEach(b => { delete b.dataset.overflow; }); more.hidden = true;
    if (tools.classList.contains('folded')) return;
    const buttons = [...tools.querySelectorAll('[data-tool]')].filter(b => !b.hidden), room = innerHeight - tools.getBoundingClientRect().top - 22;
    for (let i = buttons.length - 1; i > 0 && tools.getBoundingClientRect().height > room; i--) { buttons[i].dataset.overflow = '1'; more.hidden = false; }
  }
  const customise = () => { settings.showModal(); renderToolbar(); section.scrollIntoView({ block: 'start' }); };
  createMenu({ trigger: more, menu: overflow, label: 'More tools', items: () => [
    ...[...tools.querySelectorAll('[data-overflow]')].map(source => ({ title: source.title, run: () => source.click() })),
    { title: 'Customise toolbar', run: customise },
  ] });
  tools.addEventListener('contextmenu', e => { e.preventDefault(); customise(); });
  addEventListener('resize', fitTools); document.getElementById('toolsFold').addEventListener('click', fitTools);
  let config = read('aegis:toolbar');
  const defaults = [...tools.querySelectorAll('[data-tool]')].map(b => b.dataset.tool);
  function applyToolbar() {
    const buttons = [...tools.querySelectorAll('[data-tool]')], ids = buttons.map(b => b.dataset.tool);
    for (const id of ids) if (!defaults.includes(id)) defaults.push(id);
    const order = toolbarOrder(defaults, config.order);
    const anchor = more;
    tools.querySelectorAll('.tools-sep').forEach(el => { el.hidden = true; });
    for (const id of order) { const b = buttons.find(b => b.dataset.tool === id); anchor.before(b); b.hidden = (config.hidden ?? []).includes(id); }
    document.body.dataset.toolSize = config.size || 'medium'; size.value = config.size || 'medium';
    fitTools(); return order;
  }
  function saveToolbar() { localStorage.setItem('aegis:toolbar', JSON.stringify(config)); applyToolbar(); }
  function renderToolbar() {
    const order = applyToolbar(); options.replaceChildren();
    for (const [index, id] of order.entries()) {
      const row = document.createElement('div'); row.className = 'toolbar-option'; row.draggable = true; row.dataset.toolOrder = id;
      row.ondragstart = e => { e.dataTransfer.setData('text/x-aegis-tool', id); };
      row.ondragover = e => { if (e.dataTransfer.types.includes('text/x-aegis-tool')) e.preventDefault(); };
      row.ondrop = e => { const source = e.dataTransfer.getData('text/x-aegis-tool'); if (!order.includes(source)) return; e.preventDefault(); const next = order.filter(key => key !== source); next.splice(next.indexOf(id), 0, source); config.order = next; saveToolbar(); renderToolbar(); };
      const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = !(config.hidden ?? []).includes(id); input.setAttribute('aria-label', `Show ${id}`); label.append(input, document.createTextNode(tools.querySelector(`[data-tool="${id}"]`).title.replace(/\s*\([^)]*\)$/, ''))); row.append(label);
      input.onchange = () => { config.hidden = order.filter(key => key === id ? !input.checked : (config.hidden ?? []).includes(key)); saveToolbar(); };
      for (const [text, delta] of [['↑', -1], ['↓', 1]]) { const b = document.createElement('button'); b.textContent = text; b.setAttribute('aria-label', `Move ${id} ${delta < 0 ? 'up' : 'down'}`); b.disabled = index + delta < 0 || index + delta >= order.length; b.onclick = () => { [order[index], order[index + delta]] = [order[index + delta], order[index]]; config.order = order; saveToolbar(); renderToolbar(); }; row.append(b); }
      options.append(row);
    }
  }
  size.onchange = () => { config.size = size.value; saveToolbar(); };
  section.querySelector('[data-reset]').onclick = () => { config = {}; saveToolbar(); renderToolbar(); };
  document.getElementById('settingsBtn').addEventListener('click', renderToolbar);
  // Tools are mounted after the editing module. Observe additions only to preserve active preferences.
  const observer = new MutationObserver(records => { if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && n.matches?.('[data-feature]') && !n.dataset.customised))) { tools.querySelectorAll('[data-feature]').forEach(n => { n.dataset.customised = '1'; }); applyToolbar(); } }); observer.observe(tools, { childList: true });
  section.querySelector('[data-export]').onclick = () => exportBoard(false);
  section.querySelector('[data-pdf]').onclick = () => exportBoard(false, 'pdf');
  for (const grip of document.querySelectorAll('.resize-handle')) grip.addEventListener('dblclick', () => { grip.previousElementSibling.style.height = ''; const state = read('aegis:panels'); delete state.heights?.[grip.closest('.pbox').dataset.panel]; localStorage.setItem('aegis:panels', JSON.stringify(state)); });
  return { capture() { capture.querySelector('input').value = ''; if (!capture.open) capture.showModal(); capture.querySelector('input').focus(); } };
}
