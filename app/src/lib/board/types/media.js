import { registerCardType } from '../commands.js';
registerCardType('swatch', { size: [160, 160], guide: 'one colour chip. props {hex: "#rrggbb", label}.' });
registerCardType('audio', { size: [340, 240], guide: 'a recording the person made. Read only for agents.' });
registerCardType('spotify', { size: [340, 192], guide: 'a Spotify player. url is an open.spotify.com track, album or playlist link.' });
