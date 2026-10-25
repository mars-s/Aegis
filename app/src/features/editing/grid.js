// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
export const gridShapes = [['dots', 'Dots'], ['cross', 'Crosses'], ['x', 'X marks'], ['heart', 'Hearts'], ['tri', 'Triangles'], ['square', 'Squares'], ['sparkle', 'Sparkles'], ['lines', 'Lines'], ['none', 'None']];
const paths = {
  cross: 'M-3.4-.75H-.75V-3.4H.75V-.75H3.4V.75H.75V3.4H-.75V.75H-3.4Z',
  x: 'M-3-2L-2-3 0-1 2-3 3-2 1 0 3 2 2 3 0 1-2 3-3 2-1 0Z',
  heart: 'M0 3.2C-1.4 2-3.7.6-3.7-1.3-3.7-3.5-1-4.2 0-2.3 1-4.2 3.7-3.5 3.7-1.3 3.7.6 1.4 2 0 3.2Z',
  tri: 'M0-2.7L3 2.5H-3Z', square: 'M-2.1-2.1H2.1V2.1H-2.1Z',
  sparkle: 'M0-3.6C.3-1.7 1.7-.3 3.6 0 1.7.3.3 1.7 0 3.6-.3 1.7-1.7.3-3.6 0-1.7-.3-.3-1.7 0-3.6Z',
};
let cache;
export function drawGridMotif(ctx, shape, x, y) {
  cache ??= Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, new Path2D(value)]));
  if (!cache[shape]) return false;
  ctx.save(); ctx.translate(x, y); ctx.fill(cache[shape]); ctx.restore(); return true;
}
