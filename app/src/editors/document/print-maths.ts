import css from "katex/dist/katex.min.css?raw";

const fonts = import.meta.glob<string>(
  "/node_modules/katex/dist/fonts/*.woff2",
  { eager: true, query: "?inline", import: "default" },
);
export const printMathsCSS = css.replace(
  /url\(fonts\/([^)]*\.woff2)\)/g,
  (_match: string, name: string) => {
    const font = fonts[`/node_modules/katex/dist/fonts/${name}`];
    if (!font) throw new Error(`The print font ${name} is missing`);
    return `url("${font}")`;
  },
);
