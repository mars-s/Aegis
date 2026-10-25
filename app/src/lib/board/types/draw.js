import { registerCardType } from '../commands.js';

const GUIDES = {
  ink: 'freehand pen strokes the person drew. Read only for agents.',
  shape: 'a drawn shape that can hold text. props {shape: rect|circle|tri|diamond|star|heart|arrow|hexagon, fill: "#rrggbb"|"none", stroke: "ink"|"#rrggbb", sw: line width 1 to 12}. text sits inside.',
  path: 'a vector line or outline. props {points: [{x, y}] in the card\'s own pixels, ow: w, oh: h, closed, stroke, sw, fill}.',
  stamp: 'one emoji sticker. props {emoji}.',
};
for (const [type, size] of Object.entries({ ink: [240, 160], shape: [180, 140], path: [240, 160], stamp: [80, 80] })) {
  registerCardType(type, { size, guide: GUIDES[type] });
}
