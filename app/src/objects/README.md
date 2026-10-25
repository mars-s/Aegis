# Generative objects

`lib/board/objects.js` owns the closed data shapes, default sizes, JSON schemas and agent guidance. The host and app use the same validator. `ObjectCard.svelte` draws each kind in the shared dark window. Person edits use `object_set`, so they follow the existing save queue and board history.

Built-ins are the first choice: stats, timeline, kanban, table, progress, compare, gallery, stages, callout and form. Kanban supports dragging and keyboard or touch Move controls. Forms save each field on change, with text and numbers saving when focus leaves the field. They have no external submission. Galleries accept uploaded local image assets only. The test artwork is original SVG geometry.

## Custom HTML

The `html` kind accepts `{ html, css, js, height? }`. Source strings are stored and revised like any object. The app registers that source with the authenticated local host using `POST /sandbox`. The host builds the isolated document and returns a loopback URL with a random 256-bit ID. Only that document executes the source. The app never evaluates it. The iframe has exactly `sandbox="allow-scripts"`, with an opaque origin and no same-origin, pop-up, form, top-navigation or download permission.

The response CSP header and first CSP meta tag set `default-src 'none'`, inline scripts and styles only, `img-src data: blob:`, `font-src data:` and no connections, frames, workers, objects, media, base URL or form actions. Inter is inlined from the existing SIL OFL font package. App theme variables are copied into the document, along with reduced-motion and Motion off rules. Theme or motion-setting changes rebuild the isolated document. The header also sets `sandbox allow-scripts`, `nosniff`, `no-referrer`, `no-store` and `Cross-Origin-Resource-Policy: same-site`.

Resize and mutation observers report content height only when it changes. The app accepts a report only from this iframe's `contentWindow`, origin `null`, with its instance channel and a finite numeric height. It clamps height to 80 to 2000 px, includes the actual strip, padding and borders, and saves geometry through the normal board command. Larger content scrolls. Resizing does not replace the document. Custom widget state is temporary; use a built-in form for saved answers.

The parent retains `script-src 'self'` and Tauri's automatic CSP hash insertion. Its frame permission allows only `http://127.0.0.1:*` and the existing Spotify origin. A URL document receives its own CSP, so the parent needs no inline-script or data-font exception. The shared builder is included in the native bundle's resources for the agent host to import.

The host keeps at most 200 documents in memory, each capped at 1 MiB, and refreshes recency on reads. The request body has the same byte cap, and source fields retain their existing validation limits. Registering source requires the app's bearer token. Reading a document requires its unguessable ID, because iframe navigation cannot send the token. Unknown or evicted IDs return 404. Reloading the app registers fresh URLs from saved object data, and an iframe can reload its URL while cached. This keeps source persistence in the board store and avoids a second persistent store or long-lived signed URLs. A host restart or cache eviction requires the app to register the document again.

Svelte and React source compilation is omitted. Svelte and Vite are build-time tools here, with no offline runtime compiler and module bundler in the shipped app. Svelte's compiled output still imports a runtime, and React is not installed. Adding an agent-controlled compilation service would exceed this object's scope and the worker brief's no-new-dependency rule. Plain HTML, CSS and JavaScript already work offline with no additional dependency.

## Verification

`agent/checks/genui.test.mjs` checks every kind's validation, creation, default size, revision, edits and host persistence. `checks/ui/genui.mjs` creates every kind through a fake agent, exercises saved edits and reloads, applies the exact native parent CSP before scripts load, proves parent inline scripts are blocked while sandbox scripts run, tests isolation, checks height message sources, and photographs every kind at 1440, 1586 and 390 px. Run it with `AEGIS_PORT_OFFSET=500` to use Vite port 5694. `AEGIS_CHECK_OUT` chooses the screenshot folder.
