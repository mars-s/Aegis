// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, ImageRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, LevelFormat, WidthType, BorderStyle, ShadingType, LineRuleType,
} from 'docx';

const INK = '25252B', SOFT = '6B6370', PINK = '4263EB', LINK = '3155C6', LINE = 'ECE2EA';
const PAGES = { letter: { width: 12240, height: 15840 }, a4: { width: 11906, height: 16838 } };   // twips
const MARGIN = { top: 1152, bottom: 1224, left: 1224, right: 1224 };   // 0.8in top, 0.85in sides and bottom (same as the PDF)
const hp = px => Math.round(parseFloat(px) * 1.5);   // CSS px → Word half-points (16px = 12pt = 24)
const hex = c => {
  if (!c) return undefined; c = String(c).trim();
  const m = c.match(/^rgba?\((\d+)\D+(\d+)\D+(\d+)/i); if (m) return [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
  c = c.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); return /^[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : undefined;
};
const font = f => f ? String(f).replace(/["']/g, '').split(',')[0].trim() : undefined;
const ALIGN = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.BOTH, left: AlignmentType.LEFT };

// text with its marks → Word runs (and links)
function runs(nodes = [], extra = {}) {
  const out = [];
  for (const n of nodes) {
    if (n.type === 'inlineMath') { out.push(new TextRun({ text: `$${n.attrs?.latex ?? ''}$`, font: 'Menlo' })); continue; }
    if (n.type === 'hardBreak') { out.push(new TextRun({ break: 1 })); continue; }
    if (n.type !== 'text') continue;
    const o = { text: n.text, ...extra }; let href = null;
    for (const m of n.marks || []) {
      const a = m.attrs || {};
      if (m.type === 'bold') o.bold = true;
      else if (m.type === 'italic') o.italics = true;
      else if (m.type === 'underline') o.underline = {};
      else if (m.type === 'strike') o.strike = true;
      else if (m.type === 'superscript') o.superScript = true;
      else if (m.type === 'subscript') o.subScript = true;
      else if (m.type === 'code') { o.font = 'Menlo'; o.shading = { type: ShadingType.CLEAR, color: 'auto', fill: 'F6EFF5' }; }
      else if (m.type === 'highlight') o.shading = { type: ShadingType.CLEAR, color: 'auto', fill: hex(a.color) || 'FFF1A8' };
      else if (m.type === 'textStyle') { if (a.color) o.color = hex(a.color); if (a.fontFamily) o.font = font(a.fontFamily); if (a.fontSize) o.size = hp(a.fontSize); }
      else if (m.type === 'link') href = a.href;
    }
    if (href) out.push(new ExternalHyperlink({ link: href, children: [new TextRun({ ...o, color: o.color || LINK, underline: {} })] }));
    else out.push(new TextRun(o));
  }
  return out;
}
const spacingOf = a => a?.lineHeight ? { line: Math.round(parseFloat(a.lineHeight) * 240), lineRule: LineRuleType.AUTO } : undefined;

export async function toDocx(json, { title = '', paper = 'letter' } = {}) {
  const content = json?.content || [];
  const page = PAGES[paper] || PAGES.letter, maxW = Math.round((page.width - MARGIN.left - MARGIN.right) / 15);   // content width in px (1px = 15 twips)
  let listInstance = 0;

  // pictures: their real size, scaled to fit the page
  async function picture(src) {
    const m = String(src || '').match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i); if (!m) return null;
    const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    const size = await new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([600, 400]); i.src = src; });
    const k = Math.min(1, maxW / size[0]);
    return new Paragraph({ spacing: { before: 120, after: 160 }, children: [new ImageRun({ type: m[1].toLowerCase().replace('jpeg', 'jpg'), data: bytes, transformation: { width: Math.round(size[0] * k), height: Math.round(size[1] * k) } })] });
  }

  async function block(n, ctx = {}) {
    const a = n.attrs || {}, align = ALIGN[a.textAlign];
    switch (n.type) {
      case 'blockMath': return [new Paragraph({ spacing: { before: 120, after: 160 }, children: [new TextRun({ text: `$$${a.latex ?? ''}$$`, font: 'Menlo' })] })];
      case 'paragraph': {
        const style = a.kind === 'lead' ? 'Lead' : a.kind === 'caption' ? 'Caption' : ctx.quote ? 'Quote' : undefined;
        return [new Paragraph({ style, alignment: align, spacing: spacingOf(a), numbering: ctx.numbering, children: runs(n.content, ctx.run) })];
      }
      case 'heading': {
        const heading = [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2][(a.level || 1) - 1];
        return [new Paragraph({ heading, alignment: align, spacing: spacingOf(a), keepNext: true, children: runs(n.content) })];
      }
      case 'blockquote': return (await Promise.all((n.content || []).map(c => block(c, { ...ctx, quote: true })))).flat();
      case 'codeBlock': {
        const lines = (n.content || []).map(t => t.text || '').join('').split('\n');
        return lines.map((l, i) => new Paragraph({ style: 'Code', spacing: { before: i ? 0 : 120, after: i === lines.length - 1 ? 160 : 0 }, children: [new TextRun({ text: l || ' ' })] }));
      }
      case 'horizontalRule': return [new Paragraph({ spacing: { before: 200, after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 1 } }, children: [] })];
      case 'image': { const p = await picture(a.src); return p ? [p] : []; }
      case 'bulletList': case 'orderedList': {
        const reference = n.type === 'bulletList' ? 'bullets' : 'numbers', level = ctx.level ?? 0, instance = n.type === 'orderedList' && level === 0 ? ++listInstance : ctx.instance;
        const out = [];
        for (const li of n.content || []) for (const [i, c] of (li.content || []).entries()) {
          if (c.type === 'bulletList' || c.type === 'orderedList') out.push(...await block(c, { ...ctx, level: level + 1, instance }));
          else out.push(...await block(c, { ...ctx, numbering: i === 0 ? { reference, level, instance } : undefined, run: undefined }));
        }
        return out;
      }
      case 'taskList': {
        const out = [];
        for (const li of n.content || []) {
          const done = !!li.attrs?.checked;
          for (const [i, c] of (li.content || []).entries()) {
            if (c.type === 'taskList') { out.push(...await block(c, ctx)); continue; }
            if (c.type !== 'paragraph') { out.push(...await block(c, ctx)); continue; }
            const kids = runs(c.content, done ? { strike: true, color: SOFT } : {});
            out.push(new Paragraph({ indent: { left: 360, hanging: 360 }, spacing: { after: 60 }, children: [i === 0 ? new TextRun({ text: (done ? '☑' : '☐') + '\t', font: 'Segoe UI Symbol', color: done ? PINK : SOFT }) : new TextRun({ text: '\t' }), ...kids] }));
          }
        }
        return out;
      }
      case 'table': {
        const rows = [];
        for (const tr of n.content || []) {
          const cells = [];
          for (const td of tr.content || []) {
            const head = td.type === 'tableHeader', kids = (await Promise.all((td.content || []).map(c => block(c, { ...ctx, run: head ? { bold: true } : undefined })))).flat();
            cells.push(new TableCell({ children: kids.length ? kids : [new Paragraph({ children: [] })], shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'FAF5F9' } : undefined,
              margins: { top: 90, bottom: 90, left: 140, right: 140 }, columnSpan: td.attrs?.colspan > 1 ? td.attrs.colspan : undefined, rowSpan: td.attrs?.rowspan > 1 ? td.attrs.rowspan : undefined }));
          }
          rows.push(new TableRow({ children: cells, tableHeader: (tr.content || []).every(c => c.type === 'tableHeader') }));
        }
        const b = { style: BorderStyle.SINGLE, size: 4, color: LINE };
        return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows, borders: { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b } }), new Paragraph({ children: [] })];
      }
      default: return n.content ? (await Promise.all(n.content.map(c => block(c, ctx)))).flat() : [];
    }
  }

  const children = [];
  const firstText = (content[0]?.content || []).map(t => t.text || '').join('').trim().toLowerCase();
  if (title && firstText !== title.trim().toLowerCase()) children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }));   // the doc's name on top, unless it already starts with it
  for (const n of content) children.push(...await block(n));
  if (!children.length) children.push(new Paragraph({ children: [] }));

  const bulletText = ['•', '◦', '▪'], numberFmt = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
  const doc = new Document({
    creator: 'Aegis', title: title || 'Document',
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 24, color: INK }, paragraph: { spacing: { after: 120, line: 288, lineRule: LineRuleType.AUTO } } },
        title: { run: { font: 'Arial', size: 54, bold: true, color: INK }, paragraph: { spacing: { before: 0, after: 200 } } },
        heading1: { run: { font: 'Arial', size: 39, bold: true, color: INK }, paragraph: { spacing: { before: 360, after: 80 } } },
        heading2: { run: { font: 'Arial', size: 30, bold: true, color: INK }, paragraph: { spacing: { before: 280, after: 60 } } },
        hyperlink: { run: { color: LINK, underline: {} } },
      },
      paragraphStyles: [
        { id: 'Lead', name: 'Lead', basedOn: 'Normal', next: 'Normal', run: { size: 29, color: SOFT }, paragraph: { spacing: { after: 160 } } },
        { id: 'Caption', name: 'Caption', basedOn: 'Normal', next: 'Normal', run: { size: 20, color: SOFT } },
        { id: 'Quote', name: 'Quote', basedOn: 'Normal', next: 'Normal', run: { size: 27, color: SOFT }, paragraph: { indent: { left: 360 }, spacing: { before: 160, after: 160 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'F27AA8', space: 12 } } } },
        { id: 'Code', name: 'Code', basedOn: 'Normal', run: { font: 'Menlo', size: 20, color: 'F1ECF3' }, paragraph: { spacing: { after: 0, line: 276 }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: '262229' }, indent: { left: 180, right: 180 } } },
      ],
    },
    numbering: { config: [
      { reference: 'bullets', levels: [0, 1, 2, 3, 4].map(l => ({ level: l, format: LevelFormat.BULLET, text: bulletText[l % 3], alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 + l * 360, hanging: 260 } } } })) },
      { reference: 'numbers', levels: [0, 1, 2, 3, 4].map(l => ({ level: l, format: numberFmt[l % 3], text: `%${l + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 + l * 360, hanging: 300 } } } })) },
    ] },
    sections: [{ properties: { page: { size: page, margin: MARGIN } }, children }],
  });
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
}
