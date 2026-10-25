# Mochiboard feature inventory for Aegis

Source inspected: `/tmp/aegis-ref/mochiboard`, commit `2474cd6a79369e7d7383d2ae858bc4120578dbc3`, on 25 October 2026. This is a source inspection, not a runtime test. Priorities are porting judgements: P1 means core to daily use, P2 means useful supporting functionality, P3 means optional or note only. No implementation files were changed.

Reference key, used in every entry:

| Key | File | Lines |
| --- | --- | --- |
| A | `/tmp/aegis-ref/mochiboard/web/app.js` | 1-4751 |
| H | `/tmp/aegis-ref/mochiboard/web/index.html` | 1-406 |
| S | `/tmp/aegis-ref/mochiboard/web/style.css` | 1-2369 |
| B | `/tmp/aegis-ref/mochiboard/web/bridge.js` | 1-109 |
| R | `/tmp/aegis-ref/mochiboard/src-tauri/src/main.rs` | 1-360 |

Ranges are inclusive. An entry saying “dynamic” means JavaScript creates that UI inside the cited HTML container. “None specific” means there is no separate HTML element or CSS rule for that operation, not that the feature has no implementation.

Shared data and bridge rules:

- Every card starts with exact fields `id`, `type`, `x`, `y`, `w`, `h`, `r`, `color`. `x` and `y` are board coordinates. `r` is the loose card tilt. See A:60-63. `path`, `section` and `spotify` are real types even though they are absent from the default size map and receive sizes elsewhere. `piece` is a placement mode, not a saved card type.
- A new board has `id`, `name`, `color`, `cards`, `links`, `tray`, `view: {x, y, z}`. Later code adds `folder`, `parent`, `palette`, `bg`, `chat`. See A:64-67, 98-121, 430-459, 1961-1965, 2172-2178. `updated` is board-list metadata, not a field set by `newBoard`.
- Below, **save bridge** means `MB.save(board)` via native op `save`, B:84-88, or browser JSON/localStorage, B:33-40. Most card operations use the 400 ms save debounce and show “saving…” then “saved”, A:455-459. Views are saved with boards. There is no separate native call for dragging, formatting, grouping or drawing.
- The **library bridge** is `MB.list()`, `MB.load(id)`, `MB.save(board)`, `MB.remove(id)`, `MB.folders()`, `MB.saveFolders({projects, folders})`, B:33-43, 84-88. Tauri stores board JSON files and `folders.json`, R:39-61. Browser fallback stores them under `mochiboard:` keys.
- Native transport is WebKit `messageHandlers.mb` on the Swift app, or Tauri `invoke('mb', {op, args})`, B:5-13. A method existing on `MB` does not prove every platform implements it.
- Preferences below live in `settings`, saved to localStorage key `mochiboard:settings`, A:1840-1841, 1899-1923, unless another key is named. Transient UI state is identified separately. As written, general board saving serialises the board object, so temporary fields attached to cards can also be present in saved JSON.

Asset restriction applying to every entry: the code licence expressly excludes the name “Mochiboard”, logo/app icon, Mochi character in any form, `web/goo.js` character drawings and outfits, `web/stamps/` including `stamps/px/`, `assets/` pixel art/illustrations, and `web/music/`. Do not port these. Keep the MIT copyright and permission notice for copied code. Evidence: `LICENSE`:3-13, 25-27; `TRADEMARKS.md`:3-18. Feature mechanics below can be inventoried independently of that presentation. Existing third-party media, screenshots and fonts do not become freely redistributable merely because this code references them.

## 1. Docs (doc card + side document editor, toolbar, export PDF/DOCX, dropping cards into a doc, AI rewrite)

### D1. Document card and side editor [P1]

- User sees and does: choose Doc or press `D`, click to place, then type its title. The board card is a small page pill, with a different state when it has body content. Open through the selection bar, or double-click the non-title part. The editor opens beside the board with a title, board/document breadcrumb, word count and save state. Full page toggles with the expand button. Back, close or `Esc` closes and saves; Enter in the title moves into the document.
- Data: `type: 'doc'`, `text` is the document title, `doc` is structured editor JSON, `body` is a plain-text copy. Older `body` content is interpreted as light Markdown when `doc` is absent. Editor globals `docCard`, `ed`, `dvT` are transient. Structured nodes use `type`, `content`, `attrs`, `marks`, `text`; these are inside `doc`, not separate board cards.
- Evidence: A:593, 698, 1299-1300, 2343-2384, 3403-3407, 3428-3503, 3567, 3960, 4238. H:101, 170-181. S:414-420, 448-476, 1404-1448, 1523-1566, 1959-1960.
- Bridge/restrictions: save bridge. Bundled `MBEditor` is loaded at H:397. Character calls and branded helper text around the editor need replacement; the document mechanics do not require Mochi art.

### D2. Rich text, styles, fonts and floating selection toolbar [P1]

- User sees and does: styles Title, Heading, Subheading, Body, Lead, Caption, Quote and Code; font search with “Used on this board”, suggested and system font lists; size minus/plus or a typed 6-200 px value; bold, italic, underline and strike. Toolbar labels reflect the cursor's current formatting. Selecting words opens a floating bar. Colour/highlight menus include saved board colours and swatch cards, defaults and an “Any colour” wheel. Alignment supports left, centre, right and justified. Undo/redo buttons disable when unavailable. The toolbar folds controls into More when narrow.
- Data: `doc` nodes include `heading.attrs.level` 1-3, `paragraph.attrs.kind` values `lead`/`caption`, marks `bold`, `italic`, `underline`, `strike`, `code`, `textStyle.attrs.fontFamily`, `fontSize`, `color`, and `highlight.attrs.color`; alignment is `attrs.textAlign`. Font usage is also read from other cards' `font` and document JSON. `body` remains the plain-text mirror.
- Evidence: A:3406-3410, 3451-3475, 3569-3678, 3728-3737, 3873-3878. H:173-180, 394-398. S:1412-1448, 1450-1507, 1543-1566. Extension definitions: `tools/editor/entry.js`:26-86.
- Bridge/restrictions: save bridge; `MB.fonts()` for system families, B:57, 90, R:241-246. Non-system families load from Google Fonts, A:2902-2907. Preserve applicable font licences; a system font name is not a licence to bundle that font. Replace “Mochiboard's own” and helper branding.

### D3. Lists, links, tables, pictures and More tools [P1]

- User sees and does: bulleted/numbered lists, nested checklists, link add/update/open/remove, image picker or image-file drop/paste. More offers line spacing Single/1.15/1.5/Double, a 3 × 3 table with header, divider, superscript, subscript and clear formatting. Inside a table it offers add/remove row or column, header row and delete table. Table columns can be resized. Document `Cmd+K` opens the link menu; board quick capture also uses this chord, so the code has two context handlers, not two different shortcuts.
- Data: `doc` nodes `bulletList`, `orderedList`, `listItem`, `taskList`, `taskItem.attrs.checked`, `link` marks with `attrs.href`, `image.attrs.src`, `table`, `tableRow`, `tableHeader`, `tableCell`; paragraph/heading `attrs.lineHeight`. Image files become embedded data URLs. Formatting marks include `superscript` and `subscript`. No extra board field beyond `doc`, `body`, `text`.
- Evidence: A:3458-3463, 3476-3481, 3582-3585, 3627-3633, 3679-3703, 3738-3744. H:174-180. S:1425-1444, 1505-1522. `tools/editor/entry.js`:74-85 confirms nested task lists, autolinking, base64 images and resizable tables.
- Bridge/restrictions: save bridge; opening a document link uses `MB.openURL(href)`, B:90, R:101. File reading and editor actions are browser APIs. No restricted art is needed.

### D4. Document page appearance [P2]

- User sees and does: page colour menu offers automatic, light or dark writing paper. Dark writing paper adjusts text colours for readability. This is a viewing preference; downloads always use light pages.
- Data: localStorage `mochiboard:docPage` with `auto`, `light`, `dark`. No document or board colour field is changed.
- Evidence: A:3498-3503, 3704-3707, 3745. H:172. S:1527-1542, 1579-1601.
- Bridge/restrictions: none beyond normal document saving. Replace automatic mode's branded label.

### D5. Download document as paged PDF [P1]

- User sees and does: Download, choose Letter or A4, then Download PDF. A “making your PDF…” state appears, followed by success or error. Print HTML includes the title unless it repeats the first body block, preserves prose styles, tries to keep headings with following content, and avoids page breaks inside images, rows and list items.
- Data: `text`, `doc`, `body`; localStorage `mochiboard:paper` stores `letter` or `a4`. HTML and paper are derived export arguments, not saved board fields.
- Evidence: A:3497, 3505-3540, 3557-3565, 3708-3712, 3746-3747. H:172, 178. S:1404-1448 supplies printable prose rules, 1567-1578 styles Download. Export document CSS is also assembled in A:3524-3539.
- Bridge/restrictions: `MB.docPDF(html, name, paper)`, B:67-69, 88, 92-93. Swift handles a save panel and paged printing in `Sources/Mochiboard.swift`:183-190. Tauri explicitly overrides this method with the browser hidden-iframe print flow, so it does not call a Rust `docPDF` op. Replace branded defaults; external fonts/images retain their own rights.

### D6. Download document as editable DOCX [P1]

- User sees and does: Download, select paper, then Download Word. Loads the Word exporter on demand, displays progress and opens a native save dialogue or browser download. Headings, formatting, lists, links, tables and supported embedded pictures become Word content. The exporter embeds DM Sans regular; a bold font is imported in its source but not added to the document's `fonts` array.
- Data: `doc`, `text`, `body`, `mochiboard:paper`; exports `ed.getJSON()` through `MBDocx.toDocx`. `tools/editor/docx-entry.js`:55-61 only accepts base64 PNG/JPEG/GIF/BMP images, so arbitrary image sources are not guaranteed to survive Word export.
- Evidence: A:3541-3556, 3708-3712, 3748. H:172, 178, 397. S:1567-1578. Supporting conversion: `tools/editor/docx-entry.js`:1-152, especially font registration at 128-130.
- Bridge/restrictions: `MB.saveFile(base64, name, 'docx')`, B:61-64, 88; R:91-99; Swift:173-181. Preserve DM Sans's bundled OFL notice, `web/fonts/OFL.txt`. Replace DOCX creator metadata `creator: 'Mochiboard'`, `tools/editor/docx-entry.js`:129. No Mochi art belongs in exports.

### D7. Copy board cards into a document [P1]

- User sees and does: drag one or several supported cards onto an open document page or a doc pill. The target highlights. On release, the board cards return to their original positions and their content is copied into the document. An open page inserts near the drop; a closed pill appends. A message offers Undo. Checklists retain checked states, titles become headings, links become links, swatches include a colour square and hex, and documents retain rich content.
- Data: accepted `type` values are exactly `note`, `todo`, `title`, `link`, `swatch`, `doc`, `shape`, `audio`, `spotify` via `WORDY`. Reads `name`, `text`, `items[].t`, `items[].done`, `title`, `url`, `hex`, `label`, `desc`, `body`, `doc`. Writes destination `doc`, `body`. `image`, `video`, wireframe `text`, `canvas`, `ink` and `path` are not in this board-card drop list. Image-file drop/paste is separate, D3.
- Evidence: A:1413-1417, 1485-1487, 3774-3813. H:171-180, 63-65. S:458-464, 1404-1448. The conversion is dynamic and shares existing doc/card elements.
- Bridge/restrictions: save bridge only. Remove branded success-message presentation.

### D8. AI rewrite of selected document words [P2]

- User sees and does: select words, use the helper button in either toolbar, choose Shorter, Clearer, Friendlier, More confident, More professional, Fix spelling & grammar or Into bullet points, or type a custom instruction. Empty selections get instructions instead of actions. Busy state appears while rewriting. Returned text replaces the selection, is selected again, and Undo restores the original. Missing Claude Code, sign-in and other errors have separate messages.
- Data: reads selection `from`/`to`, selected text, `docCard.text`, and up to 700 characters either side as `around`; writes `doc`/`body` through editor updates. `how` is the rewrite request argument, not a card field.
- Evidence: A:3713-3718, 3749, 3754-3771. H:174, 178-180. S:1446-1448, 1508-1513, 1548-1554.
- Bridge/restrictions: `MB.rewrite(text, how, title, around)`, B:60, 88; R:68-71, 190-205. Browser fallback throws. The rewrite handler itself does not check `settings.ai`, unlike board chat. Port the action only with new Aegis naming/presentation; do not carry `Goo` character calls or branded setup links.

## 2. Drawing, shapes, pen paths, stamps-without-Mochi-art, connectors (styles, bending, labels)

### G1. Freehand pen, marker and highlighter [P1]

- User sees and does: Draw or `P` swaps the dock for Done, pen, marker, highlighter, eraser, thickness and colours. Draw with pointer/touch. The pen varies width with movement speed and tapers ends; marker is even; highlighter is translucent. Done or `Esc` exits. Existing ink is grabbed on painted strokes, rather than across its empty rectangle.
- Data: `type: 'ink'`, `pts` arrays of `[x, y, timestamp]` relative to the card, `ow`, `oh`, `pen` values `pen`/`marker`/`hi`, numeric `size`, `ink` colour key/hex, `r: 0`. Saved pen preference key `mochiboard:pen` contains `tool`, legacy `size`, `color`, `sizes` per tool. Live `stroke`, `liveSvg`, `drawOn` are transient. This is distinct from editable vector paths.
- Evidence: A:611, 1699-1702, 3221-3234, 3254-3340. H:115, 121-132. S:633-663.
- Bridge/restrictions: save bridge. Rendering algorithms are code; no `goo.js` or stamp asset is needed. Replace references to the author's drawing persona.

### G2. Drawing thickness, colour and whole-stroke eraser [P1]

- User sees and does: drag a nonlinear thickness slider, use its arrow keys or wheel, or press `[`/`]` while drawing. Dot and floating bubble preview current thickness at the current zoom. Ranges are pen 2-48, marker 2-40, highlighter 8-72 and eraser 10-90. Colour buttons include theme ink, pink, coral, butter, mint, sky, lilac and white. Eraser ring stays a screen size; touching a sampled ink point removes that entire ink card, not a segment.
- Data: `pen.sizes`, `pen.color`, `pen.tool`; existing `ink` cards' `pts`, `size`, `pen`, `ow`, `oh`, `w`, `h` drive hit testing. Board `cards` loses erased cards.
- Evidence: A:3222-3253, 3283-3304, 3312-3321. H:124-131. S:646-652, 1252-1273.
- Bridge/restrictions: save bridge; tool preferences use localStorage. No restricted art required.

### G3. Built-in shapes and text inside shapes [P1]

- User sees and does: Shapes or `S`, choose Line, Rectangle, Circle, Triangle, Star or Heart, click to place. Shapes can be resized, tilted and, except lines' special treatment, filled/outlined. Double-click text to edit. Shape colour offers theme colours, arbitrary colour and No fill. Choosing No fill adds an outline if needed to keep the shape visible.
- Data: `type: 'shape'`, `shape` values `line`, `rect`, `circle`, `tri`, `star`, `heart`; `fill`, `text`, `radius`, `stroke`, `sw`, `sdash`, `dl`, `dg`, `r`; card text fields described in E3 also apply. A new line sets `w: 200`, `h: 24`.
- Evidence: A:595, 728-755, 2364-2370, 3382-3383, 3970, 4008-4012, 4106-4109, 4230. H:111, 162-169. S:436-447, 829-835, 2136-2158, 2302-2309, 2367-2368.
- Bridge/restrictions: save bridge. These SVG geometry functions do not depend on Mochi art.

### G4. Straight, wavy, zigzag and loopy standalone lines [P2]

- User sees and does: select a line shape and open Line style. Choose Straight, Wavy, Zigzag or Loopy, then adjust Tightness 1-30, Roundness/Loop size 0-100%, Height 8-300 px, Wobble 0-100% and Thickness 1-24 px. Style changes adjust the card's height around its centre. These are standalone shape cards, not connectors between cards.
- Data: `type: 'shape'`, `shape: 'line'`, `squig` absent for straight or `wavy`/`zigzag`/`loopy`, `waves`, `round`, `wobble`, `lw`, `h`, `y`, `fill` as line colour.
- Evidence: A:729-755, 3964-3969, 4089-4105. H:163, 120, dynamic selection dropdown. S:2282-2292, 2367-2368.
- Bridge/restrictions: save bridge only. No restricted artwork required.

### G5. Vector Pen creation [P1]

- User sees and does: Pen or `Shift+P`; click to add straight points, drag while placing a point to pull smooth curve handles. Alt/Option bends only the outgoing side. Shift constrains directions to 45° increments. Click the first point to close, or Enter, Esc, double-click or switching tools finishes an open path. Backspace/Delete removes the last point before finishing. A live outline and control points preview the result.
- Data: `type: 'path'`, `pts` objects with `x`, `y`, optional `ix`, `iy`, `ox`, `oy`; `ow`, `oh`, `closed`, `stroke`, `sw`, optional `fill`, `r: 0`. New paths default to `stroke: '#27272a'`, `sw: 2.5`; closed paths add `fill: '#ffe0ec'`. `penT` is transient.
- Evidence: A:610, 860-915, 1338, 1471, 1526-1527, 1659-1661, 1701, 1719-1728. H:114, 63-65. S:2293-2301.
- Bridge/restrictions: save bridge only. No character drawing dependency.

### G6. Edit vector points and round individual corners [P2]

- User sees and does: double-click a path, rectangle, triangle, star or circle. Built-in supported shapes become paths. Drag points; Shift constrains horizontal/vertical movement. Shift-click selects more points. Drag handles, Option-drag a sharp point to create handles, Option-drag a handle independently, or double-click a point to switch sharp/smooth. Click an outline to insert a point; Delete removes selected points if at least two remain. Corners control or an inner radius dot rounds selected sharp corners. Enter, Esc or clicking away ends editing.
- Data: `pts[].x`, `y`, `ix`, `iy`, `ox`, `oy`, per-point `r`; card `radius`, `ow`, `oh`, `w`, `h`, `x`, `y`, `closed`, `fill`, `stroke`, `sw`. Conversion changes `type: 'shape'` to `'path'` and deletes `shape`. Two-point results clear `closed`. `vec.id`, `vec.sel`, `vec.drag`, `vec.svg` are transient.
- Evidence: A:863-885, 916-1006, 1656-1658, 4082-4087. H:120 and world container, dynamic controls. S:2293-2301, 2136-2158.
- Bridge/restrictions: save bridge only. Hearts and standalone line shapes are not supported by `shapeToPath`.

### G7. Repeated stamps, favourites wheel and asset-free replacement boundary [P2]

- User sees and does: Stamps or `E` opens eight favourites in a radial wheel. Centre plus opens Mochi, Moving Mochi and Emoji tabs. Picking from the full list adds it to favourites; repeated board clicks keep stamping until Esc, right-click or another tool. Stamps resize as squares, can be tilted, and land with a small burst.
- Data: `type: 'stamp'`, `src`, `emoji`, `mv`, `r`, `tilted`, `w`, `h`; localStorage `mochiboard:wheel` stores eight descriptors `{src, emoji, mv}`. `mv` values include `wiggle`, `pulse`, `spin`, `shake`, `float`, `squish`, `hop`.
- Evidence: A:596, 700, 1420, 1731, 2354-2361, 3342-3380. H:112, 153-158. S:488-541, 516-521, 595-599.
- Bridge/restrictions: save bridge. **Do not port any bundled stamp artwork, including the Emoji tab.** A:3353-3356 maps nominal Unicode emoji to restricted `stamps/px/*.png`. Replace `STAMPS`, `WHEEL_DEFAULT`, `PX`/`pxSrc`, tab branding, image previews and stored restricted `src` values with original/licensed assets or actual system emoji. The wheel and repeat-placement mechanics can be reused independently.

### G8. Create, select, bend and reconnect connectors [P1]

- User sees and does: drag a card's edge knob onto another card. A live line previews the connection. Select a line to see two endpoint circles and a middle bend handle. Drag the middle handle to curve either way, with a snap to straight. Drag an end near a new card edge to attach it there. Auto ends removes pinned positions. Duplicate undirected pairs are blocked during manual creation. Delete/Backspace removes the selected connector; Esc deselects.
- Data: board `links[]` objects `{id, a, b}`, optional `bend`, `pa: {u, v}`, `pb: {u, v}`. `a`/`b` are card IDs; pin fractions follow card position/size. `selWire` is transient. Default bend is computed when absent, `bend: 0` means straight. This is separate from `type: 'link'` website cards.
- Evidence: A:807-844, 1356-1362, 1375, 1443, 1459-1461, 1515-1523, 1672, 1676, 4052-4054. H:64, 120; knobs/endpoints generated in A:707, 837-838. S:45-57, 72-74, 1201-1204.
- Bridge/restrictions: save bridge only. No restricted artwork required. Reattachment excludes collections and sections, A:1517; creation's hit test is broader, A:1521.

### G9. Connector style, arrow direction and labels status [P1]

- User sees and does: selecting a connector replaces the dock with Curved, Straight, Dashed, Arrow, Flip, optional Auto ends and Delete. Flip swaps endpoints, pinned positions and bend sign. Styling is a fixed line colour/width plus dashed and arrow toggles. **Connector labels are not implemented in this checkout.** There is no label editing UI or saved connector label field. Card labels in E4 are separate.
- Data: `links[].bend`, `dash`, `arrow`, `a`, `b`, `pa`, `pb`. No `label` or `text` is read by `renderWires` or written by the connector toolbar.
- Evidence: A:823-841, 3925-3931, 4045-4054. H:120, dynamically generated toolbar. S:45-57, 53-55. Label absence is based on these complete render and mutation paths, not on release notes.
- Bridge/restrictions: save bridge. Labels would be a new Aegis feature, not a source feature to port. No restricted assets required.

## 3. Wireframes (frames/screens, boxes, text, icons, fonts, sections/glass, snapping, design panel, ready-made pieces, website sections)

### W1. Screens, device presets and frame ownership [P1]

- User sees and does: Wireframe → Screen, choose iPhone, Android, iPad, Desktop or Watch, then click to place. Names sit above screens. Change name, X/Y/W/H, device, fill and corners in the panel. Manual width/height changes set device to Custom. Dragging a screen carries its assigned contents. Dropping a piece inside assigns it to the screen and lifts it above the screen if necessary. Screen contents stay separate editable cards.
- Data: `type: 'frame'`, `name`, `device`, `fill`, `radius`, `w`, `h`, `x`, `y`, `r: 0`; contents have `onFrame` equal to frame ID. Presets `[w,h,radius]`: iPhone `[393,852,44]`, Android `[412,915,28]`, iPad `[834,1194,20]`, Desktop `[1440,1024,10]`, Watch `[205,251,40]`.
- Evidence: A:612, 714-717, 1381-1383, 2364, 2814-2827, 2877-2884, 3072-3081, 3100-3105, 3117-3124. H:188-204. S:853-918, 941-947, 2258-2281.
- Bridge/restrictions: save bridge. Device names describe presets; these screens contain no bundled device artwork. There is no saved `children` array on frames, ownership uses `onFrame`.

### W2. Boxes and image placeholders [P1]

- User sees and does: Box or `R`, drag a rectangle; a click makes a standard 160 × 100 box. Edit position, size, fill, corners, border width/colour and opacity. A box with an `img` label and no `src` shows an image placeholder with Fill image action. Filled placeholders use a cover image background.
- Data: `type: 'box'`, `fill`, `radius`, `stroke`, `sw`, `opacity`, optional `img` description and `src`, `onFrame`, `group`, `rot`; shared outline fields in W8. `img` is a prompt/label, not an image URL.
- Evidence: A:614, 1354, 1457-1458, 1512-1514, 2823-2824, 2939, 2956-2959, 3106, 3117-3123, 3957. H:194, 200-201. S:890, 897, 910-918, 969-973.
- Bridge/restrictions: save bridge; image generation/fetch dependencies are W10. Placeholder geometry/icons do not require restricted art.

### W3. Wireframe text and typography [P1]

- User sees and does: Text or `X`, click and type. Text wraps and grows vertically. Panel offers font, pixel size, weights Light/Regular/Medium/Semi/Bold/Extra, colour, line height and left/centre/right alignment. X/Y/W and rotation are editable; height is content-driven.
- Data: `type: 'text'`, `text`, `size`, `weight`, `font`, `color`, `align`, `lh`, `rot`, `onFrame`, `group`, `w`, `h`; `r` is forced to zero. These use explicit `size` and `weight`, not the note/title `fs` multiplier.
- Evidence: A:617, 2364-2365, 2818-2827, 2937-2938, 3100-3101, 3107-3109, 3117-3123. H:196, 201. S:880-894, 941-947, 2258-2264.
- Bridge/restrictions: save bridge, `MB.fonts()` and Google Fonts loading as D2/W5. No Mochi art required.

### W4. Search, place and swap Material Icons [P2]

- User sees and does: Icon opens a search field and grid. Search normalises spaces to underscores, displays up to 180 matches and asks for a narrower query if more remain. Click to place an icon. For an existing icon, Change icon swaps its name. Panel controls colour and square size. Esc leaves the picker.
- Data: `type: 'icon'`, `name` is the Material Icons ligature name, `color`, `w`, `h`, `rot`, `onFrame`, `group`. `iconSwap` is transient.
- Evidence: A:616, 2364, 2821, 3058-3068, 3074-3076, 3102, 3119, 3127. H:195, 199, 394. S:920-940.
- Bridge/restrictions: save bridge; bundled icon font/names work without a native bridge. These are separate from restricted `stamps/`. The icon font identifies Apache 2.0 in S:920 and ships `web/icons/LICENSE.txt`; retain its notice if reused.

### W5. Font specimen cards and available font discovery [P2]

- User sees and does: a font card shows “Aa”, family name, source label and editable sample sentence. Select it to change family or type a Google font name; double-click its sample to try words. AI can add font cards. There is no dedicated font-card button in the main dock or Wireframe tool row in this source.
- Data: `type: 'font'`, `font`, `text`, plus common dimensions/colour. `fc._t` is a debounce handle, not intended content. `FONTS` and `fontsLoaded` are application state. Font families on a board are counted across `font` fields and `doc` marks for menus.
- Evidence: A:615, 1298, 2257-2259, 2817, 2902-2907, 3095-3096, 3115-3116, 3873-3878. H:98-119 confirms no font creation tool; 201 hosts dynamic font properties. S:954-962, 1495-1499.
- Bridge/restrictions: `MB.fonts()`, B:57, 90; R:241-246. Google Fonts is fetched in-browser. System font availability does not authorise redistributing the font files. No restricted character asset is needed.

### W6. Glass sections around board content [P1]

- User sees and does: select cards, Create section from toolbar/context menu or `Option+Cmd+G`. A padded glass region appears behind them and prompts for a name. Membership follows whether a card's centre lies inside, with exclusions for hidden cards and collection members. Drag a section to move contained cards, screens and collections with their contents. Drag cards into/out of it to change membership. Rename, recolour or Remove section; removing the region leaves its contents. Dragging on unselected glass starts marquee selection; a simple click selects the section. Name labels grow when zooming out.
- Data: `type: 'section'`, `text`, `color`, `x`, `y`, `w`, `h`, `r: 0`. There is no saved `kids`/section membership field; it is geometric. Nested smaller sections can be included. This differs from `coll.kids` and `onFrame`.
- Evidence: A:507-508, 613, 1052-1054, 1371-1383, 1465, 1473, 1678, 2527-2529, 2829-2846, 2869-2876, 4016-4019, 4212-4226. H:66, 120, dynamically created cards/menu. S:1962-1988.
- Bridge/restrictions: save bridge only. Glass effect is CSS, no character art. “Remove section” is the explicit content-preserving action; ordinary Delete removes selected IDs using E12.

### W7. Snapping guides, grid snapping and design panel alignment [P1]

- User sees and does: moving most card types aligns edges/centre lines with nearby content and shows pink guides. This guide snapping is active independently of Settings → Snap to dots. Optional grid snapping rounds placement/drop positions to a 26-unit grid. The design panel aligns selected wireframe pieces left/centre/right/top/middle/bottom, or one piece against its screen. Three or more pieces can be spaced evenly across/down.
- Data: card `x`, `y`, `w`, `h`, `onFrame`; `settings.snap` controls grid snap only. Guide geometry and `drag.start` are transient. General selection alignment is E7 and respects whole groups.
- Evidence: A:1406, 1484, 2141, 2367, 2886-2900, 3110-3111, 3126-3142. H:201, 204, 367. S:875-878, 898-899, 913-918.
- Bridge/restrictions: save bridge only. Guide hit tolerance is `6 / view.z`; ink and hidden targets are excluded. No art dependency.

### W8. Fill, border, corners and transparent/hollow styling [P1]

- User sees and does: selection menus offer fills and arbitrary colour wheel, stroke colour/width, Solid/Dashed/Dotted/None with dash length and gap for compatible shapes, boxes, screens and paths, plus corner slider, numeric input and presets including Pill. No fill keeps an outline. Titles/wireframe text can become hollow letters. Text/icon outlines are solid only: dashed/dotted controls are hidden for them and their alternate text renderer returns immediately.
- Data: `fill`, `stroke`, `sw`, `sdash` values absent/`solid`, `dash`, `dot` with legacy boolean support; `dl`, `dg`, `radius`, optional `cap`; title text fill `tc`, wireframe text/icon fill `color`. Path fill is used only when `closed`. Corners may instead update `pts[].r` during vector editing. `image.radius` controls image rounding. Setting No fill may write `stroke`/`sw` automatically.
- Evidence: A:610, 635-680, 742-755, 2818-2827, 3990-4012, 4082-4087, 4106-4169. H:120, 201, 206-214, dynamic menus. S:2136-2158, 2258-2281, 2302-2309, 2343-2351.
- Bridge/restrictions: save bridge only. Do not treat dormant dashed-letter CSS as working support. No restricted artwork is needed.

### W9. Ready-made editable pieces [P1]

- User sees and does: Wireframe → Pieces offers Nav bar, Tab bar, Button, Input, Search, Card, List row, Toggle, Checkbox, Avatar, Image and Heading. Pick and click to place. Each becomes grouped editable boxes/text/icons. Bars/rows size to a containing screen; other pieces have defaults. Use Cmd-click or double-click to reach inside the group, or Ungroup to edit independently. These are visual mockups, not functioning form controls.
- Data: no saved `piece` type. Each generated card is `box`, `text` or `icon`, carrying `group`, optionally `onFrame`, plus their fields in W2-W4. Piece options include `text`, `title`, `sub`, `label`, `tabs`, `active`, `icon`, `style`, `back`, `on`, `size`, `h`, `img`, `align`; they are build inputs, not a separate persisted component schema.
- Evidence: A:2345-2351, 2362, 2936-2959, 3048-3056, 1377-1383, 1501-1503. H:200. S:934-940, 941-947, 1094-1098.
- Bridge/restrictions: save bridge only for manual placement. Material Icons licence applies; none of the pieces require bundled Mochi art.

### W10. Whole website sections and generated screens [P2]

- User sees and does: Website pieces offer Header, Hero, Features, Stats, Testimonials, Pricing, Gallery, Logos, CTA and Footer. They place grouped editable content, full-width inside a frame or 1200 units wide on loose board. Board AI can build complete screens from pieces, lay screens in a row, link a flow with arrows, theme colours/fonts and add a note below. Frames grow to fit content. Text, Icon, Space and Divider are extra AI-only piece names, absent from the panel.
- Data: saved `frame`, `box`, `text`, `icon`, sometimes `note`, with `group`, `onFrame` and fields above; board `links[].arrow` for flows. `r.screens` inputs use `name`, `device`, `w`, `h`, `gap`, `padTop`, `items`, `theme`, `note`, `flow`. Theme inputs include `bg`, `text`, `muted`, `primary`, `onPrimary`, `surface`, `font`, `headFont`. These specifications are consumed to create cards, not retained as a saved website document.
- Evidence: A:2280-2285, 2960-3046, 3048-3056. H:200, dynamic Website subsection. S:934-940, 969-973, 853-918.
- Bridge/restrictions: save bridge; AI uses `MB.ask` as E13. Manual Website pieces do not need AI. Sample customer names, quotes and prices are placeholder content, not evidence about real people/businesses. Replace branded helper presentation; referenced external content needs its own rights.

### W11. Fill labelled image spots with generated photos or SVG [P2]

- User sees and does: Fill image on a placeholder, context-menu fill for selected screens/spots, or an offer after AI builds screens. Choose Higgsfield images or “Draw simple illustrations”. Higgsfield first checks price/balance and asks for confirmation; insufficient balance offers illustrations instead. Loading, completion and error messages appear; filled cards glow and may be brought into view. The UI calls illustrations “free” to distinguish Higgsfield credits, but the native operation still invokes Claude Code.
- Data: reads `type: 'box'`, `img`, `src`, `w`, `h`, `onFrame`, frame `name`, board `name`; writes `src` as fetched data URL or SVG data URL. Bridge job objects use `id`, `label`, `aspect` or `w`, `h`; quote reads `perImage`, `balance`.
- Evidence: A:2537, 3144-3188, 3957, 4237. H:201, 136-141, dynamic action. S:969-976, 963-967, 175-181.
- Bridge/restrictions: `MB.higgsQuote`, `MB.higgsMake`, `MB.drawFill`, `MB.fetchImage`, B:53-56, 90; R:73-78, 149-153. Browser fallbacks throw and public web flow offers app download. Replace `Goo`/Mochi presentation. Generated or fetched media is not licensed by the repository's MIT code licence.

## 4. Colors and media (swatches, palette/board colors panel, pull colors from image, crop, link previews, Spotify, voice memos, video recording)

### M1. Swatch cards, automatic names and colour wheel [P1]

- User sees and does: Colour tool places a swatch and opens its editor. Click the colour area, double-click the card or use Change colour. Drag hue/saturation wheel and brightness slider, enter three/six-digit hex, name the colour or pick a saved colour. Auto-naming continues until a custom name is typed. Toggle display of name and hex independently. Done or outside click closes.
- Data: `type: 'swatch'`, `hex`, `label`, `autoName`, `hideName`, `hideHex`. HSV editor state `hsv` and target `colorCard` are transient. New swatches receive `autoName: true`; manual names set it false.
- Evidence: A:628, 1296-1316, 1496, 2374, 2382, 3822-3827, 3955, 4242-4244, 4251-4335. H:110, 205-214. S:109-114, 194-216, 1172-1177.
- Bridge/restrictions: save bridge only. No restricted assets needed. In-app labels retain source spelling; inventory prose uses Australian English.

### M2. Saved board palette and colours already in use [P1]

- User sees and does: Save to board colours adds/updates a named swatch in the left widget. Click a palette row to add a swatch card. Right-click offers Add to board, Rename, Change colour and Remove from board colours. Rename/recolour updates matching swatch cards; it is not a global theme-token replacement for every object using that hex. Colour wheels can show saved colours, colour cards and other used colours, sorted/deduplicated, with All board colours/Fewer when there are more than 16.
- Data: `board.palette[]: {hex, name}`; swatch `hex`, `label`. Used-colour aggregation reads other cards' `color`, `fill`, `stroke`. `cpAll` is transient for this app session. Palette removal leaves board swatch cards intact.
- Evidence: A:434, 4287-4303, 4315-4319, 4337-4342, 4357-4382. H:36-39, 212-213. S:182-193, 1153-1158, 2265-2267.
- Bridge/restrictions: save bridge only. No restricted artwork needed.

### M3. Board background and app colour customisation [P2]

- User sees and does: right-click empty board to change only its background or restore default. Settings → Board changes global background, grid dots, panels and accent, separately for light/dark. Text/panel contrast adapts to chosen light/dark colours. Reset clears current-mode overrides. Choosing a board-specific background takes precedence over the global background.
- Data: per-board `bg`; `settings.colors.light` and `.dark`, each with optional `bg`, `dot`, `panel`, `accent`. Cursor uses `settings.cursor` separately. `board.color` is the library's identifying tint, not the actual canvas background.
- Evidence: A:1955-1983, 2540-2545, 4346-4356. H:355-362. S:683-719, 1153-1177.
- Bridge/restrictions: save bridge for `board.bg`; preferences use localStorage. No art dependency.

### M4. Image import, animated files and captions [P1]

- User sees and does: Image or `I` opens a multiple file picker; also paste or drag files onto board. Images can be placed into Unsorted by file drop onto the tray. Animated GIF/WebP/APNG files up to 12 MB retain original data; larger moving files become a still with a message. Still images are reduced to a maximum 2800-pixel dimension, PNG/SVG rasterisation keeps PNG when small enough, otherwise JPEG. Add/remove a caption through the selection bar; double-click an image edits its tag.
- Data: `type: 'image'`, `src` data URL, `w`, `h`, `tagText`, `radius`; caption is `tagText`, not `caption`. File import dimensions determine the card's initial aspect. `crop` is M6.
- Evidence: A:620-624, 1228-1249, 1284-1288, 1314, 1705, 1736-1738, 1809-1825, 3958, 4245. H:107, 215. S:87-93, 75, 720-734.
- Bridge/restrictions: save bridge for local image files; FileReader/canvas do conversion, no native importer. `MB.fetchImage` is used for AI-fetched images separately. Do not use restricted repository art as sample images.

### M5. Pull a colour palette from an image [P2]

- User sees and does: hover image and press Pull colours. Up to five distinct frequent colours appear as swatch cards to its right, named main, second, accent, shadow and pop. A result message reports the count. It does not automatically save them into the board palette.
- Data: reads image `src`, `x`, `y`, `w`; adds `swatch` cards with `hex`, `label`, position/dimensions. No separate extracted-palette field. Sampling is performed on the original `src`, not the crop window.
- Evidence: A:624, 1251-1262, 1535-1539. H:65, button generated in A:624. S:90-93, 109-114.
- Bridge/restrictions: save bridge through added cards; extraction uses canvas pixels locally. No AI/native colour extractor required. Source image rights still apply.

### M6. Non-destructive image crop [P1]

- User sees and does: select image → Crop. Full image becomes visible with a dimmed outside and movable crop box/four corner handles. Cancel or Esc restores old crop/height. Reset chooses the full image within the crop session. Done or Enter applies and recalculates display height.
- Data: `crop: {x, y, w, h}` uses normalised fractions; `src` is unchanged. `cropEdit` is a temporary card flag; `cropping` stores `prevH`, `prevCrop`, `nw`, `nh`, `box`. Minimum crop width/height is 0.08.
- Evidence: A:620-624, 1353, 1667-1668, 3190-3219, 3956, 4235-4236. H:120 and generated image overlay. S:720-734.
- Bridge/restrictions: save bridge only. No restricted image assets required.

### M7. Website link cards and previews [P1]

- User sees and does: Link or `L`, place a card, enter URL and Enter. Missing scheme becomes HTTPS. Loading state becomes site title, description, image and favicon, or compact text if no image. Paste/drop a URL also creates a card. Edit title/description by double-click, Open link, Change link, and optional label. Empty cancelled link cards can be removed. A separate linkbox form exists in the code, but current dock Link action places an inline-input card.
- Data: `type: 'link'`, `url`, `title`, `desc`, `image`, `draft`, `loading`, `h`, `tagText`. Explicitly setting a link resizes to 210 with preview image or 52 without; generic `linkCard` follows its own creation path.
- Evidence: A:625-626, 701-703, 1220-1226, 1302, 1313, 1710-1715, 1818-1825, 3385-3400, 3962, 4239-4240. H:106, 149-150. S:94-99, 347-350, 427-435.
- Bridge/restrictions: `MB.linkPreview(url)` and `MB.openURL(url)`, B:70-71, 88-90; R:63, 101, 127-146. Browser preview is only host/URL with empty image, not native metadata scraping. Favicon is a direct Google endpoint, A:626. External previews/media retain their own rights.

### M8. Spotify embeds [P2]

- User sees and does: paste a Spotify URL/URI or enter one in a link card to get Spotify's player with a draggable heading. Accepts track, album, playlist, episode, show and artist. An unselected shield lets the card be dragged without pressing Play; select first to interact. Open in Spotify uses the link action. Metadata/cover art is retained for the card even when the live player is unavailable.
- Data: `type: 'spotify'`, `url`, `kind`, `sid`, `title`, `desc`, `image`, `w`, `h`, `loading`, `draft`. Player height is 152 for track/episode or 352 for others, plus header/padding. These are URL references, not downloaded music.
- Evidence: A:597-598, 706, 1201-1221, 1819, 3394-3395, 3963, 4239. H:106, 65, no dedicated Spotify tool. S:1733-1745.
- Bridge/restrictions: direct Spotify iframe and oEmbed fetch; fallback `MB.linkPreview`, plus `MB.openURL`, B:88-90. Replace `utm_source=mochiboard` attribution if adapting the URL. Spotify content/player is distinct from restricted bundled `web/music/`; it is not licensed by this repository.

### M9. Voice memo recording and playback [P1]

- User sees and does: Voice memo or `A` asks for microphone/speech access and places a ready card. It waits for Start recording. Countdown, connecting/starting, live waveform, elapsed time and Pause/Resume/Stop states appear. Finished card has title, waveform scrubbing, Play/Pause, transcript area, Replace and optional Turn into notes/Write it out. Title and transcript text can be edited. Interrupted recordings without audio are marked for replacement on board load.
- Data: `type: 'audio'`, `title`, `src` recorded data URL, `dur`, `wave`, `text`, `txNote`, `needTx`; state fields `ready`, `rec`, `paused`, `starting`, `count`. `live`/`players` maps hold recording/playback objects outside board data. Audio dimensions grow with content/card width.
- Evidence: A:435, 606-609, 1303, 1703, 2383, 2548-2559, 2690-2737, 2791-2811. H:108, dynamic card controls. S:600-626, 664-666, 1655-1663, 2204-2223.
- Bridge/restrictions: recording/playback use browser MediaRecorder, getUserMedia and Audio APIs; save bridge stores audio inside board JSON. `MB.speechAuth()` handles permission, B:52, 90, R:81. Transcription is M11. Replace branded recorder/transcript messages; no bundled music is used.

### M10. Camera recording, imported video and playback [P1]

- User sees and does: Video or **`Shift+V`** places a ready live-camera card. `V` alone selects the pointer, despite an older release-note claim. Choose Wide/Phone, flip preview, select devices, Start recording, countdown and Stop. Camera rests after 60 seconds idle and can be woken. Recording stops after 15 minutes. Use a video file or drop/import one; over 1 GB is rejected. Saving percentage appears. Saved video has poster, play/pause, scrubber, elapsed/duration, mute and transcript controls. Wide mirroring is display metadata; portrait flip is drawn into recorded frames.
- Data: `type: 'video'`, `title`, `src`, `poster`, `dur`, `vw`, `vh`, `vert`, `mirror`, `muted`; state `ready`, `rec`, `count`, `saving`, `pct`, `camErr`, `camRest`. Transcript fields are M11. `cams`, `vids` hold live media objects. `src` is external media storage, unlike voice-memo data URLs.
- Evidence: A:599-605, 1241-1243, 1704, 1736-1738, 2384, 2560-2663; stale shortcut prose A:4565. H:109, 215. S:1677-1710, 1725-1732, 1926-1936, 2042-2060.
- Bridge/restrictions: `MB.saveMedia(blob, onProgress)` calls ops `mediaBegin`, `mediaChunk`, `mediaEnd` in 3 MiB chunks, B:16-22, 89; `MB.mediaURL(src)`, B:24-31, 83, 89. Browser uses IndexedDB `mochiboard-media`/`media` and `idbmedia:`; native uses `mbmedia://media/<name>`. R:102-114, 287-317 provides files, delayed orphan cleanup and byte-range streaming. Capture itself uses browser media APIs. No bundled music/art required.

### M11. Transcribe audio/video and turn speech into notes [P2]

- User sees and does: audio transcribes after Stop; video transcribes on Write it out. Missing local model offers one-time setup, download progress and retry. Transcript states include working, ready, could not understand, model needed and error. Video expands a transcript area, offers Copy and, when AI available, Turn into notes. A completed video transcript is not toggled closed by the transcript button in this handler. Turn into notes asks board AI to place short notes to the right of the media card.
- Data: media `src`, `text`, `txNote`, `needTx`; video `txShown`, `h`. Audio extraction converts video to 16 kHz mono WAV before transcription. localStorage `mochiboard:whisperAsked` remembers the initial offer; bridge model state uses `ready`, `downloading`, `progress`, `error`.
- Evidence: A:600-601, 608-609, 2650-2653, 2739-2790, 2798-2801. H:337-338; controls generated in media cards. S:607-626, 1937-1958.
- Bridge/restrictions: `MB.transcribe(audio)`, `MB.mediaURL`, `MB.whisperStatus()`, `MB.whisperGet()`, B:90, 94-108. Tauri converts to base64 Float32 16 kHz PCM and passes `{pcm}`, R:83-88; optional Whisper implementation is `src-tauri/src/whisper.rs`:1-70, with feature-off stub R:6-9. Swift uses speech recognition, `Sources/Mochiboard.swift`:217-220. Browser transcription throws. Note generation uses `MB.ask`, not transcription itself. Replace all character/brand wording.

### M12. Camera/microphone choice and disconnected-device fallback [P2]

- User sees and does: device pills on recording cards and General settings list available cameras/microphones, mark current choice and can request permission to show names. Changing choices restarts idle previews or warms the selected mic. If a selected device is missing/unreadable/overconstrained, preferences clear and default devices are retried. Error messages point to OS privacy settings.
- Data: `settings.camId`, `micId`, `camFlip`; device lists and streams are transient. Choices are app preferences, not per-card device IDs. `video.vert`/`mirror` remain card fields.
- Evidence: A:1984-2000, 2555-2559, 2584-2595, 2654-2655, 2665-2697, 2799. H:381-384. S:1746-1763.
- Bridge/restrictions: browser media APIs; `MB.speechAuth` for speech permission; R:320-337 permits camera/microphone in Windows WebView while OS privacy settings still apply. No restricted assets needed.

## 5. Library and navigation (home/all projects zoom view, projects/folders/boards tree behaviours, right-click menus, duplicate/delete/move, canvases inside boards, templates, quick capture Cmd+K and the tray/Unsorted, focus mode F, just-the-board Cmd+\, collapsible keyboard hints at bottom-left, zoom menu, minimisable floating panels, widgets snapping to sidebars)

### L1. All projects overview, tiles and project covers [P1]

- User sees and does: logo/Home/All projects opens an overview with project tiles, drill-down folders/boards, counts, board previews and breadcrumbs. Back climbs folders/project; Back to board or Esc returns to the current board. Loose folders/boards have separate areas. Project covers can use a picked image or preview of the first board. The overview is a separate tile view, not a continuous camera zoom of the board.
- Data: projects `{id, name, color, open, cover?}`; folders/boards as L2. `cover` is reduced to a 720 px-wide JPEG data URL. Board-list `updated` labels edited time. `homeAt: {level, id}` and `miniCache` are transient; preview SVGs derive from card geometry/type/colour.
- Evidence: A:318-428. H:23, 26, 87-94, 216. S:248-305, 320-339, 822-828.
- Bridge/restrictions: library bridge; `MB.load` supplies previews. Replace logo/Mochiboard name and character-like folder illustrations with Aegis presentation. Do not use restricted `assets/` images as covers.

### L2. Projects/folders/boards tree, naming and scoped creation [P1]

- User sees and does: expand/collapse projects and nested folders, view current board highlight/counts, click board to open, double-click name or pencil to rename. Enter commits inline names; Esc restores. Ancestors of the current board open automatically. Tree scopes to the current project/folder while inside it; All projects shows everything. + Project/+ Folder/+ Board and tile add buttons create within the scope supported by their handlers. Current board title edits immediately. Returning to the app refreshes external additions and shows their location.
- Data: library `{projects: [{id,name,color,open,cover?}], folders: [{id,name,project,open,parent?}]}`; board `folder`, `name`, `color`, optional `parent`. `updated` comes from listing. Unique default names receive numeric suffixes. `__boardsChanged` is a notification hook, not a saved field.
- Evidence: A:69-102, 125-146, 202-305, 308-316, 430-437, 1739-1748. H:21-31, 73-76. S:217-247, 795-805, 1059-1061.
- Bridge/restrictions: library bridge. Local browser data and native files work without Claude. Replace brand header and branded notifications; no character art needed for tree mechanics.

### L3. Library move, nesting and right-click menus [P1]

- User sees and does: drag boards into folders or onto another board, drag folders into projects/nested folders or out to the root, or right-click Rename/Move to/Duplicate/Delete. Move to shows destinations and current location. A nested canvas offers Make it its own board. Attempts to put a board/folder into itself or a descendant are blocked. Removing a child board from its old parent removes the corresponding canvas card and its attached connectors there.
- Data: board `folder`, `parent`; folder `parent`, `project`; destination parent gets `open: true`. Parent board `cards[].type: 'canvas'`, `.board`; affected board `links[].a`, `.b`. No separate file-system folder path is stored on these entities.
- Evidence: A:78-121, 131-137, 178-223, 238, 264-281, 395-402, 1822-1823. H:28, 92, dynamic context menu. S:477-487, 806-821, 217-239.
- Bridge/restrictions: library bridge. No restricted artwork required; replace branded messages.

### L4. Recursive library duplication and confirmed deletion [P1]

- User sees and does: Duplicate board/folder/project creates a named copy, recursively copying nested folders and child canvas boards so library duplicates do not share child boards. Delete asks for confirmation and warns that it cannot be undone, including contained boards/canvases. Deleting the current board opens a remaining board; an empty library gets a first board. Library deletion is not board undo.
- Data: new board/library IDs, copied `cards`, `links`, `tray`, `view`, etc.; canvas cards' `board` references are remapped, child board `parent`/`folder` updated. Folder copies use new `id`, `name`, `project`, `open`, optional `parent`. Project copy preserves `color`; its explicit constructor does not copy `cover`.
- Evidence: A:148-176, 203-220. H:28, 92, dynamic row menu. S:477-487.
- Bridge/restrictions: full library bridge, especially `MB.remove`. Copying existing user data does not grant new rights to restricted embedded art.

### L5. Canvases nested inside boards [P1]

- User sees and does: Canvas tool places a miniature board card and creates its child board. Double-click its non-title area or use Open this canvas to enter. Edit its title to rename the child; library renames are reflected when reopening the parent. Board breadcrumbs climb up to four parent-board levels. Boards can be dragged in/out as L3 describes. Child view is fitted on opening.
- Data: `type: 'canvas'`, `text`, `board` child ID; child `parent` parent-board ID and inherited `folder`; parent `view`. Preview comes from child `cards`; there is no embedded child-card array on the canvas card.
- Evidence: A:77-79, 103-122, 326-330, 436, 594, 702, 1299-1301, 2375, 3815-3820, 3961. H:105, 74. S:421-426, 240-247.
- Bridge/restrictions: `MB.load`/`MB.save` plus list refresh, B:84-86. Card copy/paste does not recursively clone child boards, unlike L4. No art required.

### L6. Board starters and design-thinking templates [P2]

- User sees and does: Templates menu separates Add to this board from Start a new board. In-place frameworks are Affinity map, Opportunity map, Impact / effort, Empathy map, Journey map, How might we and Rose, thorn, bud. They add editable titles, sample notes, collections, occasional arrows and a deletable how-to note, then fit the result. Starters Moodboard, App plan and Brain dump create/open a separate board with starter cards/tray content.
- Data: normal `title`, `note`, `todo`, `swatch`, `coll`; `note.name`, `text`, `color`; checklist `items`; collection `kids`, `cols`, `colOf`; `links[].arrow`. Framework helper note has `mochi: true`, which triggers a restricted character image. Framework keys are `affinity`, `opportunity`, `matrix`, `empathy`, `journey`, `hmw`, `rtb`. No saved `templateId` field.
- Evidence: A:41-59, 64-67, 1733, 2387-2488, 592. H:113, 160-161. S:1099-1122, 1144-1152.
- Bridge/restrictions: save bridge for additions; new starters use `MB.save`/`MB.load`. Remove `mochi: true` artwork, branded instructional voice and starter references to Mochi. Framework layout mechanics are independent of those assets.

### L7. Quick capture and Unsorted tray [P1]

- User sees and does: `Cmd+K` opens capture. Enter saves a note or HTTP(S) URL into current board's Unsorted and closes. Outside click/Esc cancels unsaved input. Tray shows count, text/image summaries, drag-out ghost and scrolling. Drag ideas onto board, or drag board cards back into tray, removing their attached connectors. Tray can be minimised; if disabled, capture still works and offers Show Unsorted. On phone, tap a tray idea to add it centrally.
- Data: `board.tray[]` holds ordinary card objects; `cards` holds placed objects. Capture uses `note.text` or `link`/`spotify` fields. localStorage `mochiboard:trayMin` persists minimisation. `settings.wTray`; transient `trayN` tracks count notifications.
- Evidence: A:846-855, 1478-1480, 1555-1569, 1579-1583, 1652, 1809-1825, 4690-4696. H:81-85, 183-185. S:127-136, 154-158, 340-342, 1798-1800.
- Bridge/restrictions: save bridge; URL capture also `MB.linkPreview`. Precision: the paste listener returns for input/textarea targets, A:1811, so the capture placeholder's “paste an image too” is not proof of working image paste while `capInput` has focus. Video file imports also go directly to board, A:1242-1243. No restricted artwork required.

### L8. Focus selected content [P1]

- User sees and does: select cards and press `F`; selected cards and connected cards remain visible, others dim, and camera fits the focused content. `F` toggles; Esc exits. With no selection there is no focus set. Connection expansion is one pass through `board.links`, not a general graph traversal.
- Data: transient `focusSet`, `sel`; reads `links[].a`, `.b` and card geometry. No persisted focus field on board/card.
- Evidence: A:685, 1585-1591, 1673, 1690. H:69, 187. S:76, 159. The `focus-veil` element exists but CSS hides it; dimming is on cards.
- Bridge/restrictions: no feature-specific bridge. No art requirement.

### L9. Just the board [P1]

- User sees and does: press `Cmd+\` or the dock button to hide sidebars, toolbar, title and keyboard hints. A faint Show panels pill remains. Repeat chord, Esc when not editing/drawing, or pill restores panels. Entry is disabled on phone; shortcut handler excludes Home and open docs. It closes colour editor and chat before entering.
- Data: transient body `clean` class, no board/card or saved preference field.
- Evidence: A:1638-1654. H:118, 186. S:1602-1615, 1801.
- Bridge/restrictions: none. Replace any branded presentation hidden/shown alongside panels.

### L10. Bottom-left keyboard hints [P2]

- User sees and does: hints show capture, double-click note, focus, just-board, helper and space-pan shortcuts. The × hides the whole hint list; Settings → Board → Shortcut hints restores it. This is a hide/show preference, not an expandable keyboard reference panel. Short windows also hide it automatically.
- Data: `settings.keys`, legacy localStorage `mochiboard:keys` values `hide`/`show`. No card/board field.
- Evidence: A:1841, 1920-1923, 4391. H:187, 370. S:35-38, 343-345, 378, 904-909.
- Bridge/restrictions: none. Replace `M` helper label/Mochi wording.

### L11. Pan, zoom controls and fitting content [P1]

- User sees and does: Space-drag or middle mouse pans; two-finger trackpad scrolling pans, pinch/Cmd-or-Ctrl-scroll zooms around pointer. Click zoom percentage for Zoom in/out, 100%, Fit and 50/100/200%. Keyboard `Cmd+plus/minus`, `Cmd+0`, `Shift+1` fit, and unmodified `0` fit all. Menu zoom glides around visible centre; fit leaves room for sidebars/chat. Normal zoom clamps 15-300%, touch pinch 20-300%.
- Data: board `view: {x,y,z}`, transient animations/drag state. Menu step stops are 25/50/75/100/125/150/200/300%. Hidden cards are excluded by `zoomFit`; plain `0` passes all cards.
- Evidence: A:504-524, 571-586, 1175-1195, 1365, 1402, 1548-1553, 1680-1681, 1706, 4721-4732. H:117, 61-65, 187. S:40-44, 125, 1856-1860.
- Bridge/restrictions: view uses ordinary board saving when saved; no native zoom operation. No artwork dependency.

### L12. Minimisable panels and adjustable heights [P2]

- User sees and does: minus collapses a floating box to its heading, plus restores. Unsorted and Wireframe have their own minimise controls. Drag a bottom grip to change Boards/Layers/Unsorted/Wireframe list height; double-click grip restores automatic sizing. Lists scroll if long; Layers keeps at least a row visible.
- Data: localStorage `mochiboard:boxes` maps box name to Boolean; `mochiboard:trayMin` for tray. `settings.panelH` keys `boards`, `layers`, `tray`, `design`. Wireframe's `min` class is toggled only in DOM, A:3082, and is not persisted by that handler. No per-board panel fields.
- Evidence: A:1555-1559, 2006-2017, 3082-3088, 4384-4389. H:22-39, 82, 190; grips created dynamically. S:16-23, 856, 1797-1810, 2316-2321.
- Bridge/restrictions: none. Generic panel behaviours can be reused without branded widgets.

### L13. Sidebar widget snapping and visibility [P2]

- User sees and does: drag a widget by its title; it lifts and dashed insertion slots appear in both sidebars. Drop selects order/side, Esc cancels. Boards stays pinned top left. Settings toggles Layers, Board colours, Wireframe, Unsorted and the restricted Dress up/Music widgets; Reset layout returns defaults. Header dragging is skipped for touch.
- Data: `settings.layout: {left: [widgetKey], right: [widgetKey]}`. Keys `layers`, `colors`, `music`, `design`, `tray`, `dressup`; defaults left layers/colours/music, right design/tray/dressup. Visibility `wLayers`, `wColors`, `wDesign`, `wTray`, `wDressup`, `wMusic`; last two default false. `wgLast`, drag geometry/slots are transient.
- Evidence: A:1840, 1842-1906, 2126. H:20-21, 32-58, 81-85, 189-203, 345-354. S:1789-1813.
- Bridge/restrictions: none. Preserve generic layout behaviour only; Dress up imagery, `goo.js` outfits, bundled music and music artwork must not be ported.

## 6. Editing core (undo/redo, copy/cut/paste across boards, stacking, tilt, grouping/collections, multi-select behaviours, crisp zoom, grid shapes, selection-aware dock/toolbar swapping, your-toolbar customisation, export card/board as image or PDF, phone/touch)

### E1. Local board persistence, save feedback and offline use [P1]

- User sees and does: boards save after edits, show save state, reopen the last available board and refresh the library when the app regains focus. New empty installations create a first Brain dump board. Offline manual editing is independent of Claude. The browser registers a network-first service worker with cached-app fallback; this is local persistence, not account/cloud sync.
- Data: board/card fields in shared rules; localStorage `mochiboard:last`. `cleanNumbers` repairs invalid numeric `x`, `y`, `w`, `h`, `r`, `rot` before save. Browser index stores `{id,name,color,folder,parent,updated}`; native listing derives modification time.
- Evidence: A:308-316, 430-459, 4736-4748. H:73-76, 399-401. S:117-119. Browser cache: `web/sw.js`:1-20.
- Bridge/restrictions: library/save bridge. Tauri uses temporary file then rename on board save, R:54-57. Rebrand storage/cache names and remove restricted art/music from the service worker asset list; copying that manifest verbatim would include prohibited assets.

### E2. Notes, titles and editable checklists [P1]

- User sees and does: Note `N`, Title `T`, Checklist `C`, or double-click empty board for a note unless disabled. Pick tool and click to place; text entry starts immediately. Notes have optional editable name above text. Titles are large unframed text, auto-width until manually resized, then wrap. Checklists have editable heading, tick boxes, + add and hover remove. Click item text to edit, Enter inserts another item, empty Enter leaves, empty Backspace removes and moves back, blur removes empty items. Notes/checklists grow to fit text but honour manually chosen minimum height.
- Data: `note.text`, `name`, `color`, `userH`; `title.text`, `fixedW`, measured `w`/`h`; `todo.text`, `items[]: {t, done}`, `userH`. All have common geometry. `settings.noteColor`, `dblNote` control defaults. `note.mochi` is a source template helper-art flag and is restricted.
- Evidence: A:592, 619, 627, 1265-1326, 1499, 1528-1545, 1691-1693, 2139, 2365-2381. H:100, 102-103, 365-366. S:78-86, 100-108, 388-393, 2183-2184, 2224-2234.
- Bridge/restrictions: save bridge. Remove the `mochi` heading-image branch, A:592, from adapted note UI. Plain cards do not require restricted art.

### E3. Whole-card text formatting and font preview [P1]

- User sees and does: selection bar offers B/I/U/strike, left/centre/right alignment, font menu with hover preview, mixed-font indicator, size quick picks Small/Medium/Large/Extra large and typed 6-400 px size with steps. Shift steps by 10. Spacing offers line height, letter spacing, presets and display case As typed/UPPERCASE/lowercase/Title Case. Case transforms display without changing typed text. Cmd+B/I/U acts on selected eligible cards outside typing.
- Data: applies to exactly `note`, `todo`, `title`, `shape`, `coll`. Fields `bold`, `italic`, `under`, `strike`, `align`, `font`, `fs` as legacy `s`/`m`/`l`/`xl` or numeric multiplier, `lh`, `ls`, `tcase` absent/`upper`/`lower`/`title`. Base px sizes `note:15`, `title:44`, `todo:22`, `shape:15`, `coll:15`. Title/collection bold defaults differ from other card defaults.
- Evidence: A:634, 688-697, 1683, 3834-3856, 3873-3908, 3971-3988, 4172-4192, 4231-4234. H:120, generated controls. S:542-559, 1646-1653, 2185-2203, 2235-2245, 2358-2364.
- Bridge/restrictions: save bridge; `MB.fonts()` as W5 and direct Google Fonts loading. Replace default-font branding. Wireframe text uses W3's model instead.

### E4. Labels and captions on cards [P2]

- User sees and does: Add label/Add caption creates an editable pill above a supported card; click action again removes it. Double-click the tag to edit. Empty edited tags disappear. Images call it a caption; ordinary cards call it a label. These are not connector labels.
- Data: `tagText`. Selection bar excludes collection, swatch, stamp and ink from generic label creation. Wireframe CSS hides `.tag` even though common rendering supports it.
- Evidence: A:707, 1284-1288, 1293, 1314, 3958-3959, 4245; H:120, dynamically generated tags. S:75, 886.
- Bridge/restrictions: save bridge only. No artwork dependency.

### E5. Undo/redo and text-edit history [P1]

- User sees and does: outside typing, `Cmd+Z` undoes board changes and `Shift+Cmd+Z` redoes. Inside inputs/contenteditable, normal typing/editor undo applies. Empty history reports nothing left. Snapshot history resets when opening a board; it is not a cross-board or library undo history. Selected text rewrites also offer editor Undo.
- Data: transient `past`/`future`, up to 80 serialised states; each state includes exactly `cards`, `links`, `tray`, `palette`. `name`, `bg`, `view`, library changes, settings and `chat` are not part of this snapshot. Changes settle after 350 ms; pointerdown takes a boundary snapshot.
- Evidence: A:440-459, 1337, 1655, 3574, 3630, 3647, 3765. H:174, 120 as context containers. S:1450-1476 for doc undo/redo buttons; no unique board-history CSS.
- Bridge/restrictions: save bridge writes restored board state. History itself is memory only. No art needed.

### E6. Copy/cut/paste between boards, duplicate and Option-drag [P1]

- User sees and does: Cmd+C/X/V or native clipboard events copy/cut/paste rich board cards, while plain words also reach the OS clipboard. Clipboard survives board switches and is cached locally. Same-board repeated paste offsets by 30 units; another board centres pasted content. Collections, frame contents, groups and internal connectors are remapped. Option/Alt-drag clones originals as dragging starts. Cmd+D and context Duplicate also exist, but use simpler cloning paths.
- Data: localStorage `mochiboard:clip` `{cards, links, from, text}`; clipboard MIME `text/x-mochiboard`. New `id`s, remapped `kids`, `colOf`, `onFrame`, `group`, connector `id/a/b`. `canvas.board` is copied unchanged in card copying, so it still refers to the same child board. Complete recursive library duplication is L4. Section geometric contents are not explicitly expanded by `copyCards`.
- Evidence: A:1685-1687, 1750-1819, 1405, 2538. H:65, board event targets; no specific static clipboard UI. S:379-387 for placement preview, 1764-1766 for clone cursor.
- Bridge/restrictions: save bridge plus browser clipboard/localStorage. Cmd+D does not remap collection/frame ownership or connectors like `copyOf` does; context Duplicate filters out collection containers. Do not assume these paths are equivalent when porting. No restricted art is needed for mechanics.

### E7. Multi-selection, move, resize, align and distribute [P1]

- User sees and does: click selects, Shift-click toggles a card, Cmd/Ctrl-click selects a single group member. Drag empty board for marquee; Shift adds to existing selection. Marquee intersects ordinary cards but must fully enclose sections; hidden/locked cards are excluded there. Cmd+A selects all IDs without that same filter. Whole selection can be dragged by gaps in its outline. A single shared corner resizes groups/multiple cards; Shift scales aspect and supported text. Selection toolbar aligns edges/centres, with even spacing for 3+ selected cards. Whole groups align as units.
- Data: transient `sel`, `drag`; changes `x`, `y`, `w`, `h`, `fs`, wireframe `size`, `fixedW`, `userH`. Section/frame/collection moving expands through contents. `hidden`, `locked`, `group`, `onFrame`, `kids` affect behaviour. Resize handle remains screen-sized across zoom.
- Evidence: A:525-570, 856-857, 1340-1352, 1377-1397, 1419-1442, 1462-1466, 1506-1507, 1684, 3949-3951, 4193-4217. H:66, 68, 120; shared handle generated in A:526. S:67-71, 158, 1094-1098, 1201-1213, 2352-2357.
- Bridge/restrictions: save bridge only. No asset requirement. Multi-resize excludes ink; special stamp/icon single resize stays square, A:1420.

### E8. Grouping and auto-layout collections [P1]

- User sees and does: Cmd+G groups selected cards, Shift+Cmd+G ungroups; right-click/bar/panel also offer these actions. Group click moves as one; Cmd-click/double-click drills into a member. Collections are a separate card type, created with `G`, with editable header, colour and optional hidden header. Drag cards inside to stack; drop near its right edge adds a column; drop within a column reorders. Collection resize changes column count. Drag a member out to remove membership and restore a loose tilt. Collection height fits contents.
- Data: grouping uses per-card `group` ID and optional `gn` display name; there is no group card. `type: 'coll'`, `text`, `color`, `head`, `kids: [cardId]`, `cols`, `colOf: {[cardId]: columnIndex}`, computed `w`/`h`. Child cards are still in board `cards`, have positions/dimensions updated by layout and `r:0` while inside. Layer rename also writes collection `name`, while rendered collection heading reads `text`, a source inconsistency.
- Evidence: A:618, 704-705, 758-805, 1071-1073, 1128-1129, 1377-1383, 1419, 1488-1491, 1501-1503, 1679, 2910, 2935, 3953, 4020, 4241. H:104, 120. S:394-412, 1094-1098.
- Bridge/restrictions: save bridge only. No restricted art needed. Removing a collection through generic Delete does not recursively delete its children, A:2336-2340.

### E9. Layers: select, rename, hide, lock and reorder [P1]

- User sees and does: Layers lists content top-first, with nested screens, sections, collections and groups. Expand/collapse; hover outlines board objects; click selects and pans off-screen content into view. Shift/Cmd/Ctrl-click toggles selections. Double-click renames. Eye/lock acts on descendants. Drag rows reorders siblings under the same parent; collection rows reorder reading order. Right-click uses the board selection menu. Selecting board content opens its ancestors in Layers.
- Data: `hidden`, `locked`, custom layer `ln`, group `gn`, frame/collection `name`, section `text`, swatch `label`, `autoName` and matching `palette[].name`. Nesting derives from `onFrame`, `kids`, `group` and section geometry. `LY.open` and selection highlighting are transient, not library `open` fields.
- Evidence: A:1008-1174. H:32-35. S:1214-1251, 1274-1291.
- Bridge/restrictions: save bridge only. **Replace the Mochi waving image in the locate/flash effect**, A:1155-1163, S:1274-1291. Stamp layer icons also resolve restricted stamp art through `pxSrc`, A:1036. Generic outline/scroll mechanics do not need those assets.

### E10. Front/back stacking and preserving media playback [P1]

- User sees and does: context menu Bring to front/forward or Send backward/to back; shortcuts `Shift+Cmd+]`, `Cmd+]`, `Cmd+[`, `Shift+Cmd+[`. Frames carry their pieces in the stack; pieces cannot go behind their frame. Sections remain behind ordinary cards and stack with sections. Hovering does not raise cards. Layers reflects order. Restacking moves existing DOM nodes so other Spotify/video playback can continue.
- Data: order of `board.cards`, `onFrame`; selected group IDs already define moved members. Sections use CSS z-index zero, normal card stack z-index two. `keepOnScreens` repairs old frame/content ordering.
- Evidence: A:714-718, 1682, 2531-2534, 2911-2934, 1148-1151. H:65, 34, dynamic menu. S:64, 887-889, 977-978, 1963, 2347-2348.
- Bridge/restrictions: save bridge only. No art requirement.

### E11. Tilt, wireframe rotation and rotating selections [P2]

- User sees and does: shared rotation dot above selection rotates one/several objects, with a live degree badge. Shift enforces 15° steps; near-step snapping also occurs. Other objects rotate around the selection centre, while sections/screens/collections/ink stay upright. Tilt menu accepts -180..180° or preset angles and Reset. Context menu resets tilts. Global Loose tilted cards setting can visually straighten loose cards. Older per-card rotation handles remain in code but final CSS hides them in favour of the shared dot.
- Data: ordinary `r`, stamp `tilted`, wireframe `rot`; multi-turn updates `x`, `y`. `settings.tilt`; transient `mrotKeep`, `drag`, `rotBadge`. Fixed orientation list is `section`, `frame`, `coll`, `ink`. `TILTS` also excludes wireframe box/text/icon because they use `rot`.
- Evidence: A:529-547, 632-633, 1342-1348, 1444-1456, 1509-1511, 2530, 2847-2867. H:403-404. S:941-947, 1990-2041, 2352-2357.
- Bridge/restrictions: save bridge only. No art requirement. Stamp asset restriction still applies independently of rotation mechanics.

### E12. Delete selection and attached connections [P1]

- User sees and does: Delete/Backspace, selection Delete button or context Delete removes selected cards and incident connectors. For vector editing those keys edit points instead; for selected connectors they delete only that connector. Board undo can restore board deletions. Unlike library Delete, there is no separate confirmation for normal card deletion.
- Data: filters `board.cards` by selected `id`, `board.links` by `a`/`b`; selection cleared. No soft-delete field. Collection layout filters stale `kids`; frame ownership and nested child boards are not recursively deleted by `removeSelected`.
- Evidence: A:770, 1656-1658, 1676-1677, 2336-2340, 2539, 4053, 4247. H:120 and dynamic context menu. S:306-319, 477-487 for action/menu presentation.
- Bridge/restrictions: save bridge. No native remove operation for ordinary card deletion; `MB.remove` deletes library boards only. No artwork required.

### E13. Board AI assistant and manual/offline fallback [P2]

- User sees and does: helper pill or `M` opens board chat; Enter sends, Shift+Enter adds a line, New chat clears current chat, Esc closes. Suggestions ask to organise, write, plan or find references. AI can add/edit/remove/move cards, file tray items, make collections, connect cards, organise library, suggest fonts/colours, build screens and fetch reference/generated images. Changed cards glow and camera may fit them. Price confirmation is offered for paid generation. Offline/disabled/missing Claude can still line loose notes into four-column rows for matching tidy requests. Public web mode explains unavailable integrations.
- Data: optional `board.chat[]: {who,text,t}`; session alternatives keyed by board ID; settings `ai`, `mobbin`, `higgs`, `chatKeep`, `chatMax`, `chat`, `emoji`, `name`, `mochiName`. Snapshot payload has `name`, `cards`, `links`, `unsorted`, `boardColors`, `fontsOnThisMac`, `recentChat`, `mochiStyle`, `library`; these are request projections, not a replacement board schema. Responses use `add`, `edit`, `remove`, `move`, `place`, `titles`, `collections`, `connect`, `screens`, `images`, `projects`, `folders`, `confirm`, `say`, `next`.
- Evidence: A:462-469, 2153-2334, 4248. H:133-147. S:735-794, 963-976, 1039-1043.
- Bridge/restrictions: `MB.ask(prompt, snapshot, confirmed, {mobbin,higgs})`, `MB.connections`, `MB.fetchImage`, `MB.openURL`, library bridge, B:46-56, 72-81, 88-90; R:182-218 and `src-tauri/src/prompts.rs`:1-65. **Mochi name/character, `Goo` canvases, gestures, outfits, branded setup/download URLs and bundled art must not be ported.** Reuse only generic assistant mechanics with Aegis presentation. Chat “off” still uses session storage in `chatLog`; it limits AI context to two messages rather than erasing the log on every turn, A:2172-2192.

### E14. Crisp zoom, screen-sized handles and grid shapes [P1]

- User sees and does: panning/zooming uses a fast transform; after 450 ms idle, zoom above 1.02 uses CSS zoom to lay content out sharply. Expensive wobble filters pause while moving/far out. Resize/rotation handles stay usable at different zooms. Grid dots keep spacing readable by skipping levels. Settings offers dots, crosses, X marks, hearts, triangles, squares and sparkles, using the chosen grid-dot colour; choosing a shape also turns grid on.
- Data: `view.x/y/z`, `settings.grid`, `gridShape`; transient `zoomShrinks`, `movingT`, CSS zoom/masks and inverse-zoom properties. No grid geometry is saved as cards.
- Evidence: A:472-524, 493-502, 513, 525-570, 575-577, 3917-3924. H:62, 363-364. S:43-44, 948-952, 1201-1213, 1665-1675, 2162-2182.
- Bridge/restrictions: no native zoom/render call; settings/local board persistence only. Geometric grid motifs are code and are separate from restricted pixel stamps.

### E15. Selection-aware dock and responsive menus [P1]

- User sees and does: no selection shows creation tools; selecting cards swaps to relevant controls; selecting a connector shows connector controls; drawing swaps to the drawbar. Home/open document changes available board tools. Bar identifies single type or selection count, shows mixed values where supported, preserves open dropdown/slider while changing values, and folds less-used groups into More. Hover labels identify icons. Pointer `V` puts down placement/drawing/Pen/pickers. A new selection closes old dropdowns.
- Data: transient `sel`, `selWire`, `placing`, `penT`, `drawOn`, `homeAt`, `editing`, bar dataset keys and CSS `ctx`/`drawing` classes. Controls read/write each type's fields above, not a new toolbar field on a card.
- Evidence: A:1717-1735, 3830-3857, 3909-4024, 4042-4081. H:96-132. S:306-319, 352-378, 465-471, 633-641, 2061-2135, 2365-2366.
- Bridge/restrictions: no additional bridge beyond the invoked action. Replace helper/brand controls. Contextual behaviour itself requires no restricted art.

### E16. Your-toolbar customisation and overflow [P2]

- User sees and does: right-click main toolbar → Customise toolbar, or Settings → Toolbar. Switch tools on/off, drag to reorder, choose Small/Medium/Large icons and Reset. Hidden tools keep keyboard shortcuts. Tools that do not fit move into the trailing More menu, which also links to customisation. New tools missing from an older saved order are inserted at defaults.
- Data: `settings.toolbar: {order: [toolKey], hidden: [toolKey]}`, `settings.tbSize` `s`/`m`/`l`. Tool keys come from H's `data-add`, including `pointer`, `note`, `doc`, `todo`, `title`, `coll`, `canvas`, `link`, `image`, `audio`, `video`, `swatch`, `shape`, `stamp`, `tpl`, `pen`, `draw`. No board/card field.
- Evidence: A:1593-1636. H:98-119, 377-380. S:1711-1724, 2246-2257.
- Bridge/restrictions: preferences/localStorage only. Remove/reconfigure restricted stamp catalogue/helper presentation independently from toolbar ordering.

### E17. Export selected card(s) or board as image/PDF [P1]

- User sees and does: right-click selected content or empty board → Export as image/PDF. Empty-board menu acts on whole board; right-clicking empty space while selection exists still uses selection menu. Export clears selection, hides app chrome/grid, frames padded bounds, calls native capture, then restores view/selection. Collection/frame contents are expanded. Empty selection/board reports nothing to export; cancellation produces no saved message.
- Data: reads card geometry and `kids`/`onFrame`, board `name`; derived export payload `{x,y,w,h,name,pdf,scale}`. No persistent export field. Capture is of the rendered rectangle, and does not hide unrelated cards overlapping that rectangle, so it is not an isolated object renderer. Section contents are not explicitly expanded like frames/collections.
- Evidence: A:2490-2514, 2520-2545. H:61-68, dynamic context menu. S:627-631, 1615, 1637.
- Bridge/restrictions: `MB.exportRect(payload)` maps to op `export`, B:58, 90. Swift exports PNG snapshot/PDF with save panel, `Sources/Mochiboard.swift`:151-171. **Tauri R:90 returns an unsupported/coming-to-Windows error**, and public web mode is blocked in A:2494. Document export D5/D6 is a different, working pathway. Exclude restricted art/music/branding from any Aegis export fixture.

### E18. Phone layout, bottom sheets and touch gestures [P1]

- User sees and does: at width ≤700 px, board fills screen and bottom hub opens Boards, Layers, Add and Unsorted sheets plus helper chat. Add tabs expose Basics, Wireframe and Colours; disabled widgets stay hidden. Panels are the same live elements moved into sheets. Backdrop/× or dragging sheet down >90 px closes it. Picking board/layer/tool closes the sheet; tray items add centrally. One finger pans empty board; two fingers pinch; 520 ms press-and-hold within 8 px opens context menu, with optional vibration. New placements are kept visible. Selection/draw bars use large scrollable controls.
- Data: same board/card model, `view`; transient `phone.on`, `open`, `tab`, panel home positions, pointer map and pinch state. Touch gestures do not create a separate mobile board format. Widget prefs still apply; desktop widget header dragging excludes touch.
- Evidence: A:1396, 2371-2373, 4633-4734, 1889-1890. H:existing panel containers, hub/sheet generated dynamically. S:1292-1397, 1374-1397, 1615, 1638-1639.
- Bridge/restrictions: browser pointer/media APIs and ordinary saving; bridge-dependent actions retain platform limits. Replace `hubGoo`, helper tab branding and restricted Dress up/Music sheet content. Generic bottom-sheet/navigation behaviour can be ported.

### E19. Platform shortcut labels and custom cursor [P3]

- User sees and does: Windows/Linux labels substitute Ctrl/Alt/Shift and relevant OS words while avoiding user-entered text. Optional coloured cursor carries chosen name, switches to hand/fist over board cards/dragging, and yields to native I-beam/resize/input cursor. Fine-pointer devices only; disabled through Settings.
- Data: `settings.name`, `cursor`, `fancyCursor`; `MB.platform` determines OS, `OS` and pointer state are transient. No card/board field.
- Evidence: A:5-30, 1925-1953, 1974-1982. H:309-314. S:1178-1200, 1764-1766.
- Bridge/restrictions: `MB.platform`/`MB.native`, B:5-8, 85, 91; no native cursor op. Source calls its pointer the author's jessa.art design. Use new Aegis cursor artwork rather than copying any restricted pixel cursor assets in `assets/`/`stamps/`.

## 7. Settings, first run, what's new, updates (note only)

### N1. Settings structure, appearance and saved preferences [P3, note only]

- User sees and does: gear opens General, Mochi, Helpers, Board, Toolbar, Widgets and About tabs; close/outside/Esc dismisses. Preferences cover system/light/dark theme, cursor/name, board colours/grid/default note colour, double-click note, snap, tilt, motion, hints, widgets, toolbar and devices. General can reveal local boards in Finder/File Explorer. Details relevant to the port are inventoried above; this entry is not a request to port source settings branding.
- Data: complete default preference object at A:1840 includes `panelH`, `mochiName`, `mochiCalm`, `mochiChar`, `tbSize`, `dblNote`, `wLayers`, `wColors`, `wDressup`, `wMusic`, `wDesign`, `wTray`, `mochi`, `greet`, `grid`, `tilt`, `motion`, `keys`, `theme`, `chat`, `emoji`, `noteColor`, `snap`, `ai`, `mobbin`, `higgs`, `chatKeep`, `chatMax`, `cursor`, `fancyCursor`, `colors`. Later additions include `name`, `layout`, `toolbar`, `outfit`, `camId`, `micId`, `camFlip`, `gridShape`, `autoUpdate`. No separate settings board/card type.
- Evidence: A:1837-1841, 1897-1923, 1955-2035, 2126-2142. H:301-392. S:560-599, 668-673, 683-719, 1044-1058, 1153-1200.
- Bridge/restrictions: `MB.reveal`, B:70, 90, R:100. Other settings are local preferences except explicitly invoked helpers/update operations. Rebuild Aegis settings wording; do not port Mochi tab identity, source About identity or branded artwork.

### N2. AI connections, chat retention and usage information [P3, note only]

- User sees and does: Helpers checks Claude Code, Mobbin and Higgsfield with checking/ready/connect states; recheck button refreshes. AI/helper switches control board requests. Usage shows today/week/all asks/tokens, approximate per-request cost text, plan-limit link and Reset. Chat retention offers Off/Until quit/On each board, message caps 20/60/200 and Clear all chats. Clearing saved chats edits every board, not just current board.
- Data: settings `ai`, `mobbin`, `higgs`, `chatKeep`, `chatMax`, `chat`, `emoji`; `board.chat[]: {who,text,t}`. Native `usage.json` records timestamp/input/output/cost, R:220-238. Connection result fields `claude`, `mobbin`, `higgsfield`, optional `browser`, `web`. Do not mistake `higgs` request preference for `higgsfield` connection-result key.
- Evidence: A:2022-2032, 2130-2136, 2172-2194, 2319-2334. H:315-344. S:167-174, 1123-1130, 1144-1152.
- Bridge/restrictions: `MB.connections`, `usage`, `resetUsage`, `openURL`, library bridge, B:46-48, 87-90, R:36-38, 182-187, 220-238. Browser usage returns null. Use new Aegis labels/links; the source's account/help/policy claims are not an Aegis implementation.

### N3. Character customisation, dress-up and bundled music [P3, restricted, note only]

- User sees and does: character can be renamed/recoloured, set Lively/Calm/Calmest, hidden or greeted on launch. Dress up offers outfit categories, hover preview, click to wear and remove all. Optional music widget offers three looping lo-fi tracks, selection, play/pause, volume, now-playing/minimised view and artwork. Both playful widgets default off.
- Data: settings `mochi`, `mochiName`, `mochiCalm`, `mochiChar`, `greet`, `outfit` with keys `hat`, `face`, `neck`, `held`, `wDressup`, `wMusic`; localStorage `mochiboard:music` keeps `{track, vol}`. Music playback is transient Web Audio/HTML Audio state and continues across board switches. No music card type; Spotify M8 is separate.
- Evidence: A:1827-1839, 1901-1918, 2018-2019, 2036-2127, 4595-4612. H:40-58, 133-147, 226-234, 315-325, 349-350. S:138-153, 1767-1788, 1815-1850, 2310-2315, 2322-2342.
- Bridge/restrictions: local preferences/audio, no special native music op. **Must not be ported:** Mochi identity, all `Goo` character drawings/outfits, stamps/music artwork and music recordings. Source paths include `goo.js`, `stamps/`, `music/`. Generic preference or audio-player concepts would need independent Aegis design/assets.

### N4. First-run setup and interactive tour [P3, note only]

- User sees and does: six setup steps collect name, appearance, helper connections, chat preferences and board defaults, then offer tour/explore. Back/Next, Skip, arrow keys and Enter are supported. Seven-step tour highlights tools, capture, tray, library, wireframes, assistant and Settings. Some steps detect actual card/tray growth before advancing. Settings can replay tour/setup.
- Data: `mochiboard:onboarded`; preferences above; transient `obAt`, `tourAt`, baseline counts and polling timer. First board is a real Brain dump starter, A:4739, not just an onboarding mockup.
- Evidence: A:4467-4542, 4736-4745. H:249-300, 386. S:980-1038, 1049-1058.
- Bridge/restrictions: `MB.connections`, startup library operations; no separate tour op. All character canvases, helper persona, source brand and restricted starter art must be excluded/replaced.

### N5. What's new and opt-in widget walkthrough [P3, note only]

- User sees and does: once per newly seen version, a release card collects entries since last seen version. Try/Skip/Next/Back/Show me actions can demonstrate features or open widget settings. A larger update offers optional Dress up/Music toggles and music preview. Fresh installations mark current news seen and show setup instead.
- Data: static `NEWS`, `NEWS_TRY`, `NEWS_STEPS`; localStorage `mochiboard:newsSeen`; transient `nwStep`, `nwSteps`, `nwHead`, animation timer. No board/card field. Release text is not always current behaviour, for example video shortcut A:4565 versus actual A:1704.
- Evidence: A:4546-4631, 4743-4747. H:220-248. S:1131-1152, 1861-1917.
- Bridge/restrictions: `MB.version()`, B:48, 87, R:36. Do not port historical source release copy, Mochi imagery/outfit demos or bundled music preview. Aegis needs its own release entries.

### N6. Update checks and install actions [P3, note only]

- User sees and does: Settings → About checks updates, shows notes/current version, Update now and automatic update choice. A quiet board banner can be dismissed until another update, shows progress/errors and avoids title/panel overlap. Checks run at startup, hourly and on focus with 15-minute reuse. “Automatic” prepares an update for quit on supported Swift release builds. Browser hides native update controls. Tauri checks GitHub releases and runs a Windows installer; automatic preparation is explicitly unsupported.
- Data: settings `autoUpdate`; localStorage `mochiboard:updChecked`, `mochiboard:upbarHidden`; bridge results include `behind`, `latest`, `since`, `release`, `repo`, `offline`, `notes`, optional `preview`. `updInfo`, `preparing` are transient. No board/card field.
- Evidence: A:4398-4465, 4748. H:71-72, 376, 385. S:1075-1085, 1617-1644.
- Bridge/restrictions: `MB.updateCheck`, `MB.updatePrepare`, `MB.updateNow`, B:90; R:115-118, 248-284; Swift:231-244. **Do not port upstream update feeds, installer/app names, source project URLs or branded update copy into Aegis.** These are operational source-app details, not reusable Aegis release configuration.

### N7. About, feedback, download and external links [P3, note only]

- User sees and does: About identifies author/source repository, offers tour/setup and Send feedback. Public web demo has app-download calls to action and feature-unavailable messages. Send feedback opens the source feedback website; it does not submit a report inside the app.
- Data: no board/card fields; fixed URLs, `MB.getURL`, web/native flags.
- Evidence: A:2031, 2207-2216, 4465, 4544-4545. H:23-24, 270, 343, 375-389. S:1062-1074, 1086-1093, 2369.
- Bridge/restrictions: `MB.openURL`, B:46, 51, 90. **Do not port source app name, logo, feedback/download URLs or author-identifying product presentation.** Preserve MIT attribution where required by copied code instead of presenting Aegis as the source author's product.
