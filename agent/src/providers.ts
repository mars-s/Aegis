import { z } from 'zod/v4';
import { JsonSchema, JsonRecordSchema } from '@aegis/domain/schema';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { appendFile } from 'node:fs/promises';
import { createModels } from '@earendil-works/pi-ai/models';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import type { FauxResponseFactory } from '@earendil-works/pi-ai/providers/faux';
import { atomicJson, readJson, errorMessage } from './files.js';
import type { HostLifetime } from './lifetime.js';

type CredentialStore = NonNullable<NonNullable<Parameters<typeof createModels>[0]>['credentials']>;
type Credential = NonNullable<Awaited<ReturnType<CredentialStore['read']>>>;
type AuthInteraction = Parameters<ReturnType<typeof createModels>['login']>[2];
type AuthEvent = Parameters<AuthInteraction['notify']>[0];
type AuthPrompt = Parameters<AuthInteraction['prompt']>[0];
const CredentialSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('api_key'), key: z.string().optional(), env: z.record(z.string(), z.string()).optional() }),
  z.object({ type: z.literal('oauth'), refresh: z.string(), access: z.string(), expires: z.number() }).catchall(z.unknown()),
]);
const CredentialMapSchema = z.record(z.string(), CredentialSchema.transform((credential): Credential => credential.type === 'oauth' ? credential : { type: 'api_key', ...(credential.key === undefined ? {} : { key: credential.key }), ...(credential.env === undefined ? {} : { env: credential.env }) }));
const CallSchema = z.tuple([z.string(), JsonRecordSchema]);
const CallsSchema = z.array(CallSchema);
const ScriptSchema = z.array(z.union([CallSchema, CallsSchema]));
export const ModelChoiceSchema = z.object({ provider: z.string(), modelId: z.string(), name: z.string().optional() });
export type ModelChoice = z.output<typeof ModelChoiceSchema>;
export const RewriteSchema = z.object({ text: z.unknown(), how: z.unknown().optional(), title: z.unknown().optional(), around: z.unknown().optional(), model: ModelChoiceSchema.optional() });
type RewriteInput = z.output<typeof RewriteSchema>;
interface Prompt { type: Exclude<AuthPrompt['type'], 'select'>; message: string; placeholder: string | undefined }
interface SignIn { outcome: { kind: 'idle' | 'pending' | 'connected' } | { kind: 'failed'; error: string }; events: AuthEvent[]; prompt: Prompt | null; answer: ((answer: string) => void) | null; abort: AbortController; started: number; job: Promise<void> | null; cancelled: boolean }
interface AuthState { connected: boolean; state: string; prompt: Prompt | null; error: string | null; link: string | null; progress: string | null; started: number | null }
class Credentials {
  private chain: Promise<unknown> = Promise.resolve();
  readonly path: string;
  constructor(path: string) { this.path = path; }
  async all() { return CredentialMapSchema.parse(await readJson(this.path, {})); }
  async read(id: string) { return (await this.all())[id]; }
  async list() { return Object.entries(await this.all()).map(([providerId, c]) => ({ providerId, type: c.type })); }
  modify(id: string, fn: Parameters<CredentialStore['modify']>[1]) {
    const task = this.chain.then(async () => { const all = await this.all(); const v = await fn(all[id]); if (v !== undefined) { all[id] = v; await atomicJson(this.path, all); } return all[id]; });
    this.chain = task.catch(() => {}); return task;
  }
  delete(id: string) {
    const task = this.chain.then(async () => { const all = await this.all(); delete all[id]; await atomicJson(this.path, all); });
    this.chain = task.catch(() => {}); return task;
  }
}
export async function createProviders({ data: DATA, device: DEVICE, broadcast, timing, lifetime }: { data: string; device: string; broadcast(event: unknown): void; timing(value: object): void; lifetime: HostLifetime }) {
const credentials = new Credentials(join(DATA, 'auth.json'));
const models = createModels({ credentials, authContext: { env: async () => undefined, fileExists: async () => false } });
models.setProvider(openaiProvider());
models.setProvider(anthropicProvider());
let fake: ReturnType<typeof fauxProvider> | null = null;
if (process.env.AEGIS_FAKE_MODEL) {
  // Checks only: a scripted local model, so tests never reach a provider.
  // It reads the board, then sends the batch written after "FAKE " in the brief, then says done.

  // AEGIS_FAKE_TPS streams scripted replies at a set token rate, so streaming previews can be checked.
  fake = fauxProvider({ provider: 'fake', models: [{ id: 'fake', name: 'Fake (checks only)' }], ...(Number(process.env.AEGIS_FAKE_TPS) > 0 ? { tokensPerSecond: Number(process.env.AEGIS_FAKE_TPS), tokenSize: { min: 3, max: 6 } } : {}) });
  const scripted = fake;
  const step: FauxResponseFactory = async (ctx, options) => {
    scripted.appendResponses([step]);
    // item 10: profile only sizes, so the harness proves context arrives on the first turn.
    timing({ kind: 'model', inputBytes: Buffer.byteLength(JSON.stringify(ctx.messages)), hasBoardSummary: JSON.stringify(ctx.messages).includes('Current board summary') });
    // Round 2 speed checks: opt-in capture of the actual fake-provider input, never live traffic.
    if (process.env.AEGIS_FAKE_CAPTURE_INPUT) await appendFile(process.env.AEGIS_FAKE_CAPTURE_INPUT, JSON.stringify(ctx) + '\n');
    // end item 10
    if (process.env.AEGIS_FAKE_DELAY_MS) await delay(Math.min(5000, Number(process.env.AEGIS_FAKE_DELAY_MS) || 0), undefined, options?.signal ? { signal: options.signal } : {});
    const msgs = ctx.messages;
    const brief = msgs.find(m => m.role === 'user'); const briefText = typeof brief?.content === 'string' ? brief.content : brief?.content?.find?.(c => c.type === 'text')?.text ?? '';
    const results = msgs.filter(m => m.role === 'toolResult').length;
    // FAKETOOLS [[name, args], ...]: call these tools in order (one per turn; a nested list runs together), then stop.
    const script = /FAKETOOLS (\[[\s\S]+\])$/.exec(briefText)?.[1];
    if (script) {
      const turns = ScriptSchema.parse(JSON.parse(script)); const turn = msgs.filter(m => m.role === 'assistant').length;
      if (turn >= turns.length) return fauxAssistantMessage('Done.');
      const current = turns[turn]; if (!current) return fauxAssistantMessage('Done.');
      const calls = typeof current[0] === 'string' ? [CallSchema.parse(current)] : CallsSchema.parse(current);
      return fauxAssistantMessage(calls.map(([name, args]) => fauxToolCall(name, args)), { stopReason: 'toolUse' });
    }
    // FAKEREPLY text: answer in conversation with exactly this text, for reply rendering checks.
    const said = /^FAKEREPLY ([\s\S]+)$/.exec(briefText)?.[1];
    if (said) return fauxAssistantMessage(said);
    const batch = /^FAKE ([\s\S]+)$/.exec(briefText)?.[1];
    if (!batch) return fauxAssistantMessage('Fake model: start the brief with FAKE and a JSON command list.');
    if (results === 0) return fauxAssistantMessage(fauxToolCall('board_read', {}), { stopReason: 'toolUse' });
    if (results === 1) return fauxAssistantMessage(fauxToolCall('board_apply', { commands: z.array(JsonSchema).parse(JSON.parse(batch)) }), { stopReason: 'toolUse' });
    return fauxAssistantMessage('Done: sorted the board.');
  };
  fake.setResponses([step]);
  // Real providers grow toolCall.arguments with each delta; the scripted model only sets them at the end.
  const { parseStreamingJson } = await import('@earendil-works/pi-ai');
  const streamFake = fake.provider.streamSimple.bind(fake.provider);
  fake.provider.streamSimple = (...args) => {
    const source = streamFake(...args), json = new Map<number, string>();
    const iterate = source[Symbol.asyncIterator].bind(source);
    source[Symbol.asyncIterator] = async function* () {
      for await (const event of { [Symbol.asyncIterator]: iterate }) {
        if (event.type === 'toolcall_start') json.set(event.contentIndex, '');
        if (event.type === 'toolcall_delta') {
          const text = (json.get(event.contentIndex) ?? '') + event.delta; json.set(event.contentIndex, text);
          const current = event.partial.content[event.contentIndex];
          if (current?.type === 'toolCall') {
            const block = { ...current, arguments: JsonRecordSchema.parse(parseStreamingJson(text)), partialJson: text };
            event.partial.content[event.contentIndex] = block;
          }
        }
        yield event;
      }
    };
    return source;
  };
  models.setProvider(fake.provider);
}

const signIns = new Map<string, SignIn>();
function signIn(provider: string) {
  if (!['openai', 'anthropic'].includes(provider)) throw new Error('provider must be openai or anthropic');
  // Starting again replaces an unfinished attempt, so a stale callback port is always released first.
  const previous = signIns.get(provider);
  if (previous?.job) { previous.cancelled = true; previous.abort.abort(); }
  const s: SignIn = { outcome: { kind: 'pending' }, events: [], prompt: null, answer: null, job: null, cancelled: false, abort: new AbortController(), started: Date.now() };
  signIns.set(provider, s);
  const timer = setTimeout(() => s.abort.abort(), 15 * 60 * 1000);
  const job = (previous?.job ?? Promise.resolve()).catch(() => {}).then(() => lifetime.run(signal => models.login(provider, 'oauth', {
    signal: AbortSignal.any([s.abort.signal, signal]),
    notify: e => { s.events.push(e); if (s.events.length > 12) s.events.shift(); broadcast({ type: 'auth', provider }); },
    prompt: p => {
      // Aegis runs on this Mac, so the browser can return to the local callback: no code to paste.
      if (p.type === 'select') return Promise.resolve(p.options.find(o => o.id === 'browser')?.id ?? p.options[0]?.id ?? '');
      return new Promise((resolve, reject) => {
        s.prompt = { type: p.type, message: p.message, placeholder: p.placeholder };
        s.answer = v => { s.prompt = null; s.answer = null; resolve(v); };
        (p.signal ?? s.abort.signal).addEventListener('abort', () => reject(new Error('Sign-in closed')), { once: true });
        broadcast({ type: 'auth', provider });
      });
    },
  }, { getDeviceId: () => DEVICE, agentName: 'Aegis' })))
    .then(() => { s.outcome = { kind: 'connected' }; })
    .catch(e => {
      s.outcome = s.abort.signal.aborted && s.cancelled ? { kind: 'idle' } : { kind: 'failed', error: friendlyAuthError(provider, e) };
      if (s.outcome.kind === 'failed') process.stderr.write(JSON.stringify({ aegis: 'auth-error', provider, message: errorMessage(e) }) + '\n');
    })
    .finally(() => { clearTimeout(timer); s.prompt = null; s.answer = null; if (s.job === job) s.job = null; broadcast({ type: 'auth', provider }); });
  s.job = job;
}
function cancelSignIn(provider: string) {
  const s = signIns.get(provider);
  if (s?.job) { s.cancelled = true; s.abort.abort(); }
}
function friendlyAuthError(provider: string, e: unknown) {
  const m = errorMessage(e);
  if (/aborted|closed|cancel/i.test(m)) return 'Sign-in timed out. Try again.';
  if (/in use|EADDRINUSE/i.test(m)) return 'Another sign-in (Codex or Pi) is holding the login port. Finish or close it, then try again.';
  if (/state mismatch/i.test(m)) return 'That link belonged to an older attempt. Try again and use the newest browser tab.';
  if (/callback URL|redirect URL|authorization code/i.test(m)) return m;
  return `${provider === 'openai' ? 'ChatGPT' : 'Claude'} sign-in failed: ${m.slice(0, 200)}`;
}
async function authState() {
  const out: Record<string, AuthState> = {};
  for (const p of ['openai', 'anthropic']) {
    const s = signIns.get(p);
    out[p] = { connected: !!(await credentials.read(p)), state: s?.outcome.kind ?? 'idle', prompt: s?.prompt ?? null, error: s?.outcome.kind === 'failed' ? s.outcome.error : null,
      link: s?.events.findLast(e => e.type === 'auth_url')?.url ?? null, progress: s?.events.findLast(e => e.type === 'progress')?.message ?? null, started: s?.started ?? null };
  }
  return out;
}
function modelList() {
  // Current families only, newest first: GPT-6.x and the latest Claude lines.
  const pick = (provider: string, re: RegExp) => models.getModels(provider).filter(m => re.test(m.id)).map(m => ({ provider, modelId: m.id, name: m.name })).reverse();
  // item 10: the first connected model is the UI default. Keep saved, explicit choices intact.
  const current = [...pick('openai', /^gpt-6/), ...pick('anthropic', /^claude-(opus|sonnet|haiku)-5|^claude-fable-5/)];
  const speedRank = (m: ModelChoice) => /luna/.test(m.modelId) ? 0 : /haiku/.test(m.modelId) ? 1 : 2;
  return [...(fake ? [{ provider: 'fake', modelId: 'fake', name: 'Fake' }] : []), ...current.sort((a, b) => speedRank(a) - speedRank(b))];
  // end item 10
}

// ---------- one-shot text rewrite for the document editor (no board access, no tools) ----------
async function rewriteText({ text: input, how, title, around, model }: RewriteInput) {
  if (typeof input !== 'string' || !input.trim()) throw Object.assign(new Error('nothing to rewrite'), { status: 400 });
  if (input.length > 12000) throw Object.assign(new Error('select fewer than 12,000 characters'), { status: 400 });
  const list = modelList();
  const ready = [];
  for (const m of list) if (m.provider === 'fake' || (await credentials.read(m.provider))) ready.push(m);
  const choice = (model && ready.find(m => m.provider === model.provider && m.modelId === model.modelId)) || ready[0];
  if (!choice) throw Object.assign(new Error('Sign in to ChatGPT or Claude in Settings first'), { status: 400 });
  if (choice.provider === 'fake') return { text: `${input} (rewritten)` };
  const target = models.getModel(choice.provider, choice.modelId);
  if (!target) throw new Error('The selected model is no longer available');
  const reply = await models.completeSimple(target, {
    systemPrompt: 'You rewrite a passage from the person\'s document. Return only the rewritten passage: no preamble, no quotes, no notes. Keep the meaning and the language. Australian English unless the passage is in another language. Never use em dashes.',
    messages: [{ role: 'user', timestamp: Date.now(), content: `Document: ${String(title || 'Untitled').slice(0, 200)}\nInstruction: ${String(how || 'Improve the writing').slice(0, 500)}\n\nText around it (context only, do not return it):\n${String(around || '').slice(0, 3000)}\n\nPassage to rewrite:\n${input}` }],
  });
  const out = (reply.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  if (!out) throw new Error(reply.errorMessage || 'the model returned nothing');
  return { text: out, model: choice.modelId };
}


  lifetime.add(() => { for (const state of signIns.values()) state.abort.abort(); });
  return { credentials, models, fake, modelList, signIn, cancelSignIn, authState, rewriteText,
    answer(provider: string, answer: string): void {
      const current = signIns.get(provider);
      if (!current?.answer || !answer.trim()) throw new Error('no sign-in is waiting for an answer');
      current.answer(answer.trim());
    },
  };
}
