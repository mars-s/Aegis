import { SlideSchema } from '@aegis/domain/schema';
import { z } from 'zod/v4';
import type { CardContent, CardId, Slide } from '@aegis/domain/schema';

export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;
export const layouts = ['title', 'text', 'chart', 'three', 'image'] as const;
export type Layout = typeof layouts[number];
export const layoutNames: Readonly<Record<Layout, string>> = {
  title: 'Title', text: 'Title and text', chart: 'Chart', three: 'Three ideas', image: 'Image',
};
const ImagesSchema = z.array(z.object({ src: z.string(), alt: z.string().optional() }));
const ImportSchema = z.object({ original: z.string(), name: z.string().optional() });
export function slideImages(slide: Slide) {
  const parsed = ImagesSchema.safeParse(slide.images);
  return parsed.success ? parsed.data : [];
}
export function originalFile(card: CardContent) {
  const parsed = ImportSchema.safeParse(card.props?.import);
  return parsed.success ? parsed.data : null;
}
export function slideLayout(slide: Slide): Layout {
  return layouts.find(layout => layout === slide.layout) ?? 'text';
}
export function slideIndex(index: number | undefined, length: number): number {
  return Math.max(0, Math.min(length - 1, Number.isFinite(index) ? Math.trunc(index ?? 0) : 0));
}
const IdentifiedSlideSchema = SlideSchema.extend({ id: z.string() });
export type IdentifiedSlide = z.output<typeof IdentifiedSlideSchema>;
export const identifiedSlide = (value: unknown): IdentifiedSlide => IdentifiedSlideSchema.parse(value);
export function deckSlides(card: CardContent | null): IdentifiedSlide[] {
  return card?.type === 'deck' ? (card.props?.slides ?? []).map((slide, index) => identifiedSlide({ ...slide, id: slide.id ?? `slide-${index}` })) : [];
}
export function newSlide(): IdentifiedSlide {
  return { id: crypto.randomUUID(), layout: 'title', background: 'plain', title: 'New slide', sub: '', body: '' };
}
export interface DeckServices {
  readonly openEditor: (id: CardId) => boolean;
  readonly assetUrl: (url: string) => string;
  readonly menu: (options: {
    readonly trigger: HTMLElement;
    readonly label: string;
    readonly items: () => readonly { readonly title: string; readonly checked: boolean; readonly run: () => void }[];
  }) => { readonly destroy: () => void };
}
