import { SlideSchema, preserve } from './schema.js';
import type {JsonValue} from './schema.js';

// New slides get the typography default. Saved slides without a background
// retain their earlier wave, including during an in-memory edit before JSON IO.
export function normaliseNewSlides(slides: JsonValue[], previous?: readonly unknown[]): JsonValue[];
export function normaliseNewSlides(slides: readonly unknown[], previous?: readonly unknown[]): unknown[];
export function normaliseNewSlides(slides: readonly unknown[], previous: readonly unknown[] = []): unknown[] {
  const known = new Map(previous.map(value => SlideSchema.safeParse(value)).filter(result => result.success).map(result => [result.data.id, result.data]));
  return slides.map(value => {
    const parsed=SlideSchema.safeParse(value);
    if(!parsed.success) return value;
    const slide=preserve(SlideSchema,value);
    if(slide.background != null) return value;
    const saved=known.get(slide.id);
    if(saved && saved.background == null) return value;
    return {...slide,background:saved?.background ?? 'plain'};
  });
}
