import { parseCsv, profileDataset, toDate, toNumber } from '../../lib/board/dataset.js';

let data, profile, order;
const collator = new Intl.Collator('en-AU', { numeric: true, sensitivity: 'base' });
self.onmessage = async ({ data: message }) => {
  try {
    if (message.type === 'load') {
      const response = await fetch(message.url);
      if (!response.ok) throw new Error('The source file is unavailable.');
      data = parseCsv(await response.text());
      profile = profileDataset(data);
      order = Array.from({ length: data.rows.length }, (_, i) => i);
      self.postMessage({ type: 'ready', columns: data.columns, profile, total: order.length });
    } else if (message.type === 'sort') {
      const { column, direction } = message, kind = profile.columns[column].kind;
      const keys = data.rows.map(row => row[column] === '' ? null : kind === 'number' ? toNumber(row[column]) : kind === 'date' ? toDate(row[column]) : row[column]);
      order.sort((a, b) => {
        const x = keys[a], y = keys[b];
        if (x === y) return a - b;
        if (x === null) return 1;
        if (y === null) return -1;
        return (typeof x === 'number' ? x - y : collator.compare(x, y)) * direction;
      });
      self.postMessage({ type: 'sorted', column, direction });
    } else if (message.type === 'rows') {
      const rows = order.slice(message.start, message.end).map(index => ({ number: index + 1, cells: data.rows[index] }));
      self.postMessage({ type: 'rows', request: message.request, start: message.start, rows });
    }
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
