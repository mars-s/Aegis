const names = new Map([
  ["Inter Variable", "Inter"],
  ["system-ui", "System"],
  ["sans-serif", "Sans serif"],
  ["serif", "Serif"],
  ["monospace", "Monospace"],
]);
const normalise = (font: string) => font.replace(/["']/g, "").trim();
const implementationFont =
  /KaTeX|MathJax|MJX|STIX|Latin Modern Math|Cambria Math|Asana Math|Symbol|Wingdings|Webdings|Font\s*Awesome|Material\s*(?:Icons|Symbols)|LastResort|Emoji|^(?:\.|g_d\d+_f)/i;
export const writingFont = (font: string): boolean =>
  !!normalise(font) && !implementationFont.test(normalise(font));
export const fontName = (font: string): string =>
  names.get(normalise(font)) ?? normalise(font);
export const fontFamily = (font: string): string =>
  ["system-ui", "serif", "sans-serif", "monospace"].includes(font)
    ? font
    : `"${normalise(font)}"`;
export function writingFonts(extra: readonly string[] = []): string[] {
  const fonts = new Set([
    "Inter Variable",
    "system-ui",
    "Arial",
    "Helvetica Neue",
    "Georgia",
    "Times New Roman",
    "Menlo",
    "monospace",
    "sans-serif",
    "serif",
    ...extra,
  ]);
  document.fonts.forEach((font) => fonts.add(normalise(font.family)));
  return [...fonts].filter(writingFont);
}
