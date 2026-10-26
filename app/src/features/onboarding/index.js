import './onboarding.css';
import { SHORTCUTS, shortcutText } from '../../lib/shortcuts.js';

export function createOnboarding({ ctx, ask }) {
  const dialog = document.createElement('dialog'); dialog.className = 'onboarding'; dialog.setAttribute('aria-label', 'Welcome to Aegis');
  const card = document.createElement('section'); card.className = 'tour-card'; dialog.append(card); document.body.append(dialog);
  let step = 0, previousFocus, thought = '', boardId, before = new Set();
  const stage = document.getElementById('stage');
  function button(text, action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = action; return b; }
  function finish() {
    document.body.classList.remove('onboarding-open'); dialog.close();
    localStorage.setItem('aegis:onboarded', '1');
    if (previousFocus?.isConnected && !previousFocus.closest('[hidden]')) previousFocus.focus({ preventScroll: true });
    else stage.focus({ preventScroll: true });
  }
  function results() { return ctx.canvas.board.id === boardId ? ctx.canvas.board.cards.filter(c => !before.has(c.id)) : []; }
  function show(focus = true) {
    card.replaceChildren(); dialog.classList.toggle('touring', step > 0);
    const header = document.createElement('header'), progress = document.createElement('span'); progress.className = 'tour-progress'; progress.textContent = `${step + 1} of 3`;
    header.append(progress, button('Skip', finish));
    const title = document.createElement('h2'), text = document.createElement('p'), nav = document.createElement('nav');
    card.append(header, title, text);
    if (step === 0) {
      title.textContent = 'A thought becomes a plan.';
      text.textContent = 'Start with something on your mind. Aegis can turn it into windows you can edit.';
      const label = document.createElement('label'); label.textContent = 'Your first thought';
      const input = document.createElement('textarea'); input.rows = 3; input.setAttribute('aria-label', 'Your first thought');
      input.value = thought || 'I want a calmer week, with time for focused work and a proper break.';
      input.oninput = () => { thought = input.value; add.disabled = !input.value.trim(); };
      label.append(input); card.append(label);
      const add = button('Add thought', () => {
        thought = input.value.trim(); if (!thought) return;
        const at = ctx.canvas.centre(); boardId = ctx.canvas.board.id;
        ctx.apply([{ op: 'create', type: 'note', text: thought, x: Math.round(at.x - 160), y: Math.round(at.y - 100), ref: 'thought' }], created => {
          ctx.canvas.select([created.thought]);
          step = 1; dialog.close(); dialog.show(); show();
        });
      }); nav.append(add);
    } else if (step === 1) {
      title.textContent = 'Give your thought a next step.';
      text.textContent = 'Ask Aegis for a short plan and a checklist. They will appear beside your thought.';
      nav.append(button('Ask for a plan', () => {
        before = new Set(ctx.canvas.board.cards.map(c => c.id));
        if (!ask(`Turn this thought into a practical plan: ${thought}\n\nCreate a short editable document and a checklist on this board. Use suggestions, not claims about my life. Keep the original thought.`)) return;
        step = 2; show();
      }));
    } else {
      const made = results();
      title.textContent = made.length ? 'Your plan has a place.' : 'Watch your plan take shape.';
      text.textContent = made.length ? 'These are real windows. Open one to make it yours, or ask Aegis to change it.' : 'Aegis is working on the board. You can keep using the canvas while it works. If it needs a sign-in or more detail, open Ask.';
      text.setAttribute('role', 'status');
      nav.append(button(made.length ? 'See my plan' : 'Open Ask', () => {
        if (made.length) { ctx.canvas.frameIds(made.map(c => c.id), 1, false, true); finish(); }
        else { document.getElementById('askPill').click(); }
      }));
      nav.append(button('Done', finish));
    }
    card.append(nav);
    if (focus) nav.firstElementChild?.focus({ preventScroll: true });
  }
  stage.addEventListener('boardchange', () => {
    if (!dialog.open) return;
    if (boardId && ctx.canvas.board.id !== boardId) return finish();
    if (step === 2 && results().length && card.querySelector('nav button')?.textContent !== 'See my plan') show(false);
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  addEventListener('keydown', event => {
    const modal = document.querySelector('dialog:modal');
    if (modal && modal !== dialog) return;
    if (dialog.open && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(); }
  }, true);
  const help = createShortcuts();
  function welcome() {
    if (dialog.open) return;
    document.body.classList.add('onboarding-open'); previousFocus = document.activeElement;
    step = 0; thought = ''; boardId = null;
    localStorage.setItem('aegis:onboarded', '1'); dialog.showModal(); show();
  }
  return { welcome, shortcuts: help.show, firstRun() { if (!localStorage.getItem('aegis:onboarded')) welcome(); } };
}

function createShortcuts() {
  const dialog = document.createElement('dialog'); dialog.className = 'shortcuts-sheet'; dialog.setAttribute('aria-labelledby', 'shortcuts-title');
  const header = document.createElement('header'), title = document.createElement('h2'), close = document.createElement('button');
  title.id = 'shortcuts-title'; title.textContent = 'Keyboard shortcuts'; close.textContent = 'Done'; close.type = 'button';
  header.append(title, close); dialog.append(header);
  const list = document.createElement('dl');
  for (const [id, item] of Object.entries(SHORTCUTS)) {
    const term = document.createElement('dt'), keys = document.createElement('dd');
    term.textContent = item.label; keys.textContent = shortcutText(id); keys.dataset.shortcut = id; list.append(term, keys);
  }
  const term = document.createElement('dt'), keys = document.createElement('dd'); term.textContent = 'Keyboard shortcuts'; keys.textContent = '?'; list.append(term, keys);
  dialog.append(list); document.body.append(dialog);
  let previous;
  const finish = () => { dialog.close(); previous?.isConnected && previous.focus({ preventScroll: true }); };
  close.onclick = finish; dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  const show = () => { if (dialog.open) return; previous = document.activeElement; dialog.showModal(); close.focus(); };
  addEventListener('keydown', event => {
    if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
    event.preventDefault(); event.stopImmediatePropagation(); show();
  }, true);
  return { show };
}
