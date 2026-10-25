// Original, deterministic fixture content. Run from the repo root with PLAYWRIGHT set.
// No third-party document generator or artwork is used.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from '../ui/playwright.mjs';
const require = createRequire(new URL('../../app/package.json', import.meta.url));
const { zipSync, strToU8 } = require('fflate');
const save = (name, bytes) => writeFileSync(new URL(name, import.meta.url), bytes);
const zip = files => zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, typeof value === 'string' ? strToU8(value) : value])), { level: 6 });

function pdf() {
  const stream = (heading, body) => `BT /F1 24 Tf 48 736 Td (${heading}) Tj /F1 12 Tf 0 -40 Td (${body}) Tj 0 -24 Td (Original Aegis import fixture. Two pages, with selectable text.) Tj ET`;
  const streams = [stream('A quieter table', 'First page text stays editable after import.'), stream('Make room for ideas', 'Second page text belongs to the same document.')];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...streams.map(s => `<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`),
  ];
  let output = '%PDF-1.4\n', offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(output)); output += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return output;
}
save('two-pages.pdf', pdf());
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const drawings = await page.evaluate(() => [1, 2].map(n => {
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
    const g = canvas.getContext('2d'); g.fillStyle = '#0d0e0f'; g.fillRect(0, 0, 960, 540);
    g.strokeStyle = '#abb2bf'; g.lineWidth = 2; g.strokeRect(64, 64, 832, 412);
    g.fillStyle = '#ffffff'; g.font = '40px sans-serif'; g.fillText(n === 1 ? 'Room for an idea' : 'A clearer next step', 100, 150);
    g.strokeStyle = '#3f8dfd'; g.beginPath(); g.moveTo(100, 380);
    for (let x = 100; x <= 850; x += 8) g.lineTo(x, 330 - Math.sin((x + n * 110) / 130) * 40);
    g.stroke(); g.fillStyle = '#abb2bf'; g.font = '22px sans-serif'; g.fillText(`Original fixture drawing ${n}`, 100, 220);
    return { png: canvas.toDataURL('image/png').split(',')[1], jpg: canvas.toDataURL('image/jpeg', .9).split(',')[1] };
  }));
  const png = drawings.map(d => Buffer.from(d.png, 'base64')), jpg = drawings.map(d => Buffer.from(d.jpg, 'base64'));
  save('preview-first.jpg', jpg[0]);
  const rel = entries => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map(([Id, Type, Target]) => `<Relationship Id="${Id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${Type}" Target="${Target}"/>`).join('')}</Relationships>`;
  const slide = (title, body, pictures) => `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="1" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp>${pictures.map((_, i) => `<p:pic><p:blipFill><a:blip r:embed="image${i + 1}"/></p:blipFill></p:pic>`).join('')}</p:spTree></p:cSld></p:sld>`;
  save('two-slides.pptx', zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>',
    '_rels/.rels': rel([['rId1', 'officeDocument', 'ppt/presentation.xml']]),
    'ppt/presentation.xml': '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="first"/><p:sldId id="257" r:id="second"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>',
    // Relationship order, rather than filename order, decides the slide order.
    'ppt/_rels/presentation.xml.rels': rel([['first', 'slide', 'slides/slide2.xml'], ['second', 'slide', 'slides/slide1.xml']]),
    'ppt/slides/slide2.xml': slide('First import slide', 'First slide body stays editable.', [1, 2]),
    'ppt/slides/slide1.xml': slide('Second import slide', 'Second slide body stays editable.', [2]),
    'ppt/slides/_rels/slide2.xml.rels': rel([['image1', 'image', '../media/idea.png'], ['image2', 'image', '../media/next.png']]),
    'ppt/slides/_rels/slide1.xml.rels': rel([['image1', 'image', '../media/next.png']]),
    'ppt/media/idea.png': png[0], 'ppt/media/next.png': png[1],
  }));
  save('two-previews.key', zip({ 'Data/st-10.jpg': jpg[1], 'Data/st-2.jpg': jpg[0], 'QuickLook/Thumbnail.jpg': jpg[1], 'Index/Document.iwa': 'Synthetic Keynote-like fixture. Not a real editable Keynote document.' }));
  save('quicklook.key', zip({ 'QuickLook/Preview.jpg': jpg[0] }));
  save('no-previews.key', zip({ 'Index/Document.iwa': 'No preview images in this synthetic bundle.' }));
  save('oversized.pptx', zip({ 'ppt/media/too-large.png': new Uint8Array(25 * 1024 * 1024) }));
  save('invalid.pdf', 'This is deliberately not a PDF.');
  console.log('PASS generated original PDF, PPTX, Keynote preview and failure fixtures');
} finally { await browser.close(); }
