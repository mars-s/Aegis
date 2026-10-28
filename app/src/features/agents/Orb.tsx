import { useEffect, useRef } from 'react';
import './orb.css';

export function Orb({ resolved = false, listening = false, onActivate, label }: {
  readonly resolved?: boolean;
  readonly listening?: boolean;
  readonly onActivate?: () => void;
  readonly label?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.classList.toggle('orb-offscreen', !entry.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const mark = <span ref={ref} className={`orb-mark${resolved ? ' resolved' : ''}${listening ? ' listening' : ''}`} aria-hidden={onActivate ? undefined : true}>
    <span className="orb-colours" /><span className="orb-light" />
  </span>;
  if (!onActivate) return mark;
  return <button type="button" className="orb-button" aria-label={label ?? 'Dictate'} aria-pressed={listening}
    onClick={event => { event.preventDefault(); event.stopPropagation(); onActivate(); }}>{mark}</button>;
}
