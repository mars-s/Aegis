
// Keep native checkbox state and existing change handlers, add a shared switch presentation.
export function enhanceSwitch(input) {
  input.classList.add('aegis-switch'); input.setAttribute('role', 'switch'); return input;
}

export function createTabs({ list, panels, onChange = () => {} }) {
  list.classList.add('aegis-tabs'); list.setAttribute('role', 'tablist');
  const entries = [...panels];
  function select(id, focus = false) {
    for (const [key, panel] of entries) {
      const tab = list.querySelector(`[aria-controls="${panel.id}"]`), selected = key === id;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; panel.hidden = !selected;
      if (selected && focus) { tab.focus({ preventScroll: true }); tab.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    }
    onChange(id);
  }
  const click = event => { const tab = event.target.closest('[role=tab]'); if (tab && list.contains(tab)) select(entries.find(([, panel]) => panel.id === tab.getAttribute('aria-controls'))[0]); };
  const key = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...list.querySelectorAll('[role=tab]:not(:disabled)')], index = tabs.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    select(entries.find(([, panel]) => panel.id === tabs[next].getAttribute('aria-controls'))[0], true);
  };
  list.addEventListener('click', click); list.addEventListener('keydown', key);
  return { select, destroy() { list.removeEventListener('click', click); list.removeEventListener('keydown', key); } };
}

export function enhanceSwitches(root) {
  const scan = node => { if (!(node instanceof Element)) return; if (node.matches('input[type=checkbox]')) enhanceSwitch(node); node.querySelectorAll('input[type=checkbox]').forEach(enhanceSwitch); };
  scan(root); const observer = new MutationObserver(records => { for (const r of records) for (const node of r.addedNodes) scan(node); });
  observer.observe(root, { childList: true, subtree: true }); return () => observer.disconnect();
}
