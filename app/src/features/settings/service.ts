import type { McpSetup, Provider, ProviderAccount } from '@aegis/protocol/services';
export { ProviderSchema, AccountSchema, McpSetupSchema } from '@aegis/protocol/services';
export type { Provider, ProviderAccount, McpSetup } from '@aegis/protocol/services';
export interface SettingsService {
  readonly accounts: (signal: AbortSignal) => Promise<readonly ProviderAccount[]>;
  readonly authenticate: (provider: Provider, action: 'start' | 'cancel' | 'logout', signal: AbortSignal) => Promise<void>;
  readonly answer: (provider: Provider, answer: string, signal: AbortSignal) => Promise<void>;
  readonly mcp: (signal: AbortSignal) => Promise<McpSetup>;
  readonly copy: (text: string) => Promise<void>;
  readonly openUrl: (url: string) => Promise<void>;
}
