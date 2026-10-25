// Shared with the local host. Generated code executes only in a sandboxed document served by that host.
export const SANDBOX_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none'";
// The sandbox directive needs an HTTP header; browsers ignore it in a meta policy.
export const SANDBOX_HEADER_CSP = SANDBOX_CSP + '; sandbox allow-scripts';
export const THEME_KEYS = ['--canvas', '--card', '--strip', '--inset', '--raised', '--pill', '--line', '--line-strong', '--edge-top', '--text', '--ink-2', '--muted', '--faint', '--data', '--data-soft', '--font', '--r-win', '--r-menu', '--r-inset', '--ease-out', '--ease-drawer'];

export function sandboxDocument(data, channel, theme, font, motionOff = false) {
  const scriptText = text => text.replace(/<\/script/gi, '<\\/script');
  const encodedChannel = JSON.stringify(channel).replace(/</g, '\\u003c');
  const bootstrap = `(() => {
    const send = parent.postMessage.bind(parent);
    const themeKeys = ${JSON.stringify(THEME_KEYS)};
    addEventListener('message', event => {
      const data = event.data;
      if (event.source !== parent || !data || data.type !== 'aegis:html-preferences' || data.channel !== ${encodedChannel} || typeof data.motionOff !== 'boolean' || !data.theme || typeof data.theme !== 'object' || !themeKeys.every(key => typeof data.theme[key] === 'string')) return;
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
