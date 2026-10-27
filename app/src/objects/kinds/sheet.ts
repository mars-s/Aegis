// Sheet cell rules. yesNo, rating, cellOrder, figure and bests from Zephium
// (zephium-browser/Zephium @ 0eaad6d, frame/src/features/work/components/objects/sheet.ts), MPL-2.0.
import { formatValue } from '@aegis/domain/charts';

export type SheetColumn = { label: string; kind: string; unit?: string; currency?: string; best?: 'max' | 'min' };
export type Sheet = { columns: SheetColumn[]; rows: { cells: string[] }[]; note?: string };

type YesNo = 'yes' | 'no' | 'partial' | 'unknown';
export const yesNo = (text: string): YesNo => {
  const value = text.trim().toLowerCase();
  return value === 'yes' || value === 'no' || value === 'partial' ? value : 'unknown';
};
export function rating(text: string): { value: number; max: number } | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)\s*$/u.exec(text);
  if (!match) return null;
  const value = Number(match[1]), max = Number(match[2]);
  return max > 0 && value >= 0 && value <= max ? { value, max } : null;
}
const decimal = (text: string) => {
  const value = Number(text.replace(/[,\s]/gu, ''));
  return text.trim() && Number.isFinite(value) ? value : null;
};
const NUMERIC = new Set(['number', 'money', 'percent', 'duration']);
export const numeric = (column: SheetColumn) => NUMERIC.has(column.kind);

export function cellOrder(column: SheetColumn, text: string): number | string | null {
  switch (column.kind) {
    case 'number': case 'money': case 'percent': case 'duration': return decimal(text);
    case 'rating': { const score = rating(text); return score ? score.value / score.max : null; }
    case 'yes_no': return { yes: 2, partial: 1, no: 0, unknown: null }[yesNo(text)];
    default: return text.trim() ? text.trim() : null;
  }
}
export function figure(column: SheetColumn, text: string): string {
  const value = decimal(text);
  if (value === null) return text;
  switch (column.kind) {
    case 'money': return column.currency ? formatValue(value, { format: 'money', currency: column.currency }) : formatValue(value);
    case 'percent': return formatValue(value, { format: 'percent' });
    case 'duration': return column.unit ? formatValue(value) : formatValue(value, { format: 'duration' });
    default: return formatValue(value);
  }
}
export function bests(sheet: Sheet): Set<number>[] {
  return sheet.columns.map((column, index) => {
    if (!column.best) return new Set();
    const values = sheet.rows.map(row => cellOrder(column, row.cells[index] ?? ''));
    const numbers = values.filter((v): v is number => typeof v === 'number');
    if (numbers.length < 2) return new Set();
    const target = column.best === 'max' ? Math.max(...numbers) : Math.min(...numbers);
    if (numbers.every(v => v === target)) return new Set();
    return new Set(values.flatMap((v, row) => (v === target ? [row] : [])));
  });
}
export function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./u, ''); } catch { return url; }
}
