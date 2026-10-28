import { useLayoutEffect, useRef, useState } from 'react';

export function Notifications({ message, dismiss }: { readonly message: string | null; readonly dismiss: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(message);
  useLayoutEffect(() => {
    const node = element.current; if (!node) return;
    let keyboard = false, animation: Animation | null = null;
    const reduced = (): boolean => document.body.classList.contains('motion-off') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const key = (): void => { keyboard = true; }, pointer = (): void => { keyboard = false; };
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', pointer, true);
    const finish = (): void => { node.classList.remove('toast-leaving'); if (node.hidden) setText(null); };
    const observer = new MutationObserver(() => {
      if (!node.textContent?.trim()) { animation?.cancel(); animation = null; finish(); return; }
      const closing = node.hidden;
      if (closing && !reduced() && !keyboard) node.classList.add('toast-leaving');
      const style = getComputedStyle(node), current = { opacity: style.opacity, transform: style.transform };
      const interrupted = animation !== null;
      animation?.cancel(); animation = null;
      node.classList.toggle('toast-leaving', closing && !reduced() && !keyboard);
      if (reduced() || keyboard) { finish(); return; }
      const start = interrupted ? current : { opacity: closing ? 1 : 0, transform: closing ? 'translate(-50%, 0)' : 'translate(-50%, 6px)' };
      const own = node.animate([start, { opacity: closing ? 0 : 1, transform: closing ? 'translate(-50%, 6px)' : 'translate(-50%, 0)' }], { duration: closing ? 150 : 200, easing: 'cubic-bezier(.23, 1, .32, 1)' });
      animation = own;
      void own.finished.then(() => { if (animation === own) { animation = null; finish(); } }, () => {});
    });
    observer.observe(node, { attributes: true, attributeFilter: ['hidden'] });
    const cancel = (): void => { if (reduced()) { animation?.cancel(); animation = null; finish(); } };
    const motion = new MutationObserver(cancel), media = matchMedia('(prefers-reduced-motion: reduce)');
    motion.observe(document.body, { attributes: true, attributeFilter: ['class'] }); media.addEventListener('change', cancel);
    return () => { observer.disconnect(); motion.disconnect(); media.removeEventListener('change', cancel); animation?.cancel(); document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', pointer, true); };
  }, []);
  useLayoutEffect(() => {
    if (message) setText(message);
    if (element.current) element.current.hidden = !message;
  }, [message]);
  return <div ref={element} id="toast" className="toast react-toast" role="status">{text}{text ? <button type="button" onClick={dismiss}>Dismiss</button> : null}</div>;
}
