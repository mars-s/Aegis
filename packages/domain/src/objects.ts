// Object models adapted from Zephium Work, MPL-2.0. See LICENSE.zephium.
import { z } from 'zod/v4';
import { parseHtmlState } from './html-state.js';
export const OBJECT_KINDS = ['reply', 'plot', 'sheet', 'diagram', 'plan', 'list', 'code', 'stats', 'timeline', 'kanban', 'table', 'progress', 'compare', 'gallery', 'stages', 'callout', 'form', 'html'] as const;
export const PLOT_STYLES = ['bar', 'bar_horizontal', 'bar_stacked', 'bar_grouped', 'line', 'area', 'area_stacked', 'donut', 'radial', 'radar', 'range'] as const;
export const PLOT_FORMATS = ['number', 'money', 'duration', 'percent', 'bytes'] as const;
export const COLUMN_KINDS = ['text', 'number', 'money', 'percent', 'date', 'duration', 'yes_no', 'rating', 'link', 'tag'] as const;
export const NODE_KINDS = ['client', 'edge', 'gateway', 'service', 'worker', 'model', 'store', 'queue', 'cache', 'storage', 'external', 'step', 'other'] as const;
export const STEP_KINDS = ['travel', 'stay', 'event', 'task', 'milestone', 'note'] as const;
export const LIST_STYLES = ['todo', 'messages', 'reading', 'requirements', 'questions'] as const;

// Default card size for each kind, before the app measures it.
export const OBJECT_SIZE = { reply: [520, 180], plot: [520, 360], sheet: [620, 340], diagram: [720, 440], plan: [460, 420], list: [420, 320], code: [560, 360], stats: [620, 250], timeline: [520, 380], kanban: [760, 420], table: [640, 380], progress: [480, 360], compare: [680, 360], gallery: [620, 380], stages: [680, 280], callout: [460, 220], form: [460, 660], html: [560, 360] } as const;


const TableCellSchema = z.union([z.string().max(2000), z.number(), z.boolean(), z.null(), z.array(z.number()).min(1).max(60)]).meta({ legacyType: 'tableCell' });
export const SHAPES = {
reply: z.strictObject({
headline: z.string().max(80).meta({ legacyType: 'text' }),
text: z.string().max(480).meta({ legacyType: 'text' }),
figures: z.array(z.strictObject({
label: z.string().max(24).meta({ legacyType: 'text' }),
value: z.string().max(20).meta({ legacyType: 'text' }),
note: z.string().max(40).meta({ legacyType: 'text' }).optional(),
})).min(0).max(4).optional(),
points: z.array(z.string().max(140).meta({ legacyType: 'text' })).min(0).max(5).optional(),
}),
plot: z.strictObject({
style: z.enum(["bar","bar_horizontal","bar_stacked","bar_grouped","line","area","area_stacked","donut","radial","radar","range"]),
smooth: z.boolean().optional(),
source: z.strictObject({
cardId: z.string().max(120).meta({ legacyType: 'text' }),
xColumn: z.int().min(0).max(9),
yColumns: z.array(z.int().min(0).max(9)).min(1).max(8),
}).optional(),
snapshot: z.strictObject({
binding: z.string().max(300).meta({ legacyType: 'text' }),
series: z.array(z.strictObject({
name: z.string().max(24).meta({ legacyType: 'text' }),
points: z.array(z.strictObject({
x: z.string().max(200).meta({ legacyType: 'cell' }),
y: z.number().nullable().meta({ legacyType: 'value' }),
})).min(0).max(200),
})).min(1).max(8),
}).optional(),
x: z.strictObject({
label: z.string().max(24).meta({ legacyType: 'text' }).optional(),
kind: z.enum(["category","time","linear"]),
}),
y: z.strictObject({
label: z.string().max(24).meta({ legacyType: 'text' }).optional(),
unit: z.string().max(12).meta({ legacyType: 'text' }).optional(),
format: z.enum(["number","money","duration","percent","bytes"]),
currency: z.string().max(3).meta({ legacyType: 'text' }).optional(),
}),
series: z.array(z.strictObject({
name: z.string().max(24).meta({ legacyType: 'text' }),
points: z.array(z.strictObject({
x: z.string().max(24).meta({ legacyType: 'cell' }),
y: z.number().nullable().meta({ legacyType: 'value' }).optional(),
y2: z.number().nullable().meta({ legacyType: 'value' }).optional(),
})).min(1).max(60),
})).min(1).max(8),
headline: z.strictObject({
label: z.string().max(24).meta({ legacyType: 'text' }),
value: z.string().max(20).meta({ legacyType: 'text' }),
}).optional(),
basis: z.string().max(120).meta({ legacyType: 'text' }),
knowledge: z.boolean().optional(),
}),
sheet: z.strictObject({
columns: z.array(z.strictObject({
label: z.string().max(24).meta({ legacyType: 'text' }),
kind: z.enum(["text","number","money","percent","date","duration","yes_no","rating","link","tag"]),
unit: z.string().max(12).meta({ legacyType: 'text' }).optional(),
currency: z.string().max(3).meta({ legacyType: 'text' }).optional(),
best: z.enum(["max","min"]).optional(),
})).min(1).max(10),
rows: z.array(z.strictObject({
cells: z.array(z.string().max(200).meta({ legacyType: 'cell' })).min(1).max(10),
})).min(1).max(200),
note: z.string().max(200).meta({ legacyType: 'text' }).optional(),
}),
diagram: z.strictObject({
direction: z.enum(["down","right"]).optional(),
nodes: z.array(z.strictObject({
id: z.string().max(40).meta({ legacyType: 'text' }),
name: z.string().max(40).meta({ legacyType: 'text' }),
kind: z.enum(["client","edge","gateway","service","worker","model","store","queue","cache","storage","external","step","other"]),
note: z.string().max(80).meta({ legacyType: 'text' }).optional(),
layer: z.string().max(40).meta({ legacyType: 'text' }).optional(),
})).min(1).max(24),
edges: z.array(z.strictObject({
from: z.string().max(40).meta({ legacyType: 'text' }),
to: z.string().max(40).meta({ legacyType: 'text' }),
label: z.string().max(32).meta({ legacyType: 'text' }).optional(),
})).min(0).max(80),
layers: z.array(z.strictObject({
id: z.string().max(40).meta({ legacyType: 'text' }),
name: z.string().max(40).meta({ legacyType: 'text' }),
})).min(0).max(6).optional(),
}),
plan: z.strictObject({
steps: z.array(z.strictObject({
when: z.string().max(32).meta({ legacyType: 'text' }).optional(),
date: z.string().max(10).meta({ legacyType: 'text' }).optional(),
title: z.string().max(80).meta({ legacyType: 'text' }),
detail: z.string().max(280).meta({ legacyType: 'text' }).optional(),
kind: z.enum(["travel","stay","event","task","milestone","note"]),
cost: z.string().max(24).meta({ legacyType: 'text' }).optional(),
place: z.string().max(40).meta({ legacyType: 'text' }).optional(),
done: z.boolean().optional(),
})).min(1).max(40),
total: z.strictObject({
label: z.string().max(24).meta({ legacyType: 'text' }),
value: z.string().max(24).meta({ legacyType: 'text' }),
}).optional(),
checkable: z.boolean().optional(),
}),
list: z.strictObject({
style: z.enum(["todo","messages","reading","requirements","questions"]),
items: z.array(z.strictObject({
title: z.string().max(90).meta({ legacyType: 'text' }),
detail: z.string().max(280).meta({ legacyType: 'text' }).optional(),
due: z.string().max(32).meta({ legacyType: 'text' }).optional(),
done: z.boolean().optional(),
priority: z.enum(["high"]).optional(),
})).min(1).max(40),
}),
code: z.strictObject({
language: z.string().max(16).meta({ legacyType: 'text' }),
text: z.string().max(16000).meta({ legacyType: 'text' }),
notes: z.array(z.strictObject({
from: z.int().min(1).max(1000000000),
to: z.int().min(1).max(1000000000),
text: z.string().max(160).meta({ legacyType: 'text' }),
})).min(0).max(24).optional(),
}),
stats: z.strictObject({
tiles: z.array(z.strictObject({
label: z.string().max(60).meta({ legacyType: 'text' }),
value: z.string().max(40).meta({ legacyType: 'text' }),
delta: z.string().max(100).meta({ legacyType: 'text' }).optional(),
sparkline: z.array(z.number()).min(1).max(60).optional(),
editable: z.boolean().optional(),
})).min(1).max(8),
note: z.string().max(200).meta({ legacyType: 'text' }).optional(),
}),
timeline: z.strictObject({
direction: z.enum(["vertical","horizontal"]).optional(),
checkable: z.boolean().optional(),
events: z.array(z.strictObject({
date: z.string().max(10).meta({ legacyType: 'text' }),
title: z.string().max(100).meta({ legacyType: 'text' }),
detail: z.string().max(400).meta({ legacyType: 'text' }).optional(),
done: z.boolean().optional(),
})).min(1).max(40),
}),
kanban: z.strictObject({
columns: z.array(z.strictObject({
id: z.string().max(40).meta({ legacyType: 'text' }),
title: z.string().max(60).meta({ legacyType: 'text' }),
})).min(2).max(6),
cards: z.array(z.strictObject({
id: z.string().max(40).meta({ legacyType: 'text' }),
title: z.string().max(100).meta({ legacyType: 'text' }),
detail: z.string().max(280).meta({ legacyType: 'text' }).optional(),
column: z.string().max(40).meta({ legacyType: 'text' }),
})).min(0).max(100),
}),
table: z.strictObject({
columns: z.array(z.strictObject({
label: z.string().max(60).meta({ legacyType: 'text' }),
kind: z.enum(["text","number","sparkline","bar"]),
max: z.number().optional(),
editable: z.boolean().optional(),
})).min(1).max(12),
rows: z.array(z.strictObject({
cells: z.array(TableCellSchema).min(1).max(12),
})).min(0).max(200),
note: z.string().max(200).meta({ legacyType: 'text' }).optional(),
}),
progress: z.strictObject({
goals: z.array(z.strictObject({
label: z.string().max(80).meta({ legacyType: 'text' }),
current: z.number(),
target: z.number(),
unit: z.string().max(24).meta({ legacyType: 'text' }).optional(),
editable: z.boolean().optional(),
})).min(1).max(20),
}),
compare: z.strictObject({
options: z.array(z.strictObject({
name: z.string().max(60).meta({ legacyType: 'text' }),
detail: z.string().max(160).meta({ legacyType: 'text' }).optional(),
})).min(2).max(4),
criteria: z.array(z.strictObject({
label: z.string().max(80).meta({ legacyType: 'text' }),
values: z.array(z.string().max(200).meta({ legacyType: 'text' })).min(2).max(4),
})).min(1).max(20),
verdict: z.string().max(500).meta({ legacyType: 'text' }),
}),
gallery: z.strictObject({
images: z.array(z.strictObject({
url: z.string().max(500).meta({ legacyType: 'text' }),
alt: z.string().max(200).meta({ legacyType: 'text' }),
caption: z.string().max(200).meta({ legacyType: 'text' }).optional(),
})).min(1).max(24),
}),
stages: z.strictObject({
steps: z.array(z.strictObject({
title: z.string().max(80).meta({ legacyType: 'text' }),
detail: z.string().max(240).meta({ legacyType: 'text' }).optional(),
status: z.enum(["pending","active","done","blocked"]),
})).min(1).max(12),
editable: z.boolean().optional(),
}),
callout: z.strictObject({
tone: z.enum(["quote","note","warning","tip"]),
text: z.string().max(2000).meta({ legacyType: 'text' }),
attribution: z.string().max(120).meta({ legacyType: 'text' }).optional(),
}),
form: z.strictObject({
description: z.string().max(400).meta({ legacyType: 'text' }).optional(),
fields: z.array(z.strictObject({
id: z.string().max(40).meta({ legacyType: 'text' }),
label: z.string().max(80).meta({ legacyType: 'text' }),
kind: z.enum(["text","textarea","number","checkbox","choice"]),
value: TableCellSchema.optional(),
options: z.array(z.string().max(80).meta({ legacyType: 'text' })).min(1).max(16).optional(),
required: z.boolean().optional(),
hint: z.string().max(160).meta({ legacyType: 'text' }).optional(),
})).min(1).max(30),
}),
html: z.strictObject({
html: z.string().max(60000).meta({ legacyType: 'text' }),
css: z.string().max(30000).meta({ legacyType: 'text' }),
js: z.string().max(30000).meta({ legacyType: 'text' }),
height: z.int().min(80).max(2000).optional(),
state: z.string().max(65536).meta({ legacyType: 'text' }).optional(),
}),
};
export const ObjectKindSchema = z.enum(OBJECT_KINDS);
export type ObjectKind = z.output<typeof ObjectKindSchema>;
export type ObjectData = { [K in ObjectKind]: z.output<(typeof SHAPES)[K]> };
export type ObjectModel = { [K in ObjectKind]: {kind: K; data: ObjectData[K]} }[ObjectKind];

const boundaryRecord = z.record(z.string(), z.unknown());
const kindOf = (value: unknown): string => value === null ? 'null' : Array.isArray(value) ? 'a list' : typeof value;

// This compatibility decoder reads the Zod definition. It preserves the legacy
// first-error order and coercions without maintaining another schema table.
function walk(schema: z.core.$ZodType, value: unknown, at: string): unknown {
  const fail = (message: string): never => { throw new Error(`${at}: ${message}`); };
  if (schema instanceof z.ZodOptional) return walk(schema.unwrap(), value, at);
  const legacyType = z.globalRegistry.get(schema)?.['legacyType'];
  if (legacyType === 'value') {
    if (value === null || value === undefined || value === '') return null;
    const number = typeof value === 'number' ? value : Number(String(value).replace(/[,$€£¥%\s]/g, ''));
    if (!Number.isFinite(number)) return fail(`must be a number (or null for a gap), got ${JSON.stringify(value)}`);
    return number;
  }
  if (legacyType === 'tableCell') {
    const result = TableCellSchema.safeParse(value);
    if (result.success) return result.data;
    return fail('must be text (up to 2000 characters), a finite number, a boolean, null, or 1 to 60 finite sparkline values');
  }
  if (schema instanceof z.ZodString) {
    let text = value;
    if (legacyType === 'cell' && (text === null || text === undefined)) return '';
    if (typeof text === 'number' || legacyType === 'cell' && typeof text === 'boolean') text = String(text);
    if (typeof text !== 'string') return fail(`must be ${legacyType === 'cell' ? 'text or a number' : 'text'}, got ${kindOf(text)}`);
    if (schema.maxLength !== null && text.length > schema.maxLength) return fail(`is ${text.length} characters; the limit is ${schema.maxLength}${legacyType === 'cell' ? '' : '. Shorten it, nothing is cut to fit'}`);
    return text;
  }
  if (schema instanceof z.ZodNumber) {
    if (schema.isInt) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < (schema.minValue ?? 0) || value > (schema.maxValue ?? 1e9)) return fail(`must be a whole number from ${schema.minValue}`);
    } else if (typeof value !== 'number' || !Number.isFinite(value)) return fail(`must be a number, got ${kindOf(value)}`);
    return value;
  }
  if (schema instanceof z.ZodBoolean) {
    if (typeof value !== 'boolean') return fail(`must be true or false, got ${kindOf(value)}`);
    return value;
  }
  if (schema instanceof z.ZodEnum) {
    if (!(typeof value === 'string' && schema.options.includes(value))) return fail(`must be one of ${schema.options.join(', ')}; got ${JSON.stringify(value)}`);
    return value;
  }
  if (schema instanceof z.ZodArray) {
    if (!Array.isArray(value)) return fail(`must be a list, got ${kindOf(value)}`);
    const definition = z.toJSONSchema(schema, { unrepresentable: 'throw' });
    const min = typeof definition.minItems === 'number' ? definition.minItems : 0;
    const max = typeof definition.maxItems === 'number' ? definition.maxItems : Infinity;
    if (value.length < min) return fail(`needs at least ${min} item${min === 1 ? '' : 's'}`);
    if (value.length > max) return fail(`has ${value.length} items; the limit is ${max}`);
    return value.map((item: unknown, index: number) => walk(schema.element, item, `${at}[${index}]`));
  }
  if (schema instanceof z.ZodObject) {
    const parsed = boundaryRecord.safeParse(value);
    if (!parsed.success) return fail(`must be an object, got ${kindOf(value)}`);
    const record = parsed.data;
    const fields: Record<string, z.core.$ZodType> = schema.shape;
    for (const key of Object.keys(record)) if (!(key in fields)) return fail(`has an unknown field "${key}". Allowed: ${Object.keys(fields).join(', ')}`);
    for (const [key, sub] of Object.entries(fields)) if (!(sub instanceof z.ZodOptional) && (record[key] === undefined || record[key] === null)) return fail(`needs "${key}"`);
    const out: Record<string, unknown> = {};
    for (const [key, sub] of Object.entries(fields)) {
      const inner = sub instanceof z.ZodOptional ? sub.unwrap() : sub;
      if (record[key] !== undefined && (record[key] !== null || z.globalRegistry.get(inner)?.['legacyType'] === 'tableCell')) out[key] = walk(sub, record[key], `${at}.${key}`);
    }
    return out;
  }
  return fail('bad schema');
}

export function checkObject(kind: unknown, data: unknown): ObjectData[ObjectKind] {
  const parsed = ObjectKindSchema.safeParse(kind);
  if (!parsed.success) throw new Error(`unknown object kind "${String(kind)}". Use one of: ${OBJECT_KINDS.join(', ')}`);
  const selected = parsed.data;
  switch (selected) {
    case 'reply': { const out = SHAPES.reply.parse(walk(SHAPES.reply, data, 'reply')); return out; }
    case 'plot': { const out = SHAPES.plot.parse(walk(SHAPES.plot, data, 'plot')); extra.plot(out); return out; }
    case 'sheet': { const out = SHAPES.sheet.parse(walk(SHAPES.sheet, data, 'sheet')); extra.sheet(out); return out; }
    case 'diagram': { const out = SHAPES.diagram.parse(walk(SHAPES.diagram, data, 'diagram')); extra.diagram(out); return out; }
    case 'plan': { const out = SHAPES.plan.parse(walk(SHAPES.plan, data, 'plan')); extra.plan(out); return out; }
    case 'list': { const out = SHAPES.list.parse(walk(SHAPES.list, data, 'list')); return out; }
    case 'code': { const out = SHAPES.code.parse(walk(SHAPES.code, data, 'code')); return out; }
    case 'stats': { const out = SHAPES.stats.parse(walk(SHAPES.stats, data, 'stats')); return out; }
    case 'timeline': { const out = SHAPES.timeline.parse(walk(SHAPES.timeline, data, 'timeline')); extra.timeline(out); return out; }
    case 'kanban': { const out = SHAPES.kanban.parse(walk(SHAPES.kanban, data, 'kanban')); extra.kanban(out); return out; }
    case 'table': { const out = SHAPES.table.parse(walk(SHAPES.table, data, 'table')); extra.table(out); return out; }
    case 'progress': { const out = SHAPES.progress.parse(walk(SHAPES.progress, data, 'progress')); extra.progress(out); return out; }
    case 'compare': { const out = SHAPES.compare.parse(walk(SHAPES.compare, data, 'compare')); extra.compare(out); return out; }
    case 'gallery': { const out = SHAPES.gallery.parse(walk(SHAPES.gallery, data, 'gallery')); extra.gallery(out); return out; }
    case 'stages': { const out = SHAPES.stages.parse(walk(SHAPES.stages, data, 'stages')); return out; }
    case 'callout': { const out = SHAPES.callout.parse(walk(SHAPES.callout, data, 'callout')); return out; }
    case 'form': { const out = SHAPES.form.parse(walk(SHAPES.form, data, 'form')); extra.form(out); return out; }
    case 'html': { const out = SHAPES.html.parse(walk(SHAPES.html, data, 'html')); extra.html(out); return out; }
    default: { const exhaustive: never = selected; return exhaustive; }
  }
}
// Rules that span fields.
const extra = {
  // PM3 HTML state: object_set cannot bypass the iframe message size or shape limits.
  html(d: ObjectData['html']) {
    if (d.state !== undefined && !parseHtmlState(d.state)) throw new Error('html.state: must be a valid widget snapshot within 64 KiB');
  },
  timeline(d: ObjectData['timeline']) {
    d.events.forEach((e, i) => date(e.date, `timeline.events[${i}].date`));
  },
  kanban(d: ObjectData['kanban']) {
    unique(d.columns, 'kanban.columns'); unique(d.cards, 'kanban.cards');
    const columns = new Set(d.columns.map(c => c.id));
    d.cards.forEach((c, i) => { if (!columns.has(c.column)) throw new Error(`kanban.cards[${i}].column: no column "${c.column}"`); });
  },
  table(d: ObjectData['table']) {
    d.columns.forEach((c, i) => { if (c.kind === 'bar' && !((c.max ?? 0) > 0)) throw new Error(`table.columns[${i}].max: a bar needs a positive maximum`); });
    d.rows.forEach((r, i) => {
      if (r.cells.length !== d.columns.length) throw new Error(`table.rows[${i}].cells: must match columns`);
      r.cells.forEach((v, j) => {
        const kind = d.columns[j]?.kind ?? 'text';
        if (v === null) return;
        if (kind === 'sparkline' ? !Array.isArray(v) : kind === 'text' ? !['string', 'number'].includes(typeof v) : typeof v !== 'number' || (kind === 'bar' && v < 0)) throw new Error(`table.rows[${i}].cells[${j}]: invalid ${kind} value`);
      });
    });
  },
  progress(d: ObjectData['progress']) {
    d.goals.forEach((g, i) => { if (g.current < 0 || g.target <= 0) throw new Error(`progress.goals[${i}]: current must be non-negative and target must be positive`); });
  },
  compare(d: ObjectData['compare']) {
    d.criteria.forEach((c, i) => { if (c.values.length !== d.options.length) throw new Error(`compare.criteria[${i}].values: needs one value per option`); });
  },
  gallery(d: ObjectData['gallery']) {
    d.images.forEach((image, i) => { if (!/^asset:[a-f0-9]{32}\.(png|jpe?g|gif|webp|avif|svg|apng)$/.test(image.url)) throw new Error(`gallery.images[${i}].url: use a local asset: URL from an uploaded image`); });
  },
  form(d: ObjectData['form']) {
    unique(d.fields, 'form.fields');
    d.fields.forEach((f, i) => {
      const at = `form.fields[${i}]`;
      if (f.kind === 'choice' && (!f.options?.length || new Set(f.options).size !== f.options.length)) throw new Error(`${at}.options: choice fields need distinct options`);
      if (f.value === undefined || f.value === null) return;
      if (f.kind === 'checkbox' ? typeof f.value !== 'boolean' : f.kind === 'number' ? typeof f.value !== 'number' : typeof f.value !== 'string' || (f.kind === 'choice' && f.value !== '' && !f.options?.includes(f.value))) throw new Error(`${at}.value: invalid ${f.kind} value`);
    });
  },
  plot(d: ObjectData['plot']) {
    const values = d.series.flatMap(s => s.points.map(p => p.y)).filter(y => y !== null);
    if (!values.length) throw new Error('plot.series: every value is empty. Never make an empty chart');
    if (values.length > 1 && values.every(y => y === values[0])) throw new Error('plot.series: every value is the same. A chart needs values that differ');
    if (d.y.format === 'money' && !d.y.currency) throw new Error('plot.y.currency: a money axis needs an ISO currency such as AUD');
  },
  sheet(d: ObjectData['sheet']) {
    d.rows.forEach((r, i) => { if (r.cells.length !== d.columns.length) throw new Error(`sheet.rows[${i}].cells: has ${r.cells.length} cells but there are ${d.columns.length} columns`); });
  },
  diagram(d: ObjectData['diagram']) {
    const ids = new Set<string>();
    d.nodes.forEach((n, i) => { if (ids.has(n.id)) throw new Error(`diagram.nodes[${i}].id: "${n.id}" is used twice`); ids.add(n.id); });
    const layers = new Set((d.layers ?? []).map(l => l.id));
    d.nodes.forEach((n, i) => { if (n.layer && !layers.has(n.layer)) throw new Error(`diagram.nodes[${i}].layer: no layer "${n.layer}". Add it to layers or drop it`); });
    d.edges.forEach((e, i) => {
      if (!ids.has(e.from)) throw new Error(`diagram.edges[${i}].from: no node "${e.from}"`);
      if (!ids.has(e.to)) throw new Error(`diagram.edges[${i}].to: no node "${e.to}"`);
    });
  },
  plan(d: ObjectData['plan']) {
    d.steps.forEach((s, i) => { if (s.date && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) throw new Error(`plan.steps[${i}].date: must be YYYY-MM-DD`); });
  },
};

function unique(items: readonly {id: string}[], at: string) {
  const ids = new Set<string>();
  items.forEach((item, i) => { if (!item.id.trim() || ids.has(item.id)) throw new Error(`${at}[${i}].id: must be non-empty and unique`); ids.add(item.id); });
}
function date(value: string, at: string) {
  const parsed = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${at}: must be a real YYYY-MM-DD date`);
}


export function jsonSchema(shape: z.core.$ZodType): z.core.JSONSchema.JSONSchema {
  return z.toJSONSchema(shape, { unrepresentable: 'throw', override: ({ zodSchema, jsonSchema: json }) => {
    const type = z.globalRegistry.get(zodSchema)?.['legacyType'];
    delete json['legacyType'];
    if (type === 'value' || type === 'cell') {
      for (const key of Object.keys(json)) delete json[key];
      json.type = ['string', 'number', 'null'];
    }
  } });
}
export const objectSchemas = () => Object.fromEntries(OBJECT_KINDS.map(kind => [kind, {title: kind, ...jsonSchema(SHAPES[kind])}]));
export const agentJsonSchemas = () => new Map(OBJECT_KINDS.map(kind => [kind, jsonSchema(SHAPES[kind])]));
// What each kind is for, written for the model. Adapted from Zephium's lead prompt (work_lead/prompt.rs, MPL-2.0).
export const OBJECT_GUIDE = [
  "Each kind's data follows its schema; limits are characters and items, and nothing is ever cut to fit.",
  'Prefer built-in kinds. They match the board theme and support edits, saved values and undo. Use html only when the built-ins cannot express the requested UI. Use revise with complete data to edit an existing object, including html.',
  '- reply: the answer, set large on top of the result. headline answers the request; text is one to three plain sentences with only **bold** and `code`; figures are key numbers shown large; points are short lines. One per request. It never restates an object beside it.',
  '- plot: a chart. style is one of ' + PLOT_STYLES.join(', ') + '. x.kind is category, time (ISO dates) or linear; y.format is number, money (with currency), duration (seconds), percent or bytes. Optional source binds a sheet by cardId, xColumn and yColumns (zero-based). smooth is false by default; true explicitly requests a curve. One series per thing measured; y is a number, or null for a gap. headline is the one figure the chart exists to say. basis says what the values are and where they come from; knowledge is true when they are your own knowledge, not data on the board. Never empty or all equal.',
  '- sheet: real data in typed columns (' + COLUMN_KINDS.join(', ') + '), one value per cell: numbers as plain decimals, yes_no one of yes, no, partial, unknown; rating like 4/5; empty when unknown. best (max or min) marks the column\'s best cell. No sentences in cells. The person can sort it.',
  '- diagram: boxes and arrows: a flow, a pipeline, an architecture. nodes have ids that edges name; kind picks the box\'s look (step for a process step); layers group nodes into bands. direction is down (default) or right. The app lays it out; never give positions.',
  '- plan: time-ordered steps (an itinerary, a roadmap, a study plan). kind is ' + STEP_KINDS.join(', ') + '. checkable true lets the person tick steps off.',
  '- list: items without time order. style is ' + LIST_STYLES.join(', ') + '.',
  '- code: exact source text in a language, with notes on line ranges.',
  '- stats: tiles with label, value, optional delta naming its baseline and optional sparkline of numeric observations. editable true lets the person change a value. Include a note naming the source or demo data.',
  '- timeline: events with real YYYY-MM-DD dates, titles and optional detail. direction is vertical or horizontal. checkable true lets the person tick done.',
  '- kanban: columns have distinct ids and titles; cards have distinct ids, title, optional detail and column naming a column id. The person can drag cards or use Move to change columns.',
  '- table: columns have label and kind text, number, sparkline or bar. Each row has cells in column order. A sparkline cell is an array of numbers, a bar cell a non-negative number with a positive column max. null means missing. editable true on a text, number or bar column enables saved cell edits. Use sheet for typed spreadsheet data.',
  '- progress: goals with label, non-negative current, positive target, optional unit and editable true for saved current values. The bar shows the true ratio, capped at the target; the value still shows overruns.',
  '- compare: two to four options with name and optional detail, criteria with label and one value per option in the same order, and a plain-language verdict.',
  '- gallery: images with url from an uploaded local asset: URL, descriptive alt and optional caption. Use only owned or properly licensed media. No remote URLs.',
  '- stages: steps with title, optional detail and status pending, active, done or blocked. editable true enables saved status changes.',
  '- callout: tone quote, note, warning or tip, text and optional attribution. Quote only supplied words; do not invent quotations.',
  '- form: description and fields with distinct id, label, kind text, textarea, number, checkbox or choice; optional hint, required, value and options for choice. Values save into fields[i].value through object_set. Use strings for text/choice, numbers for number and booleans for checkbox. Empty number is null. There is no submission or external action.',
  '- html: custom offline UI with html, css and js strings and optional initial height 80 to 2000. Runs only inside an opaque sandboxed iframe: no network, imports, parent document, storage or board commands. Styling: write plain semantic HTML (h2, p, label, input, select, button, output, table, progress, svg) and leave it unstyled; the app styles every element in its own theme. Add css only for layout (grid, flex, gap, sizes). For colour use only the theme variables var(--text), var(--ink-2), var(--muted), var(--faint), var(--data), var(--data-soft), var(--inset), var(--line), var(--danger), var(--warn), var(--ok); never set a page background. Any literal colour is converted to the nearest theme token, so other palettes will not appear. aria-pressed="true" marks a selected toggle button. Prefer built-ins; use this only for UI they cannot express. Form values and checked state are saved automatically except password and file inputs. Mark text-only outputs with data-aegis-state. Keep other persistent JSON in window.aegisState, initialise with ??=, and render it on aegis:restore. Dispatch aegis:statechange after changes outside input/change/click or DOM mutations. Snapshots are limited to 64 KiB and share state between canvas and Open, including after restart. The app owns the optional state JSON string. Plain HTML/CSS/JS only: framework compilation is omitted because the installed browser build has no bundler to inline Svelte or React runtime imports into an isolated offline document. Never execute generated code in the app. Revise replaces the source in place.',
].join('\n');
