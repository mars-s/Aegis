import './onboarding.css';
export function createOnboarding({ mobile }) {
  const dialog = document.createElement('dialog'); dialog.className = 'onboarding'; dialog.setAttribute('aria-label', 'Welcome to Aegis');
  const highlight = document.createElement('div'); highlight.className = 'tour-highlight'; highlight.hidden = true;
  const card = document.createElement('section'); card.className = 'tour-card'; dialog.append(highlight, card); document.body.append(dialog);
  const steps = [
    ['Tools', 'Pick a tool, then tap or click the board to add something.', '#tools', 'add'],
    ['Quick capture', 'Press Cmd+K to save an idea without leaving your work. On Windows and Linux, use Ctrl+K.', '#quickCapture', 'add'],
    ['Unsorted', 'Captured ideas wait here. Choose one to put it on the board.', '[data-panel="unsorted"]', 'unsorted'],
    ['Library', 'Keep boards in folders and projects. Choose a board to open it.', '[data-panel="library"]', 'boards'],
    ['Wireframe panel', 'Build screens with components, icons and templates.', '[data-panel="wireframe"]', 'wireframe'],
    ['Agent composer', 'Describe what you need. Choose a model and start an agent, or add your words as notes.', '#composer', 'agents'],
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
      const target = document.querySelector(phone && index === 1 ? '[data-capture]' : !phone && index === 4 ? '.wf-design' : selector);
      if (target) {
        const hidden = target.hidden, folded = target.classList.contains('folded'), parent = target.closest('.side');
        const parentHidden = parent?.hidden, width = parent?.style.width, scroll = parent?.scrollTop;
        target.hidden = false; target.classList.remove('folded');
        if (parent) { parent.hidden = false; parent.style.width = '248px'; target.scrollIntoView({ block: 'nearest' }); }
        restore = () => { target.hidden = hidden; target.classList.toggle('folded', folded); if (parent) { parent.hidden = parentHidden; parent.style.width = width; parent.scrollTop = scroll; } };
      }
      const r = (matchMedia('(max-width: 700px)').matches && sheet && index !== 1 ? document.querySelector('.mobile-sheet') : target)?.getBoundingClientRect();
      highlight.hidden = !r || !r.width || !r.height;
      if (r) Object.assign(highlight.style, { left: `${Math.max(4, r.left - 4)}px`, top: `${Math.max(4, r.top - 4)}px`, width: `${Math.min(innerWidth - 8, r.width + 8)}px`, height: `${Math.min(innerHeight - 8, r.height + 8)}px` });
      title.textContent = `${index + 1} of ${steps.length}: ${name}`; text.textContent = description;
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
