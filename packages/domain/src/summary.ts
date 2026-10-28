import { z } from 'zod/v4';
import { SHAPES } from './objects.js';
import { JsonSchema } from './schema.js';
import type { Card, Board } from './schema.js';
import { documentWordCount, wordCountLabel } from './words.js';
import { resolvePlot, resolveDeckChart } from './chart-source.js';
import { formatValue, parseTime, pointText, styleSpec, xText } from './charts.js';
// Shared by the host's lightweight board list and the Library preview.
export const plainLine = (value: unknown): string => String(value ?? '').split('\n').find(line => line.trim())?.replace(/^\s*#{1,6}\s+/, '').replace(/[*_`]/g, '').trim().slice(0, 160) || '';
export const cardTitle = (card: Pick<Card,'props'|'heading'|'text'>): string => plainLine(card.props?.layerName || card.heading || card.text || card.props?.name);
const count = (n: number, singular: string, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;
const words = (text: unknown) => count(String(text || '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length, 'word');
const heading = (text: unknown) => plainLine(/^\s*#{1,6}\s+(.+)$/.exec(String(text || '').split('\n').find(line => line.trim()) || '')?.[1]);
const names: Record<string,string> = { doc: 'Document', note: 'Note', todo: 'Checklist', deck: 'Deck', slides: 'Deck', dataset: 'Dataset', html: 'Custom UI', plot: 'Plot', sheet: 'Sheet' };

// Data only. Cache these when the board changes, never parse content during a zoom gesture.
export function cardSummary(card: Card, cards: readonly Card[] = []): CardSummary {
  const type: string = card.type === 'object' ? card.kind : card.type;
  const kind = names[type] || `${type?.[0]?.toUpperCase() || ''}${type?.slice(1) || 'Window'}`;
  const data = SummaryDataSchema.parse(card.kind === 'plot' ? resolvePlot(card.data, cards) : card.data || {}), props = card.props || {};
  const title = cardTitle(card) || kind;
  let facts: (string | undefined)[] = [], preview: SummaryPreview | undefined;
  switch (type) {
    case 'doc': {
      const body = String(props.body || '');
      const excerpt = plainLine(body.split('\n').find(line => line.trim() && !/^\s*#{1,6}\s/.test(line))).split(/(?<=[.!?])\s/)[0];
      facts = [heading(body), excerpt]; break;
    }
    case 'sheet': case 'table': facts = [`${count(data.rows?.length || 0, 'row')} · ${count(data.columns?.length || 0, 'column')}`, plainLine(data.note)]; break;
    case 'dataset': facts = [`${count(props.rows || 0, 'row')} · ${count(props.columns?.length || 0, 'column')}`, plainLine(props.filename || props.source)]; break;
    case 'deck': case 'slides': facts = [count(props.slides?.length || 0, 'slide'), plainLine(props.slides?.[0]?.title)]; break;
    case 'plot': facts = [`${count(data.series?.length || 0, 'series', 'series')} · ${count(data.series?.reduce((n, s) => n + (s.points?.length || 0), 0) || 0, 'point')}`, plainLine(data.basis || data.y?.label)]; break;
    case 'html': facts = [plainLine(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(data.html || '')?.[1]?.replace(/<[^>]*>/g, '')), 'Interactive view']; break;
    case 'stats': facts = (data.tiles || []).slice(0, 2).map(tile => `${tile.label}: ${tile.value}`); break;
    case 'progress': facts = (data.goals || []).slice(0, 2).map(goal => `${goal.current}/${goal.target}${goal.unit ? ` ${goal.unit}` : ''} · ${goal.label}`); break;
    case 'diagram': facts = [`${count(data.nodes?.length || 0, 'node')} · ${count(data.edges?.length || 0, 'connection')}`]; break;
    case 'todo': case 'list': case 'plan': {
      const items = card.items || data.items || data.steps || [];
      facts = [`${items.filter(item => item.done).length}/${count(items.length, 'item')} complete`, plainLine(items[0]?.text || (items[0] && 'title' in items[0] ? items[0].title : ''))]; break;
    }
    case 'callout': case 'reply': facts = [plainLine(data.headline || data.text), plainLine(data.attribution)]; break;
    default: facts = [plainLine(card.heading ? card.text : String(card.text || '').split('\n').slice(1).join('\n')), words(card.text)];
  }
  if (type === 'plot') {
    preview = plotPreview(data);
  } else if (type === 'stats') preview = { type, tiles: (data.tiles || []).slice(0, 2) };
  else if (type === 'progress') preview = { type, goals: (data.goals || []).slice(0, 2) };
  else if (type === 'sheet' || type === 'table') preview = { type: 'sheet', columns: (data.columns || []).slice(0, 3).map(columnLabel), rows: (data.rows || []).slice(0, 2).map(row => (data.columns || []).slice(0, 3).map((column, i) => cellText(column, row.cells?.[i] ?? ''))) };
  else if (type === 'deck' || type === 'slides') preview = { type: 'deck', slide: props.slides?.[0] };
  else if (type === 'diagram') preview = { type, nodes: data.nodes || [], edges: data.edges || [] };
  if (type === 'callout' || type === 'reply') facts = [plainLine(data.headline || data.text).split(/(?<=[.!?])\s/)[0]];
  const disclosure = ['callout', 'reply'].includes(type) ? plainLine(data.attribution) : '';
  // Documents share one word count with the editor footer (lib/board/words.js); it is a secondary detail, not a visible fact.
  const wordCount = type === 'doc' ? wordCountLabel(documentWordCount(card)) : undefined;
  const distinct = facts.filter((fact, i): fact is string => !!fact && !facts.slice(0, i).some(previous => previous?.toLocaleLowerCase() === fact.toLocaleLowerCase()));
  const sourceStatus = data.sourceStatus || (type === 'deck' || type === 'slides' ? props.slides?.map(slide => slide.chart && resolveDeckChart(slide.chart, cards).sourceStatus).find(Boolean) : '');
  return { title, kind, facts: distinct.slice(0, 2), ...(sourceStatus ? { sourceStatus } : {}), ...(wordCount ? { wordCount } : {}), ...(preview ? { preview } : {}), ...(disclosure ? { disclosure } : {}) };
}

// Match the sheet editor's header and the typed sheet's figures. Dates and text stay verbatim.
export const columnLabel = (column: Column) => `${column.label}${column.unit ? ` (${column.unit})` : ''}`;
export function cellText(column: Column, value: unknown): string {
  const text = String(value ?? '');
  if (!['number', 'money', 'percent', 'duration'].includes(column.kind ?? '') || !text.trim()) return text;
  const number = Number(text.replace(/[,\s]/gu, ''));
  if (!Number.isFinite(number)) return text;
  const format = column.kind === 'money' ? 'money' : column.kind === 'percent' ? 'percent' : column.kind === 'duration' && !column.unit ? 'duration' : 'number';
  return formatValue(number, { format, currency: column.currency });
}

function plotPreview(data: SummaryData) {
  const style=SHAPES.plot.shape.style.safeParse(data.style);
  const { kind, stack } = style.success ? styleSpec(style.data) : {kind:data.style,stack:undefined};
  const all = data.series || [];
  const series = all.slice(0, 3).map((entry, i) => {
    const points = [...(entry.points || [])];
    if (data.x?.kind === 'time') points.sort((a, b) => parseTime(String(a.x)) - parseTime(String(b.x)));
    if (data.x?.kind === 'linear') points.sort((a, b) => Number(a.x) - Number(b.x));
    const last = points.at(-1);
    return { name: entry.name || `Series ${i + 1}`, points, value: last && Number.isFinite(last.y) ? pointText({...last,y:last.y ?? null,y2:last.y2 ?? undefined}, data.y) : 'No data', label: last ? xText(last.x, data.x?.kind) : '' };
  });
  const parts = kind === 'donut' && all.length === 1 ? (all[0]?.points || []).filter(p => Number.isFinite(p.y) && (p.y ?? 0) > 0) : [];
  const total = parts.reduce((sum, point) => sum + (point.y ?? 0), 0);
  const first = series[0];
  return { type: 'plot', kind, stack, xKind: data.x?.kind, series, seriesCount: all.length,
    parts: parts.map(p => ({ value: p.y, label: xText(p.x, data.x?.kind) })),
    value: kind === 'donut' && all.length === 1 ? formatValue(total, data.y) : first?.value || 'No data',
    label: kind === 'donut' && all.length === 1 ? count(parts.length, 'segment') : [first?.label, data.y?.label || first?.name].filter(Boolean).join(' · ') };
}
export function boardSubtitle(board: Pick<Board,'cards'> | null | undefined) {
  const cards = board?.cards ?? [];
  const heading = cards.find(card => card.type === 'title' && cardTitle(card));
  if (heading) return cardTitle(heading);
  const document = cards.find(card => card.type === 'doc');
  if (document) return cardTitle(document) || plainLine(document.props?.body);
  return cardTitle(cards.find(card => cardTitle(card)) ?? {text:''}) || 'An empty board, ready for an idea.';
}

const ColumnSchema = z.object({label:z.string().optional(),kind:z.string().optional(),unit:z.string().optional(),currency:z.string().optional()});
type Column=z.output<typeof ColumnSchema>;
const ItemSchema = z.object({done:z.boolean().optional(),text:z.string().optional(),title:z.string().optional()});
const SummaryDataSchema = z.object({
  rows:z.array(z.object({cells:z.array(JsonSchema)})).optional(),columns:z.array(ColumnSchema).optional(),note:z.string().optional(),
  series:z.array(z.object({name:z.string(),points:z.array(z.object({x:z.union([z.string(),z.number()]),y:z.number().nullable().optional(),y2:z.number().nullable().optional()}))})).optional(),basis:z.string().optional(),x:SHAPES.plot.shape.x.partial().optional(),y:SHAPES.plot.shape.y.partial().optional(),
  style:z.string().optional(),html:z.string().optional(),tiles:SHAPES.stats.shape.tiles.optional(),goals:SHAPES.progress.shape.goals.optional(),
  nodes:z.array(SHAPES.diagram.shape.nodes.element.partial().catchall(JsonSchema)).optional(),edges:z.array(SHAPES.diagram.shape.edges.element.partial().catchall(JsonSchema)).optional(),items:z.array(ItemSchema).optional(),steps:z.array(ItemSchema).optional(),
  headline:z.union([z.string(),SHAPES.plot.shape.headline.unwrap()]).optional(),text:z.string().optional(),attribution:z.string().optional(),sourceStatus:z.string().optional(),
});
type SummaryData=z.output<typeof SummaryDataSchema>;

type SummaryPreview = ReturnType<typeof plotPreview> | {type:'stats';tiles:NonNullable<SummaryData['tiles']>} | {type:'progress';goals:NonNullable<SummaryData['goals']>} | {type:'sheet';columns:string[];rows:string[][]} | {type:'deck';slide: import('./schema.js').Slide | undefined} | {type:'diagram';nodes:NonNullable<SummaryData['nodes']>;edges:NonNullable<SummaryData['edges']>};

export interface CardSummary {title:string;kind:string;facts:string[];sourceStatus?:string;wordCount?:string;preview?:SummaryPreview;disclosure?:string;}
