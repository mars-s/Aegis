export function previewUrl(value: string | URL): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only public HTTP and HTTPS links are supported');
  return url;
}
const decode = (text: string): string => text.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (m: string, v: string) => {
  const named: Record<string,string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  if (v[0] !== '#') return named[v.toLowerCase()] || m;
  const n = v[1]?.toLowerCase() === 'x' ? parseInt(v.slice(2), 16) : Number(v.slice(1));
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
});
export function parseLinkPreview(html: string, pageUrl: string, permittedHost: (host:string)=>boolean) {
  const meta = new Map<string,string>(); let favicon = '';
  // Tags are read as data, never inserted into an HTML document.
  for (const tag of html.match(/<(?:meta|link)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) || []) {
    const attrs: Record<string,string> = {};
    for (const a of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[(a[1] ?? '').toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (attrs.content && !meta.has(key)) meta.set(key, attrs.content);
    if (/\bicon\b/i.test(attrs.rel || '') && attrs.href && !favicon) favicon = attrs.href;
  }
  const safe = (raw: string): string => { try { const u = previewUrl(new URL(raw, pageUrl)); const ip = u.hostname.replace(/^\[|\]$/g, ''); return permittedHost(ip) ? u.href : ''; } catch { return ''; } };
  return {
    url: pageUrl, title: (meta.get('og:title') || decode(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '') || new URL(pageUrl).hostname).trim().slice(0, 500),
    description: (meta.get('og:description') || meta.get('description') || '').slice(0, 2000),
    image: meta.get('og:image') ? safe(meta.get('og:image') ?? '') : '', favicon: safe(favicon || '/favicon.ico'),
  };
}
