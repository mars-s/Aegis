import { useState } from 'react';
import type { BoardId, Command } from '@aegis/domain';
import { CommandSchema } from '@aegis/domain/schema';
import type { FeatureContext } from '../../composition.js';
import { useCreativeServices, useRecordingStore } from '../media/services.js';
import type { createRecordingStore } from '../media/recording-store.js';
import { videoInfo } from '../media/video-info.js';
import { CardIdSchema } from '@aegis/domain/schema';
import type { CreativeServices } from '../media/services.js';
import { normaliseLink, spotifyOf } from '../media/link-model.js';
import { prepareImage } from '../media/image-utils.js';
import { fileFormat, MAX_FILE, titleOf } from './types.js';
import { keynotePackages } from './keynote-package.js';
import { createImportArrival } from './arrival.js';
import './imports-react.css';
export const IMPORT_ACCEPT = 'image/*,video/*,.csv,.tsv,text/csv,.pdf,.pptx,.key,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.apple.keynote';
const mime = { pdf: 'application/pdf', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', key: 'application/vnd.apple.keynote' };
export interface ImportProgress { readonly fraction: number; readonly message: string; readonly filename: string }
export function createImporter(context: FeatureContext, services: CreativeServices, progress: (value: ImportProgress | null) => void, recordings: ReturnType<typeof createRecordingStore>) {
  let queue = Promise.resolve();
  let picker: HTMLInputElement | null = null;
  const arrival = createImportArrival(context.workspace);
  async function save(boardId: BoardId, commands: readonly Command[], instant = true) {
    if (context.workspace.metadata.getSnapshot().id === boardId) {
      const result = context.workspace.submit(commands); if (result.kind === 'rejected') throw new Error(result.errors[0]?.reason ?? 'Could not import this file');
      arrival.remember(result.ids, instant);
      context.workspace.act({ kind: 'select', ids: result.ids });
    } else await services.commitToBoard(boardId, commands);
  }
  function importFiles(files: Iterable<File>, at?: { x: number; y: number }, destination = context.workspace.metadata.getSnapshot().id) {
    const position = at ?? context.engine()?.screenToWorld({ x: innerWidth / 2, y: innerHeight / 2 }) ?? { x: 0, y: 0 };
    const batch = [...files];
    const instant = arrival.viaKeyboard();
    const task = async () => {
      for (const [index, file] of batch.entries()) {
        const x = Math.round(position.x + index * 36), y = Math.round(position.y + index * 30);
        try {
          const format = fileFormat(file);
          if (/\.(csv|tsv)$/i.test(file.name)) { await services.importCSV(file, destination, { x, y }); continue; }
          if (!file.size) throw new Error('This file is empty. Choose a file with content.');
          if (format) {
            if (file.size > MAX_FILE) throw new Error('This file is over 64 MB. Export a smaller file and try again.');
            const update = (fraction: number, message: string) => progress({ fraction, message, filename: file.name }); update(0, 'Preparing import');
            const imported = format === 'pdf' ? await (await import('./pdf.js')).importPDF(file, services, update) : format === 'pptx' ? await (await import('./bundle.js')).importPPTX(file, services, update) : await (await import('./bundle.js')).importKeynote(file, services, update);
            update(1, 'Saving original file');
            const original = await services.upload(new File([file], file.name, { type: mime[format] }));
            const props = { ...imported.props, import: { format, name: file.name, original: original.url } };
            if (new TextEncoder().encode(JSON.stringify(props)).length > 900000) throw new Error('This file has too much content for one window. Split it into smaller files first.');
            const command = CommandSchema.parse({ op: 'create', type: imported.type, text: titleOf(file), x, y, w: imported.type === 'doc' ? 560 : 570, h: imported.type === 'doc' ? 620 : 420, props });
            await save(destination, [command], instant);
            services.notify(`Imported ${file.name}${context.workspace.metadata.getSnapshot().id === destination ? '' : ' into the original board'}.${imported.type === 'deck' && imported.notice ? ` ${imported.notice}` : ''}`);
          } else if (file.type.startsWith('image/')) {
            const prepared = await prepareImage(file), saved = await services.upload(prepared.file);
            if (prepared.flattened) services.notify('This animated file is over 12 MB. A still image was imported.');
            await save(destination, [{ op: 'create', type: 'image', text: titleOf(file), url: saved.url, x, y, w: 320, h: Math.max(60, 320 * prepared.height / prepared.width) }]);
          } else if (file.type.startsWith('video/')) {
            if (file.size > 1024 ** 3) throw new Error('Choose a file smaller than 1 GB');
            if (context.workspace.metadata.getSnapshot().id === destination) {
              const id = CardIdSchema.parse(crypto.randomUUID().replaceAll('-', '').slice(0, 16));
              await save(destination, [{ op: 'create', newId: id, type: 'video', text: titleOf(file), x, y, w: 440, h: 320, props: { ready: true } }]);
              await recordings.session(context.workspace, id, true, 'wide', false).importFile(file, true);
            } else {
              const info = await videoInfo(file), saved = await services.upload(file);
              await save(destination, [{ op: 'create', type: 'video', text: titleOf(file), url: saved.url, x, y, w: 440, h: Math.max(120, 440 * info.height / (info.width || 1) + 72), props: { poster: info.poster, duration: info.duration, videoWidth: info.width, videoHeight: info.height } }]);
            }
          } else throw new Error('Choose an image, video, CSV, PDF, PowerPoint (.pptx) or Keynote (.key) file.');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          services.notify(`Could not import ${file.name}. ${/invalid pdf/i.test(message) ? 'This PDF could not be read. Export it again and retry.' : message}`);
        } finally { progress(null); }
      }
    };
    queue = queue.then(task, task); return queue;
  }
  function fileInput() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = IMPORT_ACCEPT; input.multiple = true;
    input.onchange = () => { if (input.files) void importFiles(input.files); input.value = ''; };
    return input;
  }
  function choose() {
    const input = picker ?? fileInput(); input.value = ''; input.click();
  }
  function install(stage: HTMLElement) {
    const input = fileInput(); input.id = 'mediaFile'; input.hidden = true; document.body.append(input); picker = input;
    const world = stage.querySelector('#world'), disposeArrival = world instanceof HTMLElement ? arrival.install(world) : () => {};
    const editing = (target: EventTarget | null) => target instanceof Element && !!target.closest('textarea,input,select,[contenteditable="true"],[contenteditable="plaintext-only"]');
    const paste = (event: ClipboardEvent) => {
      if (editing(event.target) || !event.clipboardData) return;
      const files = [...event.clipboardData.files];
      if (files.some(file => /^(image|video)\//.test(file.type) || fileFormat(file) || /\.(csv|tsv)$/i.test(file.name))) { event.preventDefault(); event.stopImmediatePropagation(); void importFiles(files); return; }
      const text = event.clipboardData.getData('text/plain').trim();
      if (/^spotify:/i.test(text) && spotifyOf(text)) { event.preventDefault(); event.stopImmediatePropagation(); const at = context.engine()?.screenToWorld({ x: innerWidth / 2, y: innerHeight / 2 }) ?? { x: 0, y: 0 }; context.workspace.submit([{ op: 'create', type: 'link', url: normaliseLink(text), x: at.x, y: at.y, w: 340, h: 228 }]); }
    };
    const drop = (event: DragEvent) => {
      if (editing(event.target) || !event.dataTransfer) return;
      const packages = keynotePackages(event.dataTransfer), files = [...event.dataTransfer.files];
      if (!packages && !files.length) {
        const text = (event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain')).split('\n').find(line => line && !line.startsWith('#'))?.trim();
        if (!text || !/^https?:\/\/|^spotify:/i.test(text)) return;
        try { const url = normaliseLink(text), bounds = stage.getBoundingClientRect(), at = context.engine()?.screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }) ?? { x: 0, y: 0 }; event.preventDefault(); event.stopImmediatePropagation(); context.workspace.submit([{ op: 'create', type: /\.(png|jpe?g|gif|webp|avif|apng)(\?|$)/i.test(url) ? 'image' : 'link', url, x: at.x, y: at.y }]); } catch { /* Leave a non-link drop to the canvas. */ }
        return;
      }
      event.preventDefault(); event.stopImmediatePropagation();
      const bounds = stage.getBoundingClientRect(), at = context.engine()?.screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }) ?? { x: 0, y: 0 }, board = context.workspace.metadata.getSnapshot().id;
      if (packages) void packages.then(result => importFiles(result, at, board)).catch(error => services.notify(`Could not import the Keynote package. ${error instanceof Error ? error.message : String(error)}`));
      else void importFiles(files, at, board);
    };
    const dragover = (event: DragEvent) => { if (event.dataTransfer?.types.some(type => ['Files', 'text/uri-list', 'text/plain'].includes(type))) event.preventDefault(); };
    document.addEventListener('paste', paste, true); stage.addEventListener('drop', drop, true); stage.addEventListener('dragover', dragover);
    return () => { disposeArrival(); if (picker === input) picker = null; input.remove(); document.removeEventListener('paste', paste, true); stage.removeEventListener('drop', drop, true); stage.removeEventListener('dragover', dragover); };
  }
  return { importFiles, choose, install };
}
export function ImportProgressView({ value }: { readonly value: ImportProgress | null }) {
  return value && <div className="import-progress" role="status" aria-live="polite"><span>{value.filename}: {value.message}</span><div className="import-progress-line" role="progressbar" aria-label={`Importing ${value.filename}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value.fraction * 100)}><i style={{ transform: `scaleX(${Math.max(.02, value.fraction)})` }} /></div></div>;
}
export function ImportButton({ context }: { readonly context: FeatureContext }) {
  const services = useCreativeServices(), recordings = useRecordingStore(), [value, setValue] = useState<ImportProgress | null>(null), [importer] = useState(() => createImporter(context, services, setValue, recordings));
  return <><button data-tool="import-image" onClick={importer.choose}>Import</button><ImportProgressView value={value} /></>;
}
