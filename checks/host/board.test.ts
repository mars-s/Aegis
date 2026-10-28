import { z } from 'zod/v4';
import { applyBatch } from './batch.ts';
import { required } from './required.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard, describe } from '@aegis/domain/commands';

const board = () => applyBatch(emptyBoard('b1', 'Test'), { commands: [
  { op: 'create', type: 'note', text: 'one', newId: 'aaaaaaaa', x: 0, y: 0 },
  { op: 'create', type: 'note', text: 'two', newId: 'bbbbbbbb', x: 300, y: 0 },
] }).board;

test('a batch applies all commands and bumps the revision', () => {
  const b = board();
  assert.equal(b.rev, 1);
  assert.deepEqual(b.cards.map(c => c.text), ['one', 'two']);
});

test('a batch with one bad command changes nothing and says why', () => {
  const b = board();
  const r = applyBatch(b, { commands: [{ op: 'update', id: 'aaaaaaaa', set: { text: 'changed' } }, { op: 'move', id: 'missing', x: 1, y: 1 }] });
  assert.equal(r.ok, false);
  assert.equal(required(r.errors[0]).index, 1);
  assert.match(required(r.errors[0]).reason, /no card missing/);
  assert.equal(r.board, b, 'returns the untouched board');
  assert.equal(required(b.cards[0]).text, 'one');
});

test('refs let later commands use cards created earlier in the batch', () => {
  const r = applyBatch(board(), { commands: [
    { op: 'create', type: 'title', text: 'Group', ref: 't' },
    { op: 'create', type: 'note', text: 'child', near: '$t', ref: 'c' },
    { op: 'connect', a: '$t', b: '$c' },
    { op: 'focus', ids: ['$t', '$c'] },
  ] });
  assert.equal(r.ok, true);
  assert.equal(r.board.links.length, 1);
  assert.deepEqual(required(r.board.focus).ids, [r.created.t, r.created.c]);
});

test('cards placed without coordinates never overlap existing cards', () => {
  let b = board();
  for (let i = 0; i < 30; i++) b = applyBatch(b, { commands: [{ op: 'create', type: 'note', text: String(i) }] }).board;
  for (const a of b.cards) for (const c of b.cards) if (a !== c)
    assert.ok(a.x + a.w <= c.x || c.x + c.w <= a.x || a.y + a.h <= c.y || c.y + c.h <= a.y, `${a.text} overlaps ${c.text}`);
});

test('deleting a card removes its links', () => {
  let b = applyBatch(board(), { commands: [{ op: 'connect', a: 'aaaaaaaa', b: 'bbbbbbbb' }] }).board;
  b = applyBatch(b, { commands: [{ op: 'delete', id: 'aaaaaaaa' }] }).board;
  assert.equal(b.links.length, 0);
  assert.deepEqual(b.cards.map(c => c.id), ['bbbbbbbb']);
});

test('grid layout puts cards on a grid', () => {
  const r = applyBatch(board(), { commands: [{ op: 'layout', ids: ['aaaaaaaa', 'bbbbbbbb'], shape: 'column', x: 10, y: 10 }] });
  const [a, b] = r.board.cards; assert.ok(a && b);
  assert.equal(a.x, 10); assert.equal(b.x, 10); assert.ok(b.y > a.y + a.h);
});

test('unknown ops and card types are refused with the allowed list', () => {
  assert.match(required(applyBatch(board(), { commands: [{ op: 'explode' }] }).errors[0]).reason, /create, update/);
  assert.match(required(applyBatch(board(), { commands: [{ op: 'create', type: 'rocket' }] }).errors[0]).reason, /note, title/);
});

test('describe gives a model ids, positions and text', () => {
  const d = describe(board());
  assert.deepEqual(d.cards.map(c => [c.id, c.text]), [['aaaaaaaa', 'one'], ['bbbbbbbb', 'two']]);
});

test('notes keep a heading and badge, agents see them, and clearing removes them', () => {
  let r = applyBatch(board(), { commands: [{ op: 'create', type: 'note', text: 'Dump here.', heading: 'How this board works', badge: 'read me first', ref: 'r' }] });
  const id = r.created.r;
  const seen = required(describe(r.board).cards.find(c => c.id === id));
  assert.equal(seen.heading, 'How this board works'); assert.equal(seen.badge, 'read me first');
  r = applyBatch(r.board, { commands: [{ op: 'update', id, set: { badge: '' } }] });
  assert.equal('badge' in required(r.board.cards.find(c => c.id === id)), false);
});

test('order restacks cards: later in the list draws on top', () => {
  const b = applyBatch(board(), { commands: [{ op: 'create', type: 'note', text: 'three', newId: 'cccccccc', x: 0, y: 400 }] }).board;
  const ids = (r: ReturnType<typeof applyBatch>) => r.board.cards.map(c => c.id);
  assert.deepEqual(ids(applyBatch(b, { commands: [{ op: 'order', ids: ['aaaaaaaa'], to: 'front' }] })), ['bbbbbbbb', 'cccccccc', 'aaaaaaaa']);
  assert.deepEqual(ids(applyBatch(b, { commands: [{ op: 'order', ids: ['cccccccc'], to: 'back' }] })), ['cccccccc', 'aaaaaaaa', 'bbbbbbbb']);
  assert.deepEqual(ids(applyBatch(b, { commands: [{ op: 'order', ids: ['cccccccc'], to: 1 }] })), ['aaaaaaaa', 'cccccccc', 'bbbbbbbb']);
  assert.equal(applyBatch(b, { commands: [{ op: 'order', ids: ['nope'], to: 'front' }] }).ok, false);
});

test('video cards keep their url and get a 16:9 default size', () => {
  const r = applyBatch(board(), { commands: [{ op: 'create', type: 'video', url: 'asset:0123456789abcdef0123456789abcdef.mp4', ref: 'v' }] });
  const v = required(r.board.cards.find(c => c.id === r.created.v));
  assert.equal(v.url, 'asset:0123456789abcdef0123456789abcdef.mp4'); assert.deepEqual([v.w, v.h], [480, 270]);
});

test('object cards hold checked data, and a bad field is named exactly', () => {
  const plot = { style: 'bar', x: { kind: 'category' }, y: { format: 'number' }, basis: 'Tasks done', series: [{ name: 'Tasks', points: [{ x: 'Mon', y: 8 }, { x: 'Tue', y: 12 }] }] };
  const r = applyBatch(board(), { commands: [{ op: 'create', type: 'object', kind: 'plot', text: 'Weekly', data: plot, ref: 'p' }] });
  assert.equal(r.ok, true, r.errors?.[0]?.reason);
  const card = required(r.board.cards.find(c => c.id === r.created.p)); assert.ok(card.kind === 'plot');
  assert.equal(card.kind, 'plot'); assert.equal(required(required(card.data.series[0]).points[1]).y, 12);
  const bad = { ...plot, series: [{ ...required(plot.series[0]), points: [required(required(plot.series[0]).points[0]), { ...required(required(plot.series[0]).points[1]), y: 'lots' }] }] };
  assert.match(required(applyBatch(board(), { commands: [{ op: 'create', type: 'object', kind: 'plot', data: bad }] }).errors[0]).reason, /plot\.series\[0\]\.points\[1\]\.y/);
  const extra = { ...plot, colour: 'red' };
  assert.match(required(applyBatch(board(), { commands: [{ op: 'create', type: 'object', kind: 'plot', data: extra }] }).errors[0]).reason, /unknown field "colour"/);
});

test('revise replaces an object in place and counts its version; diagram edges must name real nodes', () => {
  const d = { nodes: [{ id: 'a', name: 'Brief', kind: 'step' }, { id: 'b', name: 'Ship', kind: 'step' }], edges: [{ from: 'a', to: 'b' }] };
  let r = applyBatch(board(), { commands: [{ op: 'create', type: 'object', kind: 'diagram', data: d, ref: 'd' }] });
  const id = r.created.d;
  r = applyBatch(r.board, { commands: [{ op: 'revise', id, data: { ...d, nodes: [...d.nodes, { id: 'c', name: 'Review', kind: 'step' }] } }] });
  const card = required(r.board.cards.find(c => c.id === id)); assert.ok(card.kind === 'diagram');
  assert.equal(card.ver, 2); assert.equal(card.data.nodes.length, 3);
  assert.match(required(applyBatch(r.board, { commands: [{ op: 'revise', id, data: { ...d, edges: [{ from: 'a', to: 'zzz' }] } }] }).errors[0]).reason, /edges\[0\]\.to: no node "zzz"/);
});

test('restore puts back an earlier state, and board_set keeps the tray, palette and background', () => {
  const b0 = board();
  let r = applyBatch(b0, { commands: [{ op: 'delete', id: 'aaaaaaaa' }] });
  assert.equal(r.board.cards.length, 1);
  r = applyBatch(r.board, { commands: [{ op: 'restore', cards: b0.cards, links: b0.links }] });
  assert.deepEqual(r.board.cards.map(c => c.id), ['aaaaaaaa', 'bbbbbbbb']);
  r = applyBatch(r.board, { commands: [{ op: 'board_set', set: { tray: [{ id: 't1', type: 'note', text: 'later' }], bg: '#112233' } }] });
  assert.equal(z.object({ text: z.string() }).parse(required(required(r.board.tray)[0])).text, 'later'); assert.equal(r.board.bg, '#112233');
  assert.equal(applyBatch(r.board, { commands: [{ op: 'board_set', set: { bg: 'red' } }] }).ok, false);
});

test('props merge, rot and custom colours are kept; built-in catalogue sizes are accepted', async () => {
  const { CARD_CATALOG } = await import('@aegis/domain/catalog');
  assert.deepEqual(CARD_CATALOG.swatch.size, [160, 160]);
  let r = applyBatch(board(), { commands: [{ op: 'create', type: 'swatch', props: { a: 1, b: 2 }, rot: 5, color: '#ff8800', ref: 't' }] });
  const id = r.created.t; let c = required(r.board.cards.find(x => x.id === id));
  assert.deepEqual([c.w, c.h, c.rot, c.color], [160, 160, 5, '#ff8800']);
  r = applyBatch(r.board, { commands: [{ op: 'update', id, set: { props: { b: null, c: 3 } } }] });
  c = required(r.board.cards.find(x => x.id === id));
  assert.deepEqual(c.props, { a: 1, c: 3 });
  assert.equal(applyBatch(board(), {commands:[{op:'create',type:'testthing'}]}).ok, false);
});

test('"$name" refs resolve in parent and in props.kids, on create and update', () => {
  const r = applyBatch(emptyBoard('refs'), { commands: [
    { op: 'create', type: 'note', text: 'Screen', ref: 'f' },
    { op: 'create', type: 'note', text: 'Child', parent: '$f', ref: 'a' },
    { op: 'create', type: 'note', text: 'Later', ref: 'b' },
    { op: 'update', id: '$b', set: { parent: '$f' } },
    { op: 'update', id: '$f', set: { props: { kids: ['$a', '$b'] } } },
  ] });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const [f, a, b] = r.board.cards; assert.ok(f && a && b && f.props);
  assert.equal(a.parent, f.id); assert.equal(b.parent, f.id); assert.deepEqual(f.props.kids, [a.id, b.id]);
});

test('a collection made in one batch lays out its members in columns', async () => {
  const r = applyBatch(emptyBoard('coll'), { commands: [
    { op: 'create', type: 'note', text: 'A', x: 900, y: 900, ref: 'a' },
    { op: 'create', type: 'note', text: 'B', x: 900, y: 900, ref: 'b' },
    { op: 'create', type: 'coll', text: 'Ideas', x: 0, y: 0, w: 530, props: { kids: ['$a', '$b'] } },
  ] });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const [coll, a, b] = r.board.cards; assert.ok(coll && a && b && coll.props);
  assert.equal(coll.type, 'coll', 'the collection sits behind its members');
  assert.equal(a.parent, coll.id); assert.equal(b.parent, coll.id);
  assert.equal(coll.props.cols, 2); assert.equal(a.y, b.y); assert.ok(b.x > a.x + a.w - 1);
  assert.ok(a.x >= coll.x && b.x + b.w <= coll.x + coll.w, 'members sit inside the collection');
});
