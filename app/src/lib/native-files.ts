// Saving and printing inside the macOS app. WKWebView ignores <a download> and window.print() in an
// iframe, so in the app these go through the shell's save_download and print_page commands instead.
type Invoke = (cmd: string, args?: unknown, options?: { headers: Record<string, string> }) => Promise<unknown>;
const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__;

export async function saveFile(blob: Blob, name: string): Promise<string> {
  if (!tauri) throw new Error('saveFile is for the desktop app');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return String(await tauri.invoke('save_download', bytes, { headers: { 'x-file-name': encodeURIComponent(name) } }));
}

// Features download with a temporary <a download href="blob:...">, often never added to the page,
// so its click event reaches no listener. In the app, a download link's click() saves the bytes to
// Downloads instead, and says where the file went. Real clicks on such links are caught too.
export function installNativeDownloads(say: (message: string) => void) {
  if (!tauri) return;
  const save = async (link: HTMLAnchorElement) => {
    try {
      const blob = await (await fetch(link.href)).blob();
      const path = await saveFile(blob, link.download || 'Download');
      say(`Saved to ${path.replace(/^\/Users\/[^/]+/, '~')}`);
    } catch (error) { say(`Could not save: ${(error as Error).message ?? error}`); }
  };
  const isDownload = (link: HTMLAnchorElement) => link.hasAttribute('download') && /^(blob|data):/.test(link.href);
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { if (isDownload(this)) void save(this); else click.call(this); };
  document.addEventListener('click', event => {
    const link = (event.target as Element | null)?.closest?.('a[download]');
    if (link instanceof HTMLAnchorElement && isDownload(link)) { event.preventDefault(); event.stopImmediatePropagation(); void save(link); }
  }, true);
}

// Prints a standalone HTML page with the macOS print sheet (Save as PDF lives there). The page goes
// into a sheet that print media shows on its own; the app around it is hidden while printing.
export async function printHtml(page: string): Promise<boolean> {
  if (!tauri) return false;
  const doc = new DOMParser().parseFromString(page, 'text/html');
  const sheet = document.createElement('div'); sheet.className = 'native-print-sheet';
  const shadow = sheet.attachShadow({ mode: 'open' });
  for (const style of doc.querySelectorAll('style')) {
    const css = style.textContent ?? '', page = css.match(/@page\s*\{[^}]*\}/)?.[0] ?? '';
    const s = document.createElement('style'); s.textContent = css.replace(/@page\s*\{[^}]*\}/, '').replace(/\bbody\b/g, ':host'); shadow.append(s);
    if (page) { const g = document.createElement('style'); g.className = 'native-print-page'; g.textContent = `@media print { ${page} }`; document.head.append(g); }
  }
  const body = document.createElement('div'); body.innerHTML = doc.body.innerHTML; shadow.append(body);
  const hide = document.createElement('style'); hide.className = 'native-print-page';
  hide.textContent = '.native-print-sheet { display: none; } @media print { body > :not(.native-print-sheet) { display: none !important; } .native-print-sheet { display: block; } html, body { background: white !important; overflow: visible !important; height: auto !important; } }';
  document.head.append(hide); document.body.append(sheet);
  await document.fonts.ready;
  await Promise.all([...shadow.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
  const cleanUp = () => { sheet.remove(); document.querySelectorAll('.native-print-page').forEach(s => s.remove()); };
  try { await tauri.invoke('print_page'); }
  catch (error) { cleanUp(); throw error; }
  // The print sheet is modal and may lay the page out again while it is open. The app gets no input
  // until it closes, so the first click or key afterwards is the moment to remove the print page.
  for (const type of ['pointerdown', 'keydown']) addEventListener(type, cleanUp, { once: true, capture: true });
  return true;
}
