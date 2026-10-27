# React documents

This folder owns document content, editing sessions, references and exports.
`cards/document/registration.tsx` exports `documentCard`, `documentEditor` and
`documentTool` for the app's explicit composition. Import from this folder's
`index.js` to use `DocumentProvider`, `DocumentContext`, clipboard setup and
session cleanup. The legacy `features/docs` implementation remains separate
while legacy is the default.

Canvas bodies use the scene's leases. They render the same rich document and
KaTeX nodes as the editor without creating TipTap editors. CSS container queries
keep small legacy document pills compact without subscribing to geometry.
Documents keep their real world positions and sizes at every camera scale.

An opened document acquires a separate TipTap session. The session keeps its
selection, Undo history, draft and editor scroll while its view is closed or
remounted. Up to eight saved, closed sessions remain cached. Dirty sessions are
retained and pinned. Body text and rich JSON commit together through
`workspace.submit`. Closing or changing the editor must use the registration's
`flush`, which can refuse a rejected or conflicting draft. Saved means the
workspace's save queue has confirmed the write, rather than just optimistic input.
New incoming content cannot silently replace a dirty draft. The editor offers
explicit choices to keep the draft or use the saved document.

`DocumentProvider` supplies semantic services. It accepts a typed rewrite
function, asset URL resolution, native save/print adapters, the app's
`FeatureContext`, the shared shell's `editorActions`, and a `ReferenceChart`
component from the charts owner. A rewrite receives text and document context,
not credentials or a generic HTTP client. Stale and cancelled replies cannot
replace current text. The document's header renders `editorActions`; the app
continues to own close/full-width buttons and editor positioning.

`DocumentContext` is a separate pinned-reference panel. It does not replace,
hide or repack canvas windows. It uses linked sources first, persists the chosen
source and table region, and cancels reads when a dataset source changes.
Sheet values update directly from the canonical board. Chart rendering is
injected from the chart owner rather than copied into this feature.

The port reuses the existing dropdown, writing-font, colour-picker and inline
orb controls through the narrow declarations in `legacy-controls.ts`. These
declarations describe the inspected implementations; they do not relax the
type checker. Shared control migration can replace these adapters later.

Word export writes editable WordprocessingML with the existing `fflate`
dependency. This avoids `docx@9.14.0`'s invalid global `ImportMeta.glob`
declaration under strict Vite checking. Marks, hyperlinks, restarted lists,
tasks, table spans, images, page sizes and LaTeX source are retained. Its tests
read the actual ZIP parts. Browser verification also exports images, and macOS
`textutil` reads an exported rich document. Print uses light paper and embedded
KaTeX fonts. A native adapter receives the HTML; a browser uses a temporary
print iframe with load-failure cleanup.

The integration owner must register these exports and wire the provider,
shared editor shell, clipboard and scene drag/drop adapter. The feature exports
`copyCardsIntoDocument` for a completed board-card drop; the scene must restore
the source geometry and avoid submitting a move before calling it. Shared
camera bookmarks, focus return and the chart renderer remain integration work.
Call `disposeDocumentSessions` before deliberately disposing a workspace. A
false result retains a draft that cannot be flushed and must prevent navigation.

All production changes stay inside the two document folders. The document UI
checks select real React controls, the shared editor shell and mounted sheet
rows. They retain the original assertions and expected values. React context
checks verify real source content and exact camera geometry under the static
zoom ruling. Legacy checks retain their compact reference assertions.

Parity results and exact cross-owner proposals are recorded under
`~/.codex/orchestrate/aegis-react/evidence/fix-documents/` and in
`~/.codex/orchestrate/aegis-react/reports/fix-documents-final.md`. Conditional
verification copies include those proposed changes. They do not prove parity
on the worker branch until the integration owner lands the proposals.
