import type { AgentId, CardId, Source } from '@aegis/domain/schema';
import type { FeatureWorkspace } from '../../composition.js';
import type { AgentModel, AgentSnapshot, ModelChoice } from './schema.js';
import type { AgentService } from './service.js';
import { createAgentStore } from './store.js';
import { defaultStatusModel, modelChoice, modelValue } from './model-choice.js';
import type { UndoRequest } from './RequestHistory.js';

type Target = { readonly kind: 'current'; readonly id: AgentId | null } | { readonly kind: 'new' };
export interface AgentUiState {
  readonly agents: readonly AgentSnapshot[];
  readonly target: Target;
  readonly models: readonly AgentModel[];
  readonly model: ModelChoice | null;
  readonly statusModel: ModelChoice | null;
  readonly readyProviders: ReadonlySet<string>;
  readonly count: number;
  readonly pinned: readonly CardId[];
  readonly sending: boolean;
  readonly error: string | null;
}
export interface AgentRuntime extends Source<AgentUiState> {
  readonly workspace: FeatureWorkspace;
  readonly start: () => () => void;
  readonly current: () => AgentSnapshot | null;
  readonly refresh: () => Promise<void>;
  readonly select: (id: AgentId) => void;
  readonly newAgent: () => void;
  readonly pin: (ids: readonly CardId[]) => void;
  readonly model: (value: string) => void;
  readonly statusModel: (value: string) => void;
  readonly count: (count: number) => void;
  readonly send: (text: string, forceNew?: boolean) => Promise<boolean>;
  readonly message: (id: AgentId, content: string) => Promise<boolean>;
  readonly stop: (id: AgentId) => Promise<void>;
  readonly undo: UndoRequest;
  readonly dismissError: () => void;
  readonly priorAgents: (signal: AbortSignal) => Promise<boolean>;
}
const storedChoice = (key: string): ModelChoice | null => modelChoice(localStorage.getItem(key) ?? '');
const describe = (error: unknown): string => error instanceof Error ? error.message : 'The request could not finish. Try again.';

export function createAgentRuntime({ workspace, service, requireSignIn }: {
  readonly workspace: FeatureWorkspace;
  readonly service: AgentService;
  readonly requireSignIn: (provider: string) => void;
}): AgentRuntime {
  const boardId = workspace.metadata.getSnapshot().id;
  const agents = createAgentStore(boardId);
  const listeners = new Set<() => void>();
  let lifetime = new AbortController();
  let mounted = false;
  let state: AgentUiState = { agents: [], target: { kind: 'current', id: null }, models: [], model: storedChoice('aegis:model'),
    statusModel: storedChoice('aegis:status-model'), readyProviders: new Set(), count: 1, pinned: [], sending: false, error: null };
  function update(patch: Partial<AgentUiState>): void {
    if (lifetime.signal.aborted) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
  const current = (): AgentSnapshot | null => {
    const target = state.target;
    return target.kind === 'new' ? null : state.agents.find(agent => agent.id === target.id) ?? state.agents.find(agent => !agent.parent) ?? null;
  };
  function fail(error: unknown): void { update({ error: describe(error) }); }
  async function refresh(): Promise<void> {
    const read = agents.beginRead(), signal = lifetime.signal;
    try {
      const snapshots = await service.list(boardId, signal);
      if (signal.aborted) return;
      for (const agent of snapshots) agents.mergeSnapshot(agent, read);
    } catch (error) { if (!signal.aborted) fail(error); }
  }
  async function loadModels(): Promise<void> {
    const signal = lifetime.signal;
    try {
      const models = await service.models(signal);
      const providers = [...new Set(models.map(model => model.provider))];
      const connections = await Promise.all(providers.map(async provider => ({ provider, ready: provider === 'fake' || await service.connected(provider, signal) })));
      if (signal.aborted) return;
      const readyProviders = new Set(connections.filter(item => item.ready).map(item => item.provider));
      const ready = (model: AgentModel): boolean => readyProviders.has(model.provider);
      const model = models.find(model => state.model && modelValue(model) === modelValue(state.model)) ?? models.find(ready) ?? models[0] ?? null;
      const statusModel = models.find(model => state.statusModel && modelValue(model) === modelValue(state.statusModel)) ?? defaultStatusModel(models, ready) ?? null;
      if (model) localStorage.setItem('aegis:model', modelValue(model));
      if (statusModel) localStorage.setItem('aegis:status-model', modelValue(statusModel));
      update({ models, model, statusModel, readyProviders });
    } catch (error) { if (!signal.aborted) fail(error); }
  }
  async function operate(run: (signal: AbortSignal) => Promise<void>): Promise<boolean> {
    const signal = lifetime.signal;
    try { await run(signal); if (signal.aborted) return false; await refresh(); return true; }
    catch (error) { if (!signal.aborted) fail(error); return false; }
  }
  return {
    workspace, getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, current, refresh,
    start() {
      if (mounted) throw new Error('The agent runtime is already attached.');
      mounted = true;
      lifetime = new AbortController();
      const offAgents = agents.subscribe(() => update({ agents: agents.getSnapshot() }));
      const offEvents = workspace.events.subscribe(() => {
        const event = workspace.events.getSnapshot();
        if (event?.type === 'agent') agents.mergeEvent(event);
        if (event?.type === 'auth') void loadModels();
      });
      const offScene = workspace.scene.subscribe(() => {
        if (workspace.metadata.getSnapshot().id !== boardId) { lifetime.abort(); agents.clear(); return; }
        const ids = new Set(workspace.scene.snapshot().cards.map(card => card.id));
        if (state.pinned.some(id => !ids.has(id))) update({ pinned: state.pinned.filter(id => ids.has(id)) });
      });
      void refresh(); void loadModels();
      return () => { lifetime.abort(); mounted = false; offAgents(); offEvents(); offScene(); };
    },
    select: id => update({ target: { kind: 'current', id } }),
    newAgent: () => update({ target: { kind: 'new' } }),
    pin: ids => { const present = new Set(workspace.scene.snapshot().cards.map(card => card.id)); update({ pinned: [...new Set(ids)].filter(id => present.has(id)) }); },
    model(value) {
      const choice = modelChoice(value);
      if (choice && state.models.some(item => modelValue(item) === value)) { localStorage.setItem('aegis:model', value); update({ model: choice, target: { kind: 'new' } }); }
    },
    statusModel(value) {
      const choice = modelChoice(value);
      if (choice && state.models.some(item => modelValue(item) === value)) { localStorage.setItem('aegis:status-model', value); update({ statusModel: choice }); }
    },
    count: count => update({ count: Math.max(1, Math.min(8, Math.round(count))) }),
    async send(text, forceNew = false) {
      if (state.sending || lifetime.signal.aborted || workspace.metadata.getSnapshot().id !== boardId) return false;
      const existing = !forceNew && state.count === 1 ? current() : null;
      const model = existing?.model ?? state.model;
      if (!model) { update({ error: 'Choose an agent model in Settings, then try again.' }); return false; }
      const signal = lifetime.signal;
      update({ sending: true, error: null });
      try {
        if (model.provider !== 'fake' && !await service.connected(model.provider, signal)) {
          if (!signal.aborted) { update({ error: `Sign in to ${model.provider === 'openai' ? 'ChatGPT' : model.provider === 'anthropic' ? 'Claude' : model.provider} first` }); requireSignIn(model.provider); }
          return false;
        }
        if (signal.aborted) return false;
        const selectedIds = state.pinned.length ? [...state.pinned] : [...workspace.selection.getSnapshot()];
        const brief = text.trim() || 'Sort this board into clear groups.';
        if (existing) await service.message(existing.id, brief, selectedIds, signal);
        else {
          const spawned = await service.start({ boardId, brief, selectedIds, model, count: state.count, ...(state.statusModel ? { statusModel: state.statusModel } : {}) }, signal);
          if (signal.aborted) return false;
          const first = spawned[0];
          if (first) update({ target: { kind: 'current', id: first.id } });
        }
        if (signal.aborted) return false;
        update({ pinned: [] }); await refresh(); return true;
      } catch (error) { if (!signal.aborted) fail(error); return false; }
      finally { if (!signal.aborted) update({ sending: false }); }
    },
    message: (id, content) => content.trim() ? operate(signal => service.message(id, content.trim(), [], signal)) : Promise.resolve(false),
    stop: async id => { await operate(signal => service.stop(id, signal)); },
    undo: async (id, requestId) => {
      const saving = workspace.saving.getSnapshot();
      if (saving.kind !== 'saved') { update({ error: saving.kind === 'blocked' ? saving.reason : 'Save your changes before undoing this request.' }); return; }
      const cancel = workspace.expectAgentUndo(id, requestId);
      if (!await operate(signal => service.undoRequest(id, requestId, signal))) cancel();
    },
    dismissError: () => update({ error: null }),
    priorAgents: async signal => (await service.list(null, signal)).length > 0,
  };
}
