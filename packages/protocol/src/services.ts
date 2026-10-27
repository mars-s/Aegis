import { z } from 'zod/v4';
import { BoardIdSchema, JsonSchema } from '@aegis/domain/schema';
import { BoardListEntrySchema } from './http.js';
import { StoredLibrarySchema } from './storage.js';

export const LibrarySnapshotSchema = z.object({
  nodes: StoredLibrarySchema.shape.nodes,
  boards: z.array(BoardListEntrySchema.extend({ parent: z.string().nullable() })),
});
export type LibrarySnapshot = z.output<typeof LibrarySnapshotSchema>;
export const LibraryChangeSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), kind: z.enum(['project', 'folder']), name: z.string().optional(), parent: z.string().nullable() }),
  z.object({ op: z.literal('rename'), id: z.string(), name: z.string() }),
  z.object({ op: z.literal('move'), id: z.string(), parent: z.string().nullable().optional(), boardParent: BoardIdSchema.nullable().optional() }),
  z.object({ op: z.literal('cover'), id: z.string(), cover: z.string().nullable() }),
  z.object({ op: z.literal('delete'), id: z.string(), recursive: z.literal(true) }),
]);
export type LibraryChange = z.output<typeof LibraryChangeSchema>;
export const LibraryResultSchema = z.object({ ok: z.literal(true), created: z.string().nullable(), removed: z.array(BoardIdSchema), nextBoard: BoardIdSchema });
export type LibraryResult = z.output<typeof LibraryResultSchema>;

export const ProviderSchema = z.enum(['openai', 'anthropic']);
export type Provider = z.output<typeof ProviderSchema>;
const AccountStateSchema = z.object({
  connected: z.boolean(), state: z.string(), error: z.string().nullish(), progress: z.string().nullish(),
  link: z.string().nullish(), prompt: z.object({ placeholder: z.string().optional() }).nullish(),
});
export const AccountSchema = AccountStateSchema.extend({ provider: ProviderSchema });
export type ProviderAccount = z.output<typeof AccountSchema>;
export const AccountsSchema = z.object({ openai: AccountStateSchema, anthropic: AccountStateSchema }).transform(value => [
  { provider: 'openai' as const, ...value.openai }, { provider: 'anthropic' as const, ...value.anthropic },
]);
export const McpSetupSchema = z.object({
  codexCommand: z.string(), codexConfig: z.string(), claudeCommand: z.string(), pluginCommand: z.string(), config: JsonSchema,
}).transform(({ config, ...setup }) => ({ ...setup, configText: JSON.stringify(config, null, 2) }));
export type McpSetup = z.output<typeof McpSetupSchema>;
export const RewriteResponseSchema = z.object({ text: z.string() }).transform(value => value.text);
export interface RewriteRequest {
  readonly text: string;
  readonly how: string;
  readonly title: string;
  readonly around: string;
  readonly model?: { readonly provider: string; readonly modelId: string };
}
export const LinkPreviewSchema = z.object({ title: z.string(), description: z.string(), image: z.string(), favicon: z.string() });
export type LinkPreview = z.output<typeof LinkPreviewSchema>;
export const SandboxRequestSchema = z.object({
  html: z.string(), css: z.string(), js: z.string(), state: z.string().optional(), parentOrigin: z.string(),
  channel: z.string().uuid(), font: z.string(), theme: z.string(), motionOff: z.boolean(),
});
export type SandboxRequest = z.output<typeof SandboxRequestSchema>;
const SandboxResponseSchema = z.object({ url: z.url() });
export function decodeSandbox(value: unknown, base: string): { readonly url: string } {
  const result = SandboxResponseSchema.parse(value), url = new URL(result.url);
  if (url.origin !== new URL(base).origin || !/^\/sandbox\/[a-f0-9]{64}$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new Error('Invalid sandbox capability');
  return result;
}
