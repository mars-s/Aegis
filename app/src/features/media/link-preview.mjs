// Server-only metadata fetcher. Each connection uses the address checked before it connects.
import { lookup } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';
import http from 'node:http';
import https from 'node:https';
const blocked = new BlockList();
for (const [ip, bits] of [['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8], ['169.254.0.0',16], ['172.16.0.0',12], ['192.0.0.0',24], ['192.0.2.0',24], ['192.168.0.0',16], ['198.18.0.0',15], ['198.51.100.0',24], ['203.0.113.0',24], ['224.0.0.0',3]]) blocked.addSubnet(ip, bits, 'ipv4');
export function publicAddress(ip) {
  if (isIP(ip) === 4) return !blocked.check(ip, 'ipv4');
  // Restrict IPv6 to global unicast; exclude mapped IPv4, local, multicast and transition ranges.
  if (isIP(ip) !== 6 || !/^[23][0-9a-f]{3}:/i.test(ip)) return false;
  const deny = new BlockList();
  for (const [base, bits] of [['2001::',32], ['2001:db8::',32], ['2001:10::',28], ['2001:20::',28], ['2002::',16]]) deny.addSubnet(base, bits, 'ipv6');
  return !deny.check(ip, 'ipv6');
}
export function previewUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only public HTTP and HTTPS links are supported');
  return url;
}
const decode = text => text.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (m, v) => {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  if (v[0] !== '#') return named[v.toLowerCase()] || m;
  const n = v[1].toLowerCase() === 'x' ? parseInt(v.slice(2), 16) : Number(v.slice(1));
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
});
export function parsePreview(html, pageUrl) {
  const meta = new Map(); let favicon = '';
  // Tags are read as data, never inserted into an HTML document.
  for (const tag of html.match(/<(?:meta|link)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) || []) {
    const attrs = {};
    for (const a of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4]);
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (attrs.content && !meta.has(key)) meta.set(key, attrs.content);
    if (/\bicon\b/i.test(attrs.rel || '') && attrs.href && !favicon) favicon = attrs.href;
  }
  const safe = raw => { try { const u = previewUrl(new URL(raw, pageUrl)); const ip = u.hostname.replace(/^\[|\]$/g, ''); return isIP(ip) && !publicAddress(ip) ? '' : u.href; } catch { return ''; } };
  return {
    url: pageUrl, title: (meta.get('og:title') || decode(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '') || new URL(pageUrl).hostname).trim().slice(0, 500),
    description: (meta.get('og:description') || meta.get('description') || '').slice(0, 2000),
    image: meta.get('og:image') ? safe(meta.get('og:image')) : '', favicon: safe(favicon || '/favicon.ico'),
  };
}
export async function linkPreview(value, { resolve = lookup, transport, timeoutMs = 7000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    let url = previewUrl(value);
    for (let redirects = 0; redirects <= 4; redirects++) {
      signal.throwIfAborted();
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([
        resolve(host, { all: true, verbatim: true }),
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Preview timed out')), { once: true })),
      ]);
      if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('Private and loopback addresses are blocked');
      const address = addresses[0];
      const result = await new Promise((accept, reject) => {
        const request = transport || (url.protocol === 'https:' ? https.request : http.request);
        const req = request(url, {
          signal, method: 'GET', agent: false,
          headers: { 'user-agent': 'Aegis-Link-Preview/1.0', accept: 'text/html', 'accept-encoding': 'identity' },
          lookup: (_hostname, options, cb) => options.all ? cb(null, [address]) : cb(null, address.address, address.family),
        }, res => {
          if ([301,302,303,307,308].includes(res.statusCode)) { res.destroy(); accept({ redirect: res.headers.location }); return; }
          if (res.statusCode < 200 || res.statusCode >= 300) { res.destroy(); reject(new Error(`Page returned ${res.statusCode}`)); return; }
          if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(res.headers['content-type'] || '')) { res.destroy(); reject(new Error('The link is not an HTML page')); return; }
          const chunks = []; let size = 0;
          res.on('data', data => { size += data.length; if (size > 1024 * 1024) { res.destroy(new Error('Page exceeds the 1 MB preview limit')); } else chunks.push(data); });
          res.on('end', () => accept({ html: Buffer.concat(chunks).toString('utf8') }));
          res.on('error', reject);
        });
        req.on('error', reject); req.end();
      });
      if ('html' in result) return parsePreview(result.html, url.href);
      if (!result.redirect) throw new Error('Invalid redirect');
      url = previewUrl(new URL(result.redirect, url));
    }
    throw new Error('Too many redirects');
  } catch (error) { throw Object.assign(new Error(error.message), { status: 400 }); }
}
