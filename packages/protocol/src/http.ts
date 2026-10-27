import { z } from 'zod/v4';
import { BoardIdSchema, AgentIdSchema, CardIdSchema, CardSchema, LinkSchema, RevisionSchema, JsonSchema } from '@aegis/domain/schema';
export const BoardListEntrySchema = z.object({id:BoardIdSchema,name:z.string(),cards:z.int().nonnegative(),rev:RevisionSchema,boardParent:BoardIdSchema.nullable(),editedAt:z.number().nullable(),subtitle:z.string()}).catchall(JsonSchema);
export type BoardListEntry = z.output<typeof BoardListEntrySchema>;
const ErrorSchema = z.object({index:z.number(),reason:z.string(),hint:z.string().optional()});
export const BatchResponseSchema = z.discriminatedUnion('ok',[
  z.object({ok:z.literal(true),rev:RevisionSchema,created:z.record(z.string(),CardIdSchema),notes:z.array(z.string()).optional()}),
  z.object({ok:z.literal(false),rev:RevisionSchema.optional(),errors:z.array(ErrorSchema)}),
]);
export type BatchResponse = z.output<typeof BatchResponseSchema>;
const PatchFieldsSchema = z.object({bg:z.string().nullable().optional(),palette:z.array(z.object({hex:z.string(),name:z.string()})).nullable().optional(),tray:z.array(JsonSchema).nullable().optional()}).catchall(JsonSchema);
export const BoardPatchSchema = z.object({cards:z.array(CardSchema),removed:z.array(CardIdSchema),links:z.array(LinkSchema).optional(),order:z.array(CardIdSchema).optional(),fields:PatchFieldsSchema});
export type BoardPatch = z.output<typeof BoardPatchSchema>;
const AuthorSchema = z.object({kind:z.enum(['user','agent','mcp']),conversationId:z.union([z.string(),z.number()]).optional(),name:z.string().optional(),undoRequest:z.string().optional()}).catchall(JsonSchema);
const BoardEventSchema = z.object({type:z.literal('board'),boardId:BoardIdSchema,baseRev:RevisionSchema,rev:RevisionSchema,patch:BoardPatchSchema,author:AuthorSchema,touched:z.array(CardIdSchema),focus:z.object({ids:z.array(CardIdSchema),at:z.number()}).nullable(),sentAt:z.number()}).catchall(JsonSchema);
const AgentEventSchema = z.object({type:z.literal('agent'),id:AgentIdSchema,boardId:BoardIdSchema.optional(),revision:z.number().optional(),running:z.boolean().optional(),done:z.boolean().optional(),error:z.union([z.string(),z.boolean()]).nullable().optional()}).catchall(JsonSchema);
export const HostEventSchema = z.discriminatedUnion('type',[
  BoardEventSchema,AgentEventSchema,
  z.object({type:z.literal('library')}).catchall(JsonSchema),
  z.object({type:z.literal('auth'),provider:z.string()}).catchall(JsonSchema),
  z.object({type:z.literal('ui')}).catchall(JsonSchema),
]);
export type HostEvent = z.output<typeof HostEventSchema>;
export const decodeBoardList = (value:unknown): BoardListEntry[] => BoardListEntrySchema.array().parse(value);
export const decodeBatchResponse = (value:unknown): BatchResponse => BatchResponseSchema.parse(value);
export const decodeHostEvent = (value:unknown): HostEvent => HostEventSchema.parse(value);
export const decodeHostError = (value:unknown): string => z.object({error:z.string()}).parse(value).error;

export function decodeOkResponse(value:unknown):void {z.object({ok:z.literal(true)}).parse(value);}

export const AssetUploadSchema = z.object({
  url: z.string().regex(/^asset:[a-f0-9]{32}\.[a-z0-9]{3,4}$/),
  type: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i),
  size: z.number().int().positive(),
});
export type AssetUpload = z.output<typeof AssetUploadSchema>;
export const decodeAssetUpload = (value: unknown): AssetUpload => AssetUploadSchema.parse(value);
