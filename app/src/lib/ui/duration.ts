/** Computed CSS tokens can use seconds after production CSS minification. */
export function cssMilliseconds(value: string, fallback: number): number {
  const match = /^([+]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(ms|s)$/i.exec(value.trim());
  if (!match?.[1] || !match[2]) return fallback;
  const milliseconds = Number(match[1]) * (match[2].toLowerCase() === 's' ? 1000 : 1);
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : fallback;
}
