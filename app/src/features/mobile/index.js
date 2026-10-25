// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import './mobile.css';
export function mountMobile({ pickTool, tools, showAgents }) {
  const mq = matchMedia('(max-width: 700px)'), homes = new Map();
  const hub = document.createElement('nav'); hub.id = 'mobileHub'; hub.setAttribute('aria-label', 'Board hub');
  for (const name of ['Boards', 'Layers', 'Add', 'Unsorted', 'Agents']) {
    const b = document.createElement('button'); b.textContent = name; b.dataset.sheet = name.toLowerCase(); b.setAttribute('aria-expanded', 'false'); b.onclick = () => open(name.toLowerCase()); hub.append(b);
  }
  const veil = document.createElement('div'); veil.className = 'mobile-veil'; veil.hidden = true;
  const sheet = document.createElement('section'); sheet.className = 'mobile-sheet'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'mobileTitle');
  sheet.innerHTML = '<div class="mobile-grab" aria-label="Drag down to close"><i></i></div><header><h2 id="mobileTitle"></h2><button aria-label="Close sheet">×</button></header><div class="mobile-content"></div>';
  const body = sheet.querySelector('.mobile-content'); let current = null, previousFocus = null;
  function restore() {
    for (const [node, home] of homes) { home.placeholder.replaceWith(node); if (node.classList.contains('wf-design')) node.hidden = home.hidden; }
    homes.clear(); body.replaceChildren();
  }
  function close() {
    const wasOpen = !!current;
    restore(); sheet.hidden = veil.hidden = true;
    if (current === 'agents') { showAgents(false); document.getElementById('composer').dispatchEvent(new Event('close-composer')); }
    current = null; document.body.classList.remove('mobile-sheet-open'); hub.querySelectorAll('button').forEach(b => b.setAttribute('aria-expanded', 'false'));
    if (wasOpen) previousFocus?.focus({ preventScroll: true });
  }
  function move(node) {
    if (!node) return;
    const placeholder = document.createComment('mobile home'); node.before(placeholder); homes.set(node, { placeholder, hidden: node.hidden }); body.append(node);
  }
  function open(id) {
    if (!mq.matches) return;
    if (current === id) { close(); return; }
    close(); previousFocus = document.activeElement; current = id;
    sheet.querySelector('h2').textContent = { boards: 'Boards', layers: 'Layers', add: 'Add', unsorted: 'Unsorted', agents: 'Agents' }[id];
    if (id === 'add') {
      for (const [name, group] of [['Basics', null], ['Wireframe', 'wireframe'], ['Colours', 'colours']]) {
        const section = document.createElement('section'), h = document.createElement('h3'); h.textContent = name; section.append(h);
        for (const source of document.querySelectorAll('#tools [data-tool]')) {
          const tool = tools.find(t => t.id === source.dataset.tool);
          const actual = tool?.id === 'wireframe' || /wireframe/i.test(tool?.group ?? '') ? 'wireframe' : tool?.id === 'swatch' || /colou?r/i.test(tool?.group ?? '') ? 'colours' : null;
          if (actual !== group || source.hidden) continue;
          const b = document.createElement('button'); b.textContent = tool?.title ?? source.title.replace(/\s*\([^)]*\)$/, ''); b.onclick = () => { const id = source.dataset.tool; close(); if (id === 'wireframe') open('wireframe'); else pickTool(id); }; section.append(b);
        }
        if (name === 'Basics') {
          const capture = document.createElement('button'); capture.dataset.capture = '1'; capture.textContent = 'Quick capture (Shift+Cmd+K / Shift+Ctrl+K)'; capture.onclick = () => { close(); document.getElementById('quickCapture').click(); }; section.append(capture);
        }
        body.append(section);
      }

    } else if (id === 'wireframe') {
      const design = document.querySelector('.wf-design'); move(design); if (design) design.hidden = false;
    } else if (id === 'agents') {
      showAgents(true); move(document.getElementById('agentsPanel')); move(document.getElementById('composer')); document.getElementById('composer').dispatchEvent(new Event('open-composer'));
    } else move(document.querySelector(`[data-panel="${id === 'boards' ? 'library' : id}"]`));
    if (id === 'wireframe') sheet.querySelector('h2').textContent = 'Wireframe';
    veil.hidden = sheet.hidden = false; document.body.classList.add('mobile-sheet-open');
    hub.querySelector(`[data-sheet="${id}"]`)?.setAttribute('aria-expanded', 'true'); sheet.querySelector('header button').focus();
  }
  body.addEventListener('click', e => {
    if (e.target.closest('.tree-row[data-board], .layer-row:not(:has(input)), .tray-item, [data-wf], [data-piece], [data-icon]') && !e.target.closest('.twisty, .layer-action, input')) close();
  });
  veil.onclick = close; sheet.querySelector('header button').onclick = close;
  const grab = sheet.querySelector('.mobile-grab'); let y0 = 0;
  grab.onpointerdown = e => { y0 = e.clientY; grab.setPointerCapture(e.pointerId); };
  grab.onpointermove = e => { if (grab.hasPointerCapture(e.pointerId)) sheet.style.translate = `0 ${Math.max(0, e.clientY - y0)}px`; };
  const end = e => { if (!grab.hasPointerCapture(e.pointerId)) return; sheet.style.translate = ''; if (e.type !== 'pointercancel' && e.clientY - y0 > 90) close(); grab.releasePointerCapture(e.pointerId); };
  grab.onpointerup = end; grab.onpointercancel = end;
  addEventListener('keydown', e => {
    if (!current || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const items = [...sheet.querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter(el => el.getClientRects().length && !el.disabled);
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }, true);
  function sync() { close(); document.body.classList.toggle('phone', mq.matches); hub.hidden = !mq.matches; }
  document.body.append(hub, veil, sheet); mq.addEventListener('change', sync); sync();
  document.getElementById('closeAgents').addEventListener('click', close);
  return { open, close };
}
