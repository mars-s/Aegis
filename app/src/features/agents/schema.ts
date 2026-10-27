import { z } from 'zod/v4';
import { AgentIdSchema, BoardIdSchema, CardIdSchema, CardTypeSchema, RequestIdSchema } from '@aegis/domain/schema';
import { ObjectKindSchema } from '@aegis/domain/objects';

export const ModelChoiceSchema = z.object({ provider: z.string().min(1), modelId: z.string().min(1) });
export const AgentModelSchema = ModelChoiceSchema.extend({ name: z.string() });
export const AgentReceiptSchema = z.object({ id: AgentIdSchema });
export const AgentTurnSchema = z.object({ id: z.string(), role: z.enum(['user', 'assistant']), text: z.string() });
export const AgentChangeSchema = z.object({
  id: CardIdSchema, title: z.string(), previousTitle: z.string().nullable(),
  actions: z.array(z.enum(['Created', 'Moved', 'Edited', 'Deleted'])),
});
export const AgentRequestSchema = z.object({
  id: RequestIdSchema, brief: z.string(), started: z.number().finite(), finished: z.number().finite().nullable(),
  elapsedMs: z.number().nonnegative().nullable(), summary: z.string(), changes: z.array(AgentChangeSchema),
  undone: z.boolean(), undoBlockedReason: z.string().nullable(), canUndo: z.boolean(),
});
export const AgentDraftSchema = z.object({
  id: z.string(), type: CardTypeSchema, kind: ObjectKindSchema.optional(), title: z.string(), done: z.boolean(),
});
export const AgentSnapshotSchema = z.object({
  id: AgentIdSchema, boardId: BoardIdSchema, revision: z.int().nonnegative().optional(),
  brief: z.string(), model: ModelChoiceSchema, statusModel: ModelChoiceSchema.optional(), created: z.number().finite(),
  status: z.string(), running: z.boolean(), parent: AgentIdSchema.nullable(), title: z.string().nullable(),
  summary: z.string().nullable().optional(), text: z.string(), partial: z.string().default(''),
  turns: z.array(AgentTurnSchema).default([]), drafts: z.array(AgentDraftSchema).default([]),
  history: z.array(AgentRequestSchema).default([]), error: z.string().nullable(),
});
export const StartAgentSchema = z.object({
  boardId: BoardIdSchema, brief: z.string(), selectedIds: z.array(CardIdSchema), model: ModelChoiceSchema,
  statusModel: ModelChoiceSchema.optional(), count: z.int().min(1).max(8),
});
export type AgentSnapshot = z.output<typeof AgentSnapshotSchema>;
export type AgentRequest = z.output<typeof AgentRequestSchema>;
export type AgentDraft = z.output<typeof AgentDraftSchema>;
export type AgentModel = z.output<typeof AgentModelSchema>;
export type ModelChoice = z.output<typeof ModelChoiceSchema>;
export type StartAgent = z.output<typeof StartAgentSchema>;
