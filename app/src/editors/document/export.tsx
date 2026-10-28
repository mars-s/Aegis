import { escapeHTML, plainText } from "@aegis/domain/content";
import type { DocumentServices, ExportDocument } from "./services.js";

export async function downloadBlob(
  blob: Blob,
  title: string,
  extension: string,
  saveFile?: DocumentServices["saveFile"],
): Promise<void> {
  const name = `${title.replace(/[\\/:*?"<>|]/g, "").trim() || "Document"}.${extension}`;
  if (saveFile) {
    await saveFile(blob, name);
    return;
  }
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function downloadWord(
  doc: ExportDocument,
  services: DocumentServices = {},
): Promise<void> {
  const { toDocx } = await import("./docx.js");
  const bytes = await toDocx(doc.json, {
    title: doc.title,
    paper: doc.paper,
    ...(services.assetUrl ? { assetUrl: services.assetUrl } : {}),
  });
  await downloadBlob(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    doc.title,
    "docx",
    services.saveFile,
  );
}

export async function printDocumentHTML(doc: ExportDocument): Promise<string> {
  const { printMathsCSS } = await import("./print-maths.js");
  const firstNode = doc.json.content?.[0],
    first = firstNode ? plainText(firstNode).trim() : "";
  const heading =
    first.toLowerCase() === doc.title.trim().toLowerCase()
      ? ""
      : `<h1>${escapeHTML(doc.title)}</h1>`;
  return `<!doctype html><html><head><title>${escapeHTML(doc.title)}</title><style>
    @page { size: ${doc.paper === "letter" ? "letter" : "A4"}; margin: 20mm; }
    body { font: 12pt/1.5 Arial,sans-serif; color:#25252b; background:white; }
    h1,h2,h3 { line-height:1.2; break-after:avoid; } img { max-width:100%; height:auto; }
    img,tr,li { break-inside:avoid; } table { border-collapse:collapse; width:100%; }
    td,th { border:1px solid #ccc; padding:6px; } th { background:#f5f5f5; }
    blockquote { border-left:3px solid #aaa; margin-left:0; padding-left:16px; }
    pre { white-space:pre-wrap; background:#f3f3f3; padding:12px; }
    [data-kind=lead] { font-size:14pt; } [data-kind=caption] { font-size:10pt; color:#666; }
    ul[data-type=taskList] { list-style:none; padding-left:0; }
    li[data-type=taskItem] { display:flex; gap:8px; } li[data-type=taskItem] p { margin:0; }
    .docs-math-block { margin:1em 0; } .katex-display { overflow-wrap:normal; }
    ${printMathsCSS}
  </style></head><body>${heading}${doc.html}</body></html>`;
}

export async function printPDF(
  doc: ExportDocument,
  printHtml?: DocumentServices["printHtml"],
): Promise<void> {
  const html = await printDocumentHTML(doc);
  if (printHtml && (await printHtml(html))) return;
  const frame = document.createElement("iframe");
  frame.title = "Document print preview";
  frame.className = "docs-print-frame";
  frame.srcdoc = html;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const loaded = new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve();
    frame.onerror = () => reject(new Error("Could not prepare the print page"));
    timeout = setTimeout(
      () => reject(new Error("The print page took too long to load")),
      15000,
    );
  });
  document.body.append(frame);
  try {
    await loaded;
    const page = frame.contentDocument,
      view = frame.contentWindow;
    if (!page || !view) throw new Error("The print page is unavailable");
    await page.fonts.ready;
    await Promise.all(
      [...page.images].map((image) => image.decode().catch(() => {})),
    );
    view.addEventListener("afterprint", () => frame.remove(), { once: true });
    view.focus();
    view.print();
    setTimeout(() => frame.remove(), 60000);
  } catch (error) {
    frame.remove();
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    frame.onload = null;
    frame.onerror = null;
  }
}
