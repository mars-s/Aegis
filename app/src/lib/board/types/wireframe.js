import { registerCardType } from '../commands.js';

for (const [type, size] of Object.entries({ frame: [393, 852], box: [160, 100], text: [240, 36], icon: [40, 40], font: [320, 190], section: [560, 360] })) {
  registerCardType(type, { size });
}
