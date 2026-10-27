import { z } from 'zod/v4';
import { JsonSchema } from '@aegis/domain/schema';

export const ProviderSchema = z.enum(['openai', 'anthropic']);
export type Provider = z.output<typeof ProviderSchema>;
export const AccountSchema = z.object({
  provider: ProviderSchema, connected: z.boolean(), state: z.string(), error: z.string().nullish(),
  progress: z.string().nullish(), link: z.string().nullish(), prompt: z.object({ placeholder: z.string().optional() }).nullish(),
});
export type ProviderAccount = z.output<typeof AccountSchema>;
export const McpSetupSchema = z.object({
  codexCommand: z.string(), codexConfig: z.string(), claudeCommand: z.string(), pluginCommand: z.string(), config: JsonSchema,
}).transform(({ config, ...setup }) => ({ ...setup, configText: JSON.stringify(config, null, 2) }));
export type McpSetup = z.output<typeof McpSetupSchema>;
export interface SettingsService {
  readonly accounts: (signal: AbortSignal) => Promise<readonly ProviderAccount[]>;
  readonly authenticate: (provider: Provider, action: 'start' | 'cancel' | 'logout', signal: AbortSignal) => Promise<void>;
  readonly answer: (provider: Provider, answer: string, signal: AbortSignal) => Promise<void>;
  readonly mcp: (signal: AbortSignal) => Promise<McpSetup>;
  readonly copy: (text: string) => Promise<void>;
  readonly openUrl: (url: string) => Promise<void>;
}
