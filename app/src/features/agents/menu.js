// A local menu over the existing model preferences. Source selects stay hidden for settings sync.
export function mountIslandMenu({ island, current, shortTitle, agents, newAgent, show, showAll }) {
  const button = document.getElementById('orbMenuButton'), menu = document.getElementById('orbMenu');
  const source = document.getElementById('model'), count = document.getElementById('count');
  let typeahead = '', typedAt = 0;
  function close(focus = false) {
    menu.hidden = true; button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus({ preventScroll: true });
  }
  function item(label, run, { value, checked, submenu = false } = {}) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', checked === undefined ? 'menuitem' : 'menuitemradio');
    if (checked !== undefined) b.setAttribute('aria-checked', String(checked));
    if (submenu) b.setAttribute('aria-haspopup', 'menu');
    const title = document.createElement('span'); title.textContent = label; b.append(title);
    if (value) { const v = document.createElement('span'); v.className = 'orb-menu-value'; v.textContent = value; b.append(v); }
    if (checked) b.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>');
    b.onclick = run; menu.append(b); return b;
  }
  function choices(label, options, value, set) {
    menu.replaceChildren(); menu.setAttribute('aria-label', label);
    item('Back to agent options', () => { render(); menu.querySelector('button')?.focus(); });
    for (const o of options) item(o.textContent, () => { set(o.value); close(true); }, { checked: o.value === value });
    menu.querySelector('[aria-checked="true"]')?.focus();
  }
  function render() {
    menu.replaceChildren(); menu.setAttribute('aria-label', 'Agent options');
    item('Agent model', () => choices('Agent model', source.options, source.value, value => {
      source.value = value; source.dispatchEvent(new Event('change'));
      // A model change applies to a new conversation, leaving existing agents on their model.
      newAgent();
    }), { value: source.selectedOptions[0]?.textContent, submenu: true });
    item('Agent count', () => choices('Agent count', count.options, count.value, value => { count.value = value; }), { value: count.selectedOptions[0]?.textContent, submenu: true });
    const statusValue = localStorage.getItem('aegis:status-model');
    item('Status model', () => choices('Status model', source.options, statusValue, value => {
      localStorage.setItem('aegis:status-model', value); document.dispatchEvent(new Event('aegis-models'));
    }), { value: [...source.options].find(o => o.value === statusValue)?.textContent, submenu: true });
    menu.append(document.createElement('hr'));
    item('New agent', newAgent);
    item('All agents', () => { close(); showAll(); });
    for (const a of agents()) item(shortTitle(a), () => { close(); show(a.id); }, { value: a.running ? 'Working' : 'Ready', checked: current()?.id === a.id });
  }
  button.onclick = e => {
    if (!menu.hidden) return close();
    render(); menu.hidden = false; button.setAttribute('aria-expanded', 'true');
    if (e.detail !== 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.body.classList.contains('motion-off')) {
      menu.animate([{ transform: 'scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 140, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
    menu.querySelector('button')?.focus();
  };
  function keydown(e) {
    const items = [...menu.querySelectorAll('button')], index = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close();
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && e.key !== ' ') {
      e.preventDefault(); const now = Date.now(); typeahead = now - typedAt < 700 ? typeahead + e.key.toLowerCase() : e.key.toLowerCase(); typedAt = now;
      items.find(b => b.textContent.toLowerCase().startsWith(typeahead))?.focus();
    }
  }
  document.addEventListener('pointerdown', e => { if (!menu.contains(e.target) && !button.contains(e.target)) close(); });
  island.addEventListener('focusout', e => {
    if (island.contains(e.relatedTarget)) return;
    setTimeout(() => { if (!island.contains(document.activeElement)) close(); }, 0);
  });
  return { close, keydown, contains: target => menu.contains(target) };
}
