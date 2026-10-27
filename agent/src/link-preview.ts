import {parseLinkPreview,previewUrl} from '@aegis/domain/link-preview';
export {previewUrl} from '@aegis/domain/link-preview';
// Server-only metadata fetcher. Each connection uses the address checked before it connects.
import { lookup } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';
import http from 'node:http';
import https from 'node:https';
const blocked = new BlockList();
for (const [ip, bits] of [['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8], ['169.254.0.0',16], ['172.16.0.0',12], ['192.0.0.0',24], ['192.0.2.0',24], ['192.168.0.0',16], ['198.18.0.0',15], ['198.51.100.0',24], ['203.0.113.0',24], ['224.0.0.0',3]] as const) blocked.addSubnet(ip, bits, 'ipv4');
export function publicAddress(ip: string): boolean {
  if (isIP(ip) === 4) return !blocked.check(ip, 'ipv4');
  // Restrict IPv6 to global unicast; exclude mapped IPv4, local, multicast and transition ranges.
  if (isIP(ip) !== 6 || !/^[23][0-9a-f]{3}:/i.test(ip)) return false;
  const deny = new BlockList();
  for (const [base, bits] of [['2001::',32], ['2001:db8::',32], ['2001:10::',28], ['2001:20::',28], ['2002::',16]] as const) deny.addSubnet(base, bits, 'ipv6');
  return !deny.check(ip, 'ipv6');
}

export const parsePreview = (html: string, pageUrl: string) => parseLinkPreview(html,pageUrl,host=>!isIP(host)||publicAddress(host));
export async function linkPreview(value: string | URL, { resolve = lookup, transport, timeoutMs = 7000 }: PreviewOptions = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    let url = previewUrl(value);
    for (let redirects = 0; redirects <= 4; redirects++) {
      signal.throwIfAborted();
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([
        resolve(host, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('Preview timed out')), { once: true })),
      ]);
      if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('Private and loopback addresses are blocked');
      const address = addresses[0];
      if (!address) throw new Error('Private and loopback addresses are blocked');
      const result = await new Promise<PreviewResult>((accept, reject) => {
        const request = transport || (url.protocol === 'https:' ? https.request : http.request);
        const req = request(url, {
          signal, method: 'GET', agent: false,
          headers: { 'user-agent': 'Aegis-Link-Preview/1.0', accept: 'text/html', 'accept-encoding': 'identity' },
          lookup: (_hostname, options, cb) => options.all ? cb(null, [address]) : cb(null, address.address, address.family),
        }, res => {
          if ([301,302,303,307,308].includes(res.statusCode ?? 0)) { res.destroy(); accept({ redirect: res.headers.location }); return; }
          if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) { res.destroy(); reject(new Error(`Page returned ${res.statusCode}`)); return; }
          if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(res.headers['content-type'] || '')) { res.destroy(); reject(new Error('The link is not an HTML page')); return; }
          const chunks: Buffer[] = []; let size = 0;
          res.on('data', (value: unknown) => { const data = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : ''); size += data.length; if (size > 1024 * 1024) { res.destroy(new Error('Page exceeds the 1 MB preview limit')); } else chunks.push(data); });
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
  } catch (error) { throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), { status: 400 }); }
}

interface PreviewOptions {resolve?: (hostname:string,options:{all:true;verbatim:true})=>Promise<{address:string;family:number}[]>;transport?:typeof http.request;timeoutMs?:number;}
type PreviewResult={html:string}|{redirect:string|undefined};
