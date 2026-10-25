// PM 6: reveal secondary chrome at the edge and retain it while it is in use.
export function mountIdleChrome() {
  const rail = document.getElementById('tools');
  const controls = document.querySelector('.bar-right');
  const groups = [rail, controls];
  const timers = new Map();
  let keyboard = false;
  const near = new Set();
  const pointerInside = new Set();
  const touch = matchMedia('(hover: none), (pointer: coarse), (max-width: 700px)');
  const listeners = new AbortController();
  const listen = (target, name, callback, options = {}) => target.addEventListener(name, callback, { ...options, signal: listeners.signal });
  const active = () => document.body.classList.contains('editing-context') || document.body.classList.contains('placing');
  const held = group => touch.matches || near.has(group) || pointerInside.has(group) || active()
    || group.contains(document.activeElement) || group.matches('.armed, .more-open')
    || !!group.querySelector('[aria-expanded="true"], details[open]')
    || group === controls && (document.body.matches('.left-open, .right-open, .onboarding-open') || !!document.querySelector('#settings[open]') || !document.getElementById('retrySave').hidden);
  function reveal(group, instant = false) {
    clearTimeout(timers.get(group)); timers.delete(group);
    group.classList.toggle('chrome-instant', instant);
    group.classList.add('chrome-visible');
  }
  function sync() {
    for (const group of groups) {
      if (held(group)) { if (!group.classList.contains('chrome-visible')) reveal(group, keyboard); else { clearTimeout(timers.get(group)); timers.delete(group); } }
      else if (group.classList.contains('chrome-visible') && !timers.has(group)) timers.set(group, setTimeout(() => {
        timers.delete(group);
        if (!held(group)) { group.classList.remove('chrome-instant', 'chrome-visible'); }
      }, 1200));
    }
  }
  listen(window, 'pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    keyboard = false;
    near.clear();
    if (event.clientX <= 48) near.add(rail);
    if (event.clientY <= 48 || innerWidth - event.clientX <= 48) near.add(controls);
    sync();
  }, { passive: true });
  listen(document, 'pointerdown', () => { keyboard = false; }, { capture: true });
  listen(document, 'pointerleave', () => { near.clear(); pointerInside.clear(); sync(); });
  listen(window, 'blur', () => { near.clear(); pointerInside.clear(); sync(); });
  for (const group of groups) {
    listen(group, 'pointerenter', event => { if (event.pointerType === 'mouse') { pointerInside.add(group); sync(); } });
    listen(group, 'pointerleave', () => { pointerInside.delete(group); sync(); });
    listen(group, 'focusin', () => reveal(group, true));
    listen(group, 'focusout', () => queueMicrotask(sync));
  }
  // Reveal both groups before Tab moves focus, leaving every control in the normal tab order.
  listen(document, 'keydown', event => {
    keyboard = true;
    if (event.key === 'Tab' && !document.querySelector('dialog[open], .mobile-sheet:not([hidden])')) groups.forEach(group => reveal(group, true));
    if (event.code !== 'KeyT' || !event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.repeat
      || event.target.closest('input, textarea, select, [contenteditable], .side-editor, dialog[open]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    groups.forEach(group => reveal(group, true));
    rail.querySelector('button:not([hidden])')?.focus({ preventScroll: true });
  }, { capture: true });
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  for (const group of groups) observer.observe(group, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-expanded', 'open', 'hidden'] });
  observer.observe(document.getElementById('settings'), { attributes: true, attributeFilter: ['open'] });
  listen(touch, 'change', sync);
  sync();
  return () => { listeners.abort(); observer.disconnect(); for (const timer of timers.values()) clearTimeout(timer); };
}
