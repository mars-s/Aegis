import { mountModelSettings } from '../agents/models.js';
import { preference } from './preferences.js';
import { registerDragHandler } from '../../canvas/engine.js';
import './settings.css';

export function mountSettings({ canvas, replayTour }) {
  const capture = document.createElement('button'); capture.id = 'quickCapture'; capture.className = 'text-btn'; capture.textContent = '+ Idea'; capture.title = 'Quick capture (Cmd+K)';
  capture.onclick = () => { const dialog = document.querySelector('.editing-capture'); const input = dialog.querySelector('input'); input.value = ''; if (!dialog.open) dialog.showModal(); input.focus(); };
  document.getElementById('retrySave').after(capture);
  const dialog = document.getElementById('settings');
  const tabs = document.createElement('nav'); tabs.className = 'settings-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Settings');
  const pages = new Map();
  for (const name of ['General', 'Board', 'Toolbar', 'Panels', 'Accounts', 'About']) {
    const id = name.toLowerCase(), b = document.createElement('button'), panel = document.createElement('div');
    b.textContent = name; b.id = `settings-tab-${id}`; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', `settings-${id}`);
    panel.id = `settings-${id}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', b.id); panel.className = 'settings-page';
    b.onclick = () => select(id);
    b.onkeydown = e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const buttons = [...tabs.children], index = buttons.indexOf(b), next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length; buttons[next].click(); buttons[next].focus(); } };
    tabs.append(b); pages.set(id, panel); dialog.append(panel);
  }
  dialog.querySelector('.sheet-head').after(tabs);
  function select(id) {
    for (const [key, panel] of pages) { panel.hidden = key !== id; const b = document.getElementById(`settings-tab-${key}`); b.setAttribute('aria-selected', String(key === id)); b.tabIndex = key === id ? 0 : -1; }
  }
  pages.get('accounts').append(dialog.querySelector('[data-settings="accounts"]'));
  pages.get('general').append(dialog.querySelector('[data-settings="appearance"]'));
  for (const section of [...dialog.querySelectorAll(':scope > .sheet-sec')]) {
    if (section.querySelector('.panel-layout-options')) pages.get('panels').append(section);
    else if (section.hasAttribute('data-colour-settings')) pages.get('general').append(section);
    else if (section.classList.contains('editing-settings')) {
      // Move nodes rather than rebuild them, so the editing feature's handlers and references stay live.
      const board = document.createElement('section'); board.className = 'sheet-sec editing-settings';
      while (section.firstChild && section.firstChild.textContent !== 'Your toolbar') board.append(section.firstChild);
      // Export belongs with the board, after the toolbar controls.
      const exportHeading = [...section.children].find(el => el.tagName === 'H3' && el.textContent === 'Export');
      const exportNodes = []; for (let n = exportHeading; n; n = n.nextSibling) exportNodes.push(n);
      board.append(...exportNodes);
      pages.get('board').append(board); pages.get('toolbar').append(section);
    } else pages.get('accounts').append(section);
  }
  function toggle(page, title, key, fallback, update = () => canvas.redraw()) {
    const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = preference(key, fallback) === 'on';
    input.onchange = () => { localStorage.setItem(`aegis:${key}`, input.checked ? 'on' : 'off'); update(input.checked); };
    label.append(input, document.createTextNode(title)); pages.get(page).append(label); return input;
  }
  toggle('general', 'Double-click creates a note', 'double-click-note', 'on');
  const colourLabel = document.createElement('label'), colour = document.createElement('select'); colour.setAttribute('aria-label', 'Default note colour');
  for (const value of ['plain', 'gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple']) colour.add(new Option(value === 'gray' ? 'Grey' : value[0].toUpperCase() + value.slice(1), value));
  colour.value = preference('note-colour', 'plain'); colour.onchange = () => localStorage.setItem('aegis:note-colour', colour.value); colourLabel.append('Default note colour ', colour); pages.get('general').append(colourLabel);
  const grid = dialog.querySelector('[data-grid]');
  const gridToggle = toggle('board', 'Show grid', 'grid-visible', grid.value === 'none' ? 'off' : 'on', on => { if (on) grid.value = preference('grid-shape', 'dots'); else { localStorage.setItem('aegis:grid-shape', grid.value === 'none' ? 'dots' : grid.value); grid.value = 'none'; } grid.dispatchEvent(new Event('change')); });
  grid.addEventListener('change', () => { gridToggle.checked = grid.value !== 'none'; localStorage.setItem('aegis:grid-visible', gridToggle.checked ? 'on' : 'off'); if (gridToggle.checked) localStorage.setItem('aegis:grid-shape', grid.value); });
  toggle('board', 'Snap to grid', 'snap', 'off');
  registerDragHandler('settings-snap', { snap(cards, dx, dy, board, view, event) { if (preference('snap', 'off') !== 'on' || !cards.length || event.metaKey || event.ctrlKey) return; const first = cards[0]; return { dx: Math.round((first.x + dx) / 24) * 24 - first.x, dy: Math.round((first.y + dy) / 24) * 24 - first.y }; } });
  toggle('board', 'Tilt loose cards', 'tilt', 'off', () => canvas.setBoard(canvas.board));
  toggle('board', 'Motion', 'motion', 'on', applyMotion);
  function applyMotion() { document.body.classList.toggle('motion-off', preference('motion', 'on') === 'off'); }
  applyMotion();
  mountModelSettings(pages.get('general'));
  const about = pages.get('about');
  const version = document.createElement('p'); version.textContent = `Aegis ${__AEGIS_VERSION__}`; about.append(version);
  const licences = document.createElement('ul');
  for (const text of ['LICENSE.mochiboard: MIT', 'Zephium: MPL-2.0 (LICENSE.zephium)', 'Material Icons: Apache-2.0', 'Fonts: Inter and others, SIL Open Font Licence (OFL)']) { const li = document.createElement('li'); li.textContent = text; licences.append(li); }
  // item 14: import dependency notices, no changes to Settings controls.
  for (const text of ['pdfjs-dist 6.4.299: Apache-2.0 (bundled CMaps and decoders: BSD, MIT and CC0)', 'core-js 3.50.0: MIT (bundled pdf.js compatibility code)', 'Liberation Sans 2.1.5 PDF fallback: SIL OFL 1.1', 'fflate 0.8.3: MIT', '@napi-rs/canvas and platform packages 1.0.13: MIT (optional pdf.js Node dependency, unused in the browser)']) { const li = document.createElement('li'); li.textContent = text; licences.append(li); }
  // end item 14
  const data = document.createElement('p'); data.textContent = 'Default data folder: ~/Library/Application Support/Aegis. Custom launches may use another folder.';
  const replay = document.createElement('button'); replay.className = 'pill'; replay.textContent = 'Replay welcome and tour'; replay.onclick = () => { dialog.close(); replayTour(); }; about.append(licences, data, replay);
  // The editing feature's Customise toolbar entry point still lands on its controls.
  document.getElementById('tools').addEventListener('contextmenu', () => select('toolbar'), true);
  document.addEventListener('click', e => { if (e.target.textContent === 'Customise toolbar') select('toolbar'); }, true);
  dialog.addEventListener('click', e => { if (e.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); });
  select('general');
  return { select };
}
