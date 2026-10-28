# Product

<!-- impeccable:product-schema 1 -->

> Status: expanded on 2026-10-28 from the owner's brief and the shipped app.
> **Confirmed** means the owner said it. **Observed** means it is true of the
> code today. **Open** means still undecided. The earlier draft described a
> Svelte interface. The app is React now.

## The short version

Aegis is a local workbench for thinking and building: one infinite canvas where
a person and several AI agents work on the same documents, sheets, decks, notes
and diagrams. Agents work in the open. Every change is visible, attributed and
undoable. Everything runs on the person's Mac with their own ChatGPT or Claude
subscription.

## Platform

- A macOS desktop app built with Tauri 2 and installed as an app bundle.
  (Confirmed)
- The interface is a web view: Vite, React and TypeScript. The design language
  is web, not AppKit. (Confirmed)
- A local Node host runs beside the window. It owns boards, assets, agent runs,
  model providers and the MCP endpoint, and it saves boards to disk atomically.
  (Observed)
- The UI can be replaced at runtime. The host serves a built UI from the data
  folder, so a theme or a whole shell can change without reinstalling. (Confirmed)

## Users

One person: the owner. They think out loud across university, side projects and
errands, and they run several AI agents at once. They open Aegis to dump
half-formed thoughts, links, files and "go build this" requests, then watch
agents sort the pile into something they can see and act on. Sessions are long
and repeated through the day, usually on a laptop or a large display, often at
night. (Confirmed)

## Product Purpose

A local workbench for thinking and visualising. Documents, sheets and slide
decks live as small windows on one infinite canvas, and the person's AI can edit
all of them. The person brain dumps into one box; agents running on their own
machine write, chart and arrange the work while the person watches and steers.

Success looks like this: a messy dump becomes a clear, arranged board without
the person doing the filing, and the person always knows what each agent is
doing and what changed. (Confirmed)

## Positioning

"Jarvis's table, built by Apple."

Agents work in the open, on the same canvas as the person's own thinking. There
is no separate chat transcript that hides the work. The app is local first, and
it can change its own themes, card types and panels at runtime. (Confirmed)

## What sits on the table

- **One infinite canvas.** Pan and zoom move a single transform. Cards are small
  windows with flat dark surfaces, a faint dot field behind them, and a thin
  connection line when two cards are related. (Confirmed)
- **Capture cards.** Notes, titles, checklists, links, images, video, web pages,
  audio recordings, freehand ink, stamps, shapes, vector paths, device frames,
  colour swatches, font specimens and icons. (Observed)
- **Work surfaces.** Editable documents with a Markdown side editor, slide decks
  with a filmstrip, sheets with typed columns, plots and charts, diagrams,
  plans, timelines, kanban boards, tables, progress bars, comparisons,
  galleries, stat tiles, forms, callouts and code blocks. (Observed)
- **Editors open in a panel** that slides in from the right, half the screen
  wide, with a full-width option. Slides stack vertically above a filmstrip.
  Sheets scroll in both directions. (Confirmed)
- **Organisation.** Boards live in projects and folders in the Library. Layers
  lists every card on a board. Both panels stay hidden until the pointer nears
  the matching screen edge. (Confirmed)
- **Imports.** A dropped PDF becomes a document with editable text and page
  images. A PPTX becomes a deck. A Keynote file uses its previews. The original
  file stays attached to the card. (Observed)

## Agents

There are two doors onto the same table. Both are attributed, both are visible,
and both use the same commands as the person. (Confirmed)

**In-app agents.** Spawned from the app. Each one appears as a small window that
can be dragged and collapsed, with an identity marker that keeps its place. While
it works, a line connects it to the cards it touches, live drafts stream beside
it, and Follow mode glides the camera to what it just made. (Observed)

**Local MCP clients.** Claude Code, Codex, or any MCP client on the same Mac,
connected over an authenticated loopback connection. They list boards, read card
text and layout, read attached PDFs and slide images, search the board, and write
back through the same commands. A batch that lands leaves a named chip on the
canvas with the number of cards it changed, and clicking it redraws the line to
those cards. They can read and change every board in that data folder, but they
cannot run shell commands or read arbitrary paths. (Observed, added 2026-10-28)

The shared command vocabulary is create, update, revise, object_set, move,
delete, connect, link_update, layout, order, focus and board_set. Edits to
existing content carry the revision they were based on, so two agents cannot
silently overwrite each other. One request is one undo. (Confirmed for the person
and in-app agents; observed for MCP.)

An agent's work is therefore never a mystery: it is a change on the canvas, with
a name on it, that the person can take back.

## Operating Context

- **Confirmed:** the locked comp at
  `.scratch/aegis-redesign/comps/6-zen-dark-LOCKED.png` is the whole app. The
  quiet Zen look is the default and only look, not a mode.
- Brain dump by typing into the Ask pill at the bottom. `⌘K` or `/` opens it.
  Voice capture is still open.
- Keyboard first: single-key tools, `/` for the composer, `A` for agents, `F`
  for follow, `\` for the side bar.
- Charts, sheets and documents are built from the same object kinds the person
  can edit by hand, so an agent's chart is never a picture of a chart.
- Settings hold ChatGPT and Claude sign-in plus appearance.

## Capabilities and Constraints

- **Smooth at scale.** Thousands of cards on one canvas. One transform for pan
  and zoom, viewport culling, and simplified shapes when zoomed far out. 120 Hz
  is the target on the owner's display. (Confirmed; frame rate is measured ad
  hoc, not in CI.)
- **Live UI swapping.** Themes must be token driven, because the interface can
  be replaced while the app runs. (Confirmed)
- **Local and owned.** Boards, assets and agent runs live in the app data
  folder. The MCP endpoint is loopback only and needs a token. The integration
  adds no Aegis cloud service. (Confirmed)
- **Own models.** The person brings their own ChatGPT or Claude subscription.
  The app runs on-device models too where a task allows. (Observed)
- **Rich imports without a server.** PDF text and page rendering happen in the
  web view with bundled resources, no CDN. Limits: 64 MB per source file, 100
  PDF pages, 200 deck slides. No OCR, so scanned files keep images but may have
  no text. (Observed)
- **Only free, openly licensed assets.** SIL OFL fonts, permissive packages,
  CC0 or owned media. (Confirmed)

## Brand Commitments

- The name is Aegis. Mochiboard's name, character, art, music, fonts and icons
  are not used. (Confirmed)
- Owner's brief, 2026-10-25: minimal, sci-fi, futuristic. Apple's Bauhaus-like
  discipline. "Jarvis made by Apple", as a workbench or table for thinking and
  visualising. It should feel good and proper. (Confirmed)
- **Confirmed:** true black ground, a faint dot field, flat dark windows, Inter,
  one blue hue for data and agents, thin line graphs.
- The custom reticle cursor was removed on 2026-10-25. Aegis uses the system
  cursor. (Confirmed)
- Motion is restrained and purposeful: short travel, fast settles, no bounce for
  its own sake. Fast actions never wait on an animation. (Confirmed)

## Evidence on Hand

- Real boards in the app data folder, including a 15 card sign-in scratch board,
  a 30 card board with a graph playground, and the Demo assignment board used
  for the MCP walkthrough. (Observed)
- Ported chart and object components in `app/src/objects/`.
- No logo, wordmark, customers or press exist. Do not fabricate them. (Confirmed)

## Product Principles

1. **The table is the product.** Chrome recedes. The work and the agents' work
   lead.
2. **Agents work in the open.** Every change is visible, attributed and
   undoable.
3. **Instant under the hand.** Frequent actions never wait for animation.
4. **Local and owned.** Nothing leaves the Mac until the person asks an agent to
   think about it.
5. **Self-changing, never fragile.** A theme or extension can always be rolled
   back.

## Accessibility and Inclusion

- Respect reduced motion. The cursor and camera glide need plain fallbacks, and
  every decorative animation switches off.
- Keyboard paths exist for every control.
- Text contrast stays at or above 4.5:1 in both themes.

## Open Questions

- Voice capture.
- Browser tab cards.
- A lanes view.
- Export.
