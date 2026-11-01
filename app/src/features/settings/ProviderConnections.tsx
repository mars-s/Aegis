import { useEffect, useRef, useState } from 'react';
import type { AgentRuntime } from '../agents/runtime.js';
import type { ProviderAccount, SettingsService } from './service.js';
import './provider-connections.css';

const openedLinks = new Set<string>();

export function ProviderConnections({ service, agents }: { readonly service: SettingsService; readonly agents: AgentRuntime }) {
  const [accounts, setAccounts] = useState<readonly ProviderAccount[]>([]), [error, setError] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    const load = async (): Promise<void> => { try { const list = await service.accounts(controller.signal); if (!controller.signal.aborted) { setAccounts(list); setError(null); } } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not read account status.'); } };
    refresh.current = load; void load();
    const off = agents.workspace.events.subscribe(() => { if (agents.workspace.events.getSnapshot()?.type === 'auth') void load(); });
    return () => { controller.abort(); off(); lifetime.current = null; };
  }, [service, agents]);
  return <section className="provider-connections" aria-label="AI connections">
    <header className="connections-head"><h3>Connect AI</h3><p>Choose the AI you work with.</p></header>
    {!accounts.length && !error ? <p role="status">Checking connections…</p> : null}
    {accounts.map(account => <Account key={account.provider} account={account} service={service} refresh={() => refresh.current()} signal={() => lifetime.current?.signal ?? AbortSignal.abort()} />)}
    {error ? <p role="alert">Connection error: {error}</p> : null}
  </section>;
}
function Account({ account, service, refresh, signal }: { readonly account: ProviderAccount; readonly service: SettingsService; readonly refresh: () => Promise<void>; readonly signal: () => AbortSignal }) {
  const [busy, setBusy] = useState(false), [answer, setAnswer] = useState(''), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (account.provider !== 'openai' || account.state !== 'pending' || !account.link || openedLinks.has(account.link)) return;
    openedLinks.add(account.link);
    void service.openUrl(account.link).catch(() => setError('Could not open the browser. Copy the sign-in link below.'));
  }, [account.provider, account.state, account.link, service]);
  useEffect(() => {
    if (account.state !== 'pending') return;
    const timer = setInterval(() => { void refresh(); }, 1000); return () => clearInterval(timer);
  }, [account.state, refresh]);
  const pending = account.state === 'pending', name = account.provider === 'openai' ? 'ChatGPT' : 'Claude';
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(operation: () => Promise<void>): Promise<void> {
    setBusy(true); setError(null);
    try { await operation(); await refresh(); } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not update this sign-in. Try again.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  if (account.provider === 'claude') return <div className="account" data-provider="claude" data-state={account.state}>
    <div className="acct-name"><strong>Claude Code</strong><span className="acct-state" role="status">{account.state === 'ready' ? `Ready${account.version ? ` · ${account.version}` : ''}` : account.state === 'missing' ? 'Install Claude Code' : 'Sign in through Terminal'}</span></div>
    {account.state === 'missing' ? <><p>Install the official Claude Code CLI in Terminal.</p>
      <div className="provider-command"><code>curl -fsSL https://claude.ai/install.sh | bash</code><button type="button" disabled={busy} onClick={() => void run(() => service.copy('curl -fsSL https://claude.ai/install.sh | bash'))}>Copy install command</button></div>
      <div className="provider-command"><code>brew install --cask claude-code</code><button type="button" disabled={busy} onClick={() => void run(() => service.copy('brew install --cask claude-code'))}>Copy Homebrew command</button></div>
      <a href="https://code.claude.com/docs" onClick={event => { event.preventDefault(); void run(() => service.openUrl('https://code.claude.com/docs')); }}>Claude Code documentation</a></> : null}
    {account.state === 'signed-out' ? <><p>Run <code>claude</code> in Terminal once and sign in with your Claude Pro or Max account.</p><button type="button" disabled={busy} onClick={() => void run(() => service.copy('claude'))}>Copy claude command</button></> : null}
    <p className="muted small">Claude Code manages your sign-in. Aegis never reads or stores your Claude credentials.</p>
    <button type="button" disabled={busy} onClick={() => void run(() => service.refreshClaude(signal()))}>{busy ? 'Checking…' : 'Check again'}</button>
    {error ? <p role="alert">Connection error: {error}</p> : null}
  </div>;
  return <div className="account" data-provider={account.provider} data-state={account.connected ? 'ready' : account.error ? 'error' : pending ? 'pending' : 'disconnected'}><div className="acct-row"><div className="acct-name"><strong>{name}</strong><span className="acct-state" role="status">{account.connected ? 'Connected' : pending ? account.progress ?? 'Waiting for you to approve in the browser…' : account.error ?? 'Not connected'}</span></div><button type="button" className={`acct-btn${!account.connected && !pending ? ' provider-primary' : ''}`} disabled={busy} onClick={() => { void run(() => service.authenticate(account.provider, account.connected ? 'logout' : pending ? 'cancel' : 'start', signal())); }}>{account.connected ? 'Disconnect' : pending ? 'Cancel' : 'Sign in with ChatGPT'}</button></div>
    <p className="muted small">Uses your ChatGPT plan. Tokens stay in Aegis on this Mac.</p>
    {pending && account.link ? <div className="acct-flow"><p>A {name} sign-in page is ready. Approve it in your browser, or paste its address or code below if asked.</p><div className="row"><button type="button" className="acct-open" disabled={busy} onClick={() => { if (account.link) void run(() => service.openUrl(account.link ?? '')); }}>Open sign-in page again</button><button type="button" className="acct-copy" disabled={busy} onClick={() => { if (account.link) void run(() => service.copy(account.link ?? '')); }}>Copy link</button></div>{account.prompt ? <form className="row acct-paste" onSubmit={event => { event.preventDefault(); if (answer.trim()) void run(async () => { await service.answer(account.provider, answer.trim(), signal()); if (mounted.current) setAnswer(''); }); }}><input aria-label={`${name} sign-in response`} autoComplete="off" spellCheck={false} value={answer} placeholder={account.prompt.placeholder} onChange={event => setAnswer(event.target.value)} /><button type="submit" disabled={busy || !answer.trim()}>Continue</button></form> : null}</div> : null}
    {error ? <p role="alert">Connection error: {error}</p> : null}
  </div>;
}
