import { useEffect, useRef } from 'react';
import './orb.css';

export function Orb({ resolved = false }: { readonly resolved?: boolean }) {
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
  return <span ref={ref} className={`orb-mark${resolved ? ' resolved' : ''}`} aria-hidden="true"><span className="orb-colours" /><span className="orb-light" /></span>;
}
