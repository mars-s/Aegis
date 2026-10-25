// Shared with the local host. Generated code executes only in a sandboxed document served by that host.
export const SANDBOX_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none'";
// The sandbox directive needs an HTTP header; browsers ignore it in a meta policy.
export const SANDBOX_HEADER_CSP = SANDBOX_CSP + '; sandbox allow-scripts';
export const THEME_KEYS = ['--canvas', '--card', '--strip', '--inset', '--raised', '--pill', '--line', '--line-strong', '--edge-top', '--text', '--ink-2', '--muted', '--faint', '--data', '--data-soft', '--font', '--r-win', '--r-menu', '--r-inset', '--ease-out', '--ease-drawer'];

// JSON text is the only state boundary. Keep this function self-contained for the isolated bootstrap.
export function parseHtmlState(value) {
  if (typeof value !== 'string' || value.length > 65536 || new TextEncoder().encode(value).length > 65536) return null;
  try {
    const state = JSON.parse(value);
    const record = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => keys.includes(k));
    const index = n => Number.isSafeInteger(n) && n >= 0 && n < 1000;
    if (!record(state, ['version', 'controls', 'text', 'custom']) || state.version !== 1 || !Array.isArray(state.controls) || !Array.isArray(state.text) || state.controls.length > 1000 || state.text.length > 1000) return null;
    if (!state.controls.every(c => record(c, ['index', 'tag', 'type', 'value', 'checked', 'selected']) && index(c.index) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(c.tag) && typeof c.type === 'string' && !['password', 'file'].includes(c.type) && typeof c.value === 'string' && typeof c.checked === 'boolean' && Array.isArray(c.selected) && c.selected.every(index))) return null;
    if (!state.text.every(t => record(t, ['index', 'text']) && index(t.index) && typeof t.text === 'string')) return null;
    // JSON.parse accepts numeric overflow. Reject it and bound nesting before widgets use custom state.
    const json = (v, depth) => depth <= 32 && (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'object' && Object.values(v).every(item => json(item, depth + 1))));
    return !Object.hasOwn(state, 'custom') || json(state.custom, 0) ? state : null;
  } catch { return null; }
}

export function sandboxDocument(data, channel, theme, font, motionOff = false) {
  const scriptText = text => text.replace(/<\/script/gi, '<\\/script');
  const encodedChannel = JSON.stringify(channel).replace(/</g, '\\u003c');
  const bootstrap = `(() => {
    const send = parent.postMessage.bind(parent);
    const themeKeys = ${JSON.stringify(THEME_KEYS)};
    const parseState = ${parseHtmlState.toString()};
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
      if (event.source !== parent || (parentOrigin !== null && event.origin !== parentOrigin) || !data || data.channel !== ${encodedChannel}) return;
      if (data.type === 'aegis:html-restore') {
        if (data.state !== null && !parseState(data.state)) return;
        if (data.state !== lastState) restore(data.state ?? defaultState);
        // Save the first live defaults too, including generated script state before any interaction.
        if (data.state === null && lastState) send({ type: 'aegis:html-state', channel: ${encodedChannel}, state: lastState }, '*');
        document.documentElement.style.removeProperty('visibility');
        return;
      }
      if (data.type !== 'aegis:html-preferences' || typeof data.motionOff !== 'boolean' || !data.theme || typeof data.theme !== 'object' || !themeKeys.every(key => typeof data.theme[key] === 'string')) return;
      for (const key of themeKeys) document.documentElement.style.setProperty(key, data.theme[key]);
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
<style>${font ? `@font-face{font-family:'Inter Variable';font-style:normal;font-weight:100 900;src:url('${font}') format('woff2')}` : ''} :root{color-scheme:dark;${theme}} *{box-sizing:border-box}html{background:var(--card);color:var(--text);font:14px/1.45 var(--font);font-variant-numeric:tabular-nums}body{margin:0;display:flow-root;min-height:80px;overflow-wrap:anywhere}button,input,textarea{font:inherit;color:inherit}button{background:var(--inset);border:1px solid var(--line-strong);border-radius:6px;padding:8px 12px}input,textarea{background:var(--inset);border:1px solid var(--line-strong);border-radius:6px;padding:8px;caret-color:var(--data)}:focus-visible{outline:1.5px solid var(--text);outline-offset:2px}::selection{background:var(--data-soft)}</style>
<script>${bootstrap}</script><style>${data.css}\n@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}html.motion-off,html.motion-off *,html.motion-off *::before,html.motion-off *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}</style></head><body>${data.html}<script>${scriptText(data.js)}</script></body></html>`;
}

// Sandboxed frames have an opaque origin, serialised as "null". Sibling frames are not trusted.
export function reportedHeight(event, source, channel) {
  const d = event.data;
  if (!source || event.source !== source || event.origin !== 'null' || !d || d.type !== 'aegis:html-height' || d.channel !== channel || typeof d.height !== 'number' || !Number.isFinite(d.height)) return null;
  return Math.max(80, Math.min(2000, Math.ceil(d.height)));
}

export function reportedEscape(event, source, channel) {
  return !!source && event.source === source && event.origin === 'null' && event.data?.type === 'aegis:html-escape' && event.data.channel === channel;
}

export function reportedState(event, source, channel) {
  const d = event.data;
  return source && event.source === source && event.origin === 'null' && d?.type === 'aegis:html-state' && d.channel === channel && Object.keys(d).every(key => ['type', 'channel', 'state'].includes(key)) && parseHtmlState(d.state) ? d.state : null;
}
