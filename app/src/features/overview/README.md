# Board overview

Below 20% zoom, named headings and collections remain visible as screen-space
cluster buttons with window counts. Ungrouped work uses the board name. A
cluster button frames its contents, including nested children. Hidden windows
and hidden descendants stay absent.

The overlay listens to `boardchange` to rebuild clusters and `canvaspaint` to
position them. It does not change the canvas engine or scan the board during
panning. The last painted working view is kept before entering far zoom, and
Back to where you were restores its exact coordinates. Switching boards clears
the bookmark. Keyboard framing and return are instant; pointer framing uses
the canvas's existing reduced-motion preference.
