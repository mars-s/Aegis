import './register.ts';
import { z } from 'zod/v4';
import { createHostClient, failureMessage } from '@aegis/host-client';
import type { Crop } from '../../../app/src/features/media/image-utils.ts';
import { fixtureBoard } from './inputs.ts';
const colours = await import('../../../app/src/features/colours/model.ts');
const settings = await import('../../../app/src/features/colours/contrast.ts');
const images = await import('../../../app/src/features/media/image-utils.ts');
const links = await import('../../../app/src/features/media/link-model.ts');
export const { colorName, normHex, hex2hsv, hsv2rgb, rgb2hex, paletteFromPixels } = colours;
export function boardColours(board: unknown) { return colours.boardColours(fixtureBoard(board)); }
export const { contrastText } = settings;
export function cropBox(box: Crop, handle: string, dx: number, dy: number) {
  return images.cropBox(box, z.enum(['move', 'nw', 'ne', 'sw', 'se']).parse(handle), dx, dy);
}
export const { spotifyOf, normaliseLink } = links;
export async function uploadRecording(host: { base: string; token: string }, file: File, progress: (value: number) => void) {
  const client = createHostClient({ baseUrl: host.base, token: host.token });
  try {
    const result = await client.upload(file, AbortSignal.timeout(2000), progress);
    if (result.kind === 'error') throw new Error(failureMessage(result.error));
    return result.value;
  } finally { client.dispose(); }
}
