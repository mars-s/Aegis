# React decks

The card preview, editor, filmstrip and presentation use `SlideView` and the same schema-derived slides. Saved value/label charts retain their original axes through `ValueChart`. Charts with an explicit spec or bound source use the data slice's `DeckChart`. Imported pictures keep their asset references; the original presentation remains downloadable.

Integrate `deckCards(services)` and `deckEditors(services)` from `cards/deck/index.tsx` once per runtime. `DeckServices` supplies `assetUrl` and the existing shared `createMenu` control. Canvas Open uses the central `openCardEditor` dispatcher, so the current editor can refuse a switch. The app owns the side editor shell, width controls, motion, camera bookmark and focus return. `deckTools` supplies the discrete create action; `placeDeck(context, point)` supports the shared click-placement dispatcher.

A session belongs to one Workspace, board and card. It retains pending slide edits across view lifetimes. Closing calls `flushDeck`, which submits one authored transaction and can refuse during IME or after a conflicting remote field edit. Unrelated props and other slide edits survive. Saved means the workspace has no pending or blocked writes. Failed saves expose Retry; conflicting drafts can be copied before choosing the latest slides.

Slide fits use ResizeObserver and fixed 960 by 540 content. Value charts paint inside the slide and size their text and dots from the containing fit. Dots stay within the chart gutters even in tiny thumbnails. Shared charts paint outside the slide transform with the fitted height and viewScale 1. Camera zoom scales this content normally. No camera observer or animation-frame loop changes React state. Lease portals remain owned by the scene. Offscreen miniature shared charts defer their bodies using IntersectionObserver. Thumbnail clicks commit their selection synchronously so rapid clicks cancel the preceding transition before starting another.

`tsconfig.json` checks the production implementation. Twelve regression tests in `session.test.tsx` and `chart.test.tsx` cover transaction boundaries, remote conflicts, board isolation, composition, slide identities, legacy backgrounds, chart conversion and the rendered value chart. Root Vitest discovery includes this directory. Browser parity additionally checks chart geometry, painted glyphs, presentation, save/reload and editor return. Shared keyboard and scene requests are recorded in the external deck report.

## Card contract

`deck` is a card type shared by the canvas and agent host. Its default size is 470 × 352. `text` names the deck. `props.slides` holds the ordered slides and `props.current` is the current index, starting at zero.

Each slide has a stable `id`, a `layout`, `title`, `sub` and `body`. The layouts are:

- `title`: large title and subtitle. New slides use `background: "plain"`, labelled Typography. Choose Sci-fi wave in the background menu, or set `background: "sci-fi-wave"`, to draw decorative thin ridge lines. The wave is not chart data. Saved slides without a background keep their original wave. New slides added through agent updates default to Typography, and edits that omit an existing background preserve it.
- `chart`: title and subtitle above `chart: { values: number[], target?: number, label?: string, unit?: string, smooth?: boolean, sourceId?: string }`. The label describes the chart for assistive technology. Straight segments are the default. Set `smooth: true` to save an explicit curve. `sourceId` reads a canvas plot and its smoothing choice when the slide renders, with saved values as the fallback if the plot is unavailable. Zero is a valid target. The axis shows the optional unit without rescaling values. Tick steps use 1, 2, 2.5 or 5 times a power of ten, with whole-number ticks for integer data.
- `three`: title and subtitle above three independent columns. The first three lines of `body` are editable column labels. Choose Overlapping circles in Idea arrangement, or set `relationship: "overlap"`, only when the ideas have that relationship. Missing `relationship` and `relationship: "columns"` use columns.
- `text`: title, subtitle and plain body text.
- `image`: editable title and body beside `images: [{src: 'asset:…', alt}]`. `imageOnly: true` fits the pictures to the full slide for Keynote previews. Images are contained without cropping. Imported decks keep `props.import: {format, name, original}` and expose the original asset in the window and editor.

Agents use `create { type: 'deck', text, props: { slides, current: 0 } }` and `update { id, set: { props: { slides, current } } }`. Send the complete ordered slide list when editing. Pictures must be the person's own media. These layouts draw HTML and SVG, with no external photos or assets.
