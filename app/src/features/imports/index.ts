import { registerTool, registerCardMenu } from '../registry';
import type { Ctx, PlaceAt } from '../registry';
import { fileFormat, MAX_FILE, titleOf, yieldToUI } from './types';
import { installImportMotion, rememberImportWindow, importViaKeyboard } from './motion';
import { importFiles } from '../media/imports.js';
import { downloadOriginal } from './assets.js';

export const IMPORT_ACCEPT = 'image/*,video/*,.pdf,.pptx,.key,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.apple.keynote';
const mime = { pdf: 'application/pdf', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', key: 'application/vnd.apple.keynote' };
export { fileFormat } from './types';
let pending = Promise.resolve();

export function chooseImport(ctx: Ctx) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = IMPORT_ACCEPT; input.multiple = true;
  input.onchange = () => {
    if (input.files) void importFiles(ctx, input.files);
  };
  input.click();
}
registerTool({ id: 'import-files', title: 'Import', group: 'files', icon: '<path d="M3 10v4h10v-4M8 1v9m-3-3 3 3 3-3"/>', activate: chooseImport });
registerCardMenu({ id: 'import-original', title: 'Download original file', section: 'File', when: (ctx, ids) => ids.length === 1 && !!ctx.canvas.board.cards.find((c: { id: string; props?: { import?: { original?: string } } }) => c.id === ids[0])?.props?.import?.original, run(ctx, ids) {
  const source = ctx.canvas.board.cards.find((c: { id: string }) => c.id === ids[0])?.props?.import;
  if (source) void downloadOriginal(ctx, source);
} });

export function installImports(ctx: Ctx) {
  const input = document.getElementById('mediaFile');
  if (input instanceof HTMLInputElement) input.accept = IMPORT_ACCEPT;
  installImportMotion(ctx);
}

// Capture the destination before queuing or awaiting conversion. Board switches cannot redirect an import.
export function importDocument(ctx: Ctx, file: File, at: PlaceAt, boardId: string = ctx.canvas.board.id) {
  const instant = importViaKeyboard();
  const task = async () => {
    const format = fileFormat(file);
    if (!format) return;
    let status: HTMLElement | undefined;
    try {
      if (!file.size) throw new Error('This file is empty. Choose a file with content.');
      if (file.size > MAX_FILE) throw new Error('This file is over 64 MB. Export a smaller file and try again.');
      status = document.createElement('div'); status.className = 'import-progress'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      const label = document.createElement('span'), line = document.createElement('div'), fill = document.createElement('i');
      line.className = 'import-progress-line'; line.setAttribute('role', 'progressbar'); line.setAttribute('aria-label', `Importing ${file.name}`); line.setAttribute('aria-valuemin', '0'); line.setAttribute('aria-valuemax', '100');
      line.append(fill); status.append(label, line); document.body.append(status);
      const progress = (fraction: number, message: string) => {
        label.textContent = `${file.name}: ${message}`;
        line.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
        fill.style.transform = `scaleX(${Math.max(.02, fraction)})`;
      };
      progress(0, 'Preparing import'); await yieldToUI();
      const result = format === 'pdf'
        ? await (await import('./pdf')).importPDF(file, ctx.host, progress)
        : format === 'pptx'
          ? await (await import('./bundle')).importPPTX(file, ctx.host, progress)
          : await (await import('./bundle')).importKeynote(file, ctx.host, progress);
      progress(1, 'Saving original file');
      const original = await ctx.host.upload(new File([file], file.name, { type: mime[format] }));
      const id = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
      const command = { op: 'create', newId: id, type: result.type, text: titleOf(file), x: Math.round(at.x), y: Math.round(at.y), w: result.type === 'doc' ? 560 : 570, h: result.type === 'doc' ? 620 : 420, props: { ...result.props, import: { format, name: file.name, original: original.url } } };
      // Match the host's one MB props boundary before creating a partially usable card.
      if (new TextEncoder().encode(JSON.stringify(command.props)).length > 900000) throw new Error('This file has too much content for one window. Split it into smaller files first.');
      if (ctx.canvas.board.id === boardId) {
        rememberImportWindow(id, instant);
        ctx.apply([command]); ctx.canvas.select([id]);
      } else {
        const saved = await ctx.host.post(`/boards/${boardId}/batch`, { commands: [command] });
        if (saved.ok === false) throw new Error(saved.errors?.[0]?.reason || 'The host could not save this import.');
      }
      ctx.toast(`Imported ${file.name}${ctx.canvas.board.id === boardId ? '' : ' into the original board'}.${result.type === 'deck' && result.notice ? ` ${result.notice}` : ''}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      ctx.toast(`Could not import ${file.name}. ${/invalid pdf/i.test(reason) ? 'This PDF could not be read. Export it again and retry.' : reason}`);
    } finally { status?.remove(); }
  };
  const result = pending.then(task, task);
  pending = result.catch(() => {});
  return result;
}
