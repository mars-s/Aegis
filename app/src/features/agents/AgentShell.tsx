import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { BoardId } from '@aegis/domain/schema';
import { AgentIdSchema } from '@aegis/domain/schema';
import type { AgentLineStyle } from '@aegis/scene';
import type { FeatureContext } from '../../composition.js';
import { Agents } from './Agents.js';
import { AgentActivity } from './Windows.js';
import { FollowControls } from './Follow.js';
import type { AgentComposer } from './Agents.js';
import { createAgentRuntime } from './runtime.js';
import type { AgentRuntime } from './runtime.js';
import { createAgentScene } from './scene.js';
import type { AgentScene, AgentFrameSchedule } from './scene.js';
import type { AgentService } from './service.js';
import { FirstMinute } from '../first-minute/FirstMinute.js';
import { Settings } from '../settings/Settings.js';
import type { SettingsTab } from '../settings/Settings.js';
import type { SettingsService } from '../settings/service.js';
import { createPreferenceStore } from '../settings/preferences-store.js';
import { Onboarding, Shortcuts } from '../onboarding/Onboarding.js';
import { shortcutReferences } from '../onboarding/shortcuts.js';
import { agentName, shortTitle } from './results.js';

export interface AgentShellControls {
  readonly runtime: AgentRuntime;
  readonly scene: AgentScene;
  readonly activity: ReactNode;
  readonly follow: ReactNode;
  readonly ask: (text: string) => Promise<boolean>;
  readonly openAsk: () => void;
  readonly settings: (tab?: SettingsTab) => void;
  readonly shortcuts: () => void;
  readonly replayTour: () => void;
}
export interface AgentShellProps {
  readonly context: FeatureContext;
  readonly service: AgentService;
  readonly settingsService: SettingsService;
  readonly schedule: AgentFrameSchedule;
  readonly importCsv: (file: File, boardId: BoardId) => Promise<void>;
  readonly attached: (controls: AgentShellControls | null) => void;
  readonly settingsSlots?: { readonly board?: ReactNode; readonly toolbar?: ReactNode; readonly panels?: ReactNode; readonly appearance?: ReactNode };
  readonly activityInChrome?: boolean;
}

/** Mount with a board key and a stable scene schedule. All resources close with this board. */
export function AgentShell(props: AgentShellProps) {
  const id = useSyncExternalStore(props.context.workspace.metadata.subscribe, props.context.workspace.metadata.getSnapshot).id;
  return <BoardAgentShell {...props} key={id} />;
}
function BoardAgentShell({ context, service, settingsService, schedule, importCsv, attached, settingsSlots, activityInChrome = false }: AgentShellProps) {
  const composer = useRef<AgentComposer | null>(null);
  const [settings, setSettings] = useState<{ readonly tab: SettingsTab } | null>(null);
  const [tour, setTour] = useState(() => !localStorage.getItem('aegis:onboarded'));
  const [help, setHelp] = useState(false);
  const [scene, setScene] = useState<AgentScene | null>(null);
  const ui = useSyncExternalStore(context.workspace.ui.subscribe, context.workspace.ui.getSnapshot);
  const runtime = useMemo(() => createAgentRuntime({ workspace: context.workspace, service, requireSignIn: () => setSettings({ tab: 'accounts' }) }), [context.workspace, service]);
  const preferences = useMemo(createPreferenceStore, []);
  useEffect(() => runtime.start(), [runtime]);
  useEffect(() => {
    let previous: string | null = null;
    const notify = (): void => {
      const error = runtime.getSnapshot().error;
      if (error && error !== previous) dispatchEvent(new CustomEvent('aegis:notice', { detail: error }));
      previous = error;
    };
    notify();
    return runtime.subscribe(notify);
  }, [runtime]);
  useEffect(() => preferences.attach(), [preferences]);
  useEffect(() => { const instance = createAgentScene(context, schedule); setScene(instance); return () => instance.dispose(); }, [context, schedule]);
  useEffect(() => {
    if (!scene) return;
    return context.workspace.events.subscribe(() => {
      const event = context.workspace.events.getSnapshot();
      if (event?.type !== 'board' || event.boardId !== context.workspace.metadata.getSnapshot().id || event.author.kind === 'user') return;
      if (event.author.undoRequest) { scene.clearResult(); return; }
      const parsed = AgentIdSchema.safeParse(typeof event.author.conversationId === 'number' ? String(event.author.conversationId) : event.author.conversationId);
      const id = parsed.success ? parsed.data : null;
      const agent = runtime.getSnapshot().agents.find(agent => agent.id === id);
      if (agent) scene.near(agent.id, event.touched);
      if (event.touched.length) {
        const name = event.author.kind === 'mcp' ? event.author.name || 'Agent' : agent ? agentName(agent, runtime.getSnapshot().agents) : 'Agent';
        const index = [...(id ?? name)].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 3;
        const styles: readonly AgentLineStyle[] = ['solid', 'dashed', 'dotted'];
        scene.result(id, event.touched, `${name}: ${agent ? shortTitle(agent) : 'changed the board'}`, styles[index] ?? 'solid');
      }
    });
  }, [context.workspace, runtime, scene]);
  useEffect(() => {
    if (!scene) return;
    const controls: AgentShellControls = {
      runtime,
      scene,
      activity: <AgentActivity runtime={runtime} show={scene.show} close={() => context.workspace.act({ kind: 'panel', side: 'right', open: false })} />,
      follow: <FollowControls context={context} runtime={runtime} scene={scene} />,
      ask: text => composer.current?.ask(text) ?? Promise.resolve(false), openAsk: () => composer.current?.open(true),
      settings: (tab = 'general') => setSettings({ tab }), shortcuts: () => setHelp(true), replayTour: () => setTour(true),
    };
    attached(controls); return () => attached(null);
  }, [attached, context, runtime, scene]);
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey || event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]') || document.querySelector('dialog:modal')) return;
      event.preventDefault(); setHelp(true);
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, []);
  const receiveComposer = useMemo(() => (value: AgentComposer | null): void => { composer.current = value; }, []);
  if (!scene) return null;
  return <>
    <Agents runtime={runtime} scene={scene} attached={receiveComposer} activityOpen={ui.rightPanel && !activityInChrome} closeActivity={() => context.workspace.act({ kind: 'panel', side: 'right', open: false })} openActivity={() => context.workspace.act({ kind: 'panel', side: 'right', open: true })} />
    <FirstMinute context={context} agents={runtime} ask={text => composer.current?.ask(text) ?? Promise.resolve(false)} importCsv={importCsv} />
    <Settings open={!!settings} initialTab={settings?.tab ?? 'general'} close={() => setSettings(null)} preferences={preferences} agents={runtime} service={settingsService} replayTour={() => setTour(true)} showShortcuts={() => setHelp(true)} {...(settingsSlots ? { slots: settingsSlots } : {})} />
    <Onboarding open={tour} close={() => setTour(false)} context={context} ask={text => composer.current?.ask(text) ?? Promise.resolve(false)} openAsk={() => composer.current?.open(true)} />
    <Shortcuts open={help} close={() => setHelp(false)} shortcuts={shortcutReferences} />
  </>;
}
