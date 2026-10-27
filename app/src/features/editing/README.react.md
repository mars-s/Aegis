# React editing slice

`registration.tsx` is the explicit React entry. `index.ts` still starts the default legacy interface and must not be imported by the React composition.

The React entry exports clipboard, duplication, deletion and scoped restoration, alignment/distribution, stacking, groups, collections, layer ancestry, capture parsing, writing fonts, grid motifs and browser export. Data commands use the real workspace. Each authored operation submits one atomic batch and uses the workspace's existing Undo history.

Basic bodies are registered with `basicRegistrations({ assetUrl, ImageActions, VideoActions })` from `cards/basic/index.tsx`. The optional media action components belong to the creative slice. Generated bodies use `objectRegistrations({ assetUrl, registerSandbox })` from `cards/objects/index.tsx`. The object factory excludes plot and sheet, which come from the data slice.

Object editor registrations include `flushObject`. Pending invalid or conflicting fields refuse close and remain visible. Dirty drafts pin their canvas lease. Inline Escape cancels a draft; a following Escape reaches the shared editor close action. The parent validates every sandbox report through the public protocol helpers and never reads an opaque iframe's document.

`createExportRenderer({ board, composition, engine })` makes an isolated, temporary snapshot for export. It has no host connection, skips live object measurements and never runs custom HTML. Pass its `renderCard` method, an asset resolver and the scene's public link geometry callback into `exportBoard`. Always dispose the renderer in a finally block. Export keeps the person's live camera, selection and board unchanged. CSS scaling inside the SVG foreignObject keeps XHTML and image/video overlays aligned in Chromium and WebKit.

The old editing JS and Svelte object files remain required by the default legacy app. Their deletion and ratchet-manifest removal must follow caller migration and the default switch, coordinated by integration. Do not remove them while legacy is still enabled.

Verification evidence and pending shared-contract requests live in `/Users/avi/.codex/orchestrate/aegis-react/evidence/objects/` and `/Users/avi/.codex/orchestrate/aegis-react/inbox/objects-integration-requests.md`. The focused browser harness composes the actual bodies and real host/workspace/scene; its result is separate from the standard suites, which still stop at shared integration gaps.
