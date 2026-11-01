# Feature modules

The app composes features explicitly in `composition.tsx`. Nothing registers
itself as an import side effect. A fresh board is an empty dot canvas with the
small AI dock, faint board title and edge-hover navigation. There are no shipped
placement tools, starter actions, Templates or onboarding tour.

- Card data and board commands live in `@aegis/domain`; type-specific data is
  validated in `card.props`. Card bodies remain available for AI-created and
  imported content, including sandboxed HTML objects.
- Card bodies are `CardRegistration`s rendered into scene leases. Editors are
  `EditorRegistration`s with synchronous `flush` and optional asynchronous
  preparation, so pending or conflicting edits can refuse to close.
- `canvasExtensions` is a typed, empty-by-default registry for future tool and
  panel composition. It does not implement self-extension.
- Agents own the dock, normal conversation UI and first-run introduction.
  `settings/ProviderConnections` supplies the same ChatGPT and Claude Code rows
  to the dock and Settings. No API keys or Claude credentials enter the app.
- The introduction saves the local profile through `profile_update`. Saved
  context accompanies later runs. Settings' Reset introduction clears it and
  starts the conversation again when a provider is ready.
- Imports still handle files dropped or pasted onto the canvas: PDF, PPTX,
  Keynote, CSV and images. Their progress and card arrival behaviour remain.
- Drawing, wireframe and media card primitives remain separate from chrome.
  Existing content retains selection and editing behaviour. Board changes use
  `workspace.submit(commands)`; one authored action is one batch and one Undo.
- Licences: Mochiboard code is MIT (`LICENSE.mochiboard`). Never port its
  character, artwork, music or name. Zephium code keeps its MPL-2.0 file header.
