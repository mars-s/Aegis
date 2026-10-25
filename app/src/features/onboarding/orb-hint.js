// The invitation gets a full, uninterrupted turn after onboarding and modal focus.
export function createOrbHint({ island, host }) {
  const key = 'aegis:orb-hint-seen';
  const hint = document.createElement('span'); hint.className = 'agent-first-hint'; hint.textContent = 'Ask Aegis  ⌘K'; hint.hidden = true; island.append(hint);
  let checked = false, eligible = false, delay = 0, expiry = 0, frame = 0;
  const blocked = () => document.hidden || document.body.classList.contains('onboarding-open') || !!document.querySelector('dialog[open], [aria-modal="true"]:not([hidden])');
  function hide() {
    clearTimeout(delay); clearTimeout(expiry); cancelAnimationFrame(frame); delay = expiry = frame = 0;
    if (hint.classList.contains('visible')) hint.classList.remove('visible');
    if (!hint.hidden) hint.hidden = true;
  }
  function stop() { eligible = false; hide(); observer.disconnect(); document.removeEventListener('visibilitychange', sync); }
  function dismiss() {
    // The tour opens Ask to demonstrate it. That is not a first-use interaction.
    if (blocked()) return;
    localStorage.setItem(key, '1'); stop();
  }
  function sync() {
    if (!eligible) return;
    if (localStorage.getItem(key)) { stop(); return; }
    if (blocked()) { hide(); return; }
    if (delay || !hint.hidden) return;
    delay = setTimeout(() => {
      delay = 0;
      if (blocked()) return;
      hint.hidden = false;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (blocked()) { hide(); return; }
        hint.classList.add('visible'); expiry = setTimeout(dismiss, 8000);
      });
    }, 1200);
  }
  const observer = new MutationObserver(sync);
  function discover(agents) {
    if (agents.length) { stop(); checked = true; return; }
    if (checked) return;
    checked = true;
    if (localStorage.getItem(key)) return;
    // An existing agent on another board means this invitation is no longer needed.
    host.get('/agents').then(prior => {
      if (prior.length || localStorage.getItem(key)) return;
      eligible = true;
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'hidden', 'aria-modal'] });
      document.addEventListener('visibilitychange', sync); sync();
    }).catch(() => {});
  }
  return { discover, dismiss };
}
