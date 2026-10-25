// Motion tokens for scripted motion, read from the CSS so declared and scripted motion never drift apart.
// Shape follows Zephium's shared/lib/motion.ts (MPL-2.0).
export type Duration = 'instant' | 'fast' | 'base' | 'slow' | 'page';
const durations = new Map<Duration, number>();
export function duration(name: Duration): number {
  let value = durations.get(name);
  if (value === undefined) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(`--motion-${name}`).trim();
    value = raw.endsWith('ms') ? Number.parseFloat(raw) : Number.parseFloat(raw) * 1000;
    if (!Number.isFinite(value)) value = 0;
    durations.set(name, value);
  }
  return value;
}
export function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
