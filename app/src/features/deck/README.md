# Slide decks

`deck` is a card type shared by the canvas and agent host. Its default size is 470 × 352. `text` names the deck. `props.slides` holds the ordered slides and `props.current` is the current index, starting at zero.

Each slide has a stable `id`, a `layout`, `title`, `sub` and `body`. The layouts are:

- `title`: large title and subtitle. New slides use `background: "plain"`, labelled Typography. Choose Sci-fi wave in the background menu, or set `background: "sci-fi-wave"`, to draw decorative thin ridge lines. The wave is not chart data. Saved slides without a background keep their original wave. New slides added through agent updates default to Typography, and edits that omit an existing background preserve it.
- `chart`: title and subtitle above `chart: { values: number[], target?: number, label?: string, unit?: string }`. The label describes the chart for assistive technology. Zero is a valid target. The axis shows the optional unit without rescaling values. Tick steps use 1, 2, 2.5 or 5 times a power of ten, with whole-number ticks for integer data.
- `three`: title and subtitle above three independent columns. The first three lines of `body` are editable column labels. Choose Overlapping circles in Idea arrangement, or set `relationship: "overlap"`, only when the ideas have that relationship. Missing `relationship` and `relationship: "columns"` use columns.
- `text`: title, subtitle and plain body text.
- `image`: editable title and body beside `images: [{src: 'asset:…', alt}]`. `imageOnly: true` fits the pictures to the full slide for Keynote previews. Images are contained without cropping. Imported decks keep `props.import: {format, name, original}` and expose the original asset in the window and editor.

Agents use `create { type: 'deck', text, props: { slides, current: 0 } }` and `update { id, set: { props: { slides, current } } }`. Send the complete ordered slide list when editing. Pictures must be the person's own media. These layouts draw HTML and SVG, with no external photos or assets.

Double-click, Return on one selected deck, the card menu's Open deck item, and the bubbling `aegis:open-card` event with `{ id }` all open the editor. The Slides tool shares the document tool's `write` group and uses the unused B key.

The editor opens with one active slide centred in the available area, a 40px ribbon and a 104px bottom filmstrip. Each thumbnail is 112 by 63px, with its number and title below it. Overview is an explicit toggle for vertical scrolling through all slides, with the filmstrip following the current slide. The active view keeps the same slide when leaving Overview. Titles, subtitles and text-layout bodies use `contenteditable="plaintext-only"`. Saves wait 350 ms after a change, use `ctx.apply`, and show Saved only after the host confirms the stored values. Closing flushes pending edits. External board changes refresh an idle editor; deleting a deck or switching boards closes it.

Alt+Up and Alt+Down reorder the active slide. Delete or Backspace on a focused thumbnail removes it. Visible move and delete buttons also work by pointer and touch. Arrow keys, Home and End navigate the filmstrip. Esc closes. Removing every slide leaves an empty deck with Add slide available.

`openDeckPanel` in `editor.js` uses the shared `features/docs/side.js` panel. The shared shell owns the `.side-editor*` frame, `body.editor-open` and `body.editor-wide`, focus return, camera centring, 260 ms open and 200 ms close motion. Keyboard opens and closes are instant. Reduced motion and `body.motion-off` use a 160 ms crossfade with no travel.

The canvas preview, thumbnails and editor render the same native 960 by 540 slide. Each frame centres and scales the entire slide to fit both available dimensions, with the card colour filling any spare space. Imported slides use the same fit. A ResizeObserver updates the scale on frame resize, including corner-grip resizing and editor width changes, without reacting to canvas pan or zoom. Observers disconnect on card removal, editor close and slide rerender.

Pointer slide changes use a 160ms ease-out transition with a six-pixel travel and a slight fade. A new change cancels the previous transition immediately. Keyboard changes, reduced motion and Motion off are instant. Present uses the same transition and keeps its own keyboard handling.

SVG labels declare their font in SVG user units and use `text-rendering: geometricPrecision`. Chromium can report correct text bounds while its default SVG text painter loses glyphs through the combined viewBox and fitted slide transforms. A controlled override back to `text-rendering: auto` made all three diagram labels disappear at both 1x and 2x pixel density, even with explicit font sizes. WebKit kept painting them. Geometric precision fixed the reproduced fault. Slide text uses a fixed light foreground on the dark slide, independent of the app theme. At a 960 by 540 presentation, chart axes render at 18.24px and overlapping labels at 22.1px, with 9.35:1 text contrast.

The renderer has no frame listener or polling. SVG ridge art is built once per module. Slides redraw only when card content changes. Editor scroll work is limited to the open deck and runs once per scroll frame.

Checks: `agent/checks/deck.test.mjs`, `checks/ui/deck.mjs` and the registered `checks/ui/deck-studio.mjs`. The studio suite runs the production bundle in Chromium and WebKit, decodes real screenshots to check painted glyph coverage and contrast, and exercises two presentation sizes, 1x and 2x pixel density, both themes, responsive layout, overview scrolling, keyboard navigation, motion interruption, both motion settings, column editing, circles, wave selection and save/reload. Browser checks use temporary data and base port 5192 plus `AEGIS_PORT_OFFSET`. Screenshots go to `AEGIS_CHECK_OUT`.
