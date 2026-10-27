import { escapeHTML, plainText } from '@aegis/domain/content';
import { printHtml } from '../../lib/native-files';

export function downloadBlob(blob, title, extension) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `${title.replace(/[\\/:*?"<>|]/g, '').trim() || 'Document'}.${extension}`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function downloadWord(editor, title, paper) {
  const { toDocx } = await import('./docx.js');
  const bytes = await toDocx(editor.getJSON(), { title, paper });
  downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), title, 'docx');
}

// The desktop app uses its native print sheet; browsers print the same HTML in an iframe.
export async function printPDF(editor, title, paper) {
  const { printMathsCSS } = await import('./print-maths.js');
  const first = plainText(editor.getJSON().content?.[0] ?? {}).trim();
  const heading = first.toLowerCase() === title.trim().toLowerCase() ? '' : `<h1>${escapeHTML(title)}</h1>`;
  const html = `<!doctype html><html><head><title>${escapeHTML(title)}</title><style>
    @page { size: ${paper === 'letter' ? 'letter' : 'A4'}; margin: 20mm; }
    body { font: 12pt/1.5 Arial,sans-serif; color:#25252b; background:white; }
    h1,h2,h3 { line-height:1.2; break-after:avoid; } img { max-width:100%; height:auto; }
    img,tr,li { break-inside:avoid; } table { border-collapse:collapse; width:100%; }
    td,th { border:1px solid #ccc; padding:6px; } th { background:#f5f5f5; }
    blockquote { border-left:3px solid #aaa; margin-left:0; padding-left:16px; }
    pre { white-space:pre-wrap; background:#f3f3f3; padding:12px; }
    [data-kind=lead] { font-size:14pt; } [data-kind=caption] { font-size:10pt; color:#666; }
    ul[data-type=taskList] { list-style:none; padding-left:0; }
    li[data-type=taskItem] { display:flex; gap:8px; } li[data-type=taskItem] p { margin:0; }
    .docs-math-block { margin: 1em 0; } .katex-display { overflow-wrap: normal; }
    ${printMathsCSS}
  </style></head><body>${heading}${editor.getHTML()}</body></html>`;
  if (await printHtml(html)) return;
  const frame = document.createElement('iframe');
  frame.title = 'Document print preview'; frame.className = 'docs-print-frame'; frame.srcdoc = html;
  const loaded = new Promise((resolve, reject) => {
    frame.onload = resolve; frame.onerror = () => reject(new Error('Could not prepare the print page'));
  });
  document.body.append(frame);
  try {
    await loaded;
    await frame.contentDocument.fonts.ready;
    await Promise.all([...frame.contentDocument.images].map(image => image.decode().catch(() => {})));
    frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
    frame.contentWindow.focus(); frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  } catch (error) { frame.remove(); throw error; }
}
