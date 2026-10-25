import { unzipSync, strFromU8 } from 'fflate';
import { prepareImage } from '../media/images.js';
import { MAX_SLIDES, yieldToUI } from './types';
import type { Imported, ImportHost, Progress, Slide, Picture } from './types';

const MAX_EXPANDED = 128 * 1024 * 1024;
const MAX_ENTRY = 24 * 1024 * 1024;
const pictureType = (path: string) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' })[path.split('.').pop()?.toLowerCase() || ''];

async function openBundle(file: File, wanted: (name: string) => boolean) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let entries = 0, expanded = 0;
  await yieldToUI();
  return unzipSync(bytes, { filter(entry) {
    if (++entries > 5000) throw new Error('This bundle has over 5,000 files. Export a smaller presentation first.');
    expanded += entry.originalSize;
    if (expanded > MAX_EXPANDED || entry.originalSize > MAX_ENTRY) throw new Error('This bundle expands beyond the import limit of 128 MB, or has a file over 24 MB.');
    return wanted(entry.name);
  } });
}
function xml(bytes: Uint8Array | undefined, name: string) {
  if (!bytes) throw new Error(`The presentation is missing ${name}. Export it again and retry.`);
  const doc = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.doctype) throw new Error(`The presentation has invalid XML in ${name}.`);
  return doc;
}
const all = (root: Document | Element, name: string) => [...root.getElementsByTagNameNS('*', name)];
const attr = (node: Element, name: string) => node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', name) || node.getAttribute(`r:${name}`);
function relative(base: string, target: string) {
  const parts = base.split('/').slice(0, -1);
  if (target.startsWith('/')) parts.length = 0;
  for (const part of target.split('/')) {
    if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}
function relationships(bundle: Record<string, Uint8Array>, path: string) {
  const parts = path.split('/'), name = parts.pop();
  const relPath = [...parts, '_rels', `${name}.rels`].join('/');
  if (!bundle[relPath]) return new Map<string, string>();
  return new Map(all(xml(bundle[relPath], relPath), 'Relationship').filter(node => node.getAttribute('TargetMode') !== 'External').map(node => [node.getAttribute('Id') || '', relative(path, node.getAttribute('Target') || '')]));
}
async function uploadPicture(bytes: Uint8Array, path: string, host: ImportHost): Promise<Picture> {
  const type = pictureType(path);
  if (!type) throw new Error(`Unsupported picture format in ${path}.`);
  // Normalise embedded pictures to a raster image. SVG content never enters a window as markup.
  const prepared = await prepareImage(new File([Uint8Array.from(bytes).buffer], path.split('/').pop() || 'Slide image', { type }));
  const saved = await host.upload(prepared.file);
  return { src: saved.url, alt: path.split('/').pop() || 'Slide image' };
}

export async function importPPTX(file: File, host: ImportHost, progress: Progress): Promise<Imported> {
  const bundle = await openBundle(file, name => /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/.*|media\/.*)$/.test(name));
  const presentation = xml(bundle['ppt/presentation.xml'], 'ppt/presentation.xml');
  const rels = relationships(bundle, 'ppt/presentation.xml');
  const paths = all(presentation, 'sldId').map(node => rels.get(attr(node, 'id') || ''));
  if (!paths.length) throw new Error('This PowerPoint file has no slides.');
  if (paths.length > MAX_SLIDES) throw new Error('This presentation has over 200 slides. Split it into smaller decks first.');
  const slides: Slide[] = [], pictures = new Map<string, Picture>();
  let skipped = 0, textLength = 0;
  for (const [index, path] of paths.entries()) {
    if (!path) throw new Error(`The presentation is missing slide ${index + 1}.`);
    progress(index / paths.length, `Reading slide ${index + 1} of ${paths.length}`);
    await yieldToUI();
    const doc = xml(bundle[path], path), slideRels = relationships(bundle, path);
    const texts = all(doc, 'sp').map(shape => ({
      title: all(shape, 'ph').some(ph => ['title', 'ctrTitle'].includes(ph.getAttribute('type') || '')),
      text: all(shape, 'p').map(p => all(p, 't').map(t => t.textContent).join('')).filter(Boolean).join('\n'),
    })).filter(shape => shape.text);
    const title = texts.find(shape => shape.title)?.text || texts[0]?.text || `Slide ${index + 1}`;
    const titleIndex = texts.findIndex(shape => shape.text === title);
    // Table cells are text too, even though they live outside text shapes.
    const tables = all(doc, 'tc').map(cell => all(cell, 'p').map(p => all(p, 't').map(t => t.textContent).join('')).join('\n')).filter(Boolean);
    const body = [...texts.filter((_, i) => i !== titleIndex).map(shape => shape.text), ...tables].join('\n\n');
    textLength += title.length + body.length;
    if (textLength > 240000) throw new Error('This presentation has too much text for one deck. Split it into smaller decks first.');
    const images: Picture[] = [];
    for (const blip of all(doc, 'blip')) {
      const imagePath = slideRels.get(attr(blip, 'embed') || '');
      if (!imagePath || !bundle[imagePath] || !pictureType(imagePath)) { skipped++; continue; }
      if (!pictures.has(imagePath)) pictures.set(imagePath, await uploadPicture(bundle[imagePath], imagePath, host));
      const picture = pictures.get(imagePath);
      if (picture) images.push(picture);
    }
    slides.push({ id: crypto.randomUUID(), layout: images.length ? 'image' : 'text', title, body, sub: '', images });
  }
  return { type: 'deck', props: { slides, current: 0 }, ...(skipped ? { notice: `${skipped} linked or unsupported pictures were skipped. Export to PDF to keep their appearance.` } : {}) };
}

export async function importKeynote(file: File, host: ImportHost, progress: Progress): Promise<Imported> {
  const bundle = await openBundle(file, name => /(?:^|\/)Data\/st-[^/]+\.(jpe?g|png)$/i.test(name) || /(?:^|\/)(?:QuickLook\/|preview(?:-web|-micro)?\.(?:jpe?g|png)$)/i.test(name));
  const names = Object.keys(bundle), natural = new Intl.Collator('en', { numeric: true });
  const data = names.filter(name => /(?:^|\/)Data\/st-[^/]+\.(jpe?g|png)$/i.test(name));
  const quick = names.filter(name => /QuickLook\/.*\.(jpe?g|png)$/i.test(name));
  const previews = (data.length ? data : quick.length ? quick : names.filter(name => /(?:^|\/)preview\.(jpe?g|png)$/i.test(name))).sort(natural.compare);
  if (!previews.length) throw new Error('No slide previews were found in this Keynote file. In Keynote, export it to PDF, then import the PDF.');
  if (previews.length > MAX_SLIDES) throw new Error('This Keynote file has over 200 previews. Export smaller decks to PDF first.');
  const slides: Slide[] = [];
  for (const [index, path] of previews.entries()) {
    progress(index / previews.length, `Saving preview ${index + 1} of ${previews.length}`);
    await yieldToUI();
    slides.push({ id: crypto.randomUUID(), layout: 'image', imageOnly: true, title: `Slide ${index + 1}`, body: '', sub: '', images: [await uploadPicture(bundle[path], path, host)] });
  }
  return { type: 'deck', props: { slides, current: 0 } };
}
