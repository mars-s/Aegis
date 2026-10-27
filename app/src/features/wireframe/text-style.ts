import type { CSSProperties } from 'react';
import type { CardContent } from '@aegis/domain/schema';
import { WireProps } from '../../cards/creative/props.js';
export function textOutlineStyle(card: Pick<CardContent, 'color' | 'type' | 'props'>): CSSProperties {
  const props = WireProps.parse(card.props ?? {}), ink = props.ink || (/^#/.test(card.color) ? card.color : '#27272a');
  return { WebkitTextStroke: props.sw > 0 || props.hollow ? `${Math.max(props.hollow ? .5 : 0, Math.min(12, props.sw || 1))}px ${props.stroke || ink}` : '', paintOrder: 'stroke fill', color: props.hollow ? 'transparent' : props.ink || (card.type === 'title' ? undefined : ink), caretColor: props.hollow ? props.stroke || ink : undefined };
}
