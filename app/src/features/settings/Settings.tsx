import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { gridShapes } from '@aegis/scene';
import { PreferencesSchema } from './preferences-store.js';
import type { AgentRuntime } from '../agents/runtime.js';
import { modelValue, providerName } from '../agents/model-choice.js';
import type { PreferenceStore } from './preferences-store.js';
import type { McpSetup, ProviderAccount, SettingsService } from './service.js';
import { MediaDevices } from './Devices.js';
import { ValuePicker } from '../../chrome/controls.js';
import './settings.css';
import './react-settings.css';

const tabs = ['General', 'Board', 'Toolbar', 'Panels', 'Accounts', 'Integrations', 'About'] as const;
export type SettingsTab = Lowercase<(typeof tabs)[number]>;
export function Settings({ open, initialTab = 'general', close, preferences, agents, service, replayTour, showShortcuts, slots = {} }: {
  readonly open: boolean; readonly initialTab?: SettingsTab; readonly close: () => void; readonly preferences: PreferenceStore;
  readonly agents: AgentRuntime; readonly service: SettingsService; readonly replayTour: () => void; readonly showShortcuts: () => void;
  readonly slots?: { readonly board?: ReactNode; readonly toolbar?: ReactNode; readonly panels?: ReactNode; readonly appearance?: ReactNode };
}) {
  const dialog = useRef<HTMLDialogElement>(null), previousFocus = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const values = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
  const agentState = useSyncExternalStore(agents.subscribe, agents.getSnapshot);
  useEffect(() => { if (open) setTab(initialTab); }, [initialTab, open]);
  useLayoutEffect(() => {
    const node = dialog.current; if (!node) return;
    if (open && !node.open) { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; node.showModal(); }
    else if (!open && node.open) { node.close(); previousFocus.current?.focus({ preventScroll: true }); }
  }, [open]);
  function toggle(key: 'motion' | 'doubleClickNote' | 'gridVisible' | 'snap' | 'tilt', label: string): ReactNode {
    const on = values[key] === 'on';
    return <label><span>{label}</span><button type="button" role="switch" aria-label={label} aria-checked={on} className="setting-switch" onClick={() => {
      if (key === 'motion' || key === 'doubleClickNote' || key === 'gridVisible' || key === 'snap' || key === 'tilt') preferences.set(key, on ? 'off' : 'on');
    }}><span /></button></label>;
  }
  return <dialog ref={dialog} id="settings" className="aegis-dialog aegis-feature" aria-label="Settings" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="sheet-head"><h2>Settings</h2><button type="button" id="closeSettings" className="text-btn" onClick={close}>Done</button></div>
    <nav className="settings-tabs" role="tablist" aria-label="Settings" onKeyDown={event => {
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')], current = buttons.findIndex(button => button === document.activeElement);
      const next = event.key === 'ArrowRight' ? buttons[(current + 1) % buttons.length] : event.key === 'ArrowLeft' ? buttons[(current - 1 + buttons.length) % buttons.length] : event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : null;
      if (next) { event.preventDefault(); next.click(); next.focus(); }
    }}>
      {tabs.map(label => { const id = label.toLowerCase(); return <button type="button" role="tab" key={label} id={`settings-tab-${id}`} aria-controls={`settings-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => {
        switch (label) { case 'General': setTab('general'); break; case 'Board': setTab('board'); break; case 'Toolbar': setTab('toolbar'); break; case 'Panels': setTab('panels'); break; case 'Accounts': setTab('accounts'); break; case 'Integrations': setTab('integrations'); break; case 'About': setTab('about'); break; default: { const exhaustive: never = label; throw new Error(exhaustive); } }
      }}>{label}</button>; })}
    </nav>
    {tabs.map(label => { const id = label.toLowerCase(); return <div className="settings-page" id={`settings-${id}`} role="tabpanel" key={id} aria-labelledby={`settings-tab-${id}`} hidden={tab !== id}>
      {label === 'General' ? <>
        <section className="sheet-sec"><h3>Theme</h3><div id="theme" className="seg" role="radiogroup" aria-label="Theme">{(['system', 'light', 'dark'] as const).map(theme => <button type="button" role="radio" aria-checked={values.theme === theme} key={theme} onClick={() => preferences.set('theme', theme)}>{theme[0]?.toUpperCase()}{theme.slice(1)}</button>)}</div></section>
        {toggle('doubleClickNote', 'Double-click creates a note')}
        <label>Default note colour<ValuePicker label="Default note colour" value={values.noteColour} onChange={choice => {
          if (choice === 'plain' || choice === 'gray' || choice === 'blue' || choice === 'green' || choice === 'yellow' || choice === 'orange' || choice === 'red' || choice === 'purple') preferences.set('noteColour', choice);
        }} options={(['plain', 'gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple'] as const).map(colour => [colour, colour === 'gray' ? 'Grey' : `${colour[0]?.toUpperCase()}${colour.slice(1)}`])} /></label>
        <section className="sheet-sec model-settings"><h3>Models</h3>{(['agent', 'status'] as const).map(kind => { const current = kind === 'agent' ? agentState.model : agentState.statusModel; const label = kind === 'agent' ? 'Agent model' : 'Status model'; return <label key={kind}>{label}<ValuePicker id={kind === 'agent' ? 'agentModel' : 'statusModel'} label={label} value={current ? modelValue(current) : ''} onChange={value => { if (kind === 'agent') agents.model(value); else agents.statusModel(value); }} options={agentState.models.map(model => { const description = agentState.readyProviders.has(model.provider) ? model.provider === 'fake' ? 'Available' : 'Signed in' : 'Sign in required'; return { value: modelValue(model), label: model.name, group: providerName(model.provider), groupDescription: description, description }; })} /></label>; })}<p className="muted small">A small model writes the live activity phrase.</p></section>
        <details className="settings-appearance"><summary>Appearance</summary>{slots.appearance}</details>
      </> : label === 'Board' ? <>{toggle('gridVisible', 'Show grid')}<label>Grid shape<ValuePicker label="Grid shape" value={values.gridShape} onChange={shape => { const parsed = PreferencesSchema.shape.gridShape.safeParse(shape); if (parsed.success) preferences.set('gridShape', parsed.data); }} options={gridShapes.filter(([shape]) => shape !== 'none')} /></label>{toggle('snap', 'Snap to grid')}{toggle('tilt', 'Tilt loose cards')}{toggle('motion', 'Motion')}{slots.board}</> :
        label === 'Toolbar' ? slots.toolbar : label === 'Panels' ? slots.panels : label === 'Accounts' ? open ? <Accounts service={service} agents={agents} /> : null : label === 'Integrations' ? open && tab === 'integrations' ? <Integrations service={service} /> : null : <>
          <p>Aegis {__AEGIS_VERSION__}</p><ul>{licences.map(licence => <li key={licence}>{licence}</li>)}</ul><p>Default data folder: ~/Library/Application Support/Aegis. Custom launches may use another folder.</p>
          <button type="button" onClick={() => { close(); replayTour(); }}>Replay welcome and tour</button><button type="button" onClick={() => { close(); showShortcuts(); }}>Keyboard shortcuts</button>
        </>}
      {label === 'General' && open ? <MediaDevices /> : null}
    </div>; })}
  </dialog>;
}

declare const __AEGIS_VERSION__: string;
const licences = ['LICENSE.mochiboard: MIT', 'Zephium: MPL-2.0 (LICENSE.zephium)', 'Material Icons: Apache-2.0', 'Fonts: Inter and others, SIL Open Font Licence (OFL)', '@modelcontextprotocol/sdk 1.32.2: MIT', 'Zod 4.6.7: MIT', 'pdfjs-dist 6.4.299: Apache-2.0 (bundled CMaps and decoders: BSD, MIT and CC0)', 'core-js 3.50.0: MIT', 'Liberation Sans 2.1.5 PDF fallback: SIL OFL 1.1', 'fflate 0.8.3: MIT', 'KaTeX 0.19.1: MIT (maths in documents; fonts SIL OFL 1.1)', '@napi-rs/canvas and platform packages 1.0.13: MIT (optional pdf.js Node dependency, unused in the browser)'];

function Accounts({ service, agents }: { readonly service: SettingsService; readonly agents: AgentRuntime }) {
  const [accounts, setAccounts] = useState<readonly ProviderAccount[]>([]), [error, setError] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    const load = async (): Promise<void> => { try { const list = await service.accounts(controller.signal); if (!controller.signal.aborted) setAccounts(list); } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not read account status.'); } };
    refresh.current = load; void load();
    const off = agents.workspace.events.subscribe(() => { if (agents.workspace.events.getSnapshot()?.type === 'auth') void load(); });
    return () => { controller.abort(); off(); lifetime.current = null; };
  }, [service, agents]);
  return <section className="sheet-sec"><h3>Accounts</h3><p className="muted">Agents use your own ChatGPT or Claude subscription. Tokens stay on this Mac.</p>
    {accounts.map(account => <Account key={account.provider} account={account} service={service} refresh={() => refresh.current()} signal={() => lifetime.current?.signal ?? AbortSignal.abort()} />)}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
function Account({ account, service, refresh, signal }: { readonly account: ProviderAccount; readonly service: SettingsService; readonly refresh: () => Promise<void>; readonly signal: () => AbortSignal }) {
  const [busy, setBusy] = useState(false), [answer, setAnswer] = useState(''), [error, setError] = useState<string | null>(null);
  const pending = account.state === 'pending', name = account.provider === 'openai' ? 'ChatGPT' : 'Claude';
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(operation: () => Promise<void>): Promise<void> {
    setBusy(true); setError(null);
    try { await operation(); await refresh(); } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not update this sign-in. Try again.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="account" data-provider={account.provider}><div className="acct-row"><div className="acct-name"><strong>{name}</strong><span className="acct-state" role="status">{account.connected ? 'Connected' : pending ? account.progress ?? 'Waiting for you to approve in the browser…' : account.error ?? 'Not connected'}</span></div><button type="button" className="pill acct-btn" disabled={busy} onClick={() => { void run(() => service.authenticate(account.provider, account.connected ? 'logout' : pending ? 'cancel' : 'start', signal())); }}>{account.connected ? 'Sign out' : pending ? 'Cancel' : account.error ? 'Try again' : 'Sign in'}</button></div>
    {pending && account.link ? <div className="acct-flow"><p>A {name} sign-in page is ready. Approve it in your browser, or paste its address or code below if asked.</p><div className="row"><button type="button" className="acct-open" onClick={() => { if (account.link) void run(() => service.openUrl(account.link ?? '')); }}>Open sign-in page again</button><button type="button" className="acct-copy" onClick={() => { if (account.link) void run(() => service.copy(account.link ?? '')); }}>Copy link</button></div>{account.prompt ? <form className="row acct-paste" onSubmit={event => { event.preventDefault(); if (answer.trim()) void run(async () => { await service.answer(account.provider, answer.trim(), signal()); if (mounted.current) setAnswer(''); }); }}><input aria-label={`${name} sign-in response`} autoComplete="off" spellCheck={false} value={answer} placeholder={account.prompt.placeholder} onChange={event => setAnswer(event.target.value)} /><button type="submit" disabled={busy || !answer.trim()}>Continue</button></form> : null}</div> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
function Integrations({ service }: { readonly service: SettingsService }) {
  type State = { kind: 'loading' } | { kind: 'ready'; setup: McpSetup } | { kind: 'error'; message: string };
  const [state, setState] = useState<State>({ kind: 'loading' }), [notice, setNotice] = useState('');
  const lifetime = useRef<AbortController | null>(null);
  async function refresh(signal: AbortSignal): Promise<void> { setState({ kind: 'loading' }); try { const setup = await service.mcp(signal); if (!signal.aborted) setState({ kind: 'ready', setup }); } catch (cause) { if (!signal.aborted) setState({ kind: 'error', message: cause instanceof Error ? cause.message : 'Could not load the connection.' }); } }
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; void refresh(controller.signal); return () => { controller.abort(); }; }, [service]);
  return <><h3>Local MCP</h3><p>Connect Codex, Claude or another local MCP client to your boards. Read imported documents and slides, draw diagrams, make cards and write documents you can keep editing here.</p><p className="integration-status" role="status">{state.kind === 'ready' ? 'Ready. Your local session can connect.' : state.kind === 'loading' ? 'Checking local MCP…' : `Could not load the connection: ${state.message}`}</p><p className="integration-hint">Keep Aegis open. Connected sessions can read and change all boards in this data folder.</p>
    <div className="integration-actions">{([['Copy Codex command', 'codexCommand'], ['Copy Codex configuration', 'codexConfig'], ['Copy Claude Code command', 'claudeCommand'], ['Copy MCP configuration', 'configText'], ['Copy plugin launch command', 'pluginCommand']] as const).map(([label, key]) => <button type="button" key={key} disabled={state.kind !== 'ready'} onClick={() => { if (state.kind === 'ready') void service.copy(state.setup[key]).then(() => setNotice('Copied. Paste it into your MCP client or terminal.'), () => setNotice('Could not copy. Try again.')); }}>{label}</button>)}</div>
    <details><summary>Other MCP clients (JSON)</summary><pre tabIndex={0} aria-label="MCP configuration">{state.kind === 'ready' ? state.setup.configText : ''}</pre></details><button type="button" onClick={() => { lifetime.current?.abort(); const controller = new AbortController(); lifetime.current = controller; void refresh(controller.signal); }}>Refresh connection</button><p role="status">{notice}</p>
  </>;
}
