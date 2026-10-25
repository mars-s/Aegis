---
name: show-what-you-can-do
description: When asked what you can do, for a demo or to be surprised, create one curated composition with a focal document and varied working windows.
---
# Show what you can do

1. Pick one useful subject from the board name or compact summary. For an empty board, use a practical subject such as a calmer working week. Keep existing work and put the composition in free space. Read full cards only when their details matter.
2. Build a finished set about that subject: a document with Markdown and inline and block KaTeX maths, a sheet, a three-slide deck, a thin-line plot, a short diagram, three or four built-in generative kinds, and one small offline HTML sandbox widget. Stats, progress and a callout work well together. Use the same figures across the document, sheet, plot and slides. Label invented values "Demo data", set knowledge:true on the plot, and explain in chat that the values are illustrative. For a slide chart, supply chart.labels alongside chart.values, using Mon, Tue, Wed, Thu and Fri for the five sample days. Use original drawn graphics for slides.
3. Send one board_apply containing all creates, a grid layout and focus. Give creates refs and use $refs in the layout. The document leads on the left. A tidy grid of smaller windows supports it on the right, with the deck below the document. Keep the whole set concise enough to read after Fit.

Use this layout for refs in the listed order:

```json
{"op":"layout","shape":"grid","ids":["$document","$stats","$goals","$flow","$plot","$sheet","$deck","$principle","$widget"],"cols":12,"spans":[6,3,3,6,6,6,6,3,3],"columns":[0,6,9,6,6,6,0,6,9],"columnWidth":104,"gap":24,"fit":true,"pack":"compact","x":0,"y":0}
```

The grid is 1512px wide. The optional columns list fixes each starting column, counting from zero, so the document and deck stay on the left. Compact packing closes vertical gaps within those columns. Renderers measure their intrinsic heights after mounting and repack the group. Diagrams use their laid-out graph bounds. Keep natural heights instead of stretching every window to match a tall neighbour. End with focus on the complete set. If a span is too narrow, give it more columns or shorten its content, then retry the complete batch.

Use a few document sections, a clear equation, five sheet rows, four diagram nodes in a rightward flow, two stat values and two progress goals. The HTML widget should do one useful thing, such as changing block length to calculate focused hours, using the provided theme variables. It has no network or parent access. Prefer built-in kinds for the other windows.

Finish with a short explanation in the island chat and point out one thing to try. Create zero reply or note cards for your answer. A capability demo asks for working artefacts; its conversational answer belongs in chat.
