import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../../app/src/lib/board/types/media.js';
import { applyBatch, emptyBoard } from '../../app/src/lib/board/commands.js';
import { colorName, normHex, hex2hsv, hsv2rgb, rgb2hex, paletteFromPixels, boardColours } from '../../app/src/features/colors/model.js';
import { contrastText } from '../../app/src/features/colors/settings.js';
import { uploadRecording } from '../../app/src/features/media/upload.js';
import { cropBox } from '../../app/src/features/media/images.js';
import { spotifyOf, normaliseLink } from '../../app/src/features/media/links.js';
import { publicAddress, parsePreview, linkPreview } from '../../app/src/features/media/link-preview.mjs';

test('media cards retain asset references, colour names and independent crop settings', () => {
  const original = emptyBoard('media');
  let r = applyBatch(original, { commands: [
    { op: 'create', type: 'audio', props: { src: 'asset:memo.webm', duration: 12, wave: [.1,.6] } },
    { op: 'create', type: 'swatch', props: { hex: '#87ceeb', label: colorName('#87ceeb'), autoName: true } },
    { op: 'create', type: 'image', url: 'asset:original.png', props: { tagText: 'Original' }, ref: 'image' },
    { op: 'create', type: 'spotify', url: 'https://open.spotify.com/track/1234567890123456789012', props: { kind: 'track', sid: '1234567890123456789012' } },
  ] });
  assert.equal(r.ok, true); const id = r.created.image;
  r = applyBatch(r.board, { commands: [{ op: 'update', id, set: { props: { crop: { x: .1, y: .2, w: .8, h: .6 } } } }] });
  const image = r.board.cards.find(c => c.id === id);
  assert.equal(image.url, 'asset:original.png'); assert.equal(image.props.tagText, 'Original');
  assert.deepEqual(image.props.crop, { x: .1, y: .2, w: .8, h: .6 });
  assert.equal(original.cards.length, 0);
  assert.equal(r.board.cards[1].props.label, 'Sky'); assert.match(r.board.cards[3].url, /open.spotify.com/);
  r = applyBatch(r.board, { commands: [{ op: 'update', id, set: { props: { crop: null } } }] });
  assert.equal(r.board.cards.find(c => c.id === id).props.crop, undefined);
});
test('palette and background are per board, validated and removed without deleting swatches', () => {
  const a = emptyBoard('a'), b = emptyBoard('b');
  let r = applyBatch(a, { commands: [{ op: 'board_set', set: { bg: '#112233', palette: [{ hex: '#ABCDEF', name: 'Morning' }] } }, { op: 'create', type: 'swatch', props: { hex: '#abcdef' } }] });
  assert.equal(r.ok, true); assert.equal(b.bg, undefined); assert.equal(r.board.palette[0].hex, '#abcdef');
  const invalid = applyBatch(r.board, { commands: [{ op: 'board_set', set: { palette: [{ hex: 'url(evil)', name: 'Bad' }] } }] });
  assert.equal(invalid.ok, false); assert.equal(invalid.board, r.board);
  r = applyBatch(r.board, { commands: [{ op: 'board_set', set: { palette: [], bg: null } }] });
  assert.equal(r.board.cards.length, 1); assert.equal(r.board.bg, undefined);
});
test('colour names, hex shorthand and HSV wheel preserve known colours', () => {
  assert.equal(normHex(' fAc '), '#ffaacc'); assert.equal(normHex('invalid'), null);
  assert.equal(colorName('#000000'), 'Black'); assert.equal(colorName('#ff69b4'), 'Hot Pink');
  for (const hex of ['#000000','#ffffff','#87ceeb','#fe1234','#3c7b96']) { const { h, s, v } = hex2hsv(hex); assert.equal(rgb2hex(hsv2rgb(h,s,v)), hex); }
  assert.deepEqual(boardColours({ palette: [{ hex: '#112233', name: 'Saved' }], cards: [{ type: 'swatch', props: { hex: '#112233', label: 'Card' } }, { color: '#ffffff', props: { fill: '#ff69b4' } }] }).map(p => p.name), ['Saved','White','Hot Pink']);
});
test('custom panel and accent colours choose readable text', () => {
  assert.equal(contrastText('#000000'), '#ffffff'); assert.equal(contrastText('#ffffff'), '#111111');
});
test('palette extraction ignores transparency and separates frequent distinct colours', () => {
  assert.deepEqual(paletteFromPixels(Uint8ClampedArray.from([255,0,0,255, 254,0,0,255, 0,0,255,255, 0,255,0,0])), ['#ff0000','#0000ff']);
  assert.deepEqual(paletteFromPixels(new Uint8ClampedArray(20)), []);
});
test('crop drags cannot leave the image or shrink below eight per cent', () => {
  const full = { x: 0, y: 0, w: 1, h: 1 };
  assert.deepEqual(cropBox(full, 'nw', .9, .9), { x: .9, y: .9, w: .09999999999999998, h: .09999999999999998 });
  const moved = cropBox({ x: .1, y: .1, w: .5, h: .5 }, 'move', 10, -10); assert.deepEqual(moved, { x: .5, y: 0, w: .5, h: .5 });
  assert.equal(cropBox(full, 'se', -100, -100).w, .08);
});
test('Spotify URL and URI parsing stays on the real host', () => {
  for (const kind of ['track','album','playlist','episode','show','artist']) assert.equal(spotifyOf(`spotify:${kind}:1234567890123456789012`).kind, kind);
  assert.equal(spotifyOf('https://open.spotify.com/intl-au/embed/track/1234567890123456789012?si=abc').kind, 'track');
  assert.equal(spotifyOf('https://open.spotify.com.evil.test/track/1234567890123456789012'), null);
  assert.equal(normaliseLink('example.com'), 'https://example.com/'); assert.throws(() => normaliseLink('javascript:alert(1)'));
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
function transport(response) {
  return (url, options, cb) => { const req = new EventEmitter(); req.end = () => queueMicrotask(() => {
    const data = response(url, options), res = Readable.from(data.chunks || [Buffer.from('<title>Safe page</title>')]); res.statusCode = data.status || 200; res.headers = data.headers || { 'content-type': 'text/html' }; cb(res);
  }); return req; };
}
test('preview pins approved DNS, rechecks redirect hosts and enforces the body cap', async () => {
  const resolve = async () => [{ address: '93.184.215.14', family: 4 }];
  const p = await linkPreview('https://example.com/', { resolve, transport: transport((url, options) => {
    options.lookup(url.hostname, {}, (error, address) => assert.equal(address, '93.184.215.14')); return {};
  }) }); assert.equal(p.title, 'Safe page');
  await assert.rejects(linkPreview('https://example.com/', { resolve, transport: transport(() => ({ status: 302, headers: { location: 'http://127.0.0.1/secrets' } })) }), /blocked/);
  await assert.rejects(linkPreview('https://example.com/', { resolve, transport: transport(() => ({ chunks: [Buffer.alloc(1024 * 1024 + 1)] })) }), /1 MB/);
});
let child, base; const token = `media-check-${process.pid}`;
before(async () => {
  const data = await mkdtemp(join(tmpdir(), 'aegis-media-check-'));
  child = spawn(process.execPath, ['--no-warnings','server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1' } });
  const port = await new Promise((accept, reject) => { child.stdout.on('data', d => { const match = /"port":(\d+)/.exec(String(d)); if (match) accept(match[1]); }); child.once('exit', code => reject(new Error(`Host exited ${code}`))); }); base = `http://127.0.0.1:${port}`;
});
after(() => child?.kill());
test('preview also times out during DNS resolution', async () => {
  await assert.rejects(linkPreview('https://example.com/', { resolve: () => new Promise(() => {}), timeoutMs: 25 }), /timed out/);
});
test('real host requires authentication for previews and accepts playable audio assets with seeking', async () => {
  assert.equal((await fetch(`${base}/link-preview?url=https://example.com`)).status, 401);
  const blocked = await fetch(`${base}/link-preview?url=http://127.0.0.1`, { headers: { authorization: `Bearer ${token}` } }); assert.equal(blocked.status, 400);
  for (const type of ['audio/webm;codecs=opus','audio/mp4','audio/ogg','audio/wav','audio/mpeg']) {
    const r = await fetch(base + '/assets', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': type }, body: Buffer.from('recording-fixture') }); assert.equal(r.status, 200, type);
    const { url } = await r.json(); const asset = await fetch(base + '/assets/' + url.slice(6), { headers: { range: 'bytes=0-3' } }); assert.equal(asset.status, 206); assert.equal(asset.headers.get('content-type'), type.split(';')[0]); assert.equal(await asset.text(), 'reco');
  }
});

test('recording uploads report measured progress and wait for host confirmation', async () => {
  const originalStorage = globalThis.sessionStorage, originalRequest = globalThis.XMLHttpRequest;
  const progress = []; let request;
  globalThis.sessionStorage = { getItem: () => JSON.stringify({ port: '12345', token: 'test-only-token' }) };
  globalThis.XMLHttpRequest = class {
    upload = {}; headers = {};
    constructor() { request = this; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) { this.body = body; }
  };
  try {
    const file = new File(['recorded bytes'], 'clip.webm', { type: 'video/webm' });
    let complete = false;
    const saving = uploadRecording({ base: 'http://127.0.0.1:12345' }, file, value => progress.push(value)).then(value => { complete = true; return value; });
    assert.equal(request.method, 'POST'); assert.equal(request.url, 'http://127.0.0.1:12345/assets'); assert.equal(request.body, file);
    assert.equal(request.headers.authorization, 'Bearer test-only-token');
    request.upload.onprogress({ lengthComputable: true, loaded: 42, total: 100 });
    request.upload.onprogress({ lengthComputable: false, loaded: 1, total: 0 });
    request.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
    await Promise.resolve(); assert.equal(complete, false); assert.deepEqual(progress, [0, 42, 100]);
    request.status = 200; request.response = { url: 'asset:clip.webm' }; request.onload();
    assert.equal((await saving).url, 'asset:clip.webm'); assert.equal(complete, true);
    const failed = uploadRecording({ base: 'http://127.0.0.1:12345' }, file, () => {});
    request.status = 500; request.response = { error: 'Disk full' }; request.onload();
    await assert.rejects(failed, /Disk full/);
    await assert.rejects(uploadRecording({ base: 'https://other.example' }, file, () => {}), /Reconnect/);
  } finally {
    if (originalStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = originalStorage;
    if (originalRequest === undefined) delete globalThis.XMLHttpRequest; else globalThis.XMLHttpRequest = originalRequest;
  }
});
