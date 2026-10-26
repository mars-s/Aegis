import { registerCardType } from '../commands.js';

registerCardType('dataset', { size: [640, 420], guide: 'an imported CSV kept whole. props {src: asset id, name, rows, profile}. Read only: query it with data_query for exact figures, never from the preview.' });
