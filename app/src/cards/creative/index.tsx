import type { CardRegistration } from '../../composition.js';
import { DrawingBody } from './Drawing.js';
import { SwatchBody } from './Swatch.js';
import { ImageBody } from './Image.js';
import { LinkBody } from './Link.js';
import { RecordingBody } from './Recording.js';
import { WireframeBody } from './Wireframe.js';
export { CreativeProvider } from '../../features/media/services.js';
export type { CreativeServices } from '../../features/media/services.js';
export const creativeCards: readonly CardRegistration[] = [
  ...(['ink', 'shape', 'path', 'stamp'] as const).map(kind => ({ kind, Body: DrawingBody })),
  { kind: 'swatch', Body: SwatchBody }, { kind: 'image', Body: ImageBody },
  { kind: 'link', Body: LinkBody }, { kind: 'spotify', Body: LinkBody },
  { kind: 'audio', Body: RecordingBody }, { kind: 'video', Body: RecordingBody },
  ...(['frame', 'box', 'text', 'icon', 'font', 'section'] as const).map(kind => ({ kind, Body: WireframeBody })),
];
