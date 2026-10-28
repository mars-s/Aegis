import { describe, expect, it } from 'vitest';
import { BoardSchema } from '@aegis/domain/schema';
import { cropBox } from '../media/image-utils.js';
import { normaliseLink, spotifyOf } from '../media/link-model.js';
import { contrastText } from './contrast.js';
import { boardColours, colorName, hex2hsv, hsv2rgb, normHex, paletteFromPixels, rgb2hex } from './model.js';

// Ported from checks/host/media.test.ts: colour, crop and link model cases, run against the TypeScript modules the app ships.
function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('Expected fixture value');
  return value;
}

describe('colour, crop and link models', () => {
  it('colour names, hex shorthand and HSV wheel preserve known colours', () => {
    expect(normHex(' fAc ')).toBe('#ffaacc'); expect(normHex('invalid')).toBeNull();
    expect(colorName('#000000')).toBe('Black'); expect(colorName('#ff69b4')).toBe('Hot Pink'); expect(colorName('#87ceeb')).toBe('Sky');
    for (const hex of ['#000000', '#ffffff', '#87ceeb', '#fe1234', '#3c7b96']) { const { h, s, v } = hex2hsv(hex); expect(rgb2hex(hsv2rgb(h, s, v))).toBe(hex); }
    const board = BoardSchema.parse({ id: 'c', name: 'Colours', rev: 0, view: { x: 0, y: 0, z: 1 }, links: [], palette: [{ hex: '#112233', name: 'Saved' }], cards: [
      { id: 'swatch', type: 'swatch', x: 0, y: 0, w: 10, h: 10, text: '', color: 'plain', props: { hex: '#112233', label: 'Card' } },
      { id: 'other', type: 'note', x: 0, y: 0, w: 10, h: 10, text: '', color: '#ffffff', props: { fill: '#ff69b4' } },
    ] });
    expect(boardColours(board).map(p => p.name)).toEqual(['Saved', 'White', 'Hot Pink']);
  });

  it('custom panel and accent colours choose readable text', () => {
    expect(contrastText('#000000')).toBe('#ffffff'); expect(contrastText('#ffffff')).toBe('#111111');
  });

  it('palette extraction ignores transparency and separates frequent distinct colours', () => {
    expect(paletteFromPixels(Uint8ClampedArray.from([255, 0, 0, 255, 254, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 0]))).toEqual(['#ff0000', '#0000ff']);
    expect(paletteFromPixels(new Uint8ClampedArray(20))).toEqual([]);
  });

  it('crop drags cannot leave the image or shrink below eight per cent', () => {
    const full = { x: 0, y: 0, w: 1, h: 1 };
    expect(cropBox(full, 'nw', .9, .9)).toEqual({ x: .9, y: .9, w: .09999999999999998, h: .09999999999999998 });
    expect(cropBox({ x: .1, y: .1, w: .5, h: .5 }, 'move', 10, -10)).toEqual({ x: .5, y: 0, w: .5, h: .5 });
    expect(cropBox(full, 'se', -100, -100).w).toBe(.08);
  });

  it('Spotify URL and URI parsing stays on the real host', () => {
    for (const kind of ['track', 'album', 'playlist', 'episode', 'show', 'artist']) expect(required(spotifyOf(`spotify:${kind}:1234567890123456789012`)).kind).toBe(kind);
    expect(required(spotifyOf('https://open.spotify.com/intl-au/embed/track/1234567890123456789012?si=abc')).kind).toBe('track');
    expect(spotifyOf('https://open.spotify.com.evil.test/track/1234567890123456789012')).toBeNull();
    expect(normaliseLink('example.com')).toBe('https://example.com/'); expect(() => normaliseLink('javascript:alert(1)')).toThrow();
  });
});
