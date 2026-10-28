# Wireframe tools

W1 to W10 use Aegis card commands and independent editable cards. Open **Wireframe** in the tools, pick a screen, tool or piece, then click the canvas. Drag in either direction to draw a box. X places wireframe text; Shift+R draws a wireframe box. Mochiboard uses R, but Aegis already reserves R for Read-me notes in `controller.ts`, so the box shortcut keeps Shift+R. Command+G groups a selection and Shift+Command+G ungroups it. The floating design panel has selection properties, alignment, spacing, stacking and grouping controls.

- Device presets: iPhone, Android, iPad, Desktop and Watch. Manual dimensions mark a screen as Custom.
- A screen owns content through `card.parent`. Dragging a screen or changing its X/Y carries its owned cards, including cards extending outside the screen. Dropping a card into or out of a screen assigns or clears its parent. Contents are lifted above their screen.
- Sections use centre-based membership, including nested smaller sections and frames with their contents. An unselected section body starts marquee selection through the glass. A tap selects it. Its name or selected body drags it and its contents; Shift retains normal selection behaviour. Labels counter-scale below 100% zoom, capped at 4x, and keep their natural scale above 100%, as in the source. Remove section leaves all content in place. Create section uses Option+Command+G or the selection/context menu.
- Pieces are source definitions for Nav bar, Tab bar, Button, Input, Search, Card, List row, Toggle, Checkbox, Avatar, Image and Heading. Their cards share `card.group`. Dragging any part moves the group. Command/Control dragging reaches a single part. Text can be edited directly. Ungroup releases every part.
- Website templates: Header, Hero, Features, Stats, Testimonials, Pricing, Gallery, Logos, CTA and Footer. On loose canvas they create a 1200 px frame. Inside a screen they use its width and grow its height when needed. Narrow-screen layouts scale to fit. Template text, names, quotes and prices are sample content.
- Snapping checks edges and centres against other visible card types within 6 screen pixels. Guides clear on release/cancellation. Holding Cmd (Ctrl) while dragging temporarily bypasses snapping; Option-drag copies, as in Mochiboard. Optional grid snapping uses 26 board units and keeps relative spacing.
- Font discovery uses `document.fonts` plus a fixed system-family list. A typed family uses browser fallback if unavailable. No font service or native font operation is required.
- Material Icons Outlined and its name list are bundled under `icons/` with the Apache-2.0 licence. Search normalises spaces to underscores, limits results to 180 and supports swapping an existing icon.
- Fill, opacity, custom borders, dash length/gap, corners, rotation, text typography and hollow titles/text/icons with editable letter outline width and colour live in `card.props`. Text grows vertically when edited, resized or restyled. `visualW`/`visualH` preserve small icons and thin dividers within Aegis's minimum card hit area.

## Generic canvas integration

The scene's `CanvasAttachment` exposes four optional drag policies, with no wireframe-specific branching in the engine. `canvas/wireframe-policies.ts` supplies them from `commands.ts`:

- `selectForDrag` returns selected IDs. Pieces use it to select a group or reach one part with Command/Control.
- `expandDrag` returns the cards to move together, including template members.
- `snapDrag` returns the snapped delta and world-space guide lines, drawn in a pointer-transparent layer.
- `dropCommands` adds commands to the move/resize batch. Wireframes use it for ownership, stacking and marking resized device screens as Custom.

Cancellation clears guides and restores the original geometry.

## Fill image, W11

A labelled box shows Fill image. With no host integration it fills the box with an original local stripe pattern, keeps the label, and displays “Placeholder, not AI-generated” on the card. A status message also states that no AI image was generated. The saved `props.placeholder: true` persists across reloads. The pattern is HTML/CSS, has no external assets, and leaves the editable box border visible. Assigning a real image URL displays that image instead.

The cancellable `aegis:wireframe-image-request` event remains available on `document`. Its detail contains `{ cardId, label, width, height, apply }`. A listener may prevent the default local placeholder and apply a real host asset after obtaining one. No model endpoint was added. A future host integration needs an authenticated endpoint taking board/card ids, label and dimensions, using the signed-in text model to produce a sanitised SVG illustration, storing it as a host asset and returning its asset URL and provenance. The UI must distinguish a model-produced illustration from the local placeholder.

## Verification

Board and geometry checks: `app/src/features/wireframe/wireframe.test.ts`.

Full app smoke: `checks/ui/wireframe.mjs`, Vite port 5184, fake-model host and a fresh temporary data folder. It creates and edits cards through the UI, drags containers and cards, searches/swaps icons, inspects guides, asserts the saved host board and reloads the app. It never uses the real Aegis data folder.

## Gap regression checks

`checks/ui/wireframe.mjs` now creates its Vite launcher itself on port 5184, with file watching disabled. It also asserts the R shortcut clash, both image-hook cancellation and the real local fallback, visible placeholder labels/pattern and saved state after reload, section body marquee versus selected-body/name dragging, label sizes at 50%, 100% and 200%, and hollow title rendering with editable outline width/colour and reload. `wireframe-gap-options.png` shows the glass section, local placeholder and hollow title together.
