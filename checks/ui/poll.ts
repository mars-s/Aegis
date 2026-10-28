import { CommandSchema } from '@aegis/domain/schema';
import { z } from 'zod';
import { decodeStoredBoard } from '@aegis/protocol/storage';
import { AgentSnapshotSchema, AgentReceiptSchema } from '@aegis/protocol/agents';
import { LibrarySnapshotSchema, LibraryResultSchema } from '@aegis/protocol/services';
import { decodeBoardList } from '@aegis/protocol/http';
export { z } from 'zod';
export { SHAPES as objects } from '@aegis/domain/objects';
export const commands = (value: unknown) => CommandSchema.array().parse(value);
export const board = decodeStoredBoard;
export const agents = (value: unknown) => AgentSnapshotSchema.array().parse(value);
export const receipts = (value: unknown) => AgentReceiptSchema.array().parse(value);
export const library = (value: unknown) => LibrarySnapshotSchema.parse(value);
export const libraryResult = (value: unknown) => LibraryResultSchema.parse(value);
export const boards = decodeBoardList;
const json = (text: string): unknown => JSON.parse(text);
export const panels = (text: string) => z.object({ heights: z.record(z.string(), z.number()), columns: z.object({left:z.array(z.string()),right:z.array(z.string())}), folded:z.record(z.string(),z.boolean()) }).passthrough().parse(json(text));
export const drawState = (text: string) => z.object({favourites:z.array(z.string()),recent:z.array(z.string())}).passthrough().parse(json(text));
export const colours = (text: string) => z.object({dark:z.object({bg:z.string()}).passthrough()}).passthrough().parse(json(text));
export const clip = (text: string) => z.object({cards:z.array(z.unknown()),links:z.array(z.unknown()),text:z.string()}).passthrough().parse(json(text));
export const agentRect = (text: string) => z.object({x:z.number(),y:z.number()}).passthrough().parse(json(text));
export const sandboxState = (text: string | undefined) => z.object({custom:z.object({count:z.number()}).passthrough()}).passthrough().parse(json(required(text)));

export function required<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) throw new Error('Expected a present test value');
  return value;
}
export function html(value: unknown): HTMLElement { if (!(value instanceof HTMLElement)) throw new Error('Expected an HTML element'); return value; }
export function element(value: unknown): HTMLElement | SVGElement { if (!(value instanceof HTMLElement || value instanceof SVGElement)) throw new Error('Expected an HTML or SVG element'); return value; }
export function graphics(value: unknown): SVGGraphicsElement { if (!(value instanceof SVGGraphicsElement)) throw new Error('Expected SVG graphics'); return value; }
export function iframe(value: unknown): HTMLIFrameElement { if (!(value instanceof HTMLIFrameElement)) throw new Error('Expected an iframe'); return value; }
export function svgPath(value: unknown): SVGPathElement { if (!(value instanceof SVGPathElement)) throw new Error('Expected an SVG path'); return value; }
export function image(value: unknown): HTMLImageElement { if (!(value instanceof HTMLImageElement)) throw new Error('Expected an image'); return value; }
export function button(value: unknown): HTMLButtonElement { if (!(value instanceof HTMLButtonElement)) throw new Error('Expected a button'); return value; }
export function input(value: unknown): HTMLInputElement { if (!(value instanceof HTMLInputElement)) throw new Error('Expected an input'); return value; }
export function select(value: unknown): HTMLSelectElement { if (!(value instanceof HTMLSelectElement)) throw new Error('Expected a select'); return value; }
export function canvas(value: unknown): HTMLCanvasElement { if (!(value instanceof HTMLCanvasElement)) throw new Error('Expected a canvas'); return value; }
export function keyframes(value: unknown): KeyframeEffect { if (!(value instanceof KeyframeEffect)) throw new Error('Expected a keyframe effect'); return value; }

import type { Page } from 'playwright';
// This Playwright build does not poll an async waitForFunction predicate after it resolves false.
// Await each evaluation before deciding whether the host has reached the expected state.
declare const evaluate: Page['evaluate'];
type Predicate<Arg, Result> = Parameters<typeof evaluate<Result, Arg>>[0];
export async function waitForAsync<Arg, Result>(...args: [Page, Predicate<void, Result>] | [Page, Predicate<Arg, Result>, Arg, { timeout?: number }?]): Promise<Result> {
  const page = args[0], timeout = args.length === 2 ? 30000 : args[3]?.timeout ?? 30000;
  const predicate = args[1], deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = args.length === 2 ? await page.evaluate(args[1]) : await page.evaluate(args[1], args[2]);
    if (value) return value;
    await page.waitForTimeout(60);
  }
  throw new Error(`Host state did not settle within ${timeout} ms: ${String(predicate).slice(0, 160)}`);
}

export function details(value: unknown): HTMLDetailsElement { if (!(value instanceof HTMLDetailsElement)) throw Error('Expected details'); return value; }
export function media(value: unknown): HTMLImageElement | HTMLMediaElement | HTMLIFrameElement { if (!(value instanceof HTMLImageElement || value instanceof HTMLMediaElement || value instanceof HTMLIFrameElement)) throw Error('Expected media'); return value; }
export function mediaElement(value: unknown): HTMLMediaElement { if (!(value instanceof HTMLMediaElement)) throw Error('Expected audio or video'); return value; }
export function video(value: unknown): HTMLVideoElement { if (!(value instanceof HTMLVideoElement)) throw Error('Expected video'); return value; }

export function stream(value: unknown): MediaStream { if (!(value instanceof MediaStream)) throw Error('Expected a media stream'); return value; }

export function control(value: unknown): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement | HTMLOptionElement {
 if (!(value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement || value instanceof HTMLSelectElement || value instanceof HTMLButtonElement || value instanceof HTMLOptionElement)) throw Error('Expected a value control'); return value;
}
export function text(value: unknown): Text { if (!(value instanceof Text)) throw Error('Expected a text node'); return value; }
export const vectorPoints = (value: unknown) => z.array(z.object({x:z.number(),y:z.number(),ox:z.number().nullish(),oy:z.number().nullish(),r:z.number().optional()}).passthrough()).parse(value);
export const trayItem = (value: unknown) => z.object({text:z.string()}).passthrough().parse(value);

export function optionalHtml(value: unknown): ReturnType<typeof html> | undefined { return value === null || value === undefined ? undefined : html(value); }

export function optionalElement(value: unknown): ReturnType<typeof element> | undefined { return value === null || value === undefined ? undefined : element(value); }

export function optionalKeyframes(value: unknown): ReturnType<typeof keyframes> | undefined { return value === null || value === undefined ? undefined : keyframes(value); }

export function optionalImage(value: unknown): ReturnType<typeof image> | undefined { return value === null || value === undefined ? undefined : image(value); }

export function optionalMedia(value: unknown): ReturnType<typeof media> | undefined { return value === null || value === undefined ? undefined : media(value); }

export function optionalVideo(value: unknown): ReturnType<typeof video> | undefined { return value === null || value === undefined ? undefined : video(value); }

export function optionalMediaElement(value: unknown): ReturnType<typeof mediaElement> | undefined { return value === null || value === undefined ? undefined : mediaElement(value); }

export function optionalInput(value: unknown): ReturnType<typeof input> | undefined { return value === null || value === undefined ? undefined : input(value); }

export function optionalIframe(value: unknown): ReturnType<typeof iframe> | undefined { return value === null || value === undefined ? undefined : iframe(value); }
