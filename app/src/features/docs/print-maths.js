import css from 'katex/dist/katex.min.css?raw';

// A native print window loads a temporary file. Embed fonts so it also works offline.
const fonts = import.meta.glob('/node_modules/katex/dist/fonts/*.woff2', { eager: true, query: '?inline', import: 'default' });
export const printMathsCSS = css.replace(/url\(fonts\/([^)]*\.woff2)\)/g, (_match, name) => `url("${fonts['/node_modules/katex/dist/fonts/' + name]}")`);
