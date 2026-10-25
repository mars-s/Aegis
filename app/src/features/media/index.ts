import '../colors/index';
import { registerPanel, registerTool, registerCardMenu, registerCommand } from '../registry';
import { registerRenderer } from '../../canvas/engine.js';
import { renderImage, editCrop, caption, pullColours, importImages } from './images.js';
import { renderLink, editLink } from './links.js';
import { renderRecording, dropRecording, createRecording } from './recording.js';
import { mountMedia } from './devices.js';
import './style.css';
import { installMediaImports } from './imports.js';
// item 14: the existing picker accepts every supported canvas file.
import { chooseImport } from '../imports';
installMediaImports();
registerPanel({ id: 'media-devices', title: 'Media devices', mount: mountMedia });
registerRenderer('image', { render: renderImage, open: caption, interactive: 'button' });
registerRenderer('link', { render: renderLink, open: editLink, interactive: 'button, input, a, iframe' });
registerRenderer('spotify', { render: renderLink, open: editLink, interactive: 'button, input, a, iframe' });
registerRenderer('audio', { render: renderRecording, drop: dropRecording, interactive: 'button, input, select, audio, .media-wave' });
registerRenderer('video', { render: renderRecording, drop: dropRecording, interactive: 'button, input, select, video' });
registerTool({ id: 'voice-memo', title: 'Voice memo', group: 'media', icon: '<rect x="6" y="2" width="4" height="8" rx="2"/><path d="M3 7v1a5 5 0 0 0 10 0V7M8 13v2"/>', place: (at, ctx) => createRecording(ctx, false, at) });
registerTool({ id: 'camera-recording', title: 'Camera recording', group: 'media', icon: '<rect x="2" y="4" width="8" height="8" rx="2"/><path d="m10 6 4-2v8l-4-2"/>', place: (at, ctx) => createRecording(ctx, true, at) });
registerCommand({ id: 'camera-recording', title: 'Camera recording', keys: 'shift+v', run: ctx => createRecording(ctx, true) });
registerTool({ id: 'import-image', title: 'Import images (I)', key: 'i', group: 'media', icon: '<rect x="2" y="2" width="12" height="12" rx="2"/><path d="m3 12 4-4 3 3 2-2 2 3"/>', activate(ctx) {
  chooseImport(ctx);
} });
for (const [id, title, run] of [['image-colours', 'Pull colours', pullColours], ['image-crop', 'Crop image', editCrop], ['image-caption', 'Image caption', caption]] as const) {
  registerCardMenu({ id, title, when: (ctx, ids) => ids.length === 1 && ctx.canvas.board.cards.find((c: { id: string; type: string }) => c.id === ids[0])?.type === 'image', run(ctx, ids) {
    run(ctx.canvas.board.cards.find((c: { id: string; type: string }) => c.id === ids[0]), { get board() { return ctx.canvas.board; }, apply: ctx.apply, resolveUrl: ctx.host.assetUrl, setProps: (id: string, props: object) => ctx.apply([{ op: 'update', id, set: { props } }]) });
  } });
}
