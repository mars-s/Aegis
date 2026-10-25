# Wireframe tools

W1 to W10 use Aegis card commands and independent editable cards. Open **Wireframe** in the tools, pick a screen, tool or piece, then click the canvas. Drag in either direction to draw a box. X places wireframe text; Shift+R draws a wireframe box. Command+G groups a selection and Shift+Command+G ungroups it. The floating design panel has selection properties, alignment, spacing, stacking and grouping controls.

- Device presets: iPhone, Android, iPad, Desktop and Watch. Manual dimensions mark a screen as Custom.
- A screen owns content through `card.parent`. Dragging a screen or changing its X/Y carries its owned cards, including cards extending outside the screen. Dropping a card into or out of a screen assigns or clears its parent. Contents are lifted above their screen.
- Sections use centre-based membership, including nested smaller sections and frames with their contents. Remove section leaves all content in place. Create section uses Option+Command+G or the selection/context menu.
- Pieces are source definitions for Nav bar, Tab bar, Button, Input, Search, Card, List row, Toggle, Checkbox, Avatar, Image and Heading. Their cards share `card.group`. Dragging any part moves the group. Command/Control dragging reaches a single part. Text can be edited directly. Ungroup releases every part.
- Website templates: Header, Hero, Features, Stats, Testimonials, Pricing, Gallery, Logos, CTA and Footer. On loose canvas they create a 1200 px frame. Inside a screen they use its width and grow its height when needed. Narrow-screen layouts scale to fit. Template text, names, quotes and prices are sample content.
- Snapping checks edges and centres against other visible card types within 6 screen pixels. Guides clear on release/cancellation. Holding Cmd (Ctrl) while dragging temporarily bypasses snapping; Option-drag copies, as in Mochiboard. Optional grid snapping uses 26 board units and keeps relative spacing.
- Font discovery uses `document.fonts` plus a fixed system-family list. A typed family uses browser fallback if unavailable. No font service or native font operation is required.
- Material Icons Outlined and its name list are bundled under `icons/` with the Apache-2.0 licence. Search normalises spaces to underscores, limits results to 180 and supports swapping an existing icon.
- Fill, opacity, custom borders, dash length/gap, corners, rotation, text typography and hollow text/icons live in `card.props`. Text grows vertically when edited, resized or restyled. `visualW`/`visualH` preserve small icons and thin dividers within Aegis's minimum card hit area.

## Generic canvas integration

`registerDragHandler(id, { select, start, snap, end })` in `canvas/engine.js` is optional and contains no wireframe-specific branching:

- `select(ids, hitId, board, event)` returns selected IDs. Pieces use it to select a group or reach one part with Command/Control.
- `start(cards, board, event)` returns the cards to move together.
- `snap(startSnapshots, dx, dy, board, view, event)` returns `{ dx, dy, guides }`. Guides are world-space `{ x1, y1, x2, y2 }` lines drawn in a pointer-transparent SVG layer.
- `end(cards, board, kind)` adds commands to the move/resize batch. Wireframes use it for ownership, stacking and marking resized device screens as Custom.

The hook also clears guide lines on cancellation and restores cancelled drag geometry.

## Image generation hook, W11

A labelled box shows Fill image. It dispatches a cancellable `aegis:wireframe-image-request` event on `document`. `event.detail` contains `{ cardId, label, width, height, apply }`. A future agent integration can call `event.preventDefault()` and use `apply([{ op: 'update', id: cardId, set: { props: { src: assetUrl } } }])` after obtaining an image. Without a listener, the UI explains that generation is not connected. There is no paid service, external fetch or generated-image claim. Existing image URLs or host asset URLs can also be assigned in the panel.

## Verification

Board and geometry checks: `node --test agent/checks/wireframe.test.mjs`.

Full app smoke: `/tmp/aegis-check/wireframe-smoke.mjs`, Vite port 5184, fake-model host and a fresh temporary data folder. It creates and edits cards through the UI, drags containers and cards, searches/swaps icons, inspects guides, asserts the saved host board and reloads the app. It never uses the real Aegis data folder.

Latest verification: 42 wireframe checks pass. The full host suite passes 111 tests. Svelte check reports 0 errors and 6 existing accessibility warnings in App.svelte. The production build passes with its existing bundle-size warning. The browser smoke passes on port 5184 with watching disabled to prevent concurrent agents' live edits from interrupting gestures. It saves and reloads 24 cards with no browser errors. Screenshots were opened and visually inspected:

- `/tmp/aegis-check/wireframe-screen-light.png`
- `/tmp/aegis-check/wireframe-screen-dark.png`
- `/tmp/aegis-check/wireframe-section-light.png`
- `/tmp/aegis-check/wireframe-website-light.png`
- `/tmp/aegis-check/wireframe-snapping-light.png`

The saved host board is `/tmp/aegis-check/wireframe-saved-board.json`. Check logs are `/tmp/aegis-check/wireframe-agent-check.log`, `/tmp/aegis-check/wireframe-svelte-check.log` and `/tmp/aegis-check/wireframe-build.log`. The Vite launcher is `/tmp/aegis-check/wireframe-vite.mjs`.
