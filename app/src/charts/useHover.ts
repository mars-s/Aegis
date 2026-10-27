import { useEffect, useMemo, useRef, useState } from 'react';

// A brief exit delay lets the pointer and keyboard reach evidence in the tip.
export function useHover() {
  const [index, setIndex] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actions = useMemo(() => {
    const hold = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
    return { hold, show: (value: number | null) => { hold(); setIndex(value); }, hide: () => { hold(); timer.current = setTimeout(() => { timer.current = null; setIndex(null); }, 160); } };
  }, []);
  useEffect(() => actions.hold, [actions]);
  return { index, ...actions };
}
