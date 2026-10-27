import type { z } from 'zod/v4';
import type { WireProps } from '../../cards/creative/props.js';
export type WireStyle = Partial<z.output<typeof WireProps>> & { color?: string; iconSize?: number; device?: string };
export type WireDefinition = WireStyle & { type: 'frame' | 'box' | 'text' | 'icon' | 'font' | 'section'; x: number; y: number; w: number; h: number; text?: string };
export interface PieceOptions {
  readonly title?: string; readonly text?: string; readonly sub?: string; readonly label?: string; readonly h?: number; readonly align?: 'left' | 'center' | 'right' | 'justify'; readonly style?: string; readonly back?: boolean; readonly icon?: string; readonly active?: number; readonly on?: boolean; readonly size?: number; readonly img?: string; readonly logo?: string; readonly cta?: string; readonly copy?: string; readonly cta2?: string;
  readonly tabs?: readonly (readonly [string, string] | { readonly icon?: string; readonly label?: string; readonly text?: string })[];
  readonly links?: readonly string[];
  readonly items?: readonly { readonly icon?: string; readonly title?: string; readonly text?: string; readonly quote?: string; readonly name?: string; readonly value?: string; readonly label?: string }[];
  readonly stats?: readonly (readonly [string, string])[];
  readonly plans?: readonly { readonly name?: string; readonly price?: string; readonly features?: readonly string[]; readonly cta?: string }[];
  readonly imgs?: readonly string[];
  readonly cols?: readonly (readonly [string, readonly string[]])[];
}
export interface Piece { readonly icon: string; readonly w?: number; readonly bar?: 'top' | 'bottom' | 'row'; readonly web?: number; readonly make: (width: number, options?: PieceOptions) => WireDefinition[] }
