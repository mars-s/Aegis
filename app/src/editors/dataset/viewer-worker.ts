import { parseCsv, profileDataset, toDate, toNumber } from '@aegis/domain/dataset';
import type { Dataset } from '@aegis/domain/dataset';
import { WorkerInputSchema } from './protocol.js';
import type { WorkerOutput } from './protocol.js';

// One worker belongs to one source lease. Its epoch guards overlapping fetches.
let current: { readonly epoch: number; readonly data: Dataset; readonly kinds: readonly string[]; readonly order: number[] } | null = null;
let generation = 0;
let loading: AbortController | null = null;
const collator = new Intl.Collator('en-AU', { numeric: true, sensitivity: 'base' });
const post = (message: WorkerOutput) => self.postMessage(message);
self.onmessage = (event: MessageEvent<unknown>) => {
  const parsed = WorkerInputSchema.safeParse(event.data);
  if (!parsed.success) { post({ type: 'error', epoch: generation, message: 'Invalid dataset request.' }); return; }
  const message = parsed.data;
  if (message.type === 'load') {
    generation = message.epoch;
    current = null;
    loading?.abort();
    const controller = new AbortController(); loading = controller;
    void (async () => {
      try {
        const response = await fetch(message.url, { signal: controller.signal });
        if (!response.ok) throw new Error('The source file is unavailable.');
        const data = parseCsv(await response.text());
        if (message.epoch !== generation || controller.signal.aborted) return;
        const profile = profileDataset(data);
        current = { epoch: message.epoch, data, kinds: profile.columns.map(column => column.kind), order: Array.from({ length: data.rows.length }, (_, i) => i) };
        post({ type: 'ready', epoch: message.epoch, columns: data.columns, profile, total: data.rows.length });
      } catch (error) { if (!controller.signal.aborted && message.epoch === generation) post({ type: 'error', epoch: message.epoch, message: error instanceof Error ? error.message : 'Could not read source data.' }); }
    })();
    return;
  }
  const state = current;
  if (!state || state.epoch !== message.epoch) return;
  switch (message.type) {
    case 'sort': {
      const kind = state.kinds[message.column];
      if (!kind) { post({ type: 'error', epoch: message.epoch, message: 'That column no longer exists.' }); return; }
      const keys = state.data.rows.map(row => { const text = row[message.column] ?? ''; return text.trim() === '' ? null : kind === 'number' ? toNumber(text) : kind === 'date' ? toDate(text) : text; });
      state.order.sort((a, b) => { const x = keys[a], y = keys[b]; if (x === y) return a - b; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y))) * message.direction; });
      post({ type: 'sorted', epoch: message.epoch, column: message.column, direction: message.direction }); return;
    }
    case 'rows': post({ type: 'rows', epoch: message.epoch, request: message.request, start: message.start, rows: state.order.slice(message.start, Math.min(message.end, message.start + 512)).flatMap(index => { const cells = state.data.rows[index]; return cells ? [{ number: index + 1, cells }] : []; }) }); return;
    default: { const exhaustive: never = message; return exhaustive; }
  }
};
