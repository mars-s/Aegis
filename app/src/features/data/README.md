# Data and charts

React card registrations are `dataCards` and `dataEditors` in `registrations.tsx`. The composition owner adds them to the app. `dataEditors` takes the host client's `assetUrl` capability. CSV import takes `upload` separately, plus an AbortSignal and the destination workspace. No data component opens its own host connection or uses the test facade.

`importDataset` runs parsing and profiling in an import worker, uploads the original file, then submits one dataset create command. Cancellation or any board replacement aborts the import, including a switch away and back to the same board. A late upload cannot create a card after that replacement. The dataset viewer owns one worker per source view, validates structured-clone messages and ignores stale epochs and row requests. It virtualises both rows and columns. Canvas previews are capped at the original 40 rows.

Sheets use workspace commands for cells, column types, structure and sorting. `sheetSession` retains the selection, scroll and unfinished text independently of the view lease. `flushSheet` is the editor registration's synchronous close guard. If the same cell changed while a person was typing, the draft remains available and the editor refuses to close. Changes to other cells remain intact. Saving and Retry come from the workspace's real save source.

Charts use `@aegis/domain/chart-source` for live bindings and saved snapshots. React never writes derived snapshots. `useChartCards` shares one payload subscription per workspace and ignores geometry-only changes. `useChartScreen` observes the scene's committed transform and updates chart label sizes and point radii without layout reads, a second frame loop or camera-driven React state. The canvas engine keeps ownership of card geometry and leases.

`app/src/charts/index.tsx` exports the chart renderers. `DeckChart` accepts the typed workspace, chart model, optional deck/slide identities and source chooser. Its `presentationHeight` is the screen height of the containing slide fit, and `viewScale` is the scale already applied by the containing view, including its canvas camera. The deck owner supplies both to preserve audience-sized labels and 2.5 screen pixel points during slide fitting. All chart code adapted from Zephium retains MPL-2.0 notices.

The old `features/data/*.js`, `features/sheet-editor` and `objects/chart` implementations remain necessary while legacy is the default. Their shared callers and removal are integration work. The React implementation imports none of them.
