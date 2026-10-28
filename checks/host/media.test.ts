import { required } from './required.ts';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod/v4';
import { hostFixture } from './fixture.ts';
import { transport } from './preview-transport.ts';
import { applyBatch } from './batch.ts';
import { emptyBoard } from '@aegis/domain/commands';
import { publicAddress, parsePreview, linkPreview } from '../../agent/dist/link-preview.js';

test('media cards retain asset references, colour names and independent crop settings', () => {
  const original = emptyBoard('media');
  let r = applyBatch(original, { commands: [
    { op: 'create', type: 'audio', props: { src: 'asset:memo.webm', duration: 12, wave: [.1,.6] } },
    { op: 'create', type: 'swatch', props: { hex: '#87ceeb', label: 'Sky', autoName: true } },
    { op: 'create', type: 'image', url: 'asset:original.png', props: { tagText: 'Original' }, ref: 'image' },
    { op: 'create', type: 'spotify', url: 'https://open.spotify.com/track/1234567890123456789012', props: { kind: 'track', sid: '1234567890123456789012' } },
  ] });
  assert.equal(r.ok, true); const id = r.created.image;
  r = applyBatch(r.board, { commands: [{ op: 'update', id, set: { props: { crop: { x: .1, y: .2, w: .8, h: .6 } } } }] });
  const image = required(r.board.cards.find(c => c.id === id));
  assert.equal(image.url, 'asset:original.png'); assert.equal(required(image.props).tagText, 'Original');
  assert.deepEqual(required(image.props).crop, { x: .1, y: .2, w: .8, h: .6 });
  assert.equal(original.cards.length, 0);
  assert.equal(required(required(r.board.cards[1]).props).label, 'Sky'); assert.match(required(required(r.board.cards[3]).url), /open.spotify.com/);
  r = applyBatch(r.board, { commands: [{ op: 'update', id, set: { props: { crop: null } } }] });
  assert.equal(required(required(r.board.cards.find(c => c.id === id)).props).crop, undefined);
});
test('palette and background are per board, validated and removed without deleting swatches', () => {
  const a = emptyBoard('a'), b = emptyBoard('b');
  let r = applyBatch(a, { commands: [{ op: 'board_set', set: { bg: '#112233', palette: [{ hex: '#ABCDEF', name: 'Morning' }] } }, { op: 'create', type: 'swatch', props: { hex: '#abcdef' } }] });
  assert.equal(r.ok, true); assert.equal(b.bg, undefined); assert.equal(required(required(r.board.palette)[0]).hex, '#abcdef');
  const invalid = applyBatch(r.board, { commands: [{ op: 'board_set', set: { palette: [{ hex: 'url(evil)', name: 'Bad' }] } }] });
  assert.equal(invalid.ok, false); assert.equal(invalid.board, r.board);
  r = applyBatch(r.board, { commands: [{ op: 'board_set', set: { palette: [], bg: null } }] });
  assert.equal(r.board.cards.length, 1); assert.equal(r.board.bg, undefined);
});
test('Open Graph parsing handles attribute order, entities, relative URLs and script text as plain data', () => {
  const p = parsePreview(`<title>Fallback</title><meta content="A &amp; B" property="og:title"><meta property='og:description' content='A &quot;quote&quot;'><meta property="og:image" content="/cover.png"><link href='/mark.ico' rel='icon'>`, 'https://example.com/post');
  assert.equal(p.title, 'A & B'); assert.equal(p.description, 'A "quote"'); assert.equal(p.image, 'https://example.com/cover.png'); assert.equal(p.favicon, 'https://example.com/mark.ico');
  assert.equal(parsePreview('<meta property="og:image" content="javascript:alert(1)">', 'https://example.com').image, '');
});
test('preview blocks local, private, mapped and reserved addresses', async () => {
  for (const ip of ['0.0.0.0','127.0.0.1','10.0.0.1','172.16.2.1','192.168.1.1','169.254.169.254','100.64.1.1','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('93.184.215.14'), true); assert.equal(publicAddress('2606:4700:4700::1111'), true);
  for (const url of ['file:///etc/passwd','http://127.1/','http://0x7f000001/','http://[::1]/','http://user:pass@example.com/']) await assert.rejects(linkPreview(url));
  await assert.rejects(linkPreview('https://rebound.test', { resolve: async () => [{ address: '127.0.0.1', family: 4 }] }), /blocked/);
});
test('preview pins approved DNS, rechecks redirect hosts and enforces the body cap', async () => {
  const resolve = async () => [{ address: '93.184.215.14', family: 4 }];
  const p = await linkPreview('https://example.com/', { resolve, transport: transport((url, options) => {
    required(options.lookup)(url.hostname, { all: false }, (error, address) => assert.equal(address, '93.184.215.14')); return {};
  }) }); assert.equal(p.title, 'Safe page');
  await assert.rejects(linkPreview('https://example.com/', { resolve, transport: transport(() => ({ status: 302, headers: { location: 'http://127.0.0.1/secrets' } })) }), /blocked/);
  await assert.rejects(linkPreview('https://example.com/', { resolve, transport: transport(() => ({ chunks: [Buffer.alloc(1024 * 1024 + 1)] })) }), /1 MB/);
});
let host: Awaited<ReturnType<typeof hostFixture>>;
before(async () => { host = await hostFixture(); });
after(async () => { await host.close(); });
test('preview also times out during DNS resolution', async () => {
  await assert.rejects(linkPreview('https://example.com/', { resolve: () => new Promise(() => {}), timeoutMs: 25 }), /timed out/);
});
test('real host requires authentication for previews and accepts playable audio assets with seeking', async () => {
  assert.equal((await fetch(`${host.base}/link-preview?url=https://example.com`)).status, 401);
  const blocked = await fetch(`${host.base}/link-preview?url=http://127.0.0.1`, { headers: { authorization: `Bearer ${host.token}` } }); assert.equal(blocked.status, 400);
  for (const type of ['audio/webm;codecs=opus','audio/mp4','audio/ogg','audio/wav','audio/mpeg']) {
    const r = await fetch(host.base + '/assets', { method: 'POST', headers: { authorization: `Bearer ${host.token}`, 'content-type': type }, body: Buffer.from('recording-fixture') }); assert.equal(r.status, 200, type);
    const { url } = z.object({ url: z.string() }).parse(await r.json()); const asset = await fetch(host.base + '/assets/' + url.slice(6), { headers: { range: 'bytes=0-3' } }); assert.equal(asset.status, 206); assert.equal(asset.headers.get('content-type'), required(type.split(';')[0])); assert.equal(await asset.text(), 'reco');
  }
});

