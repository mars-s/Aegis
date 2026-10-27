import { z } from 'zod/v4';
import { legacyModule } from './module.ts';
const colours = await legacyModule(new URL('../../../app/src/features/colors/model.js', import.meta.url).href);
const settings = await legacyModule(new URL('../../../app/src/features/colors/settings.js', import.meta.url).href);
const uploads = await legacyModule(new URL('../../../app/src/features/media/upload.js', import.meta.url).href);
const images = await legacyModule(new URL('../../../app/src/features/media/images.js', import.meta.url).href);
const links = await legacyModule(new URL('../../../app/src/features/media/links.js', import.meta.url).href);
export function colorName(hex: string) { return z.string().parse(colours.call('colorName', hex)); }
export function normHex(hex: string) { return z.string().nullable().parse(colours.call('normHex', hex)); }
export function hex2hsv(hex: string) { return z.object({ h: z.number(), s: z.number(), v: z.number() }).parse(colours.call('hex2hsv', hex)); }
const rgb = z.tuple([z.number(), z.number(), z.number()]);
export function hsv2rgb(h: number, s: number, v: number) { return rgb.parse(colours.call('hsv2rgb', h, s, v)); }
export function rgb2hex(value: z.output<typeof rgb>) { return z.string().parse(colours.call('rgb2hex', value)); }
export function paletteFromPixels(pixels: Uint8ClampedArray) { return z.array(z.string()).parse(colours.call('paletteFromPixels', pixels)); }
export function boardColours(board: unknown) { return z.array(z.object({ name: z.string() })).parse(colours.call('boardColours', board)); }
export function contrastText(hex: string) { return z.string().parse(settings.call('contrastText', hex)); }
const crop = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export function cropBox(box: z.output<typeof crop>, handle: string, dx: number, dy: number) { return crop.parse(images.call('cropBox', box, handle, dx, dy)); }
export function spotifyOf(url: string) { return z.object({ kind: z.string() }).nullable().parse(links.call('spotifyOf', url)); }
export function normaliseLink(url: string) { return z.string().parse(links.call('normaliseLink', url)); }
export async function uploadRecording(host: { base: string }, file: File, progress: (value: number) => void) {
  return z.object({ url: z.string() }).parse(await uploads.call('uploadRecording', host, file, progress));
}
