// Adapted from Zephium Chart/ChartLegend.svelte at 0eaad6d, MPL-2.0.
// Changes for Aegis: React.
export function ChartLegend({ entries, layout = 'row' }: { readonly entries: readonly { readonly key: string; readonly label: string; readonly color: string; readonly share?: string }[]; readonly layout?: 'row' | 'rows' | 'list' }) {
  return <ul className={`chart-legend ${layout}`} aria-label="Chart legend">{entries.map(entry => <li key={entry.key}><span className="swatch" style={{ background: entry.color }} /><span className="name">{entry.label}</span>{entry.share !== undefined ? <span className="share">{entry.share}</span> : null}</li>)}</ul>;
}
