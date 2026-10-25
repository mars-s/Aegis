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

The toolbar includes block styles, font names from the board plus system font
suggestions, size, marks, colours, alignment, lists, tasks, links, embedded images,
resizable tables, dividers and clear formatting. More includes line spacing,
superscript and subscript. Formatting controls reflect the cursor's selection.
Controls wrap onto extra rows in narrow panels. Font names use fonts installed
on the computer. No font files or remote font downloads are bundled here.

Page appearance is a local preference in `aegis:doc-page`. Paper size is stored in
`aegis:doc-paper`. Neither changes the board document. PDF opens browser printing
from a hidden iframe. Choose Save as PDF in the print dialogue. Word downloads
an editable DOCX Blob using a lazy import of `docx`. Exports use light paper.
The converter retains headings, text styles, lists, checked tasks, links, tables
and embedded PNG, JPEG, GIF and BMP pictures. Other image uploads are converted
to PNG before insertion. External picture URLs are not embedded by the Word
converter. Image imports check the board's existing one MB props limit.

Drag text cards onto the open document or onto a closed doc pill to copy their
content. Sources return to their original positions. A closed-pill copy offers
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

The browser smoke test is `/tmp/aegis-check/docs-smoke.mjs`. It starts a fake-model
host with temporary data and Vite on port 5181. `AEGIS_DOCS_ISOLATED=1` intercepts
only the feature entry module to load docs while other feature agents are still
writing imports. Normal runs load all features. The print test intercepts the
iframe's `print()` call and checks the actual print HTML, since headless Chromium
has no Save as PDF dialogue.
