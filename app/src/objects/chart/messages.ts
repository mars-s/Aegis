// The chart's English strings, as functions so the ported chart code can call them unchanged.
// Text from Zephium's frame/messages/en.json (MPL-2.0).
export const chart_copied = () => 'Copied';
export const chart_copy_values = () => 'Copy values (CSV)';
export const chart_exact_values = () => 'Exact values';
export const chart_extreme = (p: { x: string; value: string }) => `${p.x} at ${p.value}`;
export const chart_extremes = (p: { low: string; high: string }) => `lowest ${p.low}, highest ${p.high}`;
export const chart_kind_area = () => 'Area chart';
export const chart_kind_bars = () => 'Bar chart';
export const chart_kind_donut = () => 'Donut chart';
export const chart_kind_heat = () => 'Heat map';
export const chart_kind_line = () => 'Line chart';
export const chart_kind_radar = () => 'Radar chart';
export const chart_kind_radial = () => 'Radial chart';
export const chart_kind_range = () => 'Range chart';
export const chart_kind_spark = () => 'Sparkline';
export const chart_kind_stacked = () => 'Stacked bar chart';
export const chart_other = () => 'Other';
export const chart_precision = () => 'The plot is approximate. Inspect the original decimal values below.';
export const chart_sources = () => 'Sources';
export const chart_total = () => 'Total';
export const chart_unavailable = () => 'No values to plot.';
export const chart_values = () => 'Values';
