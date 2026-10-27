import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { AgentRuntime } from '../agents/runtime.js';

export function useOrbHint(runtime: AgentRuntime, island: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  const stop = useRef<() => void>(() => {});
  const blocked = (): boolean => document.hidden || document.body.classList.contains('onboarding-open') || !!document.querySelector('dialog[open], [aria-modal="true"]:not([hidden])');
  const dismiss = useCallback(() => {
    if (blocked()) return;
    localStorage.setItem('aegis:orb-hint-seen', '1'); stop.current(); setVisible(false);
  }, []);
  useEffect(() => {
    const lifetime = new AbortController();
    let eligible = false, inView = false;
    let delay: ReturnType<typeof setTimeout> | null = null, expiry: ReturnType<typeof setTimeout> | null = null;
    function hide(): void { if (delay) clearTimeout(delay); if (expiry) clearTimeout(expiry); delay = expiry = null; setVisible(false); }
    function sync(): void {
      if (!eligible || localStorage.getItem('aegis:orb-hint-seen') || blocked() || !inView) { hide(); return; }
      if (delay || expiry) return;
      delay = setTimeout(() => {
        delay = null;
        if (blocked() || !inView) return;
        setVisible(true); expiry = setTimeout(dismiss, 8000);
      }, 1200);
    }
    const observer = new MutationObserver(sync);
    const visibility = new IntersectionObserver(entries => { inView = entries.some(entry => entry.isIntersecting); sync(); });
    if (island.current) visibility.observe(island.current);
    const offAgents = runtime.subscribe(() => { if (runtime.getSnapshot().agents.length) { eligible = false; hide(); } });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'hidden', 'aria-modal', 'class'] });
    document.addEventListener('visibilitychange', sync);
    const cleanup = (): void => { eligible = false; hide(); };
    stop.current = cleanup;
    if (!localStorage.getItem('aegis:orb-hint-seen')) void runtime.priorAgents(lifetime.signal).then(prior => { if (!lifetime.signal.aborted && !prior) { eligible = true; sync(); } }).catch(() => {});
    return () => { lifetime.abort(); eligible = false; if (delay) clearTimeout(delay); if (expiry) clearTimeout(expiry); observer.disconnect(); visibility.disconnect(); offAgents(); document.removeEventListener('visibilitychange', sync); stop.current = () => {}; };
  }, [runtime, island, dismiss]);
  return { dismiss, hint: <span className={`agent-first-hint${visible ? ' visible' : ''}`} hidden={!visible}>Ask Aegis  ⌘K</span> };
}
