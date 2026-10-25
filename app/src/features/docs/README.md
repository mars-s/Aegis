# Documents

The `doc` card uses `text` for its title and `props.doc` for Tiptap JSON.
`props.body` mirrors the document as plain text for board tools and agents.
All edits use board `update` commands. Existing props remain intact.
The board overview retains a plain-text `props.body` when it summarises a large
rich payload, so agents can still read a long document without its rich JSON.

D1 to D7 are implemented in this folder. Use Doc or D and click the board to
create a document. Double-click a pill, press Enter with one doc selected, or
choose Open document from its context menu to reopen it. The title's Enter key
moves into the editor. Back, Close and Escape flush pending edits.

The title is an inline input in the editor's window strip. The canvas strip shows
the same title. There is no title field in the page and no formatting toolbar.
Write Markdown directly: `#`, `##`, `###`, `-`, `1.`, `- [ ]`, `>`, `**bold**`,
`*italic*`, inline code, fenced code blocks, `---` and links. TipTap input rules
format as you type. Pasted Markdown becomes rich content, including maths.
Rich HTML, board cards and image clipboard content retain their existing paths.

Use `$inline LaTeX$` and `$$block LaTeX$$` for maths. KaTeX 0.19.1 (MIT)
renders `inlineMath` and `blockMath` nodes with a `latex` attribute. Click or
keyboard-focus a formula and press Enter to edit its source. Escape or blur
commits the source and renders it again. The plain text mirror keeps the LaTeX
and delimiters for agents. Canvas previews render the same nodes. PDF print
embeds KaTeX fonts so the native print window works offline. Word exports maths
as a Menlo run containing the LaTeX source and delimiters.

One quiet Document options menu (`…`) in the title bar holds PDF, Word, page
colour and paper size. Text appearance and inserts retains the less common
formatting controls, tables, images and Undo. The selection bubble retains
formatting and Rewrite. Choices are themed and support arrows, Home, End,
type-ahead, Enter and Escape. `menu.js` is temporary until the shared
`lib/ui/dropdown.js` from the canvas worker is available.

Legacy documents remove a leading H1 only when its text equals the title.
Opening an old document or rendering its canvas window saves this migration
through the normal board update. `props.docTitleMigrated` records it, so later
intentional headings are preserved. Other document props remain intact.

Documents share the floating shell in `side.js` with sheets and slides. It covers
the right half of the window without resizing the canvas. Full width covers the
window with an 8px margin. Pointer opens glide the card to the left half;
keyboard opens are instant and leave the camera alone. `docs-open` and
`docs-full` remain aliases for `editor-open` and `editor-wide`.

`openSide({ title, kind, keyboard })` returns `{ el, body, close, setSaved }`.
Append editor content to `body`, call `setSaved('Saving…')` or `setSaved('Saved')`,
and listen for `side-editor-close` on `el` to save and dispose resources. Opening
another shell fires that event on the previous one before replacing it.
`close({ keyboard: true })` closes instantly. The shell provides Escape, Full
width, the close button and body classes. It never traps focus. Optional
`centreCardInLeft(card, ctx, keyboard)` handles the pointer camera glide.

Page appearance is a local preference in `aegis:doc-page`. Paper size is stored in
`aegis:doc-paper`. Neither changes the board document. PDF opens the native macOS print sheet through `printHtml` in the desktop app.
A plain browser falls back to printing the same HTML from a hidden iframe. Choose Save as PDF in the print dialogue. Word downloads
an editable DOCX Blob using a lazy import of `docx`. Exports use light paper.
The converter retains headings, text styles, lists, checked tasks, links, tables
and embedded PNG, JPEG, GIF and BMP pictures. Other image uploads are converted
to PNG before insertion. External picture URLs are not embedded by the Word
converter. Image imports check the board's existing one MB props limit.

Drag text cards onto the open document or onto a closed doc pill to copy their
content. Sources return to their original positions. Copied links keep their preview title and description, with explicit edits taking priority. Spotify cards also keep their preview title and description. A closed-pill copy offers
Undo for eight seconds. The open editor uses its normal Undo history. Board
Copy and editor Paste support an `application/x-aegis-cards` clipboard payload
containing the source board id and card ids. Copy selected board cards is also
available in the footer and card context menu. Copying a doc into itself is
excluded. Image file drop and paste are separate from board card copying.

## Agent rewrite adapter, D8

`registerDocRewriter` is exported by `index.ts` and `editor.js`. A host adapter
can connect the two Rewrite menus without coupling the editor to a provider:

```js
import { registerDocRewriter } from './features/docs/editor.js';

const disconnect = registerDocRewriter(async request => {
  // Return a string from the host's rewrite operation.
  // request contains text, how, title, around, boardId, cardId and host.
  return yourRewriteAdapter(request);
});
```

The Aegis host currently has no isolated text rewrite endpoint. Until an adapter
is registered, selecting Rewrite explains that requirement. The hook passes the
selection and up to 700 characters on either side, refuses stale results if the
document changed, selects the replacement and keeps Undo. It never silently
starts a board-writing agent to perform a text-only rewrite.

## Integration

`setup.js` registers the renderer, tool, card menus, clipboard and drop resolver.
`lib/board/types/docs.js` registers the 240 by 56 pill in both app and host.

The shared canvas addition is `registerCardDropTarget(resolve)`. The
resolver receives `{ cards, x, y }` during a board drag. It returns an action
when the point accepts those cards. Before running the action, the engine
restores source card positions and skips the normal move batch. Calling the
resolver with no cards clears its highlight. Existing drag handlers still run
for ordinary moves.

The browser check is `checks/ui/docs.mjs`. It starts a fake-model
host with temporary data and Vite on port 5181 plus `AEGIS_PORT_OFFSET`.
`checks/ui/editors.mjs` uses base port 5191 and checks the shared shell and sheet
editor. Screenshots go to `AEGIS_CHECK_OUT`. `AEGIS_DOCS_ISOLATED=1` intercepts
only the feature entry module to load docs while other feature agents are still
writing imports. Normal runs load all features. The print test intercepts the
iframe's `print()` call and checks the actual print HTML, since headless Chromium
has no Save as PDF dialogue.

The docs browser check asserts computed colours for automatic, light and dark
paper, preference persistence after reopening and reload, unchanged saved document
data, and light print output while the editor uses dark paper. It also checks a
copied link's title, description and destination against the saved host document.

The docs browser check also simulates a successful native `printHtml` adapter to
verify that it receives the title, paper size and body, and skips the iframe. This
checks dispatch, not the physical macOS print sheet. The existing preparation
toast asks the person to choose Save as PDF in the print dialogue and does not
claim that a PDF was saved.

The browser check also verifies all Markdown input rules, Markdown paste, a
single title in the strip, inline and block KaTeX in the editor and canvas,
source editing with Escape and blur, maths exports, self-contained print fonts,
keyboard menu navigation, reload persistence and both title migration paths.
It captures maths at 1440, 1586 and 390 pixel widths under unique filenames.
