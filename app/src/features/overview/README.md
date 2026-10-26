# Board overview

Zoom uses one shared level of detail, updated in the canvas animation frame:

- Detail below 70% changes to a window summary. Detail returns at 76%.
- Below 20%, summaries become named clusters. Window summaries return at 23%.
- Each summary keeps its title, kind glyph and up to two facts at 12 to 14 screen
  pixels. Clicking a summary frames its window at a readable working zoom.

The different entry and exit thresholds prevent flicker during trackpad jitter.
The layers crossfade over 180 ms using opacity and transform transitions, which
can reverse mid-fade. Reduced motion and the app's motion setting remove these
transitions. The detail renderers stay mounted while summaries are active, so
editor, iframe and scroll state survives. Inactive layers are inert.

The overlay caches content facts on `boardchange` and positions visible windows
on `canvaspaint`. Its fixed screen widths and heights avoid text measurement or
size changes during pinch zoom. The engine reads viewport geometry before
writes and shares it with the overlays. Agent summaries report their screen
rectangles without DOM measurement, so clusters can avoid them.

Clusters retain every visible member's summary in a scrollable list, including
nested children. The list mounts at most eight rows at once and supports wheel,
arrow, Page Up, Page Down, Home and End scrolling. Scrolling the list does not
pan the board. Hidden windows and hidden descendants stay absent. Ungrouped work
uses the board name. The existing pointer and keyboard orientation aid remains
available at far zoom.

The last painted working view is kept before entering clusters. Back to where
you were restores its exact coordinates. Switching boards clears the bookmark.
Keyboard framing and return are instant; pointer framing follows the canvas's
motion preference.

`checks/ui/semantic-zoom.mjs` checks the production bundle in Chromium and WebKit,
including fonts with ancestor transforms, hysteresis, interrupted fades, agent
state, and a 450-window copy of the mixed demo. The Chromium layout count is
bounded by frame count, rather than window count. Captures and metrics go to
`.scratch/semantic-zoom/`. Use `--capture-before` on the base revision for baseline
captures. `npm run bench` separately exercises 5,000 cards.
