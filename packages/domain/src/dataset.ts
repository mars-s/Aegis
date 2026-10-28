import { z } from 'zod/v4';
// Datasets: a CSV kept whole as an asset, profiled once, and queried exactly. Pure functions shared by the host
// (which runs queries for agents) and the app (which profiles on import). No DOM.

export const DATASET_LIMITS = { bytes: 32 * 1024 ** 2, rows: 200_000, columns: 200, resultRows: 200 };
export const MEASURES = ['count', 'sum', 'avg', 'min', 'max', 'median', 'distinct'];
export const BUCKETS = ['day', 'week', 'month', 'quarter', 'year'];
export const FILTER_OPS = ['eq', 'ne', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'not_empty'];

// RFC 4180: quoted fields, doubled quotes, delimiters and newlines inside quotes; tab and semicolon files are sniffed.
export function parseCsv(text: string): Dataset {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const end = text.indexOf('\n'), firstLine = end === -1 ? text : text.slice(0, end);
  const delimiter = [',', '\t', ';'].map(d => ({d, n:firstLine.split(d).length})).sort((a,b) => b.n-a.n)[0]?.d ?? ',';
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      if (rows.length > DATASET_LIMITS.rows + 1) throw new Error(`the file has more than ${DATASET_LIMITS.rows.toLocaleString()} rows`);
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  if (!rows.length) throw new Error('the file is empty');
  const header = (rows.shift() ?? []).map((name, i) => name.trim() || `column_${i + 1}`);
  if (header.length > DATASET_LIMITS.columns) throw new Error(`the file has more than ${DATASET_LIMITS.columns} columns`);
  // Duplicate names get a suffix so every column can be addressed by name.
  const seen = new Map<string,number>();
  const columns = header.map(name => { const n = (seen.get(name) ?? 0) + 1; seen.set(name, n); return n > 1 ? `${name}_${n}` : name; });
  return { columns, rows: rows.map(r => columns.map((_, i) => (r[i] ?? '').trim())) };
}

const NUMBER = /^[-+]?(?:[$€£¥]\s?)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/;
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value ?? '').trim();
  if (!s || !NUMBER.test(s)) return null;
  const n = Number(s.replace(/[$€£¥,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}
const DATE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$|^\d{1,2}\/\d{1,2}\/\d{4}$/;
export function toDate(value: unknown): number | null {
  const s = String(value ?? '').trim();
  if (!DATE.test(s)) return null;
  let iso = s;
  // Day first, as in Australia: 31/12/2024.
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) iso = `${dmy[3]}-${(dmy[2] ?? '').padStart(2, '0')}-${(dmy[1] ?? '').padStart(2, '0')}`;
  const zoned = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso.slice(10));
  const t = Date.parse(iso.replace(' ', 'T') + (zoned || iso.length === 10 ? '' : 'Z'));
  return Number.isFinite(t) ? t : null;
}
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
export function bucketOf(t: number, bucket: string): string {
  const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (bucket === 'year') return String(y);
  if (bucket === 'quarter') return `${y}-Q${Math.floor(m / 3) + 1}`;
  if (bucket === 'month') return `${y}-${String(m + 1).padStart(2, '0')}`;
  if (bucket === 'week') return day(Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return day(t);
}
const round = (n: number) => Math.round(n * 100) / 100;
// Sorted input; an even count averages the two middle values.
const median = (s: number[]): number => { const mid = Math.floor(s.length / 2); return round(s.length % 2 ? (s[mid] ?? NaN) : ((s[mid - 1] ?? NaN) + (s[mid] ?? NaN)) / 2); };

// One pass per column: kind, gaps and the figures an agent needs to choose questions.
export function profileDataset({ columns, rows }: Dataset) {
  return {
    rows: rows.length,
    columns: columns.map((name, i) => {
      const values = rows.map(r => r[i] ?? ''), present = values.filter(v => v !== '');
      const numbers = present.map(toNumber), dates = present.map(toDate);
      const kind = present.length && numbers.every(n => n !== null) ? 'number' : present.length && dates.every(t => t !== null) ? 'date' : 'text';
      const column: ProfileColumn = { name, kind, empty: values.length - present.length };
      if (kind === 'number') {
        const ns = numbers.filter((n): n is number => n !== null).sort((a, b) => a - b), sum = ns.reduce((a, b) => a + b, 0);
        Object.assign(column, { min: ns[0], max: ns.at(-1), sum: round(sum), mean: round(sum / ns.length), median: median(ns) });
      } else if (kind === 'date') {
        const ts = dates.filter((n): n is number => n !== null).sort((a, b) => a - b);
        Object.assign(column, { min: day(ts[0] ?? NaN), max: day(ts.at(-1) ?? NaN) });
      } else {
        const counts = new Map<string,number>(); for (const v of present) counts.set(v, (counts.get(v) ?? 0) + 1);
        column.distinct = counts.size;
        column.top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value: value.slice(0, 60), count }));
      }
      return column;
    }),
  };
}

// An exact aggregate over every row. Returns at most resultRows groups, sorted as asked.
export function queryDataset({ columns, rows }: Dataset, spec: QuerySpec = {}): QueryResult {
  const index = (name: string | undefined): number => { const i = columns.indexOf(name ?? ''); if (i === -1) throw new Error(`no column "${name}". Columns: ${columns.join(', ')}`); return i; };
  const groupBy = (Array.isArray(spec.groupBy) ? spec.groupBy : spec.groupBy ? [spec.groupBy] : []).slice(0, 3);
  if (spec.bucket && !BUCKETS.includes(spec.bucket)) throw new Error(`bucket must be one of ${BUCKETS.join(', ')}`);
  if (spec.bucket && !groupBy.length) throw new Error('bucket needs groupBy with a date column first');
  const measures = (spec.measures?.length ? spec.measures : [{ op: 'count' }]).slice(0, 8);
  for (const m of measures) {
    if (!MEASURES.includes(m.op)) throw new Error(`measure op must be one of ${MEASURES.join(', ')}`);
    if (m.op !== 'count' && !m.column) throw new Error(`${m.op} needs a column`);
  }
  const filters = (spec.filter ?? []).slice(0, 10).map(f => {
    if (!FILTER_OPS.includes(f.op)) throw new Error(`filter op must be one of ${FILTER_OPS.join(', ')}`);
    return { ...f, i: index(f.column) };
  });
  const list = (value: unknown): string[] => (Array.isArray(value) ? value : [value]).map(String);
  const compare = (v: string, f: Filter): boolean => {
    const a = toNumber(v) ?? toDate(v), b = toNumber(f.value) ?? toDate(f.value);
    const same = String(v) === String(f.value) || (a !== null && a === b);
    const cmp = a !== null && b !== null ? a - b : String(v).localeCompare(String(f.value));
    switch (f.op) {
      case 'eq': return same; case 'ne': return !same;
      case 'in': return list(f.value).includes(v); case 'not_in': return !list(f.value).includes(v);
      case 'gt': return v !== '' && cmp > 0; case 'gte': return v !== '' && cmp >= 0;
      case 'lt': return v !== '' && cmp < 0; case 'lte': return v !== '' && cmp <= 0;
      case 'contains': return v.toLowerCase().includes(String(f.value).toLowerCase());
      case 'empty': return v === ''; default: return v !== '';
    }
  };
  const keyIndexes = groupBy.map(index);
  const measureIndexes = measures.map(m => (m.op === 'count' && !m.column ? -1 : index(m.column)));
  const groups = new Map<string, {key: string[];values:(string|number)[][]}>(); let matched = 0;
  for (const r of rows) {
    if (!filters.every(f => compare(r[f.i] ?? '', f))) continue;
    matched++;
    const key = keyIndexes.map((i, k) => {
      if (k === 0 && spec.bucket) { const t = toDate(r[i]); return t === null ? '(no date)' : bucketOf(t, spec.bucket); }
      return r[i] === '' ? '(blank)' : r[i] ?? '';
    });
    const id = JSON.stringify(key);
    let g = groups.get(id); if (!g) groups.set(id, g = { key, values: measures.map(() => []) });
    measures.forEach((m, k) => {
      const i = measureIndexes[k];
      if (i === -1) g.values[k]?.push(1);
      else if (m.op === 'distinct' || m.op === 'count') { if ((r[i ?? -1] ?? '') !== '') g.values[k]?.push(r[i ?? -1] ?? ''); }
      else { const n = toNumber(r[i ?? -1]); if (n !== null) g.values[k]?.push(n); }
    });
  }
  const label = (m: Measure): string => m.as || (m.op === 'count' && !m.column ? 'count' : `${m.op}_${m.column}`);
  const reduce = (m: Measure, values: (string|number)[]): number | null => {
    const vs = values.filter((v): v is number => typeof v === 'number');
    if (m.op === 'count') return values.length;
    if (m.op === 'distinct') return new Set(values).size;
    return reduceNumeric(m, vs);
  };
  const reduceNumeric = (m: Measure, vs: number[]): number | null => {
    if (m.op === 'count') return vs.length;
    if (m.op === 'distinct') return new Set(vs).size;
    if (!vs.length) return null;
    if (m.op === 'sum') return round(vs.reduce((a, b) => a + b, 0));
    if (m.op === 'avg') return round(vs.reduce((a, b) => a + b, 0) / vs.length);
    if (m.op === 'min') return vs.reduce((a, b) => Math.min(a, b));
    if (m.op === 'max') return vs.reduce((a, b) => Math.max(a, b));
    return median([...vs].sort((a, b) => a - b));
  };
  let out: QueryResult['rows'] = [...groups.values()].map(g => Object.fromEntries<QueryValue>([
    ...groupBy.map((name, k): [string, QueryValue] => [k === 0 && spec.bucket ? `${name}_${spec.bucket}` : name, g.key[k]]),
    ...measures.map((m, k): [string, QueryValue] => [label(m), reduce(m, g.values[k] ?? [])]),
  ]));
  // Time buckets read oldest first; everything else biggest first, unless the caller says otherwise.
  const sortBy = spec.sort?.by ?? (spec.bucket ? `${groupBy[0]}_${spec.bucket}` : label(measures[0] ?? {op:'count'}));
  const dir = spec.sort?.dir ? (spec.sort.dir === 'asc' ? 1 : -1) : spec.bucket ? 1 : -1;
  out.sort((a, b) => { const x = a[sortBy], y = b[sortBy]; if (x === y) return 0; if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1; return (x > y ? 1 : -1) * dir; });
  const total = out.length, limit = Math.max(1, Math.min(DATASET_LIMITS.resultRows, Number(spec.limit) || DATASET_LIMITS.resultRows));
  out = out.slice(0, limit);
  return { matched, groups: total, truncated: total > out.length, rows: out };
}

export const DatasetSchema = z.object({columns:z.array(z.string()),rows:z.array(z.array(z.string()))});
export type Dataset = z.output<typeof DatasetSchema>;
const MeasureSchema = z.object({op:z.string(),column:z.string().optional(),as:z.string().optional()});
const FilterSchema = z.object({column:z.string(),op:z.string(),value:z.json().optional()});
export const QuerySpecSchema = z.object({groupBy:z.union([z.string(),z.array(z.string())]).optional(),bucket:z.string().optional(),measures:z.array(MeasureSchema).optional(),filter:z.array(FilterSchema).optional(),sort:z.object({by:z.string().optional(),dir:z.string().optional()}).optional(),limit:z.union([z.number(),z.string()]).optional()});
export type QuerySpec = z.output<typeof QuerySpecSchema>;
type Measure = z.output<typeof MeasureSchema>;
type Filter = z.output<typeof FilterSchema>;
interface ProfileColumn {name:string;kind:string;empty:number;min?:number|string|undefined;max?:number|string|undefined;sum?:number;mean?:number;median?:number;distinct?:number;top?:{value:string;count:number}[];}

export interface QueryResult {matched:number;groups:number;truncated:boolean;rows:Record<string,QueryValue>[];}

export type QueryValue = string | number | null | undefined;
