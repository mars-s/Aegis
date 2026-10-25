# Feature modules

Each feature (docs, drawing, wireframes, colours...) lives in its own folder here and is loaded from `index.ts`.
A feature registers what it needs; it does not edit the canvas engine or controller directly.

- Card types: `registerCardType(type, { size })` from `lib/board/commands.js`, in a file both the app and the host
  import (`lib/board/types/<feature>.js`). Type-specific data goes in `card.props` (any JSON, merged by
  `update {set: {props}}`; a `null` value deletes a key). Cards also have `rot` (degrees) and `parent` (card id).
- Rendering: `registerRenderer(type, { render(el, card, api), drop?(el), open?(card, api), interactive?: selector, resizable? })`
  from `canvas/engine.js`. `api.apply(commands)` changes the board, `api.setProps(id, partial)`, `api.resolveUrl`,
  `api.openUrl`, `api.board`, `api.view`.
- UI: `registerTool`, `registerPanel`, `registerCommand`, `registerMenu` from `features/registry.ts`.
- Licences: Mochiboard code is MIT (keep its notice, `LICENSE.mochiboard`). Never port Mochi, goo.js, stamps, music or
  the Mochiboard name. Zephium code is MPL-2.0 (keep the file header).
