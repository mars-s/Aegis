# Generative objects

`packages/domain/src/objects.ts` owns the closed data shapes, default sizes, JSON schemas and agent guidance. The host and app use the same validator. `ObjectBody.tsx` draws each kind in the shared dark window. Person edits use `object_set`, so they follow the existing save queue and board history.

Built-ins are the first choice: stats, timeline, kanban, table, progress, compare, gallery, stages, callout and form. Kanban supports dragging and keyboard or touch Move controls. Forms save each field on change, with text and numbers saving when focus leaves the field. They have no external submission. Galleries accept uploaded local image assets only. The test artwork is original SVG geometry.

## Focused views

Open in either the window strip or selection toolbar, double-click, and Return on a selected window open the shared document side editor. Sheets keep their cell editor. Other supported object kinds reuse `ObjectBody` in the expanded editor (`editors/object/session.tsx`), which omits its strip and renders the content with more space. Unsupported kinds have no Open button.

The editor subscribes to the workspace while open, so saved edits, undo and agent revisions update the view without polling. Switching boards, removing the object or changing its kind closes it. Closing blurs the active field to flush its change event and restores focus to the source window. Escape inside custom HTML reports through a source, opaque-origin and channel check. Expanded HTML height stays local to its view and does not resize the canvas window.

## Custom HTML

The `html` kind accepts `{ html, css, js, height? }`. Source strings are stored and revised like any object. The app registers that source with the authenticated local host using `POST /sandbox`. The host builds the isolated document and returns a loopback URL with a random 256-bit ID. Only that document executes the source. The app never evaluates it. The iframe has exactly `sandbox="allow-scripts"`, with an opaque origin and no same-origin, pop-up, form, top-navigation or download permission.

The response CSP header and first CSP meta tag set `default-src 'none'`, inline scripts and styles only, `img-src data: blob:`, `font-src data:` and no connections, frames, workers, objects, media, base URL or form actions. Inter is inlined from the existing SIL OFL font package. App theme variables are copied into the document, along with reduced-motion and Motion off rules. Theme, motion, title, geometry and state changes update the live document without replacing it. Only HTML, CSS or JavaScript source changes register a replacement. The header also sets `sandbox allow-scripts`, `nosniff`, `no-referrer`, `no-store` and `Cross-Origin-Resource-Policy: same-site`.

Resize and mutation observers report content height only when it changes. The app accepts a report only from this iframe's `contentWindow`, origin `null`, with its instance channel and a finite numeric height. It clamps height to 80 to 2000 px, includes the actual strip, padding and borders, and saves geometry through the normal board command. Larger content scrolls. Resizing does not replace the document.

Canvas and Open use a state transfer contract. The bootstrap snapshots input, textarea and select values, checked state, multi-select selections, text-only `[data-aegis-state]` outputs and optional `window.aegisState` JSON. Password and file inputs are excluded. The app keeps the latest snapshot in the object data through `object_set`, broadcasts it to both views and saves it through the existing queue. Open, Close, reopen, canvas culling and app restart restore the saved snapshot. An offline edit follows the existing Retry save flow. No extra store, DOM reparenting or per-frame positioning is involved.

The snapshot is JSON text, capped at 64 KiB of UTF-8, with a closed versioned shape and bounded indices, collections and custom JSON depth. The host and app share validation. State messages require the sending frame's `contentWindow`, opaque origin `null` and its channel. Restoration and preferences require the parent window, its registered origin and the channel. Restored custom JSON is available before widget scripts initialise. DOM values restore after scripts register their listeners, and the frame stays hidden until the parent's load handshake applies its latest state. Restoration sets all fields before emitting input/change events for changed values, restores marked text, then fires `aegis:restore`. It does not report the restoration as another edit.

Use `window.aegisState ??= { ... }` for script state and listen for `aegis:restore` to render it. Input/change/click and DOM mutations trigger snapshots. For a script-only change outside those events, dispatch `aegis:statechange`. DOM controls and marked text are matched in document order with control tag/type checks, so keep their structure stable within a source version. Revisions replace the source; omit `state` in replacement data to start fresh. Arbitrary JavaScript closures and timers are outside this contract.

The parent retains `script-src 'self'` and Tauri's automatic CSP hash insertion. Its frame permission allows only `http://127.0.0.1:*` and the existing Spotify origin. A URL document receives its own CSP, so the parent needs no inline-script or data-font exception. The shared builder is included in the native bundle's resources for the agent host to import.

The host keeps at most 200 documents in memory, each capped at 1 MiB, and refreshes recency on reads. The request body has the same byte cap, and source fields retain their existing validation limits. Registering source requires the app's bearer token. Reading a document requires its unguessable ID, because iframe navigation cannot send the token. Unknown or evicted IDs return 404. Reloading the app registers fresh URLs from saved object data, and an iframe can reload its URL while cached. This keeps source persistence in the board store and avoids a second persistent store or long-lived signed URLs. A host restart or cache eviction requires the app to register the document again.

Framework source (JSX, Svelte and similar) is not compiled. The shipped app has no runtime compiler or module bundler, and the sandbox cannot reach the app's React. Plain HTML, CSS and JavaScript work offline with no additional dependency.

## Verification

`checks/host/genui.test.ts` checks every kind's validation, creation, default size, revision, edits and host persistence. `checks/ui/genui.mjs` creates every kind through a fake agent, exercises saved edits and reloads, applies the exact native parent CSP before scripts load, proves parent inline scripts are blocked while sandbox scripts run, tests isolation, checks height message sources, and photographs every kind at 1440, 1586 and 390 px. Run it with `AEGIS_PORT_OFFSET=500` to use Vite port 5694. `AEGIS_CHECK_OUT` chooses the screenshot folder.
