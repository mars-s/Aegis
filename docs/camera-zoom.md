# Camera zoom

Zoom scales the board's original windows around the camera. A window at world
position `(x, y)` with size `(w, h)` appears at `(x * zoom + panX,
y * zoom + panY)` with size `(w * zoom, h * zoom)`. Rotation stays around the
window's centre. Overlapping windows stay overlapped.

The same content DOM remains in each visible window at every zoom. Charts and
sheets scale with their windows. There are no summary cards, clusters, packing
rules, per-kind zoom thresholds or overview return button.

Fit uses the real rotated bounds and reserves the visible chrome. Agent windows
retain their screen size and join Fit through their world anchors. The camera
keeps the existing 5% minimum and 400% maximum. A board too large to fit at the
minimum can extend outside the screen.

Below 40%, a crowded view with more than 400 visible windows still draws their
exact rectangles on the grid canvas. This keeps large boards fast. Rotation,
position and size use the same camera scale. Far-zoom window names remain
available through the keyboard and pointer edge aid.

`checks/ui/semantic-zoom.mjs` and `checks/ui/overview-model.mjs` run the production
bundle in Chromium and WebKit. They check 30%, 50%, 75%, 100% and 200% geometry,
content, links, window actions, Fit, motion settings and crowded far-view drawing.
`checks/ui/chart-defaults.mjs` checks scaled points and labels while retaining the
existing editor, presentation and source-binding checks. `node checks/ui/bench.mjs`
measures pan and zoom across 5,000 windows.

Board summaries for agents, document references and Library are separate from
camera rendering and remain available.
