// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
export function spotifyOf(value: string) {
  const uri = /^spotify:(track|album|playlist|episode|show|artist):([a-z0-9]{10,40})$/i.exec(value.trim());
  if (uri?.[1] && uri[2]) return { kind: uri[1].toLowerCase(), sid: uri[2] };
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'open.spotify.com') return null;
    const match = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([a-z0-9]{10,40})\/?$/i.exec(url.pathname);
    return match?.[1] && match[2] ? { kind: match[1].toLowerCase(), sid: match[2] } : null;
  } catch { return null; }
}
export function normaliseLink(value: string): string {
  const spotify = spotifyOf(value); if (spotify) return `https://open.spotify.com/${spotify.kind}/${spotify.sid}`;
  const url = new URL(/^[a-z][\w+.-]*:/i.test(value) ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS link');
  return url.href;
}
export const spotifyHeight = (kind: string): number => (['track', 'episode'].includes(kind) ? 152 : 352) + 76;
