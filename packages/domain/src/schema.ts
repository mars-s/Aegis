import { z } from 'zod/v4';
import { SHAPES } from './objects.js';

export const JsonSchema = z.json();
export type JsonValue = z.output<typeof JsonSchema>;
export const JsonRecordSchema = z.record(z.string(), JsonSchema);
export type JsonRecord = z.output<typeof JsonRecordSchema>;
export const BoardIdSchema = z.string().brand<'BoardId','inout'>();
export const CardIdSchema = z.string().brand<'CardId','inout'>();
export const LinkIdSchema = z.string().brand<'LinkId','inout'>();
export const AgentIdSchema = z.string().brand<'AgentId','inout'>();
export const RequestIdSchema = z.string().brand<'RequestId','inout'>();
export const BatchIdSchema = z.string().brand<'BatchId','inout'>();
export const ViewIdSchema = z.string().brand<'ViewId','inout'>();
export const RevisionSchema = z.int().nonnegative().brand<'Revision','inout'>();
export type BoardId = z.output<typeof BoardIdSchema>;
export type CardId = z.output<typeof CardIdSchema>;
export type LinkId = z.output<typeof LinkIdSchema>;
export type AgentId = z.output<typeof AgentIdSchema>;
export type RequestId = z.output<typeof RequestIdSchema>;
export type BatchId = z.output<typeof BatchIdSchema>;
export type ViewId = z.output<typeof ViewIdSchema>;
export type Revision = z.output<typeof RevisionSchema>;
export const CardTypeSchema = z.enum(['note', 'title', 'todo', 'link', 'image', 'video', 'web', 'agent', 'object', 'doc', 'deck', 'frame', 'box', 'text', 'icon', 'font', 'section', 'swatch', 'audio', 'spotify', 'ink', 'shape', 'path', 'stamp', 'dataset', 'canvas', 'template-group', 'coll']);

export type CardType = z.output<typeof CardTypeSchema>;

export const RichMarkSchema = z.object({ type: z.string(), attrs: JsonRecordSchema.optional() }).catchall(JsonSchema);
export const RichNodeSchema = z.object({
  type: z.string(), text: z.string().optional(), attrs: JsonRecordSchema.optional(),
  marks: z.array(RichMarkSchema).optional(),
  get content(): z.ZodOptional<z.ZodArray<typeof RichNodeSchema>> { return z.array(RichNodeSchema).optional(); },
}).catchall(JsonSchema);
export type RichNode = z.output<typeof RichNodeSchema>;
export type RichMark = z.output<typeof RichMarkSchema>;

export const ChartPointSchema = z.object({ x: z.union([z.string(), z.number()]), y: z.number().nullable().optional(), y2: z.number().nullable().optional(), display: z.string().optional(), evidence: z.array(z.object({key: z.string(), label: z.string(), origin: z.string().optional(), url: z.string().optional(), file: z.boolean().optional()})).optional() });
export const ChartSpecSchema = z.object({
  kind: z.enum(['bars', 'stacked', 'line', 'area', 'range', 'donut', 'radial', 'radar', 'heat', 'spark']),
  series: z.array(z.object({name: z.string(), points: z.array(ChartPointSchema)})),
  x: z.object({label: z.string().optional(), kind: z.enum(['category','time','linear']).optional()}).optional(),
  y: z.object({label: z.string().optional(),unit: z.string().optional(),format: z.enum(['number','money','duration','percent','bytes']).optional(),currency: z.string().optional(),min: z.number().optional(),max: z.number().optional()}).optional(),
  smooth: z.boolean().optional(), basis: z.string().optional(), knowledge: z.boolean().optional(), compact: z.boolean().optional(),
  horizontal: z.boolean().optional(), values: z.literal(false).optional(), stack: z.boolean().optional(),
  headline: z.object({label:z.string(),value:z.string()}).optional(), target: z.object({value:z.number(),label:z.string().optional()}).optional(),
}).catchall(JsonSchema);
export const DeckChartSchema = z.object({
  sourceId: CardIdSchema.optional(), spec: ChartSpecSchema.optional(), sourceStatus: z.string().optional(), snapshotSourceId: CardIdSchema.optional(),
  values: z.array(z.number()).optional(), labels: z.array(z.string()).optional(), target: z.number().optional(), label: z.string().optional(), smooth: z.boolean().optional(),
}).catchall(JsonSchema);
export type DeckChartModel = z.output<typeof DeckChartSchema>;
export const SlideSchema = z.object({id:z.string().optional(), layout:z.string().optional(),title:z.string().optional(),sub:z.string().optional(),body:z.string().optional(),background:z.string().nullable().optional(), chart:DeckChartSchema.optional()}).catchall(JsonSchema);
export type Slide = z.output<typeof SlideSchema>;
export const ContentLayoutSchema = z.object({ids:z.array(CardIdSchema),x:z.number(),y:z.number(),cols:z.number(),spans:z.array(z.number()).optional(),columns:z.array(z.number()).optional(),columnWidth:z.number().optional(),gap:z.number().optional(),pack:z.string().optional()});
export const PropsSchema = z.object({
  body:z.string().optional(),doc:RichNodeSchema.optional(),docTitleMigrated:z.boolean().optional(),slides:z.array(SlideSchema).optional(),current:z.number().optional(),
  kids:z.array(CardIdSchema).optional(),head:z.boolean().optional(),cols:z.number().optional(),colOf:z.record(z.string(),z.number()).optional(),
  contentLayout:ContentLayoutSchema.optional(),fixedHeight:z.boolean().optional(),contentFit:z.boolean().optional(),autoHeightMin:z.number().optional(),
  layerName:z.string().optional(),name:z.string().optional(),title:z.string().optional(),description:z.string().optional(),desc:z.string().optional(),
  preview:z.union([z.object({title:z.string().optional(),description:z.string().optional()}).catchall(JsonSchema),z.array(z.array(z.string()))]).optional(),
  hex:z.string().optional(),label:z.string().optional(),rows:z.number().optional(),columns:z.array(JsonSchema).optional(),filename:z.string().optional(),source:z.string().optional(),
}).catchall(JsonSchema);
export type CardProps = z.output<typeof PropsSchema>;
const BaseCardSchema = z.object({
  id:CardIdSchema,type:CardTypeSchema,x:z.number(),y:z.number(),w:z.number(),h:z.number(),text:z.string(),color:z.string(),
  heading:z.string().optional(),badge:z.string().optional(),url:z.string().optional(),agent:z.string().optional(),group:z.string().optional(),rot:z.number().optional(),parent:CardIdSchema.optional(),
  items:z.array(z.object({text:z.string(),done:z.boolean(),t:z.string().optional()})).optional(),done:z.union([z.boolean(),z.string()]).optional(),props:PropsSchema.optional(),title:z.string().optional(),desc:z.string().optional(),
  kind:z.undefined().optional(),data:z.undefined().optional(),ver:z.undefined().optional(),updated:z.undefined().optional(),
}).catchall(JsonSchema);

export const ObjectCardSchema = z.discriminatedUnion('kind', [
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('reply'),data:SHAPES.reply,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('plot'),data:SHAPES.plot,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('sheet'),data:SHAPES.sheet,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('diagram'),data:SHAPES.diagram,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('plan'),data:SHAPES.plan,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('list'),data:SHAPES.list,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('code'),data:SHAPES.code,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('stats'),data:SHAPES.stats,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('timeline'),data:SHAPES.timeline,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('kanban'),data:SHAPES.kanban,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('table'),data:SHAPES.table,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('progress'),data:SHAPES.progress,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('compare'),data:SHAPES.compare,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('gallery'),data:SHAPES.gallery,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('stages'),data:SHAPES.stages,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('callout'),data:SHAPES.callout,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('form'),data:SHAPES.form,ver:z.number().optional(),updated:z.number().optional()}),
  BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('html'),data:SHAPES.html,ver:z.number().optional(),updated:z.number().optional()}),
]);
export const CardSchema = z.union([BaseCardSchema.extend({type:CardTypeSchema.exclude(['object'])}), ObjectCardSchema]);
export type Card = z.output<typeof CardSchema>;
export type ObjectCard = z.output<typeof ObjectCardSchema>;
export const PinSchema = z.object({u:z.number(),v:z.number()});
export const LinkSchema = z.object({id:LinkIdSchema,a:CardIdSchema,b:CardIdSchema,label:z.string().optional(),bend:z.number().optional(),dash:z.boolean().optional(),arrow:z.enum(['none','end','both']).optional(),colour:z.string().optional(),pa:PinSchema.optional(),pb:PinSchema.optional()}).catchall(JsonSchema);
export type Link = z.output<typeof LinkSchema>;
export const BoardSchema = z.object({id:BoardIdSchema,name:z.string(),rev:RevisionSchema,cards:z.array(CardSchema),links:z.array(LinkSchema),view:z.object({x:z.number(),y:z.number(),z:z.number()}),bg:z.string().optional(),palette:z.array(z.object({hex:z.string(),name:z.string()})).optional(),tray:z.array(JsonSchema).optional(),focus:z.object({ids:z.array(CardIdSchema),at:z.number()}).nullable().optional(),parent:BoardIdSchema.nullable().optional(),editedAt:z.number().optional()}).catchall(JsonSchema);
export type Board = z.output<typeof BoardSchema>;
export type CardContent = Card extends infer C ? C extends Card ? Pick<C,'id'|'type'|'text'|'color'|'heading'|'badge'|'items'|'url'|'agent'|'group'|'parent'|'props'|'kind'|'data'|'ver'|'updated'|'done'|'title'|'desc'> : never : never;
export const CommandSchema = z.discriminatedUnion('op', [
z.object({op:z.literal('create'),type:CardTypeSchema.optional(),newId:CardIdSchema.optional(),ref:z.string().optional(),text:z.string().optional(),kind:z.string().optional(),data:JsonSchema.optional(),props:JsonRecordSchema.optional(),x:z.number().optional(),y:z.number().optional(),w:z.number().optional(),h:z.number().optional(),near:CardIdSchema.optional()}).catchall(JsonSchema),
z.object({op:z.literal('update'),id:CardIdSchema,set:JsonRecordSchema}).catchall(JsonSchema),
z.object({op:z.literal('revise'),id:CardIdSchema,data:JsonSchema,text:z.string().optional()}).catchall(JsonSchema),
z.object({op:z.literal('object_set'),id:CardIdSchema,path:z.array(z.union([z.string(),z.number()])),value:JsonSchema}).catchall(JsonSchema),
z.object({op:z.literal('move'),id:CardIdSchema,x:z.number(),y:z.number()}).catchall(JsonSchema),
z.object({op:z.literal('measure'),id:CardIdSchema,h:z.number(),baseHeight:z.number().optional()}).catchall(JsonSchema),
z.object({op:z.literal('initialise_html'),id:CardIdSchema,source:z.object({html:z.string(),css:z.string(),js:z.string()}),state:z.string()}).catchall(JsonSchema),
z.object({op:z.literal('delete'),id:CardIdSchema.optional(),ids:z.array(CardIdSchema).optional()}).catchall(JsonSchema),
z.object({op:z.literal('connect'),a:CardIdSchema,b:CardIdSchema,label:z.string().optional(),newId:LinkIdSchema.optional()}).catchall(JsonSchema),
z.object({op:z.literal('link_update'),id:LinkIdSchema,remove:z.boolean().optional(),set:JsonRecordSchema.optional()}).catchall(JsonSchema),
z.object({op:z.literal('layout'),ids:z.array(CardIdSchema),shape:z.string().optional(),x:z.number().optional(),y:z.number().optional(),cols:z.number().optional(),spans:z.array(z.number()).optional(),columns:z.array(z.number()).optional(),columnWidth:z.number().optional(),gap:z.number().optional(),fit:z.boolean().optional(),pack:z.string().optional()}).catchall(JsonSchema),
z.object({op:z.literal('order'),id:CardIdSchema.optional(),ids:z.array(CardIdSchema).optional(),to:z.union([z.string(),z.number()]).optional()}).catchall(JsonSchema),
z.object({op:z.literal('restore'),cards:z.array(CardSchema),links:z.array(LinkSchema),tray:z.array(JsonSchema).optional()}).catchall(JsonSchema),
z.object({op:z.literal('board_set'),set:JsonRecordSchema}).catchall(JsonSchema),
z.object({op:z.literal('focus'),id:CardIdSchema.optional(),ids:z.array(CardIdSchema).optional()}).catchall(JsonSchema),
]);
export type Command = z.output<typeof CommandSchema>;
export interface ChangeSet { readonly boardId:BoardId; readonly baseRevision:Revision; readonly revision:Revision; readonly upserted:readonly Card[]; readonly removed:readonly CardId[]; readonly links:readonly Link[] | null; readonly order:readonly CardId[] | null; }
export interface Source<T> { readonly getSnapshot:()=>T; readonly subscribe:(changed:()=>void)=>()=>void; }
export type Result<A,E> = {kind:'ok';value:A} | {kind:'error';error:E};

// Earlier saved cards can omit presentation defaults. Keep that omission on disk
// and in legacy transactions. The scene consumes the complete Card projection.
export const LegacyCardSchema = z.union([
  BaseCardSchema.extend({type:CardTypeSchema.exclude(['object'])}).partial({x:true,y:true,w:true,h:true,color:true}),
  z.discriminatedUnion('kind',[
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('reply'),data:SHAPES.reply,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('plot'),data:SHAPES.plot,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('sheet'),data:SHAPES.sheet,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('diagram'),data:SHAPES.diagram,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('plan'),data:SHAPES.plan,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('list'),data:SHAPES.list,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('code'),data:SHAPES.code,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('stats'),data:SHAPES.stats,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('timeline'),data:SHAPES.timeline,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('kanban'),data:SHAPES.kanban,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('table'),data:SHAPES.table,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('progress'),data:SHAPES.progress,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('compare'),data:SHAPES.compare,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('gallery'),data:SHAPES.gallery,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('stages'),data:SHAPES.stages,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('callout'),data:SHAPES.callout,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('form'),data:SHAPES.form,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
BaseCardSchema.extend({type:z.literal('object'),kind:z.literal('html'),data:SHAPES.html,ver:z.number().optional(),updated:z.number().optional()}).partial({x:true,y:true,w:true,h:true,color:true}),
]),
]);
export type LegacyCard = z.output<typeof LegacyCardSchema>;
export const LegacyBoardSchema = BoardSchema.extend({cards:z.array(LegacyCardSchema)});
export type LegacyBoard = z.output<typeof LegacyBoardSchema>;

// Zod's validation predicate retains insertion order and omitted properties. The
// regular parse output would rebuild records in schema order and break old Undo.
export function preserve<T>(schema:z.ZodType<T,T>,value:unknown):T {
  if(schema.validate(value)) return value;
  return schema.parse(value);
}
