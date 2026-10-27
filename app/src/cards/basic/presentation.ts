import type { CSSProperties } from 'react';
import type { CardContent } from '@aegis/domain';
import { z } from 'zod/v4';
const CropSchema = z.object({ x: z.number(), y: z.number(), w: z.number().min(.08), h: z.number().min(.08) });
export function imageCrop(card: CardContent) {
  const parsed = CropSchema.safeParse(card.props?.crop);
  return parsed.success ? parsed.data : null;
}
export function stringProp(card: CardContent, name: string) { const value = card.props?.[name]; return typeof value === 'string' ? value : ''; }
export function numberProp(card: CardContent, name: string, fallback: number) { const value = card.props?.[name]; return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
export function textStyle(card: CardContent): CSSProperties {
  const props = card.props;
  const align = stringProp(card, 'align'), tcase = stringProp(card, 'tcase');
  return {
    fontWeight: props?.bold === undefined ? card.type === 'title' || card.type === 'coll' ? 650 : undefined : props.bold ? 700 : 400,
    fontStyle: props?.italic ? 'italic' : undefined,
    textDecoration: [props?.under ? 'underline' : '', props?.strike ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
    textAlign: align === 'left' || align === 'right' || align === 'center' || align === 'justify' ? align : undefined,
    fontSize: numberProp(card, 'size', card.type === 'title' ? 30 : 15), fontFamily: stringProp(card, 'font') || undefined,
    lineHeight: numberProp(card, 'lh', card.type === 'title' ? 1 : card.type === 'todo' ? 1.35 : 1.45),
    letterSpacing: numberProp(card, 'ls', 0), textTransform: tcase === 'upper' ? 'uppercase' : tcase === 'lower' ? 'lowercase' : tcase === 'title' ? 'capitalize' : undefined,
  };
}
