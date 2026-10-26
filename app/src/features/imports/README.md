# File imports, items 14 and 15

Canvas drops, file paste, More tools > Media > Import, Import images (I) and the
media picker share `features/media/imports.js`. Mixed file lists import once.
Each import captures its destination board before waiting for other imports,
conversion or upload. A thin progress line remains visible throughout conversion.

- PDF becomes a document window. Font sizes suggest Markdown headings. TipTap
  JSON keeps the editable text, followed by each rendered page. `props.pages`
  also lists the page assets. Scanned PDFs retain their pages and explain that
  there is no selectable text. Password-protected PDFs ask for an unlocked copy.
- PPTX becomes a deck in presentation relationship order. Text shapes and table
  cells supply the title and body. Embedded raster pictures and SVGs become
  uploaded image assets. External pictures, EMF and other unsupported picture
  formats are skipped with an export-to-PDF message. Text and pictures remain
  separate when a slide is edited. This is a content import, without the original
  slide positioning, charts, transitions, SmartArt or animations.
- Keynote uses `Data/st-*` previews in numeric filename order, then QuickLook,
  then a top-level `preview.jpg` or `preview.png`. It does not decode Apple IWA.
  A package-directory drop is repacked with its original relative paths. A
  bundle without previews asks the person to export to PDF.

Successful imports retain the original as `props.import: {format, name,
original: 'asset:…'}`. Decks link the original in their strip and editor. Every
imported card also has Download original file in its card menu. Downloads use
Blob links, so the existing native save adapter works in WKWebView. Document
image JSON stores stable `asset:` references. The image extension resolves them
only when rendering HTML, without saving the host's temporary port.

Limits: 64 MB per source file or package, 128 MB expanded ZIP data, 24 MB per ZIP
entry, 5,000 ZIP entries, 100 PDF pages and 200 deck slides. PDF page images have
a maximum dimension of 1,800 pixels and a combined 96 MB limit. Text is capped
before the host's one MB props boundary. No OCR is performed. Conversion failures
create no partial card. Uploaded assets from a later failed conversion stay in
the asset store, which has no deletion endpoint.

`pdf-resources.ts` provides same-origin CMaps, fallback fonts and decoders in
Vite and emits the same relative paths in a production build. The worker is a
Vite worker entry using the compatibility distribution and an original
`Promise.withResolvers` shim in both threads. Each import terminates its worker
after conversion. The host serves `.mjs` as
JavaScript and `.wasm` as WebAssembly. No CDN or blob worker
is needed. The imports check can run against the built host UI under the app's
CSP with `AEGIS_IMPORTS_BUILT=1`.

`motion.ts` adds short toast enter/exit motion and import-only card
arrival/removal motion. The first-minute feature owns the quiet empty-board actions. Card
removal motion requires an explicit pointer Delete action, so agent batches
remain under the speed worker's control. Document and deck
editors retain the existing shared shell's open/close motion. Keyboard actions
are instant. Both reduced-motion settings disable travel. There is no polling
or extra frame listener.

## Dependencies and licences

| Dependency or resource | Version | Licence |
| --- | --- | --- |
| pdfjs-dist | 6.4.299, exact | Apache-2.0 |
| fflate | 0.8.3, exact | MIT |
| core-js, bundled in pdf.js compatibility code | 3.50.0 | MIT |
| Liberation Sans fallback fonts | 2.1.5 | SIL OFL 1.1 |
| @napi-rs/canvas and its optional platform packages | 1.0.13 | MIT, optional Node-only pdf.js dependency, not used by this UI |
| PDF.js bundled CMaps, Foxit fonts and decoder resources | pdfjs-dist 6.4.299 | BSD-2-Clause, BSD-3-Clause, MIT, Apache-2.0 and CC0, notices kept beside the files |

The old GPL Liberation files inside pdfjs-dist are excluded from emitted
resources. The replacement fonts come from the unmodified official
[Liberation 2.1.5 release](https://github.com/liberationfonts/liberation-fonts/releases/tag/2.1.5).
Their full licence is in `fonts/LICENSE`. The release archive's SHA256 is
`7191c669bf38899f73a2094ed00f7b800553364f90e2637010a69c0e268f25d0`.
The production output also includes pdf.js and fflate's full licences.

Fixtures contain original text and canvas drawings. Regenerate them with
`PLAYWRIGHT=… node checks/fixtures/generate-imports.mjs`. The `.key` fixtures
exercise bundle preview extraction, rather than pretending to be real editable
Keynote presentations.

## Verification

Run from this worktree with `AEGIS_PORT_OFFSET=600` and
`AEGIS_CHECK_OUT=/tmp/aegis-wt-imports-out`:

```
npm run check
PLAYWRIGHT=… npm run check:ui
PLAYWRIGHT=… npm run bench
npm --prefix app run build
AEGIS_IMPORTS_BUILT=1 PLAYWRIGHT=… node checks/ui/imports.mjs
```

The imports check uses port 5195 plus the offset and temporary host data. It
asserts persisted card data, asset bytes, module worker loading, editable
documents/decks, original downloads, picker access, directory drops, failure
limits, paste, board switching and motion. It saves screenshots at 1440, 1586
and 390 pixels with fresh filenames. A built-host run checks production paths
and CSP, but is not a native macOS bundle smoke test.
