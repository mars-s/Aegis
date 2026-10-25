import { MAX_FILE, yieldToUI } from './types';

// Finder can expose a Keynote package as a directory rather than a single ZIP file.
// Repack its bytes, preserving relative paths, so the original package can be kept as an asset.
export function keynotePackages(transfer: DataTransfer): Promise<File[]> | null {
  const entries = [...transfer.items].map(item => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => !!entry);
  if (!entries.some(entry => entry.isDirectory && /\.key$/i.test(entry.name))) return null;
  return Promise.all(entries.map(async entry => {
    if (entry.isFile) {
      if (!('file' in entry) || typeof entry.file !== 'function') throw new Error('Could not read the dropped file. Try the Import button.');
      const read = entry.file.bind(entry);
      return new Promise<File>((resolve, reject) => read(resolve, reject));
    }
    if (!/\.key$/i.test(entry.name)) throw new Error('Choose a Keynote (.key) package, rather than a folder.');
    const files: Record<string, Uint8Array> = {};
    let total = 0, count = 0;
    async function visit(item: FileSystemEntry, path: string): Promise<void> {
      if (++count > 5000) throw new Error('This Keynote package has over 5,000 entries. Export it to PDF first.');
      if (item.isFile && 'file' in item && typeof item.file === 'function') {
        const read = item.file.bind(item);
        const file = await new Promise<File>((resolve, reject) => read(resolve, reject));
        total += file.size;
        if (total > MAX_FILE) throw new Error('This Keynote package is over 64 MB. Export a smaller file first.');
        files[path] = new Uint8Array(await file.arrayBuffer());
      } else if ('createReader' in item && typeof item.createReader === 'function') {
        const reader = item.createReader();
        while (true) {
          const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
          if (!children.length) break;
          for (const child of children) await visit(child, path ? `${path}/${child.name}` : child.name);
        }
      }
    }
    await visit(entry, ''); await yieldToUI();
    const { zipSync } = await import('fflate');
    return new File([Uint8Array.from(zipSync(files, { level: 0 })).buffer], entry.name, { type: 'application/vnd.apple.keynote' });
  }));
}
