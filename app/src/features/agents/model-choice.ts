import { ModelChoiceSchema } from './schema.js';
import type { AgentModel, ModelChoice } from './schema.js';

export const modelValue = (model: ModelChoice): string => `${model.provider}|${model.modelId}`;
export function modelChoice(value: string): ModelChoice | null {
  const [provider, modelId, extra] = value.split('|');
  if (extra !== undefined) return null;
  const parsed = ModelChoiceSchema.safeParse({ provider, modelId });
  return parsed.success ? parsed.data : null;
}
export function defaultStatusModel(models: readonly AgentModel[], ready: (model: AgentModel) => boolean): AgentModel | undefined {
  const connected = models.filter(ready);
  const available = connected.length ? connected : models;
  return available.find(model => /luna|haiku/.test(model.modelId)) ?? available.find(model => model.provider === 'fake') ?? available.at(-1);
}
export const providerName = (provider: string): string => ({ openai: 'ChatGPT', claude: 'Claude Code', fake: 'Review' })[provider] ?? provider;
