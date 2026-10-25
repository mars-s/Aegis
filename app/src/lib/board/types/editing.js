// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { registerCardType } from '../commands.js';
registerCardType('coll', { size: [300, 180], guide: 'a collection that stacks cards in columns. text is its name; props.kids lists member card ids in reading order; the board links and stacks them.' });
