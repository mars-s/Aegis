# Feature modules

Each feature (agents, drawing, wireframes, colours, media, imports, editing and so on) lives in its own folder. The app composes features explicitly in `composition.tsx`; nothing registers itself as an import side effect.

- Card types and their data live in `@aegis/domain`. Type-specific data goes in `card.props`, validated by the domain schema. Cards also have `rot` (degrees) and `parent` (card id).
- Card bodies are `CardRegistration`s: a `kind` and a React `Body` that the scene renders into a leased shell.
- Tools, menus, panels and editors are `ActionRegistration`, `PanelRegistration` and `EditorRegistration`. Editors supply a synchronous `flush` so the app can refuse to close while an edit is pending or in conflict.
- Board changes go through `workspace.submit(commands)`. One authored action is one batch and one Undo.
- Licences: Mochiboard code is MIT (keep its notice, `LICENSE.mochiboard`). Never port Mochi, goo.js, stamps, music or the Mochiboard name. Zephium code is MPL-2.0 (keep the file header).
