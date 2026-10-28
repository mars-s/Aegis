import type { RichNode } from '@aegis/domain/schema';

export const MAX_FILE = 64 * 1024 * 1024;
export const MAX_SLIDES = 200;
export type Format = 'pdf' | 'pptx' | 'key';
export type Progress = (fraction: number, message: string) => void;
export interface ImportHost {
  readonly upload: (file: File, progress?: (percent: number) => void) => Promise<{ url: string; type: string; size: number }>;
  readonly assetUrl: (url: string | undefined) => string;
}
export type Picture = { src: string; alt: string };
export type Slide = { id: string; layout: 'text' | 'image'; title: string; sub: string; body: string; images: Picture[]; imageOnly?: boolean };
export type Imported =
  | { type: 'doc'; props: { body: string; doc: RichNode; pages: Picture[] } }
  | { type: 'deck'; props: { slides: Slide[]; current: number }; notice?: string };
export const titleOf = (file: File) => file.name.replace(/\.[^.]+$/, '') || 'Imported file';
export function fileFormat(file: File): Format | null {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || ext === 'pptx' || ext === 'key') return ext;
  return file.type === 'application/pdf' ? 'pdf' : null;
}
export const yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 0));
