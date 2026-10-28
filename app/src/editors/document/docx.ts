// Ported from Mochiboard, MIT, (c) 2026 Jessa Wolfe. See LICENSE.mochiboard.
// DOCX uses the existing permissively licensed fflate ZIP writer. The XML follows
// the WordprocessingML parts emitted by the legacy Mochiboard converter.
import { zipSync, strToU8 } from "fflate";
import type { RichNode, RichMark, JsonValue } from "@aegis/domain";
import { plainText } from "@aegis/domain/document";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE = "http://schemas.openxmlformats.org/package/2006/relationships";
const INK = "25252B",
  SOFT = "6B6370",
  BLUE = "4263EB",
  LINK = "3155C6",
  LINE = "ECE2EA";
const PAGES = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 },
};
const string = (value: JsonValue | undefined): string =>
  typeof value === "string" ? value : "";
const number = (value: JsonValue | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const xml = (value: string): string =>
  [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 || code === 9 || code === 10 || code === 13;
    })
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
function hex(value: JsonValue | undefined): string | null {
  let colour = string(value).trim();
  const match = colour.match(/^rgba?\((\d+)\D+(\d+)\D+(\d+)/i);
  if (match)
    return match
      .slice(1, 4)
      .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  colour = colour.replace("#", "");
  if (colour.length === 3)
    colour = [...colour].map((part) => part + part).join("");
  return /^[0-9a-f]{6}$/i.test(colour) ? colour.toUpperCase() : null;
}
function font(value: string): string {
  return `<w:rFonts w:ascii="${xml(value)}" w:hAnsi="${xml(value)}"/>`;
}
function markProperties(mark: RichMark): string {
  switch (mark.type) {
    case "bold":
      return "<w:b/>";
    case "italic":
      return "<w:i/>";
    case "underline":
      return '<w:u w:val="single"/>';
    case "strike":
      return "<w:strike/>";
    case "superscript":
      return '<w:vertAlign w:val="superscript"/>';
    case "subscript":
      return '<w:vertAlign w:val="subscript"/>';
    case "code":
      return `${font("Menlo")}<w:shd w:val="clear" w:fill="F6EFF5"/>`;
    case "highlight":
      return `<w:shd w:val="clear" w:fill="${hex(mark.attrs?.color) ?? "FFF1A8"}"/>`;
    case "textStyle": {
      const colour = hex(mark.attrs?.color),
        family = string(mark.attrs?.fontFamily)
          .replace(/["']/g, "")
          .split(",")[0]
          ?.trim();
      const size = parseFloat(string(mark.attrs?.fontSize));
      return `${family ? font(family) : ""}${colour ? `<w:color w:val="${colour}"/>` : ""}${Number.isFinite(size) ? `<w:sz w:val="${Math.round(size * 1.5)}"/>` : ""}`;
    }
    default:
      return "";
  }
}
const run = (text: string, properties = "") =>
  `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const paragraph = (children: string, properties = "") =>
  `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${children}</w:p>`;
interface BlockContext {
  readonly quote?: boolean;
  readonly level?: number;
  readonly list?: number;
  readonly run?: string;
  readonly paragraph?: string;
}
interface Numbering {
  readonly id: number;
  readonly ordered: boolean;
  readonly start: number;
}

export async function toDocx(
  json: RichNode,
  {
    title = "",
    paper = "letter",
    assetUrl = (source: string) => source,
  }: {
    readonly title?: string;
    readonly paper?: "a4" | "letter";
    readonly assetUrl?: (source: string) => string;
  } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const files: Record<string, Uint8Array<ArrayBuffer>> = {},
    page = PAGES[paper],
    maxWidth = Math.round((page.width - 2448) / 15);
  const relationships = [
    `<Relationship Id="styles" Type="${REL}/styles" Target="styles.xml"/>`,
    `<Relationship Id="numbering" Type="${REL}/numbering" Target="numbering.xml"/>`,
    `<Relationship Id="settings" Type="${REL}/settings" Target="settings.xml"/>`,
  ];
  const numbering: Numbering[] = [];
  let relationshipId = 0,
    imageId = 0;
  const relationship = (
    type: "hyperlink" | "image",
    target: string,
  ): string => {
    const id = `rId${++relationshipId}`;
    relationships.push(
      `<Relationship Id="${id}" Type="${REL}/${type}" Target="${xml(target)}"${type === "hyperlink" ? ' TargetMode="External"' : ""}/>`,
    );
    return id;
  };
  const runs = (nodes: readonly RichNode[] = [], extra = ""): string =>
    nodes
      .map((node) => {
        if (node.type === "hardBreak") return "<w:r><w:br/></w:r>";
        if (node.type === "inlineMath")
          return run(`$${string(node.attrs?.latex)}$`, font("Menlo"));
        if (node.type !== "text") return "";
        const href = string(
          node.marks?.find((mark) => mark.type === "link")?.attrs?.href,
        );
        const properties =
          (node.marks ?? []).map(markProperties).join("") +
          extra +
          (href ? `<w:color w:val="${LINK}"/><w:u w:val="single"/>` : "");
        const text = run(node.text ?? "", properties);
        return href
          ? `<w:hyperlink r:id="${relationship("hyperlink", href)}">${text}</w:hyperlink>`
          : text;
      })
      .join("");

  async function picture(source: string, alt: string): Promise<string> {
    let src = source;
    if (src.startsWith("asset:")) {
      const response = await fetch(assetUrl(src));
      if (!response.ok)
        throw new Error("A document image is no longer available");
      const blob = await response.blob();
      src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Could not read document image"));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }
    const match = src.match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i),
      data = match?.[2],
      format = match?.[1]?.toLowerCase();
    if (!data || !format) return "";
    const extension = format === "jpeg" ? "jpg" : format,
      id = ++imageId;
    const name = `media/image${id}.${extension}`;
    files[`word/${name}`] = Uint8Array.from(atob(data), (character) =>
      character.charCodeAt(0),
    );
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve) => {
        const image = new Image();
        image.onload = () =>
          resolve({
            width: Math.max(1, image.naturalWidth),
            height: Math.max(1, image.naturalHeight),
          });
        image.onerror = () => resolve({ width: 600, height: 400 });
        image.src = src;
      },
    );
    const scale = Math.min(1, maxWidth / dimensions.width),
      width = Math.round(dimensions.width * scale * 9525),
      height = Math.round(dimensions.height * scale * 9525);
    const reference = relationship("image", name);
    return paragraph(
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${id}" name="Image ${id}" descr="${xml(alt)}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}.${extension}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${reference}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`,
      '<w:spacing w:before="120" w:after="160"/>',
    );
  }

  async function blocks(
    nodes: readonly RichNode[],
    context: BlockContext = {},
  ): Promise<string> {
    return (await Promise.all(nodes.map((node) => block(node, context)))).join(
      "",
    );
  }
  async function block(
    node: RichNode,
    context: BlockContext = {},
  ): Promise<string> {
    const attributes = node.attrs,
      children = node.content ?? [];
    const alignment = ["left", "center", "right", "justify"].includes(
      string(attributes?.textAlign),
    )
      ? string(attributes?.textAlign)
      : "";
    const height = parseFloat(string(attributes?.lineHeight));
    const properties = `${context.paragraph ?? ""}${alignment ? `<w:jc w:val="${alignment === "justify" ? "both" : alignment}"/>` : ""}${Number.isFinite(height) && height > 0 ? `<w:spacing w:line="${Math.round(height * 240)}" w:lineRule="auto"/>` : ""}`;
    switch (node.type) {
      case "paragraph": {
        const style =
          attributes?.kind === "lead"
            ? "Lead"
            : attributes?.kind === "caption"
              ? "Caption"
              : context.quote
                ? "Quote"
                : "";
        return paragraph(
          runs(children, context.run),
          `${style ? `<w:pStyle w:val="${style}"/>` : ""}${properties}`,
        );
      }
      case "heading": {
        const level = number(attributes?.level, 1),
          style = level === 1 ? "Title" : level === 2 ? "Heading1" : "Heading2";
        return paragraph(
          runs(children),
          `<w:pStyle w:val="${style}"/><w:keepNext/>${properties}`,
        );
      }
      case "blockquote":
        return blocks(children, { ...context, quote: true });
      case "blockMath":
        return paragraph(
          run(`$$${string(attributes?.latex)}$$`, font("Menlo")),
          '<w:spacing w:before="120" w:after="160"/>',
        );
      case "codeBlock":
        return children
          .map((child) => child.text ?? "")
          .join("")
          .split("\n")
          .map((line) =>
            paragraph(run(line || " "), '<w:pStyle w:val="Code"/>'),
          )
          .join("");
      case "horizontalRule":
        return paragraph(
          "",
          `<w:spacing w:before="200" w:after="200"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="${LINE}"/></w:pBdr>`,
        );
      case "image":
        return picture(string(attributes?.src), string(attributes?.alt));
      case "bulletList":
      case "orderedList": {
        const level = Math.min(4, context.level ?? 0),
          id = context.list ?? numbering.length + 1;
        if (context.list === undefined)
          numbering.push({
            id,
            ordered: node.type === "orderedList",
            start: number(attributes?.start, 1),
          });
        const result: string[] = [];
        for (const item of children)
          for (const [index, child] of (item.content ?? []).entries()) {
            if (child.type === "bulletList" || child.type === "orderedList")
              result.push(
                await block(child, {
                  level: level + 1,
                  ...(child.type === node.type ? { list: id } : {}),
                }),
              );
            else
              result.push(
                await block(child, {
                  ...context,
                  paragraph: index
                    ? ""
                    : `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${id}"/></w:numPr>`,
                }),
              );
          }
        return result.join("");
      }
      case "taskList": {
        const result: string[] = [];
        for (const item of children)
          for (const [index, child] of (item.content ?? []).entries()) {
            if (child.type !== "paragraph") {
              result.push(await block(child, context));
              continue;
            }
            const done = item.attrs?.checked === true;
            result.push(
              paragraph(
                run(
                  index ? "\t" : `${done ? "☑" : "☐"}\t`,
                  `${font("Segoe UI Symbol")}<w:color w:val="${done ? BLUE : SOFT}"/>`,
                ) +
                  runs(
                    child.content,
                    done ? `<w:strike/><w:color w:val="${SOFT}"/>` : "",
                  ),
                '<w:ind w:left="360" w:hanging="360"/><w:spacing w:after="60"/>',
              ),
            );
          }
        return result.join("");
      }
      case "table": {
        const rows: string[] = [],
          continuations = new Map<number, { left: number; span: number }>();
        const cellXml = (
          body: string,
          span: number,
          merge: "restart" | "continue" | null,
          header: boolean,
        ) =>
          `<w:tc><w:tcPr>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}${merge ? `<w:vMerge w:val="${merge}"/>` : ""}${header ? '<w:shd w:val="clear" w:fill="FAF5F9"/>' : ""}<w:tcMar><w:top w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar></w:tcPr>${body || "<w:p/>"}${body.endsWith("</w:tbl>") ? "<w:p/>" : ""}</w:tc>`;
        for (const row of children) {
          let column = 0;
          const cells: string[] = [];
          const appendMerged = () => {
            let merge = continuations.get(column);
            while (merge) {
              cells.push(cellXml("", merge.span, "continue", false));
              const position = column;
              column += merge.span;
              if (--merge.left <= 0) continuations.delete(position);
              merge = continuations.get(column);
            }
          };
          for (const cell of row.content ?? []) {
            appendMerged();
            const header = cell.type === "tableHeader",
              span = Math.max(1, number(cell.attrs?.colspan, 1)),
              height = number(cell.attrs?.rowspan, 1);
            cells.push(
              cellXml(
                await blocks(cell.content ?? [], {
                  ...context,
                  ...(header ? { run: "<w:b/>" } : {}),
                }),
                span,
                height > 1 ? "restart" : null,
                header,
              ),
            );
            if (height > 1)
              continuations.set(column, { left: height - 1, span });
            column += span;
          }
          appendMerged();
          rows.push(
            `<w:tr>${(row.content ?? []).every((cell) => cell.type === "tableHeader") ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.join("")}</w:tr>`,
          );
        }
        const borders = ["top", "bottom", "left", "right", "insideH", "insideV"]
          .map(
            (side) => `<w:${side} w:val="single" w:sz="4" w:color="${LINE}"/>`,
          )
          .join("");
        return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>${rows.join("")}</w:tbl><w:p/>`;
      }
      default:
        return blocks(children, context);
    }
  }

  const content = json.content ?? [],
    first = content[0] ? plainText(content[0]).trim() : "";
  const body = `${title && first.toLowerCase() !== title.trim().toLowerCase() ? paragraph(run(title), '<w:pStyle w:val="Title"/>') : ""}${await blocks(content)}`;
  files["word/document.xml"] = strToU8(
    `${XML}<w:document xmlns:w="${WORD}" xmlns:r="${REL}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body || "<w:p/>"}<w:sectPr><w:pgSz w:w="${page.width}" w:h="${page.height}"/><w:pgMar w:top="1152" w:right="1224" w:bottom="1224" w:left="1224"/></w:sectPr></w:body></w:document>`,
  );
  files["word/_rels/document.xml.rels"] = strToU8(
    `${XML}<Relationships xmlns="${PACKAGE}">${relationships.join("")}</Relationships>`,
  );
  files["_rels/.rels"] = strToU8(
    `${XML}<Relationships xmlns="${PACKAGE}"><Relationship Id="document" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="core" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="app" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  );
  files["docProps/core.xml"] = strToU8(
    `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title || "Document")}</dc:title><dc:creator>Aegis</dc:creator></cp:coreProperties>`,
  );
  files["docProps/app.xml"] = strToU8(
    `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Aegis</Application></Properties>`,
  );
  files["word/settings.xml"] = strToU8(
    `${XML}<w:settings xmlns:w="${WORD}"><w:defaultTabStop w:val="720"/></w:settings>`,
  );
  const styles = [
    [
      "Normal",
      "Normal",
      "",
      font("Arial") + `<w:sz w:val="24"/><w:color w:val="${INK}"/>`,
      '<w:spacing w:after="120" w:line="288" w:lineRule="auto"/>',
    ],
    [
      "Title",
      "Title",
      "Normal",
      '<w:b/><w:sz w:val="54"/>',
      '<w:spacing w:after="200"/><w:outlineLvl w:val="0"/>',
    ],
    [
      "Heading1",
      "heading 1",
      "Normal",
      '<w:b/><w:sz w:val="39"/>',
      '<w:spacing w:before="360" w:after="80"/><w:outlineLvl w:val="0"/>',
    ],
    [
      "Heading2",
      "heading 2",
      "Normal",
      '<w:b/><w:sz w:val="30"/>',
      '<w:spacing w:before="280" w:after="60"/><w:outlineLvl w:val="1"/>',
    ],
    [
      "Lead",
      "Lead",
      "Normal",
      `<w:sz w:val="29"/><w:color w:val="${SOFT}"/>`,
      '<w:spacing w:after="160"/>',
    ],
    [
      "Caption",
      "Caption",
      "Normal",
      `<w:sz w:val="20"/><w:color w:val="${SOFT}"/>`,
      "",
    ],
    [
      "Quote",
      "Quote",
      "Normal",
      `<w:sz w:val="27"/><w:color w:val="${SOFT}"/>`,
      '<w:ind w:left="360"/><w:spacing w:before="160" w:after="160"/><w:pBdr><w:left w:val="single" w:sz="18" w:color="F27AA8" w:space="12"/></w:pBdr>',
    ],
    [
      "Code",
      "Code",
      "Normal",
      font("Menlo") + '<w:sz w:val="20"/><w:color w:val="F1ECF3"/>',
      '<w:spacing w:after="0" w:line="276"/><w:shd w:val="clear" w:fill="262229"/><w:ind w:left="180" w:right="180"/>',
    ],
  ] as const;
  files["word/styles.xml"] = strToU8(
    `${XML}<w:styles xmlns:w="${WORD}">${styles.map(([id, name, basedOn, runProperties, paragraphProperties]) => `<w:style w:type="paragraph" w:styleId="${id}"${id === "Normal" ? ' w:default="1"' : ""}><w:name w:val="${name}"/>${basedOn ? `<w:basedOn w:val="${basedOn}"/>` : ""}<w:next w:val="Normal"/><w:pPr>${paragraphProperties}</w:pPr><w:rPr>${runProperties}</w:rPr></w:style>`).join("")}</w:styles>`,
  );
  files["word/numbering.xml"] = strToU8(
    `${XML}<w:numbering xmlns:w="${WORD}">${numbering.map(({ id, ordered, start }) => `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${[0, 1, 2, 3, 4].map((level) => `<w:lvl w:ilvl="${level}"><w:start w:val="${start}"/><w:numFmt w:val="${ordered ? (level % 3 === 0 ? "decimal" : level % 3 === 1 ? "lowerLetter" : "lowerRoman") : "bullet"}"/><w:lvlText w:val="${ordered ? `%${level + 1}.` : level % 3 === 0 ? "•" : level % 3 === 1 ? "◦" : "▪"}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 + level * 360}" w:hanging="${ordered ? 300 : 260}"/></w:pPr></w:lvl>`).join("")}</w:abstractNum><w:num w:numId="${id}"><w:abstractNumId w:val="${id}"/></w:num>`).join("")}</w:numbering>`,
  );
  files["[Content_Types].xml"] = strToU8(
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[
      ["png", "png"],
      ["jpg", "jpeg"],
      ["gif", "gif"],
      ["bmp", "bmp"],
    ]
      .map(
        ([extension, type]) =>
          `<Default Extension="${extension}" ContentType="image/${type}"/>`,
      )
      .join("")}${[
      ["document", "document.main"],
      ["styles", "styles"],
      ["numbering", "numbering"],
      ["settings", "settings"],
    ]
      .map(
        ([part, type]) =>
          `<Override PartName="/word/${part}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`,
      )
      .join(
        "",
      )}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  );
  return zipSync(files, { level: 6 });
}
