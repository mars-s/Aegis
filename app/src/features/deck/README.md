# Slide decks

`deck` is a card type shared by the canvas and agent host. Its default size is 470 × 352. `text` names the deck. `props.slides` holds the ordered slides and `props.current` is the current index, starting at zero.

Each slide has a stable `id`, a `layout`, `title`, `sub` and `body`. The layouts are:

- `title`: large title and subtitle above thin ridge lines.
- `chart`: title and subtitle above `chart: { values: number[], target?: number, label?: string }`. The label describes the chart for assistive technology. Zero is a valid target.
- `three`: title and subtitle beside three overlapping circles. The first three lines of `body` label the circles.
- `text`: title, subtitle and plain body text.
- `image`: editable title and body beside `images: [{src: 'asset:…', alt}]`. `imageOnly: true` fits the pictures to the full slide for Keynote previews. Images are contained without cropping. Imported decks keep `props.import: {format, name, original}` and expose the original asset in the window and editor.

Agents use `create { type: 'deck', text, props: { slides, current: 0 } }` and `update { id, set: { props: { slides, current } } }`. Send the complete ordered slide list when editing. Pictures must be the person's own media. These layouts draw HTML and SVG, with no external photos or assets.

Double-click, Return on one selected deck, the card menu's Open deck item, and the bubbling `aegis:open-card` event with `{ id }` all open the editor. The Slides tool shares the document tool's `write` group and uses the unused B key.

Slides scroll vertically with a soft snap at their top. The bottom filmstrip follows scrolling and moves to clicked slides. Titles, subtitles and text-layout bodies use `contenteditable="plaintext-only"`. Saves wait 350 ms after a change, use `ctx.apply`, and show Saved only after the host confirms the stored values. Closing flushes pending edits. External board changes refresh an idle editor; deleting a deck or switching boards closes it.

Alt+Up and Alt+Down reorder the active slide. Delete or Backspace on a focused thumbnail removes it. Visible move and delete buttons also work by pointer and touch. Arrow keys, Home and End navigate the filmstrip. Esc closes. Removing every slide leaves an empty deck with Add slide available.

`openDeckPanel` in `editor.js` is the temporary panel adapter. Replace it with the shared `features/docs/side.js` panel at merge. It owns the `.side-editor*` frame, `body.editor-open` and `body.editor-wide`, focus return, camera centring, 260 ms open and 200 ms close motion. Keyboard opens and closes are instant. Reduced motion and `body.motion-off` use a 160 ms crossfade with no travel.

The canvas preview, thumbnails and editor render the same native 960 by 540 slide. Each frame centres and scales the entire slide to fit both available dimensions, with the card colour filling any spare space. Imported slides use the same fit. A ResizeObserver updates the scale on frame resize, including corner-grip resizing and editor width changes, without reacting to canvas pan or zoom. Observers disconnect on card removal, editor close and slide rerender.

The renderer has no frame listener or polling. SVG ridge art is built once per module. Slides redraw only when card content changes. Editor scroll work is limited to the open deck and runs once per scroll frame.

Checks: `agent/checks/deck.test.mjs` and `checks/ui/deck.mjs`. Browser checks use temporary data and base port 5192 plus `AEGIS_PORT_OFFSET`. Screenshots go to `AEGIS_CHECK_OUT`.
