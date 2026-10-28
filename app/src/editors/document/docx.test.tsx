import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import type { RichNode } from "@aegis/domain";
import { toDocx } from "./docx.js";

const paragraph = (text: string): RichNode => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
async function parts(content: RichNode[], title = "Project brief") {
  const archive = unzipSync(
    await toDocx({ type: "doc", content }, { title, paper: "letter" }),
  );
  return (name: string): string => {
    const bytes = archive[name];
    if (!bytes) throw new Error(`Missing DOCX part ${name}`);
    return strFromU8(bytes);
  };
}

describe("document Word export", () => {
  it("creates an editable Word package with escaped content, a single title and Letter paper", async () => {
    const read = await parts(
      [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Project <brief>" }],
        },
        paragraph("A & B"),
      ],
      "Project <brief>",
    );
    const document = read("word/document.xml");
    expect(document.match(/Project &lt;brief&gt;/g)).toHaveLength(1);
    expect(document).toContain("A &amp; B");
    expect(document).toContain('<w:pgSz w:w="12240" w:h="15840"/>');
    expect(read("[Content_Types].xml")).toContain(
      "wordprocessingml.document.main+xml",
    );
    expect(read("_rels/.rels")).toContain('Target="word/document.xml"');
    expect(read("docProps/core.xml")).toContain(
      "<dc:creator>Aegis</dc:creator>",
    );
  });

  it("retains rich marks, hyperlinks, checked tasks and editable LaTeX source", async () => {
    const read = await parts([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Styled words",
            marks: [
              { type: "bold" },
              { type: "italic" },
              { type: "underline" },
              {
                type: "textStyle",
                attrs: {
                  fontFamily: "Georgia",
                  fontSize: "20px",
                  color: "#3155c6",
                },
              },
              { type: "link", attrs: { href: "https://example.com/?a=1&b=2" } },
            ],
          },
          { type: "inlineMath", attrs: { latex: "a^2+b^2=c^2" } },
        ],
      },
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [paragraph("Review copy")],
          },
        ],
      },
      { type: "blockMath", attrs: { latex: "\\sum_{i=1}^{n} i" } },
    ]);
    const document = read("word/document.xml");
    for (const markup of [
      "<w:b/>",
      "<w:i/>",
      '<w:u w:val="single"/>',
      'w:ascii="Georgia"',
      '<w:sz w:val="30"/>',
      "w:color",
      "$a^2+b^2=c^2$",
      "$$\\sum_{i=1}^{n} i$$",
      "Review copy",
      "☑",
      "<w:strike/>",
    ])
      expect(document).toContain(markup);
    expect(read("word/_rels/document.xml.rels")).toContain(
      'Target="https://example.com/?a=1&amp;b=2" TargetMode="External"',
    );
  });

  it("restarts independent ordered lists and retains nested bullets", async () => {
    const read = await parts([
      {
        type: "orderedList",
        attrs: { start: 3 },
        content: [{ type: "listItem", content: [paragraph("Three")] }],
      },
      paragraph("A new list follows"),
      {
        type: "orderedList",
        content: [{ type: "listItem", content: [paragraph("One")] }],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              paragraph("Parent"),
              {
                type: "bulletList",
                content: [{ type: "listItem", content: [paragraph("Child")] }],
              },
            ],
          },
        ],
      },
    ]);
    const document = read("word/document.xml"),
      numbering = read("word/numbering.xml");
    expect(document).toContain('<w:ilvl w:val="0"/><w:numId w:val="1"/>');
    expect(document).toContain('<w:ilvl w:val="0"/><w:numId w:val="2"/>');
    expect(document).toContain('<w:ilvl w:val="1"/><w:numId w:val="3"/>');
    expect(numbering).toContain(
      '<w:start w:val="3"/><w:numFmt w:val="decimal"/>',
    );
    expect(numbering).toContain(
      '<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>',
    );
  });

  it("retains merged table cells without dropping the following row", async () => {
    const read = await parts([
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                attrs: { colspan: 2 },
                content: [paragraph("Combined heading")],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: { rowspan: 2 },
                content: [paragraph("Spanning row")],
              },
              { type: "tableCell", content: [paragraph("First value")] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [paragraph("Second value")] },
            ],
          },
        ],
      },
    ]);
    const document = read("word/document.xml");
    expect(document.match(/<w:tr>/g)).toHaveLength(3);
    expect(document).toContain('<w:gridSpan w:val="2"/>');
    expect(document).toContain('<w:vMerge w:val="restart"/>');
    expect(document).toContain('<w:vMerge w:val="continue"/>');
    expect(document).toContain("Second value");
  });
});
