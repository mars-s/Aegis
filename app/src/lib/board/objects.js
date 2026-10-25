// Objects: purpose-sized, typed results an agent places on the board (a reply, a chart, a sheet, a diagram...).
// The model fills a closed shape; the app draws it. One module for the host (validation, tool schema) and the app.
// Kinds, field names and limits follow Zephium's Work objects (zephium-core work/objects.rs and
// zephium-app work_lead/schema.rs, MPL-2.0), reimplemented here as plain JSON checks.

export const OBJECT_KINDS = ['reply', 'plot', 'sheet', 'diagram', 'plan', 'list', 'code'];
export const PLOT_STYLES = ['bar', 'bar_horizontal', 'bar_stacked', 'bar_grouped', 'line', 'area', 'area_stacked', 'donut', 'radial', 'radar', 'range'];
export const PLOT_FORMATS = ['number', 'money', 'duration', 'percent', 'bytes'];
export const COLUMN_KINDS = ['text', 'number', 'money', 'percent', 'date', 'duration', 'yes_no', 'rating', 'link', 'tag'];
export const NODE_KINDS = ['client', 'edge', 'gateway', 'service', 'worker', 'model', 'store', 'queue', 'cache', 'storage', 'external', 'step', 'other'];
export const STEP_KINDS = ['travel', 'stay', 'event', 'task', 'milestone', 'note'];
export const LIST_STYLES = ['todo', 'messages', 'reading', 'requirements', 'questions'];

// Default card size for each kind, before the app measures it.
export const OBJECT_SIZE = { reply: [520, 180], plot: [520, 360], sheet: [620, 340], diagram: [720, 440], plan: [460, 420], list: [420, 320], code: [560, 360] };

// ---------- a tiny schema language: the same table gives the model its JSON Schema and checks its data ----------
const S = {
  text: max => ({ t: 'text', max }),
  num: () => ({ t: 'num' }),
  bool: () => ({ t: 'bool' }),
  int: (min = 0, max = 1e9) => ({ t: 'int', min, max }),
  one: values => ({ t: 'one', values }),
  list: (item, min, max) => ({ t: 'list', item, min, max }),
  obj: (props, required = []) => ({ t: 'obj', props, required }),
  cell: max => ({ t: 'cell', max }),
  value: () => ({ t: 'value' }), // number, numeric string or null
};

export const SHAPES = {
  reply: S.obj({
    headline: S.text(80),
    text: S.text(480),
    figures: S.list(S.obj({ label: S.text(24), value: S.text(20), note: S.text(40) }, ['label', 'value']), 0, 4),
    points: S.list(S.text(140), 0, 5),
  }, ['headline', 'text']),
  plot: S.obj({
    style: S.one(PLOT_STYLES),
    x: S.obj({ label: S.text(24), kind: S.one(['category', 'time', 'linear']) }, ['kind']),
    y: S.obj({ label: S.text(24), unit: S.text(12), format: S.one(PLOT_FORMATS), currency: S.text(3) }, ['format']),
    series: S.list(S.obj({
      name: S.text(24),
      points: S.list(S.obj({ x: S.cell(24), y: S.value(), y2: S.value() }, ['x']), 1, 60),
    }, ['name', 'points']), 1, 8),
    headline: S.obj({ label: S.text(24), value: S.text(20) }, ['label', 'value']),
    basis: S.text(120),
    knowledge: S.bool(),
  }, ['style', 'x', 'y', 'series', 'basis']),
  sheet: S.obj({
    columns: S.list(S.obj({ label: S.text(24), kind: S.one(COLUMN_KINDS), unit: S.text(12), currency: S.text(3), best: S.one(['max', 'min']) }, ['label', 'kind']), 1, 10),
    rows: S.list(S.obj({ cells: S.list(S.cell(200), 1, 10) }, ['cells']), 1, 200),
    note: S.text(200),
  }, ['columns', 'rows']),
  diagram: S.obj({
    direction: S.one(['down', 'right']),
    nodes: S.list(S.obj({ id: S.text(40), name: S.text(40), kind: S.one(NODE_KINDS), note: S.text(80), layer: S.text(40) }, ['id', 'name', 'kind']), 1, 24),
    edges: S.list(S.obj({ from: S.text(40), to: S.text(40), label: S.text(32) }, ['from', 'to']), 0, 80),
    layers: S.list(S.obj({ id: S.text(40), name: S.text(40) }, ['id', 'name']), 0, 6),
  }, ['nodes', 'edges']),
  plan: S.obj({
    steps: S.list(S.obj({
      when: S.text(32), date: S.text(10), title: S.text(80), detail: S.text(280),
      kind: S.one(STEP_KINDS), cost: S.text(24), place: S.text(40), done: S.bool(),
    }, ['title', 'kind']), 1, 40),
    total: S.obj({ label: S.text(24), value: S.text(24) }, ['label', 'value']),
    checkable: S.bool(),
  }, ['steps']),
  list: S.obj({
    style: S.one(LIST_STYLES),
    items: S.list(S.obj({ title: S.text(90), detail: S.text(280), due: S.text(32), done: S.bool(), priority: S.one(['high']) }, ['title']), 1, 40),
  }, ['style', 'items']),
  code: S.obj({
    language: S.text(16),
    text: S.text(16000),
    notes: S.list(S.obj({ from: S.int(1), to: S.int(1), text: S.text(160) }, ['from', 'to', 'text']), 0, 24),
  }, ['language', 'text']),
};

// Check data against its kind. Returns the cleaned data or throws an error naming the exact place: "plot.series[0].points[3].y".
export function checkObject(kind, data) {
  const shape = SHAPES[kind];
  if (!shape) throw new Error(`unknown object kind "${kind}". Use one of: ${OBJECT_KINDS.join(', ')}`);
  const out = walk(shape, data, kind);
  extra[kind]?.(out);
  return out;
}

function walk(shape, v, at) {
  const fail = msg => { throw new Error(`${at}: ${msg}`); };
  switch (shape.t) {
    case 'text':
      if (typeof v === 'number') v = String(v);
      if (typeof v !== 'string') fail(`must be text, got ${kindOf(v)}`);
      if (v.length > shape.max) fail(`is ${v.length} characters; the limit is ${shape.max}. Shorten it, nothing is cut to fit`);
      return v;
    case 'cell':
      if (v === null || v === undefined) return '';
      if (typeof v === 'number' || typeof v === 'boolean') v = String(v);
      if (typeof v !== 'string') fail(`must be text or a number, got ${kindOf(v)}`);
      if (v.length > shape.max) fail(`is ${v.length} characters; the limit is ${shape.max}`);
      return v;
    case 'num':
      if (typeof v !== 'number' || !Number.isFinite(v)) fail(`must be a number, got ${kindOf(v)}`);
      return v;
    case 'int':
      if (!Number.isInteger(v) || v < shape.min || v > shape.max) fail(`must be a whole number from ${shape.min}`);
      return v;
    case 'value': {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/[,$€£¥%\s]/g, ''));
      if (!Number.isFinite(n)) fail(`must be a number (or null for a gap), got ${JSON.stringify(v)}`);
      return n;
    }
    case 'bool':
      if (typeof v !== 'boolean') fail(`must be true or false, got ${kindOf(v)}`);
      return v;
    case 'one':
      if (!shape.values.includes(v)) fail(`must be one of ${shape.values.join(', ')}; got ${JSON.stringify(v)}`);
      return v;
    case 'list': {
      if (!Array.isArray(v)) fail(`must be a list, got ${kindOf(v)}`);
      if (v.length < shape.min) fail(`needs at least ${shape.min} item${shape.min === 1 ? '' : 's'}`);
      if (v.length > shape.max) fail(`has ${v.length} items; the limit is ${shape.max}`);
      return v.map((item, i) => walk(shape.item, item, `${at}[${i}]`));
    }
    case 'obj': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`must be an object, got ${kindOf(v)}`);
      const out = {};
      for (const key of Object.keys(v)) if (!(key in shape.props)) fail(`has an unknown field "${key}". Allowed: ${Object.keys(shape.props).join(', ')}`);
      for (const key of shape.required) if (v[key] === undefined || v[key] === null) fail(`needs "${key}"`);
      for (const [key, sub] of Object.entries(shape.props)) if (v[key] !== undefined && v[key] !== null) out[key] = walk(sub, v[key], `${at}.${key}`);
      return out;
    }
  }
  throw new Error(`${at}: bad schema`);
}
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v);

// Rules that span fields.
const extra = {
  plot(d) {
    const values = d.series.flatMap(s => s.points.map(p => p.y)).filter(y => y !== null);
    if (!values.length) throw new Error('plot.series: every value is empty. Never make an empty chart');
    if (values.length > 1 && values.every(y => y === values[0])) throw new Error('plot.series: every value is the same. A chart needs values that differ');
    if (d.y.format === 'money' && !d.y.currency) throw new Error('plot.y.currency: a money axis needs an ISO currency such as AUD');
  },
  sheet(d) {
    d.rows.forEach((r, i) => { if (r.cells.length !== d.columns.length) throw new Error(`sheet.rows[${i}].cells: has ${r.cells.length} cells but there are ${d.columns.length} columns`); });
  },
  diagram(d) {
    const ids = new Set();
    d.nodes.forEach((n, i) => { if (ids.has(n.id)) throw new Error(`diagram.nodes[${i}].id: "${n.id}" is used twice`); ids.add(n.id); });
    const layers = new Set((d.layers ?? []).map(l => l.id));
    d.nodes.forEach((n, i) => { if (n.layer && !layers.has(n.layer)) throw new Error(`diagram.nodes[${i}].layer: no layer "${n.layer}". Add it to layers or drop it`); });
    d.edges.forEach((e, i) => {
      if (!ids.has(e.from)) throw new Error(`diagram.edges[${i}].from: no node "${e.from}"`);
      if (!ids.has(e.to)) throw new Error(`diagram.edges[${i}].to: no node "${e.to}"`);
    });
  },
  plan(d) {
    d.steps.forEach((s, i) => { if (s.date && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) throw new Error(`plan.steps[${i}].date: must be YYYY-MM-DD`); });
  },
};

// JSON Schema for the model, from the same table.
export function jsonSchema(shape) {
  switch (shape.t) {
    case 'text': return { type: 'string', maxLength: shape.max };
    case 'cell': return { type: ['string', 'number', 'null'] };
    case 'num': return { type: 'number' };
    case 'int': return { type: 'integer', minimum: shape.min };
    case 'value': return { type: ['number', 'string', 'null'] };
    case 'bool': return { type: 'boolean' };
    case 'one': return { type: 'string', enum: shape.values };
    case 'list': return { type: 'array', items: jsonSchema(shape.item), ...(shape.min ? { minItems: shape.min } : {}), maxItems: shape.max };
    case 'obj': return { type: 'object', properties: Object.fromEntries(Object.entries(shape.props).map(([k, v]) => [k, jsonSchema(v)])), required: shape.required, additionalProperties: false };
  }
}
export const objectSchemas = () => Object.fromEntries(OBJECT_KINDS.map(k => [k, { title: k, ...jsonSchema(SHAPES[k]) }]));

// What each kind is for, written for the model. Adapted from Zephium's lead prompt (work_lead/prompt.rs, MPL-2.0).
export const OBJECT_GUIDE = [
  "Each kind's data follows its schema; limits are characters and items, and nothing is ever cut to fit.",
  '- reply: the answer, set large on top of the result. headline answers the request; text is one to three plain sentences with only **bold** and `code`; figures are key numbers shown large; points are short lines. One per request. It never restates an object beside it.',
  '- plot: a chart. style is one of ' + PLOT_STYLES.join(', ') + '. x.kind is category, time (ISO dates) or linear; y.format is number, money (with currency), duration (seconds), percent or bytes. One series per thing measured; y is a number, or null for a gap. headline is the one figure the chart exists to say. basis says what the values are and where they come from; knowledge is true when they are your own knowledge, not data on the board. Never empty or all equal.',
  '- sheet: real data in typed columns (' + COLUMN_KINDS.join(', ') + '), one value per cell: numbers as plain decimals, yes_no one of yes, no, partial, unknown; rating like 4/5; empty when unknown. best (max or min) marks the column\'s best cell. No sentences in cells. The person can sort it.',
  '- diagram: boxes and arrows: a flow, a pipeline, an architecture. nodes have ids that edges name; kind picks the box\'s look (step for a process step); layers group nodes into bands. direction is down (default) or right. The app lays it out; never give positions.',
  '- plan: time-ordered steps (an itinerary, a roadmap, a study plan). kind is ' + STEP_KINDS.join(', ') + '. checkable true lets the person tick steps off.',
  '- list: items without time order. style is ' + LIST_STYLES.join(', ') + '.',
  '- code: exact source text in a language, with notes on line ranges.',
].join('\n');
