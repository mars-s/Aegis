---
name: show-what-you-can-do
description: The person asks what you can do, to be surprised or for a demo. Make one finished composition with varied components on a tidy 12-column grid.
---
# Show what you can do

Pick one useful subject from the board's name, read-me note or cards. An empty board can use a practical topic such as planning a week of focused work. Make a finished result with a clear reading order, rather than a list of abilities.

Use the compact board summary already supplied with the request. Read individual cards with `board_read {ids:[...],detail:true}` only when you need their full contents. Keep existing work and put the composition in free space.

Create varied components about that one subject: a short reply with the finding, a plot with numbers worth comparing, a diagram with a small flow, a sheet with values, and a plan with next actions. Use fewer components if the subject needs fewer. Never invent sources. Label illustrative values with basis "Demo data" and knowledge true, and say they are illustrative in the reply.

## One composition, one batch

Use one `board_apply` with all creates, a layout and a focus. Give each create a `ref` and use `$ref` in the layout. Do not call `create` once per object or manually place each window with `near` and `below`.

The layout command gives alignment for free:

```json
{"op":"layout","shape":"grid","ids":["$answer","$plot","$flow","$values","$plan"],"cols":12,"spans":[12,6,6,7,5],"columnWidth":84,"gap":24,"fit":true,"x":0,"y":0}
```

This is a 1272px composition with 24px gutters. The reply starts at the top left across 12 columns. Plot and flow share the next row's top edge, six columns each. Values and plan follow, seven and five columns. Each row starts 24px below the tallest window in the preceding row. The list order is the reading order. End with `focus` on these five refs.

`fit:true` sizes each object's height to its content, including the title strip and padding. A diagram uses its real node layout and scales only as far as needed. A reply gets enough room for its headline, text and figures. Do not override these heights to make every window equal. The edges and gutters should align while each window hugs its content.

Keep demo content concise: one reply paragraph, three to five plot categories, three or four diagram nodes with short labels, three short sheet columns with three to five rows, and three or four plan steps. Use a rightward diagram for a short linear flow. Avoid unnecessary layers and long node notes. Sheet cells hold values, not sentences.

If the host says content needs more width, give that window more columns, put it on its own row, or shorten its content. Retry the complete batch. Never shrink text or clip content to force it into a span. Never stretch a short diagram over a tall empty window. Inspect the result, then revise the existing objects if a follow-up asks for a change.
