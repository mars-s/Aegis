import { registerCardType } from '../commands.js';

// Wireframe pieces: put them inside a frame and set parent to the frame id so they move with the screen.
const GUIDES = {
  frame: 'a device screen for wireframes. text is its name; w and h: iPhone 393x852, Android 412x915, iPad 834x1194, Desktop 1440x1024. props {device, radius, fill: "#ffffff"}.',
  box: 'a wireframe block (button, image slot, bar). props {fill: "#rrggbb", radius, sw: border width, stroke: "#rrggbb", opacity 0 to 1, img: image label, placeholder: true for a local pattern labelled as a placeholder, src: actual image URL}. parent: the frame id.',
  text: 'wireframe text. text is the words; props {font: "Arial", size: px, weight: 400|500|700, ink: "#rrggbb", align: left|center|right, hollow: true for outlined letters, stroke: outline colour, sw: outline width}. parent: the frame id.',
  icon: 'a Material icon. props {name: a Material Symbols name such as search, home, menu, person, settings, star; ink: "#rrggbb"}. Square w and h. parent: the frame id.',
  font: 'a font specimen. text is the sample; props {font: family name}.',
  section: 'a big tinted area behind a website section. text is its label; props {fill: "#rrggbb", radius}.',
};
for (const [type, size] of Object.entries({ frame: [393, 852], box: [160, 100], text: [240, 36], icon: [40, 40], font: [320, 190], section: [560, 360] })) {
  registerCardType(type, { size, guide: GUIDES[type] });
}
