import './onboarding.css';
import { shortcutText } from '../../lib/shortcuts.js';
export function createOnboarding({ mobile, panels, openComposer, closeComposer }) {
  const dialog = document.createElement('dialog'); dialog.className = 'onboarding'; dialog.setAttribute('aria-label', 'Welcome to Aegis');
  const highlight = document.createElement('div'); highlight.className = 'tour-highlight'; highlight.hidden = true;
  const card = document.createElement('section'); card.className = 'tour-card'; dialog.append(highlight, card); document.body.append(dialog);
  const steps = [
    ['Tools', 'Pick a tool, then tap or click the board to add something.', '#tools', 'add'],
    ['Quick capture', 'Press {quickCapture} to save an idea without leaving your work.', '#quickCapture', 'add'],
    ['Unsorted', 'Captured ideas wait here. Choose one to put it on the board.', '[data-panel="unsorted"]', 'unsorted'],
    ['Windows and library', 'Press {leftSidebar} for this board’s windows and the board switcher. Press {rightSidebar} for agent activity. Use {stackForward} or {stackBack} to move a selected window forward or backward.', '[data-panel="library"]', 'boards'],
    ['Wireframe panel', 'Build screens with components, icons and templates.', '[data-panel="wireframe"]', 'wireframe'],
    ['Agent composer', 'Press {ask} to Ask. Describe what you need, or choose Add as notes in Agent options to put your words on the board.', '#composer', 'agents'],
    ['Settings', 'Set up your board, toolbar, panels and accounts here. You can replay this tour from About.', '#settingsBtn', null],
  ];
  let index = -1, restore = () => {}, previousFocus = null;
  function finish() { document.body.classList.remove('onboarding-open'); restore(); mobile.close(); dialog.close(); localStorage.setItem('aegis:onboarded', '1'); previousFocus?.focus(); }
  function button(text, action) { const b = document.createElement('button'); b.textContent = text; b.onclick = action; return b; }
  function show() {
    restore(); restore = () => {}; mobile.close(); card.replaceChildren();
    const title = document.createElement('h2'), text = document.createElement('p'), nav = document.createElement('nav');
    if (index < 0) {
      highlight.hidden = true; dialog.classList.remove('touring'); title.textContent = 'Welcome to Aegis'; text.textContent = 'A place for ideas, boards and agents. Take a short tour, or start with an empty board.';
      nav.append(button('Skip', finish), button('Start tour', () => { index = 0; show(); }));
    } else {
      dialog.classList.add('touring');
      const [name, description, selector, sheet] = steps[index];
      if (matchMedia('(max-width: 700px)').matches && sheet) mobile.open(sheet);
      const phone = matchMedia('(max-width: 700px)').matches;
      const target = document.querySelector(phone && index === 1 ? '[data-capture]' : selector);
      if (target) {
        const stepIndex = index;
        const hidden = target.hidden, folded = target.classList.contains('folded'), parent = target.closest('.side');
        const key = parent?.id === 'sideRight' ? 'right' : 'left', wasOpen = panels.isOpen(key);
        const composerOpen = document.getElementById('composer').classList.contains('open');
        if (index === 0 && !phone) document.body.classList.add('tour-tools');
        if (parent) panels.setOpen(key, true, true);
        if (index === 5) openComposer(true);
        target.hidden = false; target.classList.remove('folded');
        target.scrollIntoView({ block: 'nearest' });
        restore = () => {
          document.body.classList.remove('tour-tools');
          target.hidden = hidden; target.classList.toggle('folded', folded);
          if (parent) panels.setOpen(key, wasOpen, true);
          if (stepIndex === 5 && !composerOpen) closeComposer(true);
        };
      }
      const r = (matchMedia('(max-width: 700px)').matches && sheet && index !== 1 ? document.querySelector('.mobile-sheet') : target)?.getBoundingClientRect();
      highlight.hidden = !r || !r.width || !r.height;
      if (r) Object.assign(highlight.style, { left: `${Math.max(4, r.left - 4)}px`, top: `${Math.max(4, r.top - 4)}px`, width: `${Math.min(innerWidth - 8, r.width + 8)}px`, height: `${Math.min(innerHeight - 8, r.height + 8)}px` });
      title.textContent = `${index + 1} of ${steps.length}: ${name}`; text.innerHTML = description.replace(/\{(\w+)\}/g, (_, id) => `<span data-shortcut="${id}" data-shortcut-format="text">${shortcutText(id, 'text')}</span>`);
      nav.append(button('Skip', finish), button('Back', () => { index--; show(); }), button(index === steps.length - 1 ? 'Finish' : 'Next', next));
    }
    card.append(title, text, nav); nav.lastElementChild.focus();
  }
  function next() { if (index === steps.length - 1) finish(); else { index++; show(); } }
  dialog.addEventListener('cancel', e => { e.preventDefault(); finish(); });
  addEventListener('keydown', e => {
    if (!dialog.open) return;
    if (['ArrowRight', 'ArrowLeft', 'Escape'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); if (e.key === 'Escape') finish(); else if (e.key === 'ArrowRight') next(); else if (index >= 0) { index--; show(); } }
  }, true);
  addEventListener('resize', () => { if (dialog.open) show(); });
  function welcome() { document.body.classList.add('onboarding-open'); previousFocus = document.activeElement; index = -1; localStorage.setItem('aegis:onboarded', '1'); dialog.showModal(); show(); }
  return { welcome, firstRun() { if (!localStorage.getItem('aegis:onboarded')) welcome(); } };
}
