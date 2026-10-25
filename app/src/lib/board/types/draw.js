import { registerCardType } from '../commands.js';

for (const [type, size] of Object.entries({ ink: [240, 160], shape: [180, 140], path: [240, 160], stamp: [80, 80] })) {
  registerCardType(type, { size });
}
