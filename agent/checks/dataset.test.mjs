import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCsv, profileDataset, queryDataset, toDate } from '@aegis/domain/dataset';

const csv = 'amount,dept,opened,note\n10,Sales,2024-01-03 09:00:00,"a, quoted"\n30,Sales,2024-01-20,"say ""hi"""\n20,Support,2024-02-02,\n40,,2024-02-28,"two\nlines"\n';

test('CSV parsing handles quotes, embedded delimiters and newlines, and sniffs tabs', () => {
  const d = parseCsv(csv);
  assert.deepEqual(d.columns, ['amount', 'dept', 'opened', 'note']);
  assert.equal(d.rows.length, 4);
  assert.deepEqual(d.rows.map(r => r[3]), ['a, quoted', 'say "hi"', '', 'two\nlines']);
  assert.deepEqual(parseCsv('a\tb\n1\t2\n').rows, [['1', '2']]);
  assert.deepEqual(parseCsv('x,x\n1,2').columns, ['x', 'x_2']);
  assert.equal(toDate('31/12/2024'), Date.UTC(2024, 11, 31));
});

test('profiles report kinds, gaps, ranges and a true median', () => {
  const p = profileDataset(parseCsv(csv)), [amount, dept, opened, note] = p.columns;
  assert.deepEqual([amount.kind, dept.kind, opened.kind, note.kind], ['number', 'text', 'date', 'text']);
  assert.equal(amount.median, 25, 'an even count averages the two middle values');
  assert.equal(amount.sum, 100); assert.equal(dept.empty, 1); assert.equal(opened.min, '2024-01-03');
});

test('queries aggregate every row exactly, bucket by month, filter and sort', () => {
  const d = parseCsv(csv);
  assert.deepEqual(queryDataset(d, { groupBy: 'dept', measures: [{ op: 'sum', column: 'amount' }, { op: 'count' }] }).rows,
    [{ dept: 'Sales', sum_amount: 40, count: 2 }, { dept: '(blank)', sum_amount: 40, count: 1 }, { dept: 'Support', sum_amount: 20, count: 1 }]);
  assert.deepEqual(queryDataset(d, { groupBy: 'opened', bucket: 'month', measures: [{ op: 'median', column: 'amount', as: 'mid' }] }).rows,
    [{ opened_month: '2024-01', mid: 20 }, { opened_month: '2024-02', mid: 30 }]);
  const filtered = queryDataset(d, { measures: [{ op: 'sum', column: 'amount' }], filter: [{ column: 'opened', op: 'gte', value: '2024-02-01' }] });
  assert.equal(filtered.matched, 2); assert.equal(filtered.rows[0].sum_amount, 60);
  assert.throws(() => queryDataset(d, { groupBy: 'nope' }), /no column "nope"/);
  assert.equal(queryDataset(d, { groupBy: 'note', limit: 2 }).truncated, true);
});

let host, base, capture;
const token = 'dataset-' + process.pid;
before(async () => {
  const data = await mkdtemp(join(tmpdir(), 'aegis-dataset-')); capture = join(data, 'model-input.jsonl');
  host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_FAKE_CAPTURE_INPUT: capture } });
  base = await new Promise((resolve, reject) => {
    host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) resolve(`http://127.0.0.1:${m[1]}`); });
    host.on('exit', code => reject(new Error('host exited ' + code)));
  });
});
after(() => host?.kill());

test('an agent queries an uploaded CSV through data_query and gets exact results', async () => {
  const auth = { authorization: `Bearer ${token}` };
  const asset = await (await fetch(base + '/assets', { method: 'POST', headers: { ...auth, 'content-type': 'text/csv' }, body: csv })).json();
  assert.match(asset.url, /^asset:[a-f0-9]{32}\.csv$/);
  const board = await (await fetch(base + '/boards', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Data' }) })).json();
  await fetch(`${base}/boards/${board.id}/batch`, { method: 'POST', headers: auth, body: JSON.stringify({ commands: [{ op: 'create', type: 'dataset', newId: 'dataset01', text: 'tiny', props: { src: asset.url, rows: 4 } }] }) });
  const script = [['data_query', { dataset: 'dataset01', groupBy: 'dept', measures: [{ op: 'sum', column: 'amount' }] }]];
  await fetch(base + '/agents', { method: 'POST', headers: auth, body: JSON.stringify({ boardId: board.id, brief: 'FAKETOOLS ' + JSON.stringify(script), model: { provider: 'fake', modelId: 'fake' } }) });
  // The model's second turn receives the tool result: read it from the captured input.
  let result;
  for (let i = 0; i < 100 && !result; i++) {
    await new Promise(r => setTimeout(r, 100));
    const lines = await readFile(capture, 'utf8').catch(() => '');
    const tool = lines.split('\n').filter(Boolean).map(l => JSON.parse(l)).flatMap(c => c.messages).find(m => m.role === 'toolResult' && m.toolName === 'data_query');
    if (tool) result = JSON.parse(tool.content.find(c => c.type === 'text').text);
  }
  assert.ok(result, 'data_query returned to the model');
  assert.equal(result.matched, 4);
  assert.deepEqual(result.rows, [{ dept: 'Sales', sum_amount: 40 }, { dept: '(blank)', sum_amount: 40 }, { dept: 'Support', sum_amount: 20 }]);
  // The board summary carries the dataset's shape for planning.
  const first = (await readFile(capture, 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l))[0].messages.find(m => m.role === 'user');
  assert.match(first.content.map(c => c.text).join('\n'), /"dataset":\{"rows":4/);
});
