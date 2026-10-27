import { z } from 'zod/v4';
import { parseHtmlState } from '@aegis/domain/html-state';
import type { ObjectData } from '@aegis/domain/objects';
// Shared with the local host. Generated code executes only in a sandboxed document served by that host.
import { themeCss, themeHtml } from './html-theme.js';
export const SANDBOX_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none'";
// The sandbox directive needs an HTTP header; browsers ignore it in a meta policy.
export const SANDBOX_HEADER_CSP = SANDBOX_CSP + '; sandbox allow-scripts';
export const THEME_KEYS = ['--canvas', '--card', '--strip', '--inset', '--raised', '--pill', '--line', '--line-strong', '--edge-top', '--text', '--ink-2', '--muted', '--faint', '--hover', '--press', '--data', '--data-soft', '--danger', '--warn', '--ok', '--mono', '--font', '--r-win', '--r-menu', '--r-inset', '--ease-out', '--ease-drawer'];

// JSON text is the only state boundary. Keep this function self-contained for the isolated bootstrap.
export {parseHtmlState} from '@aegis/domain/html-state';
const PARSE_STATE_SCRIPT = "function parseHtmlState(value) {\n  if (typeof value !== 'string' || value.length > 65536 || new TextEncoder().encode(value).length > 65536) return null;\n  try {\n    const state = JSON.parse(value);\n    const record = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => keys.includes(k));\n    const index = n => Number.isSafeInteger(n) && n >= 0 && n < 1000;\n    if (!record(state, ['version', 'controls', 'text', 'custom']) || state.version !== 1 || !Array.isArray(state.controls) || !Array.isArray(state.text) || state.controls.length > 1000 || state.text.length > 1000) return null;\n    if (!state.controls.every(c => record(c, ['index', 'tag', 'type', 'value', 'checked', 'selected']) && index(c.index) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(c.tag) && typeof c.type === 'string' && !['password', 'file'].includes(c.type) && typeof c.value === 'string' && typeof c.checked === 'boolean' && Array.isArray(c.selected) && c.selected.every(index))) return null;\n    if (!state.text.every(t => record(t, ['index', 'text']) && index(t.index) && typeof t.text === 'string')) return null;\n    // JSON.parse accepts numeric overflow. Reject it and bound nesting before widgets use custom state.\n    const json = (v, depth) => depth <= 32 && (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'object' && Object.values(v).every(item => json(item, depth + 1))));\n    return !Object.hasOwn(state, 'custom') || json(state.custom, 0) ? state : null;\n  } catch { return null; }\n}";


// The base look every widget starts from. Generated markup can stay unstyled: headings, text, controls, tables,
// meters and SVG all inherit the board's type, spacing and palette.
const BASE_CSS = `*,*::before,*::after{box-sizing:border-box}
html{background:var(--card);color:var(--text);font:14px/1.5 var(--font);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;accent-color:var(--data)}
body{margin:0;padding:16px;display:flow-root;min-height:80px;overflow-wrap:anywhere}
h1,h2,h3,h4{margin:0 0 .5em;color:var(--text);font-weight:600;letter-spacing:-.015em;line-height:1.2;text-wrap:balance}
h1{font-size:22px}h2{font-size:18px}h3{font-size:15px}h4{font-size:13px;color:var(--muted)}
p{margin:0 0 .75em;color:var(--ink-2);text-wrap:pretty}small,figcaption,.muted{color:var(--muted);font-size:12px}
a{color:var(--text);text-underline-offset:2px}strong,b{color:var(--text);font-weight:600}
hr{border:0;border-top:1px solid var(--line);margin:16px 0}
code,kbd,pre,samp{font:12.5px/1.5 var(--mono)}code{padding:1px 4px;border-radius:4px;background:var(--hover)}pre{margin:0 0 .75em;padding:10px 12px;border-radius:8px;background:var(--inset);overflow:auto}
ul,ol{margin:0 0 .75em;padding-left:1.25em;color:var(--ink-2)}li+li{margin-top:2px}
label{display:block;color:var(--muted);font-size:12px}label:has(input,select,textarea){display:grid;gap:6px}label:has(>input[type=checkbox],>input[type=radio]){display:flex;align-items:center;gap:8px;color:var(--ink-2);font-size:13px}
button,input,select,textarea{font:inherit;color:inherit}
button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:6px 12px;border:1px solid var(--line-strong);border-radius:7px;background:var(--inset);color:var(--text);font-size:13px;font-weight:500;cursor:pointer;transition:background-color 120ms var(--ease-out),border-color 120ms var(--ease-out),transform 120ms var(--ease-out)}
button:hover{background:var(--press)}button:active{transform:scale(.97)}button:disabled{opacity:.45;cursor:default}
button[aria-pressed=true],button[aria-selected=true],button.active,button.selected,button.primary,button[type=submit]{background:var(--text);border-color:var(--text);color:var(--card)}
input:not([type=range],[type=checkbox],[type=radio],[type=color]),select,textarea{width:100%;min-height:32px;padding:6px 9px;border:1px solid var(--line-strong);border-radius:7px;background:var(--inset);color:var(--text);caret-color:var(--data)}
input[type=number]{width:auto;max-width:9ch}textarea{min-height:72px;resize:vertical}
input:focus-visible,select:focus-visible,textarea:focus-visible{outline:none;border-color:var(--data);box-shadow:0 0 0 3px var(--data-soft)}
input[type=range]{width:100%;height:18px;margin:4px 0;background:transparent;-webkit-appearance:none;appearance:none}
input[type=range]::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:var(--line-strong)}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;margin-top:-5.5px;border-radius:50%;background:var(--text);border:0;box-shadow:0 0 0 4px var(--data-soft)}
input[type=range]::-moz-range-track{height:3px;border-radius:2px;background:var(--line-strong)}input[type=range]::-moz-range-thumb{width:14px;height:14px;border:0;border-radius:50%;background:var(--text)}
progress,meter{width:100%;height:4px;border:0;border-radius:2px;background:var(--line);overflow:hidden;-webkit-appearance:none;appearance:none}
progress::-webkit-progress-bar,meter::-webkit-meter-bar{background:var(--line);border:0;border-radius:2px}
progress::-webkit-progress-value,meter::-webkit-meter-optimum-value{background:var(--data);border-radius:2px}
progress::-moz-progress-bar{background:var(--data)}
output{display:block;color:var(--text);font-size:28px;font-weight:600;letter-spacing:-.02em;line-height:1.15}
table{width:100%;border-collapse:collapse;font-size:13px}th{color:var(--muted);font-weight:500;text-align:left}th,td{padding:7px 8px;border-bottom:1px solid var(--line)}td{color:var(--ink-2)}
fieldset{margin:0 0 12px;padding:10px 12px;border:1px solid var(--line);border-radius:8px}legend{padding:0 4px;color:var(--muted);font-size:12px}
details{border-top:1px solid var(--line);padding:8px 0}summary{cursor:pointer;color:var(--ink-2)}
svg{max-width:100%;overflow:visible}svg text{fill:var(--muted);font:11px var(--font)}
:focus-visible{outline:1.5px solid var(--text);outline-offset:2px}::selection{background:var(--data-soft)}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:var(--line-strong);border-radius:4px}`;

export function sandboxDocument(data: ObjectData['html'] & {parentOrigin?:string}, channel: string, theme: string, font: string, motionOff = false, acknowledgeSnapshots = false): string {
  const scriptText = (text: string) => text.replace(/<\/script/gi, '<\\/script');
  const encodedChannel = JSON.stringify(channel).replace(/</g, '\\u003c');
  const bootstrap = `(() => {
    const send = parent.postMessage.bind(parent);
    const themeKeys = ${JSON.stringify(THEME_KEYS)};
    const parseState = ${PARSE_STATE_SCRIPT};
    const initial = ${JSON.stringify(data.state ?? null).replace(/</g, '\\u003c')};
    const parentOrigin = ${JSON.stringify(data.parentOrigin ?? null).replace(/</g, '\\u003c')};
    let lastState, defaultState, restoring = false, loaded = false;
    document.documentElement.style.visibility = 'hidden';
    const initialState = parseState(initial);
    if (initialState && Object.hasOwn(initialState, 'custom')) window.aegisState = initialState.custom;
    const controls = () => [...document.querySelectorAll('input,textarea,select')].filter(el => !['password', 'file'].includes(el.type));
    const snapshot = () => {
      try {
        const state = { version: 1, controls: controls().map((el, index) => ({ index, tag: el.tagName, type: el.type, value: el.value, checked: !!el.checked, selected: el.tagName === 'SELECT' ? [...el.options].flatMap((option, i) => option.selected ? [i] : []) : [] })), text: [...document.querySelectorAll('[data-aegis-state]')].map((el, index) => ({ index, text: el.textContent })) };
        if (window.aegisState !== undefined) state.custom = window.aegisState;
        const value = JSON.stringify(state);
        return parseState(value) ? value : null;
      } catch { return null; }
    };
    const restore = value => {
      const state = parseState(value);
      if (!state) return;
      restoring = true;
      try {
        if (Object.hasOwn(state, 'custom')) window.aegisState = structuredClone(state.custom);
        else delete window.aegisState;
        const fields = controls(), changed = [];
        for (const saved of state.controls) {
          const el = fields[saved.index];
          if (!el || el.tagName !== saved.tag || el.type !== saved.type) continue;
          if (el.value === saved.value && !!el.checked === saved.checked && (el.tagName !== 'SELECT' || [...el.options].every((option, i) => option.selected === saved.selected.includes(i)))) continue;
          el.value = saved.value;
          if (el.tagName === 'INPUT') el.checked = saved.checked;
          if (el.tagName === 'SELECT') [...el.options].forEach((option, i) => option.selected = saved.selected.includes(i));
          changed.push(el);
        }
        // Set every field first so calculations see a consistent snapshot.
        for (const el of changed) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
        const texts = document.querySelectorAll('[data-aegis-state]');
        for (const saved of state.text) if (texts[saved.index] && texts[saved.index].textContent !== saved.text) texts[saved.index].textContent = saved.text;
        if (Object.hasOwn(state, 'custom')) window.aegisState = state.custom;
        dispatchEvent(new Event('aegis:restore'));
      } finally { lastState = snapshot(); restoring = false; }
    };
    let stateQueued = false;
    const queueState = () => {
      if (restoring || !loaded || stateQueued) return;
      stateQueued = true;
      // Run after the whole event dispatch, including widget handlers that only change script state.
      setTimeout(() => {
        stateQueued = false;
        const state = snapshot();
        if (state && state !== lastState) { lastState = state; send({ type: 'aegis:html-state', channel: ${encodedChannel}, state }, '*'); }
      }, 0);
    };
    addEventListener('message', event => {
      const data = event.data;
      if (event.source !== parent || (parentOrigin !== null && event.origin !== parentOrigin) || !data || data.channel !== ${encodedChannel}) return;${acknowledgeSnapshots ? `
      if (data.type === 'aegis:html-snapshot') {
        if (Object.keys(data).some(key => !['type', 'channel', 'requestId'].includes(key)) || typeof data.requestId !== 'string' || !data.requestId || data.requestId.length > 128) return;
        const requestId = data.requestId;
        // Capture after queued event tasks, including script-only state updates.
        setTimeout(() => {
          const state = loaded ? snapshot() : null;
          const result = !loaded ? { kind: 'refused', reason: 'not-ready' } : state === null ? { kind: 'refused', reason: 'invalid-state' } : { kind: 'ok', state };
          send({ type: 'aegis:html-snapshot-result', channel: ${encodedChannel}, requestId, ...result }, '*');
        }, 0);
        return;
      }` : ''}
      if (data.type === 'aegis:html-restore') {
        if (data.state !== null && !parseState(data.state)) return;
        if (data.state !== lastState) restore(data.state ?? defaultState);
        // Save the first live defaults too, including generated script state before any interaction.
        if (data.state === null && lastState) send({ type: 'aegis:html-initial-state', channel: ${encodedChannel}, state: lastState }, '*');
        document.documentElement.style.removeProperty('visibility');
        return;
      }
      if (data.type !== 'aegis:html-preferences' || typeof data.motionOff !== 'boolean' || !data.theme || typeof data.theme !== 'object' || !themeKeys.every(key => typeof data.theme[key] === 'string')) return;
      for (const key of themeKeys) document.documentElement.style.setProperty(key, data.theme[key]);
      if (data.scheme === 'light' || data.scheme === 'dark') document.documentElement.style.colorScheme = data.scheme;
      document.documentElement.classList.toggle('motion-off', data.motionOff);
    });
    let last = 0, queued = false;
    const report = () => {
      queued = false;
      const height = Math.max(80, Math.min(2000, Math.ceil(document.body.getBoundingClientRect().height)));
      if (height !== last) { last = height; send({ type: 'aegis:html-height', channel: ${encodedChannel}, height }, '*'); }
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(report); } };
    addEventListener('DOMContentLoaded', () => {
      defaultState = snapshot();
      restore(initial);
      lastState = snapshot();
      loaded = true;
      for (const type of ['input', 'change', 'click', 'aegis:statechange']) addEventListener(type, queueState, true);
      new MutationObserver(queueState).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      new ResizeObserver(queue).observe(document.body);
      new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      document.fonts.ready.then(queue);
      queue();
    }, { once: true });
    addEventListener('load', queue);
    addEventListener('keydown', event => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault(); send({ type: 'aegis:html-escape', channel: ${encodedChannel} }, '*');
      }
    });
  })();`;
  // The trusted CSP comes first. A later policy in agent HTML can only add restrictions.
  return `<!doctype html><html lang="en-AU"${motionOff ? ' class="motion-off"' : ''}><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${font ? `@font-face{font-family:'Inter Variable';font-style:normal;font-weight:100 900;src:url('${font}') format('woff2')}` : ''} :root{color-scheme:light dark;${theme}}${BASE_CSS}</style>
<script>${bootstrap}</script><style>${themeCss(data.css)}\n@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}html.motion-off,html.motion-off *,html.motion-off *::before,html.motion-off *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}</style></head><body>${themeHtml(data.html, data.css)}<script>${scriptText(data.js)}</script></body></html>`;
}

// Sandboxed frames have an opaque origin. Source and channel are capabilities.
interface SandboxMessage {readonly data:unknown;readonly source:unknown;readonly origin:string;}
const HeightSchema=z.object({type:z.literal('aegis:html-height'),channel:z.string(),height:z.number()});
const EscapeSchema=z.object({type:z.literal('aegis:html-escape'),channel:z.string()});
const StateMessageSchema=z.strictObject({type:z.string(),channel:z.string(),state:z.string()});
export function reportedHeight(event:SandboxMessage,source:unknown,channel:string):number|null {
  if(!source || event.source !== source || event.origin !== 'null') return null;
  const parsed=HeightSchema.safeParse(event.data);
  if(!parsed.success || parsed.data.channel !== channel) return null;
  return Math.max(80,Math.min(2000,Math.ceil(parsed.data.height)));
}
export function reportedEscape(event:SandboxMessage,source:unknown,channel:string):boolean {
  const parsed=EscapeSchema.safeParse(event.data);
  return !!source && event.source === source && event.origin === 'null' && parsed.success && parsed.data.channel === channel;
}
export function reportedState(event:SandboxMessage,source:unknown,channel:string,type='aegis:html-state'):string|null {
  if(!source || event.source !== source || event.origin !== 'null') return null;
  const parsed=StateMessageSchema.safeParse(event.data);
  return parsed.success && parsed.data.type === type && parsed.data.channel === channel && parseHtmlState(parsed.data.state) ? parsed.data.state : null;
}

const SnapshotMessageSchema = z.discriminatedUnion('kind', [
  z.strictObject({ type: z.literal('aegis:html-snapshot-result'), channel: z.string(), requestId: z.string().min(1).max(128), kind: z.literal('ok'), state: z.string() }),
  z.strictObject({ type: z.literal('aegis:html-snapshot-result'), channel: z.string(), requestId: z.string().min(1).max(128), kind: z.literal('refused'), reason: z.enum(['not-ready', 'invalid-state']) }),
]);
export function reportedSnapshot(event: SandboxMessage, source: unknown, channel: string, requestId: string) {
  if (!source || event.source !== source || event.origin !== 'null') return null;
  const parsed = SnapshotMessageSchema.safeParse(event.data);
  if (!parsed.success || parsed.data.channel !== channel || parsed.data.requestId !== requestId) return null;
  if (parsed.data.kind === 'ok' && !parseHtmlState(parsed.data.state)) return null;
  return parsed.data;
}
