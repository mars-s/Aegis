import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod/v4';
import { createAssistantMessageEventStream, createProvider } from '@earendil-works/pi-ai';
import type { AssistantMessage, Model, TranscriptContext } from '@earendil-works/pi-ai';
import { atomicJson } from './files.js';
import type { HostLifetime } from './lifetime.js';

const aliases = ['sonnet', 'opus', 'haiku'] as const;
const StatusSchema = z.object({ loggedIn: z.boolean() });
const EventSchema = z.object({
  type: z.string(), result: z.string().optional(), is_error: z.boolean().optional(),
  event: z.object({ type: z.string(), delta: z.object({ type: z.string(), text: z.string().optional() }).optional() }).optional(),
  message: z.object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() })) }).optional(),
});
export interface ClaudeState { connected: boolean; state: 'missing' | 'signed-out' | 'ready'; version: string | null }
export const CLAUDE_TOOLS = ['board_list', 'board_create', 'board_read', 'board_search', 'card_read', 'board_apply', 'document_write', 'library_apply', 'object_schema', 'asset_read', 'profile_update'] as const;

// Only the CLI receives its own ambient account environment. Aegis secrets never enter it.
function environment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['HOME', 'PATH', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL']) {
    const value = process.env[key]; if (value !== undefined) env[key] = value;
  }
  return env;
}
async function binary(): Promise<string | null> {
  const override = process.env.AEGIS_CLAUDE_BIN;
  if (process.env.AEGIS_FAKE_MODEL && !override) return null;
  const candidates = override ? [override] : [...(process.env.PATH ?? '').split(delimiter).filter(Boolean).map(path => join(path, 'claude')), join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  for (const path of candidates) { try { await access(path, constants.X_OK); return path; } catch { /* Try the next installation path. */ } }
  return null;
}
export function createClaudeCode({ data, lifetime, configuration }: { data: string; lifetime: HostLifetime; configuration: () => unknown }) {
  const directory = join(data, 'claude-code');
  let cached: { at: number; value: ClaudeState } | undefined;
  let checking: Promise<ClaudeState> | undefined;
  async function execute(path: string, args: string[], input: string, signal: AbortSignal, timeout: number, line?: (value: string) => void): Promise<string> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const child = spawn(path, args, { cwd: directory, env: environment(), stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
      let output = '', pending = '', failed = false, outputBytes = 0;
      const kill = (): void => {
        failed = true;
        try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { child.kill('SIGKILL'); }
      };
      const timer = setTimeout(kill, timeout);
      signal.addEventListener('abort', kill, { once: true });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (text: string) => {
        output += text; pending += text; outputBytes += Buffer.byteLength(text);
        if (outputBytes > 8 * 1024 * 1024) { kill(); return; }
        let end: number;
        while ((end = pending.indexOf('\n')) >= 0) { const next = pending.slice(0, end); pending = pending.slice(end + 1); line?.(next); }
      });
      child.stderr.resume();
      child.stdin.on('error', () => {});
      child.once('error', () => { clearTimeout(timer); signal.removeEventListener('abort', kill); reject(new Error('Claude Code could not start. Check its installation in Terminal.')); });
      child.once('close', code => {
        clearTimeout(timer); signal.removeEventListener('abort', kill);
        if (pending) line?.(pending);
        if (failed || code !== 0) reject(new Error(signal.aborted ? 'Claude Code was stopped.' : 'Claude Code could not finish. Run claude in Terminal, check your sign-in, then try again.'));
        else resolve(output);
      });
      child.stdin.end(input);
    });
  }
  async function inspect(): Promise<ClaudeState> {
    const path = await binary(); if (!path) return { connected: false, state: 'missing', version: null };
    return lifetime.run(async signal => {
      let version: string | null = null;
      try {
        version = (await execute(path, ['--version'], '', signal, 3000)).trim().slice(0, 120);
        let status: string;
        try { status = await execute(path, ['auth', 'status', '--json'], '', signal, 3000); }
        catch { status = await execute(path, ['auth', 'status'], '', signal, 3000); }
        let json: unknown; try { json = JSON.parse(status); } catch { json = null; }
        const parsed = StatusSchema.safeParse(json);
        const ready = parsed.success ? parsed.data.loggedIn : !/not logged|signed out|not signed|unauthenticated/i.test(status) && /logged in|signed in|authenticated/i.test(status);
        return { connected: ready, state: ready ? 'ready' : 'signed-out', version };
      } catch { return { connected: false, state: 'signed-out', version }; }
    });
  }
  async function status(refresh = false): Promise<ClaudeState> {
    if (!refresh && cached && Date.now() - cached.at < 5000) return cached.value;
    checking ??= inspect().then(value => { cached = { at: Date.now(), value }; return value; }).finally(() => { checking = undefined; });
    return checking;
  }
  const catalogue: readonly Model<'claude-code'>[] = aliases.map(id => ({
    id, name: `Claude ${id[0]?.toUpperCase()}${id.slice(1)}`, api: 'claude-code', provider: 'claude', baseUrl: '',
    input: ['text'], reasoning: false, contextWindow: 200000, maxTokens: 32000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }));
  function stream(model: Model<string>, context: TranscriptContext, options?: { readonly signal?: AbortSignal | undefined }) {
    const events = createAssistantMessageEventStream();
    const block = { type: 'text' as const, text: '' };
    const reply: AssistantMessage = { role: 'assistant', content: [block], provider: 'claude', api: 'claude-code', model: model.id, stopReason: 'stop', timestamp: Date.now(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
    events.push({ type: 'start', partial: reply }); events.push({ type: 'text_start', contentIndex: 0, partial: reply });
    const delta = (text: string): void => { block.text += text; events.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: reply }); };
    void lifetime.run(async lifetimeSignal => {
      const signal = options?.signal ? AbortSignal.any([lifetimeSignal, options.signal]) : lifetimeSignal;
      const path = await binary(); if (!path || (await status()).state !== 'ready') throw new Error('Connect Claude Code from the dock first.');
      const boardTools = context.messages.some(message => message.role === 'system' && message.toolsAdded?.some(tool => tool.name === 'board_apply'));
      const configPath = join(directory, `${randomUUID()}.mcp.json`);
      await atomicJson(configPath, boardTools ? configuration() : { mcpServers: {} });
      const system = context.messages.filter(message => message.role === 'system').map(message => [typeof message.content === 'string' ? message.content : message.content.map(part => part.text).join('\n'), ...Object.values(message.sections ?? {}).filter(value => value !== null)].join('\n')).join('\n');
      const prompt = context.messages.filter(message => message.role === 'user' || message.role === 'assistant').map(message => `${message.role}: ${typeof message.content === 'string' ? message.content : message.content.filter(part => part.type === 'text').map(part => part.text).join('\n')}`).join('\n\n');
      let result = '', assistant = '', streamError = false;
      try {
        await execute(path, ['-p', '--setting-sources', '', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', model.id, '--append-system-prompt', `${system}\nUse only the Aegis MCP tools. Pi tools such as start_part are unavailable here. The transcript contains the current board id.`, '--mcp-config', configPath, '--strict-mcp-config', '--tools', '', ...(boardTools ? ['--allowedTools', ...CLAUDE_TOOLS.map(name => `mcp__aegis__${name}`)] : [])], prompt, signal, 180000, line => {
          let value: unknown; try { value = JSON.parse(line); } catch { return; }
          const parsed = EventSchema.safeParse(value); if (!parsed.success) return;
          const event = parsed.data;
          if (event.type === 'stream_event' && event.event?.type === 'content_block_delta' && event.event.delta?.type === 'text_delta') delta(event.event.delta.text ?? '');
          if (event.type === 'assistant') assistant = event.message?.content.filter(part => part.type === 'text').map(part => part.text ?? '').join('') ?? assistant;
          if (event.type === 'result') { result = event.result ?? ''; streamError = event.is_error === true; }
        });
      } finally { await unlink(configPath).catch(() => {}); }
      if (streamError) throw new Error('Claude Code could not finish. Check your sign-in in Terminal and try again.');
      if (!block.text) delta(result || assistant);
      if (!block.text.trim()) throw new Error('Claude Code returned no text. Try again.');
      events.push({ type: 'text_end', contentIndex: 0, content: block.text, partial: reply }); events.push({ type: 'done', reason: 'stop', message: reply }); events.end(reply);
    }).catch(() => {
      reply.stopReason = options?.signal?.aborted ? 'aborted' : 'error'; reply.errorMessage = options?.signal?.aborted ? 'Claude Code was stopped.' : 'Claude Code could not finish. Check your sign-in in Terminal and try again.';
      events.push({ type: 'error', reason: reply.stopReason, error: reply }); events.end(reply);
    });
    return events;
  }
  const provider = createProvider({ id: 'claude', name: 'Claude Code', models: catalogue,
    // pi-ai calls ambient authorisation apiKey. This adapter accepts and stores no keys.
    auth: { apiKey: { name: 'Claude Code', resolve: async () => (await status()).connected ? { auth: {} } : undefined } },
    api: { stream, streamSimple: stream },
  });
  return { status, provider, models: catalogue, current: () => cached?.value };
}
