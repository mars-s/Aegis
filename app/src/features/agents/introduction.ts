import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { profileEmpty, WELCOME_BRIEF } from '@aegis/domain/profile';
import type { AgentRuntime } from './runtime.js';
import type { AgentComposer } from './Agents.js';
import type { SettingsService } from '../settings/service.js';
import type { RefObject } from 'react';

const completeKey = 'aegis:introduction-complete', agentKey = 'aegis:introduction-agent';
export function useIntroduction(runtime: AgentRuntime, service: SettingsService, composer: RefObject<AgentComposer | null>) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [generation, setGeneration] = useState(0);
  const started = useRef(false), saving = useRef(false);
  const ready = state.readyProviders.size > 0;
  useEffect(() => {
    if (!ready || started.current || localStorage.getItem(completeKey)) return;
    started.current = true;
    const controller = new AbortController();
    void (async () => {
      const profile = await service.profile(controller.signal);
      if (controller.signal.aborted) return;
      if (!profileEmpty(profile)) { localStorage.setItem(completeKey, '1'); return; }
      await runtime.refresh();
      if (controller.signal.aborted) return;
      const saved = localStorage.getItem(agentKey);
      const existing = generation === 0 ? runtime.getSnapshot().agents.find(agent => agent.id === saved || agent.brief === 'Introduction') : undefined;
      if (existing) { runtime.select(existing.id); localStorage.setItem(agentKey, existing.id); }
      else if (saved) return;
      else {
        runtime.newAgent(); runtime.count(1); runtime.pin([]);
        if (!await runtime.send(WELCOME_BRIEF, true)) { started.current = false; return; }
        const current = runtime.current(); if (current) localStorage.setItem(agentKey, current.id);
      }
      composer.current?.open(true);
    })().catch(() => { started.current = false; });
    return () => { controller.abort(); started.current = false; };
  }, [ready, generation, runtime, service, composer]);
  useEffect(() => {
    if (!ready || saving.current || localStorage.getItem(completeKey) || !localStorage.getItem(agentKey) || state.agents.some(agent => agent.running)) return;
    // Agent snapshots change often while a reply settles. Aborting on every change could leave the
    // last check cancelled with no later change to retry it, so this check runs to completion.
    saving.current = true;
    void service.profile(new AbortController().signal).then(profile => {
      if (!profileEmpty(profile)) localStorage.setItem(completeKey, '1');
    }).catch(() => {}).finally(() => { saving.current = false; });
  }, [ready, state.agents, service]);
  return async (): Promise<void> => {
    try {
      await service.resetProfile(new AbortController().signal);
      localStorage.removeItem(completeKey); localStorage.removeItem(agentKey);
      started.current = false; setGeneration(value => value + 1);
    } catch { dispatchEvent(new CustomEvent('aegis:notice', { detail: 'Could not reset your introduction. Try again.' })); }
  };
}
