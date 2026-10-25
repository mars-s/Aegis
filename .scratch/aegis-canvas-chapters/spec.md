# Aegis canvas chapters: the Mochi-style workbench, data, wireframes, templates and export

Status: ready-for-agent
Labels: ready-for-agent
Created: 2026-10-25
Builds on: commit `fc282ce` (Tauri shell, plain ESM canvas, Pi Durable host, JSON boards)
Research: `research.md` in this folder
Supersedes, in `../aegis-workbench/spec.md`: the Electron shell, the Loro board format and the Mochiboard-fork plan. Self-edit lanes in that spec stay valid and are not covered here.

## Problem Statement

Aegis works. I can brain dump, start several agents and watch them sort cards. But it feels bare next to Mochiboard. I miss the things that made Mochi feel like a place: the playful cursor, the tool bar for dropping cards, the side panels for layers and boards, and the "read me first" notes that tell everyone, people and agents, how a board works.

I also want Aegis to go well past Mochi. Two jobs matter most:

1. **Data.** I drop a CSV on the canvas and ask an agent to analyse it. I should get live charts, tables, filters and toggles that I can play with, like a small Google Sheets or Excel, right on the board.
2. **Wireframes.** I use pen.dev today. It is free, but it is not open source, and it is a separate app. I want to sketch screens on the same canvas, with agents doing the heavy lifting, including image generation.

Around those I want reusable templates, images and videos on the canvas, and a way to share a read-only copy of a board as a static site.

When agents work, I want the choice: follow them around the board like Jarvis, or keep doing my own thing while they work in the background.

## Solution

Aegis grows in chapters. Each one ends in something I can use.

- **Chapter 1, the workbench (built in this round, see Progress).** An original "lock-on" cursor. A foldable tool bar. A left side bar of panels (Library, Layers, Shortcuts) that I can fold, resize and reorder. Projects, folders and boards in the Library. Notes with a heading and a small badge such as "read me first". Images and videos dropped or pasted onto the canvas. A Follow agents switch.
- **Chapter 2, views (generative UI).** Agents make *view cards*: live, interactive UI described as data, drawn by Aegis from its own catalogue of parts. When the catalogue cannot express something, agents make an *app card*: a sandboxed mini web page that follows the MCP Apps rules.
- **Chapter 3, data.** A CSV becomes a *dataset* the host owns. View cards bind to it with queries. Charts, tables, filters, toggles, sorting, grouping, pivots and formulas cover the common spreadsheet jobs.
- **Chapter 4, wireframes.** Frames and UI parts from the same catalogue, drawn in a sketch style. A lead agent (Claude Opus) can hand work to helper agents (GPT), including image generation once a spike proves it works on a subscription.
- **Chapter 5, templates.** Select cards, save them as a template with `{{placeholders}}`, then stamp it out again with new values. Agents can make and use templates too.
- **Chapter 6, export.** Export a board as a static, read-only site: one folder with the board, its assets, its data and a small viewer. Filters and charts still work. I can host it anywhere (for example S3 behind CloudFront) and import it back into Aegis.

## User Stories

### Cursor and feel

1. As a user, I want a custom cursor that feels technical and alive, so that the canvas feels like a workbench and not a web page.
2. As a user, I want the cursor's brackets to lock on to the card or button I hover, so that I always know what a click will hit.
3. As a user, I want the cursor to give a small press animation when I click, so that clicks feel physical.
4. As a user, I want the normal text cursor when I edit text, so that I can place the caret precisely.
5. As a user, I want the Mac cursor back at the window edges, so that I can still see the resize arrows.
6. As a user, I want to turn the custom cursor off in Settings, so that I can use the plain cursor when I prefer.
7. As a user with reduced motion turned on, I want the cursor to move without easing, so that it never makes me feel sick.
8. As a user, I want the cursor to show which tool I am placing, so that I know what will appear when I click.

### Tool bar

9. As a user, I want a tool bar with Note, Heading, Checklist, Read-me note, Link and Media tools, so that I can drop cards without typing in the composer.
10. As a user, I want to pick a tool and then click where the card should go, so that cards land exactly where I want them.
11. As a user, I want single-key shortcuts for each tool, so that I can work fast.
12. As a user, I want Escape to cancel a tool, so that I can back out of a mistake.
13. As a user, I want to fold the tool bar down to one small button, so that the canvas stays clean.
14. As a user, I want the tool bar to remember whether it is folded, so that it stays how I left it.

### Side bar panels

15. As a user, I want a side bar with Library, Layers and Shortcuts panels, so that I can see my boards and what is on this board.
16. As a user, I want to fold each panel to its header, so that I only see what I need.
17. As a user, I want to drag a panel's bottom edge to resize it, so that a long list gets more room.
18. As a user, I want to drag panels by their headers to reorder them, so that my favourite panel sits on top.
19. As a user, I want to hide the whole side bar with one shortcut, so that I can focus on the canvas.
20. As a user, I want to drag the side bar's edge to make it wider or narrower, so that long names fit.
21. As a user, I want the panel layout to survive a restart, so that I set it up once.

### Library: projects, folders, boards

22. As a user, I want projects at the top level of my Library, so that each area of my life or work has a home.
23. As a user, I want folders inside projects and inside other folders, so that I can group boards.
24. As a user, I want "+ Board", "+ Folder" and "+ Project" buttons, so that I can make things where I am.
25. As a user, I want a new board or folder to go into the project or folder I last selected, so that I don't have to move it afterwards.
26. As a user, I want to drag a board or folder onto another folder or project, so that I can reorganise.
27. As a user, I want Aegis to refuse to put a folder inside itself, so that my Library never breaks.
28. As a user, I want to rename projects, folders and boards in place, so that names stay accurate.
29. As a user, I want to delete an empty folder or project, so that I can tidy up.
30. As a user, I want Aegis to refuse to delete a folder that still holds things, so that I never lose boards by accident.
31. As a user, I want boards I made before projects existed to still show, under "Loose boards", so that nothing disappears.
32. As a user, I want to see how many cards each board holds, so that I can find the busy ones.
33. As a user, I want the board I have open to be highlighted, so that I know where I am.

### Layers

34. As a user, I want a Layers list of every card on the board, top-most first, so that I can find buried cards.
35. As a user, I want each layer row to show the card's kind and its heading or first line, so that rows are easy to scan.
36. As a user, I want to click a layer to select its card and glide to it, so that I can jump around a big board.
37. As a user, I want the Layers list to follow my selection on the canvas, so that both stay in sync.
38. As a user, I want to drag a layer up or down to bring a card in front of or behind others, so that I control overlap.
39. As a user, I want "Bring to front" and "Send to back" shortcuts, so that I can restack without the panel.

### Read-me notes

40. As a user, I want a note to have an optional heading, so that a note can have a title and a body.
41. As a user, I want a note to have an optional small badge, such as "read me first", so that important notes stand out.
42. As a user, I want a Read-me tool that makes a note with a heading and a "read me first" badge, so that I can explain a board in one click.
43. As a user, I want to edit the heading and badge in place, so that I don't need a form.
44. As an agent, I want to read headings and badges with the board, so that I follow the board's own instructions.
45. As an agent, I want to read any "read me first" note before I change a board, so that I respect how the user wants the board used.

### Images and video

46. As a user, I want to drop image files onto the canvas, so that screenshots and photos sit with my notes.
47. As a user, I want to paste an image from the clipboard, so that a screenshot lands on the board at once.
48. As a user, I want to drop video files onto the canvas and play them in place, so that clips live with my notes.
49. As a user, I want dropped media sized sensibly from its real shape, so that I don't have to fix the size.
50. As a user, I want my media stored on this Mac with the board, so that it works offline.
51. As a user, I want videos to scrub smoothly, so that I can jump to the moment I need.
52. As a user, I want to paste a link and get a link card, so that URLs need no extra step.
53. As an agent, I want to place images by URL or by stored asset, so that I can lay out media I find or make.

### Following agents

54. As a user, I want a Follow agents switch, so that I choose whether the camera moves when agents work.
55. As a user with Follow on, I want the camera to glide to what an agent just made, so that I can watch like Jarvis laying out the table.
56. As a user with Follow off, I want the camera to stay still, so that agents never yank me away from my own work.
57. As a user with Follow off, I want a small "Show" prompt when an agent makes something, so that I can jump there when I am ready.
58. As a user with Follow on, I want the camera to hold still while I am dragging or typing, so that following never fights my hands.
59. As a user, I want the coloured rings on cards an agent touched, either way, so that I can see who changed what.

### Shortcuts

60. As a user, I want a Shortcuts panel that lists the keys, so that I can learn them.
61. As a user, I want to fold the Shortcuts panel away, so that it doesn't take space once I know them.

### Views (generative UI)

62. As a user, I want agents to make interactive cards, not just text, so that answers are something I can use.
63. As a user, I want view cards to look like the rest of Aegis, so that the board feels like one thing.
64. As a user, I want view cards to stay fast with many on the board, so that the canvas stays smooth.
65. As a user, I want controls in a view (buttons, toggles, sliders, inputs) to change the view at once, without a round trip to the agent, so that it feels instant.
66. As a user, I want a view's control state to be saved with the board, so that filters I set are still set tomorrow.
67. As a user, I want to ask the agent to change a view, so that I can refine it by talking.
68. As an agent, I want a catalogue of parts with typed props, so that what I make always renders.
69. As an agent, I want a clear error when my view spec is wrong, so that I can fix it in one more try.
70. As an agent, I want to update part of a view without resending it all, so that edits are cheap.
71. As an agent, I want to make a sandboxed app card with my own HTML and script when the catalogue is not enough, so that nothing is impossible.
72. As a user, I want app cards to have no network access unless I allow named sites, so that a bad script can't leak my data.
73. As a user, I want app cards to have no access to Aegis itself except through a small, logged message channel, so that they can't take over the app.
74. As a user, I want app cards to pause when they are off screen or far zoomed out, so that they don't drain the battery.
75. As a user, I want Aegis to show UIs from MCP servers that follow MCP Apps, so that tools like LifeOS can bring their own screens.

### Data

76. As a user, I want to drop a CSV onto the canvas and get a dataset card, so that my data is on the board.
77. As a user, I want a dataset card to show columns, types and row count, so that I know what I loaded.
78. As a user, I want big CSVs parsed without freezing the canvas, so that I can keep working while it loads.
79. As a user, I want to ask an agent "analyse this", so that it makes the charts and tables for me.
80. As an agent, I want to query a dataset (filter, group, sum, count, average, sort, limit), so that I can find the story in it.
81. As an agent, I want to see a small sample and column stats, not the whole file, so that big data fits my context.
82. As a user, I want bar, line, area, scatter, pie and table views, so that common charts are covered.
83. As a user, I want charts to animate when their data changes, so that I can see what moved.
84. As a user, I want hover tooltips on charts, so that I can read exact values.
85. As a user, I want filter controls (pick list, range slider, search box, toggle) that drive several views at once, so that the board works like a dashboard.
86. As a user, I want to sort and filter a table by clicking column headers, so that it works like a spreadsheet.
87. As a user, I want to add a computed column with a formula, so that I can do spreadsheet maths.
88. As a user, I want pivot (group by rows and columns with a total), so that I can summarise.
89. As a user, I want to edit a cell and see the charts update, so that I can test "what if".
90. As a user, I want to export a view's data as CSV, so that I can take results elsewhere.
91. As a user, I want my original CSV left untouched, so that edits never damage the source.
92. As a user, I want the agent to tell me what it found in plain words beside the charts, so that I get the answer, not only pictures.

### Wireframes

93. As a user, I want frame cards sized like phone, tablet or desktop screens, so that I can sketch screens.
94. As a user, I want UI parts (nav bar, button, input, list, card, image, text) inside frames, so that sketches read as apps.
95. As a user, I want a sketch style for wireframes, so that people know it is not final design.
96. As a user, I want arrows between frames to show a flow, so that I can explain a journey.
97. As a user, I want to ask an agent for a flow, so that it lays out the screens for me.
98. As a user, I want a lead agent (Opus) to hand image work to a helper (GPT), so that each model does what it does best.
99. As a lead agent, I want to start a helper, give it a brief and get its result back, so that I can split work.
100. As a lead agent, I want generated images saved as board assets, so that I can place them in frames.
101. As a user, I want to see helper agents nested under their lead, so that I know who asked for what.
102. As a user, I want to open a wireframe in OpenPencil, so that I can take it into a real design tool when it is ready.

### Templates

103. As a user, I want to select cards and save them as a template, so that I can reuse a layout.
104. As a user, I want `{{placeholders}}` in template text, so that I fill in new values each time.
105. As a user, I want to stamp a template onto the board and be asked for its values, so that reuse is quick.
106. As a user, I want templates to keep their relative layout and links, so that a stamped copy looks right.
107. As a user, I want a template to fetch data from an API I name, so that a stamped card can show live values.
108. As a user, I want template API calls limited to the sites I allowed, so that templates can't call anywhere.
109. As a user, I want to ask an agent to make a template from my selection, so that I don't have to mark the placeholders myself.
110. As an agent, I want to list and stamp templates, so that I can build boards from known parts.

### Export and sharing

111. As a user, I want to export a board as a static folder, so that I can host it anywhere.
112. As a viewer, I want the exported board to pan and zoom like Aegis, so that it feels like the real thing.
113. As a viewer, I want filters and charts in an export to still work, so that the dashboard is useful.
114. As a viewer, I want an export to be read-only, so that I can't change the owner's board.
115. As a user, I want exports to include media and data, so that they work with no Aegis running.
116. As a user, I want app cards left out of exports unless I choose to include them, so that I don't publish scripts by accident.
117. As a user, I want a "download into Aegis" link on an export, so that others can open the board in their own Aegis.
118. As a user, I want to import an exported folder back into Aegis, so that exports round-trip.
119. As a user, I want Aegis never to upload anything by itself, so that publishing is always my choice.

### Safety and speed

120. As a user, I want everything to stay on this Mac unless I publish, so that my data is private.
121. As a user, I want the canvas to stay smooth with thousands of cards, media and views, so that big boards are usable.
122. As a user, I want agent changes to be one atomic batch, so that a failed agent step never half-changes the board.

## Implementation Decisions

### Board model (shared by canvas, host and checks)

- The board module stays the one way anything changes a board. People and agents send the same command batches. A batch applies fully or not at all.
- New card kind: `video`. Image cards now render the picture instead of falling back to text.
- New optional fields on every card: `heading` (short title) and `badge` (short tag such as "read me first"). They are editable through `update` and listed by `describe`, so agents see them.
- New command `order` with `ids` and `to` (`front`, `back`, or a number). Card list order is stacking order: later cards draw on top.
- Media URLs are `asset:<name>` for files stored by the host, or plain `https:` URLs. Boards never store the host's port, because it changes every launch. The canvas turns `asset:` into a host URL when it draws.

### Library (projects, folders, boards)

- The host owns a Library record next to the boards. It holds *nodes* (projects and folders, each with a parent) and a *placement* for each board (its parent node or none).
- Rules: projects live at the top level only. Folders live inside a project or another folder. Boards live anywhere, or loose. A node can't move inside itself or its own descendants. Only empty nodes can be deleted. Boards with no placement show as loose, so older boards keep working.
- Contract: one read endpoint returns nodes and boards with their parents and card counts. One write endpoint takes a single operation: `create` (kind, name, parent), `rename`, `move` (node or board, new parent), `delete` (empty node). Creating a board accepts an optional parent.
- The Library rules are a small pure module in the host, separate from the HTTP code, so they are easy to test and later to give to agents as a tool.

### Assets (images, video, later CSV)

- The host stores uploaded files under the data folder with random names (128-bit) and an allowed extension: png, jpg, gif, webp, avif, svg, mp4, webm, mov, m4v.
- Upload needs the bearer token. Reading an asset does not, because image and video tags can't send headers. The random name works as a capability, and the host only listens on loopback.
- Reads support byte ranges, because WebKit needs them to seek in video. Responses send `nosniff` and a strict content security policy, so an SVG can't run script.
- The app's content security policy allows media from the host and from `https:`.

### Canvas and chrome (Chapter 1)

- **Cursor**: an original reticle. A centre dot follows the pointer with no lag. Four corner brackets lock on to the hovered card, button or row and ease to its outline. A press squeezes the brackets. Text fields get the system I-beam. Window edges get the system cursor. Placing a tool shows the tool's name. It only runs on fine pointers, and it can be turned off. No Mochiboard art is used.
- **Tool bar**: a vertical dock to the right of the side bar. Tools: Select (V), Note (N), Heading (H), Checklist (C), Read-me (R), Link (L), Media (M). Picking a tool arms it. The next click on empty canvas places the card there. It folds to one button, and that state is saved.
- **Side bar**: a stack of panels (Library, Layers, Shortcuts). Each panel folds, resizes from its bottom edge and reorders by dragging its header. The side bar hides with `\` and resizes from its right edge. Layout is saved per device in local storage, not in boards.
- **Layers**: rows are drawn from the board, top-most first, capped at 500 rows for speed (virtual scrolling is later work). Dragging a row sends an `order` command.
- **Follow agents**: a switch in the top bar, saved per device. On: glide to an agent's focus unless the user touched the canvas in the last 1.5 seconds. Off: show a "Show" chip instead. Rings on touched cards show either way.
- **Stacking**: each mounted card's z-index comes from its place in the card list.

### Views: generative UI (Chapter 2)

- Two tiers. Pick the first that can do the job.
  1. **View cards (default).** A view spec is A2UI-shaped: a flat list of components with ids, a component catalogue owned by Aegis, and a separate data model. Components bind to the data model by path. Aegis draws views with its own vanilla renderer, so they stay native, fast, themeable and exportable. Agents patch views with the same atomic batches (`view_set`, `view_patch`, `data_set`), checked against the catalogue. Errors name the component and prop.
  2. **App cards (escape hatch).** HTML written by an agent, run in a sandboxed iframe on its own origin. It follows MCP Apps: no network unless the card declares allowed domains and I approve them, and all talk with Aegis is JSON-RPC over `postMessage`, logged. App cards pause when off screen or zoomed far out, and show a still snapshot instead.
- Why not json-render directly: its renderers need React, Vue, Svelte or Solid and a build step. Aegis is plain ESM with no build. We copy its good ideas (typed catalogue, prompt built from the catalogue, `$state` style bindings) and keep A2UI's message shape. If Aegis later adopts a build step, re-check `@json-render/core` for catalogue and prompt generation.
- First catalogue: Stack, Row, Text, Metric, Table, Chart, Select, Toggle, Slider, Search, Button, Image, Divider, Frame (for wireframes).

### Data (Chapter 3)

- A dropped CSV becomes a *dataset* asset. The host parses it once, in a worker, into typed columns, and keeps column stats.
- Agents get three tools: `dataset_describe` (columns, types, stats, 20 sample rows), `dataset_query` (a small JSON query: filter, group, aggregate, sort, limit, computed columns) and the view tools. Agents never get the whole file in context.
- The same JSON query runs in the canvas, in a Web Worker, so filters change charts with no host round trip. Queries are the shared contract between host, canvas and export.
- Charts use Apache ECharts (Apache-2.0) with the canvas renderer, loaded only when a chart is on screen. Vega-Lite is the fallback if ECharts proves awkward for agents.
- Start with a plain JavaScript query engine. Add DuckDB-Wasm (MIT) only if datasets over about 200k rows prove slow. Its current npm build is dev-tagged, so pin and test it first.
- Cell edits and computed columns are stored as a layer over the source. The original CSV is never changed.

### Wireframes (Chapter 4)

- Wireframes are Frame view cards with catalogue parts in a sketch theme. Flows are ordinary connectors.
- Lead and helper agents: add a `delegate` tool. It starts a helper conversation on a chosen model with a brief, waits for its final answer, and returns it. The helper's agent card nests under its lead. This is a parent and child link in the host's run records, not shared memory.
- Image generation is a **spike first**. The installed Pi OpenAI subscription provider has no image path. Check whether the ChatGPT subscription backend offers one. If not, offer an API key or OpenRouter as an opt-in, with the cost shown.
- Export of a frame to OpenPencil's format is later work. The OpenPencil projects are MIT and read `.pen`.

### Templates (Chapter 5)

- A template is a saved list of cards and links with positions relative to its top-left, plus a list of parameters found as `{{name}}` in any text field. Templates live in the Library as their own kind.
- A new `stamp` command takes a template id, a position and parameter values, and expands into ordinary `create` and `connect` commands inside the same batch.
- API-backed templates declare a source (URL pattern plus allowed host). The host fetches it, never the card, and only for hosts on the template's allow list.

### Export (Chapter 6)

- Export writes a folder: the board JSON, its assets, its datasets and a read-only viewer. The viewer reuses the canvas and the view renderer in a read-only mode. No host and no agents.
- App cards are left out unless I opt in. Their snapshot image takes their place.
- The folder works from any static host. Aegis never uploads it. Import reads the same folder back into a new board.

### Agents

- The system prompt tells agents to read any "read me first" note before changing a board, and to use headings and badges.
- Tool descriptions list the new fields, `video`, `order` and `asset:` URLs.

## Testing Decisions

- Good tests check behaviour someone outside can see: a batch's result, an HTTP response, a stored file. They don't check private helpers or DOM structure.
- Seams, highest first, and as few as we can:
  1. **Board commands** (pure module): new fields, `video`, `order`, and later `stamp` and view commands. Prior art: the existing board checks.
  2. **Host over HTTP** with the fake model: Library rules, asset upload and range reads, and later dataset queries and `delegate`. Prior art: the existing host checks that start a real host on a random port with temporary data.
  3. **The real app**: checked by hand through the native window with computer use for cursor, tool bar, panels and Follow. These are UI feel, and a unit test would only check the DOM, not the feel.
- The JSON query engine (Chapter 3) gets its own pure checks, because the host, the canvas worker and the export viewer all share it.
- No test reaches a real provider. Sign-in and helper runs use the fake model.

## Out of Scope

- Self-edit lanes, the merge queue and runtime self-change (still in the older workbench spec).
- Live browser tabs on the canvas. Parked with the browser work.
- Real-time multi-user collaboration.
- Uploading or provisioning anything in the cloud. Export writes files only.
- A full vector design editor. Use OpenPencil for that.
- Copying Mochiboard's name, characters, art, music or other reserved assets.

## Further Notes

- The test seams above are my best call from the code. If you would rather test any UI behaviour with a scripted browser run, say so and I will add a small driver.
- Speed budget: panning a 5,000 card board stays at p95 under 10 ms per frame in the existing bench. Re-run the bench after each chapter, and in the real app, not only in a browser.
- Open risks: image generation on a subscription (spike), DuckDB-Wasm memory, and app-card iframes inside a transformed canvas under WebKit (needs a spike for scaling and input).

## Progress

### Chapter 1, built 2026-10-25 (not committed yet)

Landed:
- Board model: `heading` and `badge` on any card, `video` cards, real `image` rendering, `order` command for stacking.
- Host: Library record with projects, folders and boards (pure rules module, HTTP read and write), boards created into a folder, media assets with random names and byte-range reads.
- Canvas: stacking from card order, moves no longer redraw card content (a playing video keeps playing), checklist "Add item" box, link cards ask for their address, `[` and `]` restack, Escape cancels a tool.
- Chrome: reticle cursor (Settings switch), foldable tool bar (V N H C R L M), side bar with Library, Layers and Shortcuts panels that fold, resize, reorder and hide with `\`, Follow switch with a Show chip, drop, paste or pick images and video.
- Agents are told about headings, badges, `order`, `video` and to follow "read me first" notes.

Checked:
- 23 automated checks pass (board, Library rules, host over HTTP including assets and Library).
- Scripted UI run in headless Chromium against a throwaway host: read-me tool, checklist item, Layers and restack, Library project > folder > board, image upload and display, Follow off keeps the camera still and shows the chip, panels and tool bar fold, no page errors.
- Bench, 5,000 cards, headless Chromium: p95 8.6 ms, max 16.3 ms per frame.
- Release app built and opened with real data: Library, Layers, tools, Follow and the reticle render.

Not yet checked by hand in the native window: dropping or pasting media, panel drag reorder, Layers drag, cursor feel.

Known gap: the first launch after a rebuild once took over 15 seconds for the host to listen, and the window gave up. Root cause not proven (likely macOS checking the new files). The window now waits up to two minutes and says "Starting Aegis…".

Next: Chapter 2 views, starting with the catalogue, the A2UI-shaped view spec and `view_set` and `view_patch` in the board commands.

### Change of plan, 2026-10-25: Svelte, and Zephium's Work objects instead of a component catalogue

After reading Zephium's Work mode, Chapter 2 now follows it: agents fill purpose-sized typed objects
(reply, plot, sheet, diagram, plan, list, code) with `create` and `revise`, the app draws and lays them out, and a
bad field comes back named exactly. This replaces the A2UI-shaped catalogue of small parts. The frontend moved to
Vite + Svelte 5 + TypeScript; the canvas engine stays plain code underneath.

Landed (local commit, not pushed):
- Frontend in `app/` (Vite 8, Svelte 5); Tauri builds it and uses the Vite dev server in development.
- Object cards and the `object` card type, `revise` and `object_set` commands; Zephium's chart ported under MPL-2.0;
  sheet (sortable, best values), plan and list (tickable), diagram (dagre layout, fits its card), code, reply.
- Agent tools `create`, `revise`, `start_part` (helpers in parallel, at most four), `finish`, `load_skill`;
  five skills; Zephium's work rules in the prompt.
- Self-update: the host serves an installed UI from the data folder; `POST /ui-update` checks, builds, verifies and
  swaps; rollback keeps three versions; `AEGIS_SAFE=1` loads the bundled UI. The host-served page can call the app's
  own commands through a remote capability for `http://127.0.0.1:*`.
- The host now exits when the app dies, even by force.

Checked: 30 host and board checks; svelte-check clean; headless Chromium run of every object kind, sorting, ticking
and a live component edit (22 ms, no reload, board and camera kept); bench p95 9.4 ms on 5,000 cards; native app:
bundled UI, host-served UI, native link opening from it, force-kill takes the host; a real GPT-6.1 Sol run made
two charts, a sheet, a diagram and a reply from one request.

Not yet: data sets from CSV with shared filters, picks, media objects in the object model, the update button in
the UI (the endpoint exists), lane-based self-edits.
