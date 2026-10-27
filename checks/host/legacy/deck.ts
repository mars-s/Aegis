import { z } from 'zod/v4';
import { SlideSchema } from '@aegis/domain/schema';
import { legacyModule } from './module.ts';
const slides = await legacyModule(new URL('../../../app/src/features/deck/slides.js', import.meta.url).href);
export function chartTicks(values: number[], target?: number) {
  return z.object({ lo: z.number(), hi: z.number(), ticks: z.array(z.number()) }).parse(slides.call('chartTicks', values, target));
}
export function lineChart(chart: unknown) { return z.string().parse(slides.call('lineChart', chart)); }
export function slideHTML(slide: unknown, editable = false) { return z.string().parse(slides.call('slideHTML', slide, editable)); }
export function newSlide() { return SlideSchema.parse(slides.call('newSlide')); }
