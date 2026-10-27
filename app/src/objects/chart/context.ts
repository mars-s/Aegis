import { z } from 'zod/v4';
import { CardSchema, ChartSpecSchema } from '@aegis/domain/schema';
import type {ChartSpec} from '@aegis/domain/charts';
import type { Card } from '@aegis/domain/schema';
const ContextSchema = z.object({canvas:z.object({board:z.object({cards:z.unknown()})})});
const CardsSchema=z.array(CardSchema);
let cachedInput:unknown;
let cachedCards:Card[]=[];
export function chartCards(): Card[] {
  const value: unknown = Object.getOwnPropertyDescriptor(globalThis,'aegisCtx')?.value;
  const parsed = ContextSchema.safeParse(value);
  if(!parsed.success) return [];
  const input=parsed.data.canvas.board.cards;
  if(input === cachedInput) return cachedCards;
  const cards=CardsSchema.safeParse(input);
  cachedInput=input;cachedCards=cards.success ? cards.data : [];
  return cachedCards;
}

// Older plots omit y for a gap. The renderer receives a complete point model.
export function renderChartSpec(value: unknown): ChartSpec {
  const spec=ChartSpecSchema.parse(value);
  return {...spec,series:spec.series.map(series=>({...series,points:series.points.map(point=>({
    ...point,y:point.y ?? null,y2:point.y2 ?? undefined,
  }))}))};
}
