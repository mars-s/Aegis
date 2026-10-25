# Aegis: a self-changing agent workbench on an infinite canvas

Status: ready-for-agent
Labels: ready-for-agent
Created: 2026-10-25
Baseline: jessawolfe-ux/mochiboard at `2474cd6` (v1.7.3), Tauri shell and `web/` canvas
Browser reference: zephium-browser/Zephium at `0eaad6d` (2026-10-24), MPL-2.0, used as the browser and Work canvas UX reference

## Problem Statement

I think out loud. I have a pile of half-formed ideas, links, screenshots, tasks and "go build this" requests, and today they end up scattered across chat windows, terminals, browser tabs and notes apps. Each AI tool I use lives in its own box. I can't see what my agents are doing, and I can't lay their work out next to my own thinking.

I want one local workbench. I dump everything into it, by typing or talking, and an assistant sorts it out on a big table in front of me, like Jarvis laying things out for Tony Stark. Agents should work in the open on that table. I should see their progress, open their output as live mini screens, and run several of them at once.

The tools I've tried are fixed. If I want a new card type, a different look or a new panel, I wait for someone else to ship it. I want the assistant to change the app itself, while it's running, on my machine. No server, no account, no waiting for a release.

Mochiboard already has most of the canvas I want, a Tauri shell and an assistant that edits the board. But its assistant is a one-shot `claude -p` call, it only speaks Claude, it can't run several agents, it can't change the app, and its name, character, art and music are all rights reserved.

## Solution

Aegis is a local desktop app built from Mochiboard's MIT code, with the Mochiboard brand removed.

- An infinite canvas holds notes, checklists, docs, images, links, voice memos, wireframes, connectors and groups (all from the baseline), plus new card types: live browser tabs, agent cards and extension cards.
- A Pi Durable agent runs on my machine as a sidecar process. It signs into ChatGPT or Claude with the native Pi sign-in, the same way Mars does. Agent runs survive the window closing.
- I brain dump with a quick-capture box or by voice. The assistant clusters the dump into labelled groups, places them on the board, connects related items, and flies the camera to what it made.
- The agent drives the canvas through one typed set of board commands. Anything I can do by hand, the agent can do with a command.
- I can spawn several agents at once. Each gets an agent card that shows its brief, model, live status, current step and the cards it has touched. I can watch, pause, stop, message or open any of them.
- Browser tab cards are real browser views, not iframes, so any site loads, including sites that block embedding. They zoom with the canvas, open full size, and show the exact tabs agents are driving.
- Several agents can change the app's own code at the same time, each in its own lane (a separate copy of the code on its own branch). I can preview each lane before it lands. A merge queue lands lanes one at a time, merges them, has an agent fix any conflicts, checks the combined result and hot reloads it.
- The canvas stays smooth with thousands of cards. Panning and zooming keep up with the display's refresh rate, and agent edits don't stall it.
- The agent can change Aegis itself at runtime: new themes, new card types, new tools, new panels and edits to core canvas code. Changes take effect after a hot reload, with no rebuild. There are no permission prompts. Instead, every self-change is a recorded checkpoint, a failed reload rolls back on its own, and a safe-mode launch always gets me back to the factory app.

## User Stories

### Capture and brain dump

1. As a user, I want to press one shortcut and type an idea without losing my place, so that capturing never interrupts my thinking.
2. As a user, I want to hold a key and talk, so that I can brain dump faster than I can type.
3. As a user, I want my voice dump transcribed on my own machine, so that raw thoughts don't leave my computer unless I ask an agent to think about them.
4. As a user, I want a brain dump to land in an Unsorted area first, so that nothing is lost if sorting fails.
5. As a user, I want to paste a mixed blob of text, links and images in one go, so that I can dump a whole browser session at once.
6. As a user, I want dropped links to become link cards with a title and preview image, so that I can recognise them at a glance.
7. As a user, I want dropped files and images to become cards, so that the board holds real material and not just notes about it.
8. As a user, I want to say "sort this" after a dump, so that the assistant turns the pile into an organised layout.

### The Jarvis table: sorting and layout

9. As a user, I want the assistant to cluster related items into labelled groups, so that themes appear without me doing the filing.
10. As a user, I want the assistant to pull tasks out of my dump into checklists, so that action items don't hide inside prose.
11. As a user, I want the assistant to connect related cards with arrows, so that I can see how ideas depend on each other.
12. As a user, I want sorted groups placed in clear space near what I'm looking at, so that new layouts don't bury existing work.
13. As a user, I want the camera to glide to whatever the assistant made and briefly highlight it, so that I always know what changed.
14. As a user, I want the assistant to explain in one or two lines what it did and offer a few next steps, so that I can keep going with one click.
15. As a user, I want to undo an entire assistant action with one undo, so that a bad sort costs nothing.
16. As a user, I want to ask for a different arrangement, such as timeline, kanban, mind map or grid, so that the same material can be viewed in the shape that helps right now.
17. As a user, I want to select some cards and ask about only those, so that the assistant works on a focused subset.
18. As a user, I want the assistant to be able to read everything on the current board, including docs and image captions, so that its sorting is based on content and not just titles.
19. As a user, I want to rearrange anything the assistant placed, so that the board stays mine.

### Canvas basics (kept from the baseline)

20. As a user, I want an infinite board with smooth pan and pinch zoom, so that the workspace never runs out.
21. As a user, I want notes, titles, checklists, docs, collections, images, voice memos, colour swatches, shapes, drawings and connectors, so that I have the baseline's full card set from day one.
22. As a user, I want wireframe screens, boxes, text and icons, so that I can sketch interfaces next to my notes.
23. As a user, I want grouping, snapping, focus mode and fit-to-board, so that large boards stay manageable.
24. As a user, I want projects, folders and boards with a home page, so that separate efforts don't share one canvas.
25. As a user, I want boards saved as plain files on my disk, so that I own my data and can back it up or sync it myself.
26. As a user, I want the canvas to keep working with agents switched off and no internet, so that the workbench is useful offline.
27. As a user, I want to export a card or board as an image or PDF, so that I can share a snapshot.

### Agent sign-in and models

28. As a user, I want to sign into my ChatGPT account from Settings, so that agents can use my ChatGPT subscription models.
29. As a user, I want to sign into my Claude account from Settings, so that agents can use my Claude subscription models.
30. As a user, I want to be signed into both at once, so that I can choose the best model per job.
31. As a user, I want to pick a default model and override it per agent, so that cheap jobs use cheap models.
32. As a user, I want to see which accounts are connected and sign out of each, so that I control access.
33. As a user, I want credentials stored in the app data folder, never in the live app code or any Git history, so that self-changes and exports can't leak them.
34. As a user, I want a clear message when a sign-in has expired, with a one-click reconnect, so that a stale token doesn't look like a broken agent.
35. As a user, I want sign-in to work when the browser callback can't reach the app, by pasting the final callback URL, so that unusual setups still work.

### Spawning and watching agents

36. As a user, I want to start an agent from a prompt, a selection of cards or a card's context menu, so that agents start from what I'm looking at.
37. As a user, I want to spawn several agents at once from one request, so that independent jobs run in parallel.
38. As a user, I want each agent to appear as an agent card on the board, so that agents live in the same space as my work.
39. As a user, I want an agent card to show its brief, model, status, elapsed time, current step and a short live log, so that I can tell at a glance what it's doing.
40. As a user, I want the cards an agent is editing to show a coloured outline that matches its agent card, so that I can see who is touching what.
41. As a user, I want to open an agent card into a full transcript with tool calls and outputs, so that I can inspect its reasoning and actions.
42. As a user, I want to send a follow-up message to a running agent, so that I can steer it without starting over.
43. As a user, I want to pause, resume and stop any agent, so that runaway work can be halted.
44. As a user, I want agents to keep running when I close the window, and to see their results when I reopen it, so that long jobs don't need the app in front.
45. As a user, I want a roster panel that lists every agent across all boards with its status, so that nothing runs unnoticed.
46. As a user, I want a notification when an agent finishes, fails or needs my input, so that I don't have to keep checking.
47. As a user, I want an agent that's waiting for my answer to say so on its card, so that blocked work is obvious.
48. As a user, I want an agent to be able to spawn helper agents that also appear on the board linked to their parent, so that I can see a team's structure.
49. As a user, I want to see token or usage figures per agent where the provider reports them, so that I know what heavy jobs cost.
50. As a user, I want finished agents to collapse to a compact result card with links to what they produced, so that old runs don't clutter the board.

### Browser tabs and mini screens

51. As a user, I want to drop a URL as a live browser tab card, so that a working page sits on the board.
52. As a user, I want browser tab cards to load any site, including sites that block iframes, so that I never get a blank box.
53. As a user, I want browser tabs to zoom with the canvas and stay interactive when I click into them, so that they behave like real mini screens.
54. As a user, I want to open a browser tab full size and return to the board, so that I can work in a page and come back.
55. As a user, I want back, forward, reload and address controls on a browser tab, so that it works like a normal browser tab.
56. As a user, I want a browser tab to show a local dev server that an agent started, and reload when the agent changes the files behind it, so that I can watch apps take shape.
57. As a user, I want to watch an agent click and type in a browser tab on the board, and take over by clicking in, so that agent browsing happens in the open.
58. As a user, I want logins in browser tabs to persist between launches, in profiles kept apart from the app itself, so that I don't sign in to sites every day.
59. As a user, I want to set a browser tab's device size, such as phone, tablet or desktop, so that I can check responsive layouts.
60. As a user, I want browser tabs to show a still picture while I pan, zoom far out or have many tabs open, so that a board full of tabs stays fast.

### Agents changing the canvas

61. As a user, I want agents to create, edit, move, resize, group, connect, recolour and delete any card through the same commands, so that the agent can do anything I can do.
62. As a user, I want agents to lay out many cards at once with layout commands such as grid, column, cluster and timeline, so that big rearrangements are one step.
63. As a user, I want agents to create new boards, folders and projects, so that they can organise large dumps across spaces.
64. As a user, I want agents to read the board as structured data, including card ids, types, positions, text and links, so that commands target the right cards.
65. As a user, I want an invalid board command to be rejected with a clear reason the agent can act on, so that one bad command doesn't corrupt the board.
66. As a user, I want two agents editing the same board to never lose each other's changes, so that parallel work is safe.
67. As a user, I want every agent command batch to be one undo step labelled with the agent's name, so that I can roll back one agent without touching another's work.

### Self-changing app: themes

68. As a user, I want to ask for a new theme in plain words, such as "dark glass with amber accents", and see it applied live, so that the app looks how I like.
69. As a user, I want themes saved by name and switchable from Settings, so that I can flip between looks.
70. As a user, I want a theme to cover colours, fonts, card shapes, shadows, motion and background, so that a theme can change the whole feel.
71. As a user, I want only free, openly licensed fonts and assets used in generated themes, so that my app never contains restricted material.

### Self-changing app: features

72. As a user, I want to ask for a new card type, for example "a Pomodoro timer card", and have it appear in the toolbar after a reload, so that the app grows with my needs.
73. As a user, I want to ask for a new agent tool, for example "a tool that reads my calendar", so that agents gain abilities I need.
74. As a user, I want to ask for a new panel or toolbar button, so that the app's layout changes too.
75. As a user, I want the agent to be able to edit core canvas code when an extension isn't enough, so that there are no hard limits on what can change.
76. As a user, I want self-changes to apply with a hot reload in a few seconds and keep my place on the board, so that changing the app feels immediate.
77. As a user, I want to see a list of every self-change with its description, time and agent, so that I know how my copy differs from the factory app.
78. As a user, I want to undo any self-change, so that I can back out a feature I don't like.
79. As a user, I want the app to roll back on its own if a self-change stops the canvas from loading, so that a bad change can't brick my workbench.
80. As a user, I want a safe-mode launch that loads the factory app with my boards intact, so that I always have a way back.
81. As a user, I want to turn individual extensions off without deleting them, so that I can find which one is causing trouble.
82. As a user, I want my boards, settings and credentials kept apart from app code, so that a self-change or rollback never touches my data.
83. As a user, I want to export my changed app layer as a Git repository, so that I can keep it, share it or merge it with a new baseline.
84. As a user, I want an agent working on a self-change to test it before applying it, so that most broken changes never reach me.

### Native layer and updates

85. As a user, I want the app to tell me when a requested change needs a native rebuild and offer to do it, so that I understand why some changes aren't instant.
86. As a user, I want factory updates to merge with my self-changes instead of wiping them, so that updating doesn't undo my custom app.

### Privacy and trust

87. As a user, I want nothing sent to any model until I ask an agent to do something, so that capturing stays private.
88. As a user, I want to see which board content and files an agent run included, so that I know what left my machine.
89. As a user, I want agents to run with my own user's file and shell permissions and to be told so in Settings, so that I understand the real blast radius.

### Parallel lanes and smart merge

90. As a user, I want to give two agents different app changes at once, such as a new theme and a new toolbar button, so that I don't wait for one to finish before starting the other.
91. As a user, I want each lane to work on its own copy of the app code, so that half-finished work never shows up in my running app or in another lane.
92. As a user, I want a lanes view that shows every lane side by side with its brief, status, changed files, live log and preview, so that I can watch a team of agents work at once.
93. As a user, I want to preview a lane's version of the app in its own window before it lands, so that I can see a change before it's mine.
94. As a user, I want lanes to land on their own when checks pass, or wait for my OK when I switch on review mode, so that I choose how hands-off it is.
95. As a user, I want lanes that touch different files to merge without any agent work, so that most merges are instant.
96. As a user, I want a merge agent to resolve conflicts between lanes using both lanes' briefs, so that both features survive.
97. As a user, I want the merged result checked as a whole before it goes live, so that two changes that work alone but break together are caught.
98. As a user, I want a lane that can't merge to go back to its agent with the reason, rebased on the latest app, so that it can fix itself and retry.
99. As a user, I want each landed lane to be its own entry in the self-change list with its own undo, so that I can remove the theme and keep the button.
100. As a user, I want a warning when two lanes plan to edit the same core file, so that I can let them race or run one after the other.
101. As a user, I want agents to add features to the app itself, such as the title bar, sidebar, toolbars, command palette, settings pages, status bar, panels and context menus, so that changes aren't limited to boards.
102. As a user, I want to cancel any lane at any time without affecting the others, so that a bad idea costs nothing.
103. As a user, I want to cap how many lanes run at once, so that my machine and subscription limits stay manageable.

### Browser chrome (Zephium-style)

110. As a user, I want vertical tabs in a quiet sidebar with pinned tabs and folders, so that browsing feels like Arc or Zephium.
111. As a user, I want spaces, each with its own tabs and boards, so that separate projects stay apart.
112. As a user, I want profiles with separate site logins and data, so that work and personal accounts don't mix.
113. As a user, I want split view, so that I can put a page beside a board or two pages side by side.
114. As a user, I want a launcher that searches tabs, boards, cards, history and commands, so that anything is one shortcut away.
115. As a user, I want any tab dragged onto the board to become a tab card, and any tab card opened back into the sidebar, so that browsing and the canvas share the same tabs.
116. As a user, I want a page pane beside the canvas that opens any tab card or agent source live, so that I can read and use a page without leaving the board.
117. As a user, I want built-in ad and tracker blocking, so that pages load fast and agents don't read ads.
118. As a user, I want inactive tabs to sleep, so that many open tabs don't eat memory.
119. As a user, I want an assistant sidebar that reads the current page and can carry the job onto the board, so that a quick question can grow into canvas work.
120. As a user, I want to import bookmarks, history and logins from my current browser, so that switching is painless.

### Canvas speed

104. As a user, I want panning and zooming to keep up with my display's refresh rate on a board with thousands of cards, so that the canvas never feels laggy.
105. As a user, I want a large board to open in about a second, so that switching boards is quick.
106. As a user, I want an agent placing hundreds of cards to not freeze the canvas, so that I can keep working while it sorts.
107. As a user, I want typing in a card to never lag, even with several agents running, so that capture always feels instant.
108. As a user, I want text to stay sharp at every zoom level without a redraw pause after zooming, so that the board never looks blurry or jumps.
109. As a user, I want an optional performance overlay showing frame time, so that slowdowns are measurable instead of a feeling.

## Implementation Decisions

### Baseline and branding

- Use Mochiboard (MIT) as the feature and design reference: card types, interactions, shortcuts and layout. If the stack proposal is accepted, the canvas code is rebuilt as small modules for speed and lane-friendly merging, and Mochiboard's code is copied only where it fits. Either way, one shell serves Mac, Windows and Linux, and the Swift Mac wrapper is dropped.
- Remove everything covered by Mochiboard's trademark notice: the name, the Mochi character and her drawing code, stamps, pixel art, icons, installer art and music. Keep the MIT copyright notice. Keep Material Icons (Apache 2.0) and DM Sans and Caveat (OFL) with their licence files.
- Remove the Mobbin and Higgsfield helpers, the `claude -p` calls and the Claude-specific prompts. Pi tools replace them.
- Product name is Aegis. The app identifier, data folder and update feed change with it. The baseline's self-update from Mochiboard releases is removed.

### Process model

Pending decision: the stack proposal in this folder recommends Electron instead of Tauri. If accepted, the native shell below becomes Electron's main process and the agent host runs in an Electron utility process. The three-part split stays the same.

Three parts talk over local channels:

1. **Native shell (Rust, Tauri 2).** Owns windows, native browser views for browser tab cards, file dialogs, the voice transcriber, export, the sidecar lifecycle and safe mode. It stays small and changes rarely, because changing it needs a rebuild.
2. **Live app layer (HTML, CSS, JavaScript).** The canvas, themes and extensions. The shell loads it from a writable folder in the app data directory, not from the signed bundle, so the agent can edit it and hot reload it. The bundle carries a read-only factory copy, used for first run, safe mode and recovery.
3. **Agent host (Node, Pi Durable).** Runs as a Tauri sidecar. It owns provider sign-in, durable runs, subagents, tool execution and the native SQLite run store. It keeps running while the window is closed, until the user quits it from the tray.

The webview and the agent host communicate through the shell (Tauri commands and events). The agent host never touches the DOM. It sends board commands and receives board snapshots.

### Agent host

- Use the same pinned upstream Pi packages as Mars (Pi Durable, Pi AI and Pi Codemode), pinned to one version. Upgrades are deliberate.
- Sign-in uses Pi's native ChatGPT and Claude OAuth flows, including the paste-the-callback-URL fallback. Tokens live in the app data folder, outside the live app layer and its Git history.
- An **Agent Run** is a durable Pi conversation with: id, parent run id (optional), board id, brief, model, status, created and updated times, and the set of card ids it has touched.
- Run status is one of `queued`, `running`, `waiting_for_user`, `paused`, `done`, `failed` or `stopped`. The host publishes status changes as events. The agent card renders from those events only.
- Spawning many agents at once is a single request that creates sibling runs. Subagents created inside a run carry the parent id so the board can draw parent-child links.

### Board Command API (the agent-facing canvas seam)

- One typed command set replaces Mochiboard's free-form `applyMochi` response shape. The canvas UI and the agent both use it, so anything a person can do by hand has a command.
- Commands: `create`, `update`, `move`, `resize`, `delete`, `connect`, `disconnect`, `group`, `ungroup`, `layout` (grid, column, row, cluster, timeline, kanban, radial), `focus` (camera move and highlight), `create_board`, `create_folder`, and `read` (structured snapshot of a board or a selection).
- Commands are sent as an ordered **batch**. A batch is validated in full before anything applies. A batch applies atomically, becomes one undo step labelled with its author (user or agent run id), and returns created ids plus per-command results.
- Each batch carries the board revision it was based on. If the board has moved on, non-conflicting commands rebase and apply. Commands that target a deleted card, or that update the same field another author changed after the base revision, fail with a reason the agent can act on. No edit is lost silently. If the stack proposal's Loro board documents are accepted, each author is a Loro peer, merging uses Loro's CRDT, and per-author undo uses Loro's undo manager. The failure rules above still apply to deleted cards.
- Placement is optional on `create`. When a command has no position, the canvas finds free space near the viewport or near a named anchor card.
- Card types form a registry. Built-in types and extension types register the same way: a type name, a schema for its data, a renderer and optional agent-facing instructions. The command validator uses the registry, so new card types get agent support automatically.
- The Pi host exposes the Board Command API as tools. Tool descriptions are generated from the card type registry so they stay in sync with installed extensions.
- Rough shape of a batch (a decision record, not working code):

```ts
type BoardBatch = {
  boardId: string;
  baseRevision: number;
  author: { kind: "user" } | { kind: "agent"; runId: string };
  commands: BoardCommand[];
};
type BatchResult =
  | { ok: true; revision: number; created: Record<string, string>; results: CommandResult[] }
  | { ok: false; revision: number; errors: { index: number; reason: string; hint: string }[] };
```

### Brain dump sorting

- Quick capture and voice capture write raw items into the board's Unsorted tray first, then optionally start a sort run.
- The sort run is an ordinary Agent Run with a built-in brief. It reads the tray and the board, then emits one batch that creates groups, checklists and connectors, moves items out of the tray, and ends with a `focus` command.
- Voice transcription stays local in the native shell, as in the baseline. Only the transcript goes to a model, and only when a run starts.

### Browser tabs

- A **Browser Tab** is a card type with URL, device size, history, session profile and an optional source agent run.
- Each live tab is a native browser view owned by the shell, not an iframe. Embedding rules (`X-Frame-Options`, `frame-ancestors`) don't apply, so every site loads.
- Native views draw above the web canvas and can't be CSS-transformed, so a tab card has two states. **Live**: the shell places the native view over the card's on-screen rectangle and sets its zoom factor to match the canvas zoom. **Still**: the card shows the latest captured frame as an image inside the canvas. A tab goes still while the canvas pans or zooms, when another card overlaps it, when zoomed far out, or when it's beyond the live-tab cap. The page keeps running while still, so switching back is instant.
- **Page pane.** Any tab card or agent source can also open live in a pane tiled beside the canvas, as in Zephium's Work. This is the proven layout: Zephium tiles native views and never overlaps them, because overlapping native web views fight over the cursor on macOS. If live-on-card views show the same cursor or input problems in Electron, tab cards stay as stills and live use moves to the page pane only.
- Browser chrome follows Zephium's design: vertical tab sidebar, spaces, profiles, pinned tabs and folders, split view, launcher, sleeping tabs, native ad blocking and an assistant sidebar. Sidebar tabs and canvas tab cards point at the same tab objects.
- Zephium's code and assets are MPL-2.0, except its name and logo. Copying a Zephium source file keeps that file under MPL-2.0 with its notice, and changes to it stay open if Aegis is distributed. The rest of Aegis can use any licence. The Zephium name and logo aren't used.
- Agents drive tabs through the browser's DevTools protocol, on the same view the user sees. The card shows that an agent is driving, and a click hands control to the user.
- Tabs use named session profiles, so site logins persist and stay apart from the app's own UI.
- The agent host's browser tool opens pages as Browser Tab cards linked to the run.
- A tab bound to a local dev server reloads when that server's files change.

### Self-change pipeline (the app-changing seam)

- The live app layer is a Git repository inside the app data folder. The factory copy is its first commit. Boards, settings, credentials and the run store live outside it.
- A **Self-Change** is a transaction with these steps: start (a working copy on a branch from the current live commit), edit, check, apply, verify, then either keep or roll back.
- **Check** runs before apply: syntax checks on changed files, extension manifest validation, and a headless boot of the changed layer that must report the canvas ready.
- **Apply** fast-forwards the live layer and asks the webview to hot reload, keeping the current board, camera and selection.
- **Verify**: the reloaded canvas must send a ready signal within a timeout. If it doesn't, or if it throws during boot, the shell restores the previous live commit and reloads again. The self-change is marked rolled back with the error attached.
- **Safe mode** is a shell-level launch option, through a keyboard shortcut held at launch and a tray menu item. It loads the factory copy without extensions. Data is untouched.
- There are no permission prompts for self-changes. Recovery replaces gating: checkpoints, automatic rollback and safe mode.
- Every self-change records description, author run, time, changed files and outcome. Settings lists them with undo (a revert commit).
- Themes are data: a named token file covering colours, type, radii, shadows, motion and background, applied as CSS custom properties. Switching themes needs no reload.
- **Extensions** are folders in the live layer with a manifest. A manifest can declare card types, agent tools, panels, toolbar items, commands and themes. Extensions load in a defined order, can be disabled one at a time, and can't replace built-in board commands or the self-change tools.
- Agent tools from extensions run in the agent host. Card renderers and panels run in the webview. One extension can include both.
- Core edits outside extensions are allowed and use the same pipeline. They carry a higher risk of conflict with factory updates, and the self-change list marks them as core.
- Changes to the native shell are not hot. The agent can edit them, but applying needs a rebuild and relaunch. The app says so and offers the rebuild. A rebuilt shell that fails to start falls back to the previous build.
- Factory updates arrive as new commits on a factory branch and are merged into the live layer. Conflicts go to an agent run for resolution, and the user can always keep their version or take the factory version.

### Lanes and the merge queue

- A **Lane** is a self-change that runs alongside others. It has its own Git worktree and branch from the live commit, an owning agent run, a brief, the paths it intends to touch, and a state. A single self-change is a lane of one.
- Lane states: `working`, `checking`, `ready`, `queued`, `merging`, `landed`, `bounced`, `abandoned`.
- Lanes never touch the live app layer or each other. Each lane can open a preview window that runs the lane's code against a scratch copy of the current board.
- One **merge queue** lands lanes one at a time, in the order they become ready. For each lane it:
  1. merges the lane branch into the current live commit in an integration worktree;
  2. retries textual conflicts with a structure-aware merge for supported file types;
  3. starts a merge agent for any conflicts left, giving it both lanes' briefs and diffs and letting it edit only the conflicted files;
  4. runs the full check (typecheck, tests, headless boot, smoke screenshot) on the merged tree;
  5. fast-forwards the live layer, hot reloads and verifies, as for any self-change;
  6. records the lane as one self-change with its own undo.
- If the merge agent can't resolve a conflict, or the merged tree fails its checks, the queue bounces the lane to its owning agent with the failure, rebased onto the new live commit.
- Layout prevents most conflicts. Themes are data files. Features are extension folders. Contribution points (card types, toolbar items, panels, settings pages, commands, app chrome slots) are discovered from manifests, not listed in shared index files. Two lanes that each add something touch different files and merge without an agent.
- App chrome contribution points: title bar, sidebar, toolbars, command palette, settings pages, status bar, side panels and context menus.
- Lanes declare intended paths when they start. The scheduler warns when two active lanes claim the same core file. The user can let both run or queue one behind the other.
- Protected files (the self-change pipeline, merge queue, checks, watchdog and safe mode) can't be changed by a lane, following Mars's protected-file rule. The queue runs checks from the live commit's copy, not the lane's, so a lane can't weaken the checks that judge it. Changing protected files is a factory update or a manual edit.
- A concurrency cap (default four lanes) limits active lanes. Extra lanes wait as `queued` before they start working.

### Canvas speed

- Proposed budgets, measured in the built app on Apple Silicon: pan and zoom at display refresh with 95th percentile frame time inside one frame on a 5,000-card board; a 5,000-card board opens in under one second; applying a 500-command agent batch blocks the UI thread for under 50 ms; typing latency under one frame with four agents running.
- Only cards inside the viewport, plus a margin, are mounted. A spatial index finds them.
- Pan and zoom change one transform on one layer. They never re-render cards or trigger layout.
- A card re-renders only when its own data changes. There is no whole-board re-render path.
- Saving writes incremental changes. Nothing serialises the whole board on each edit.
- Far zoom draws simplified card shapes instead of full content.
- Layout algorithms, search indexing and snapshot encoding run off the UI thread.

### Data and storage

- Boards remain plain JSON files, one per board, as in the baseline, plus an index, with a board revision counter added for the Board Command API. Pending decision: the stack proposal saves each board as a Loro document with a readable JSON export next to it, and writes incremental updates instead of the whole file.
- Agent run history lives in Pi Durable's native store in the app data folder.
- The app layer exports as a Git bundle or repository. That export never includes boards, settings or credentials.

## Testing Decisions

A good test drives Aegis through the same seam a real caller uses and checks what the caller can observe: the resulting board, the returned result, the reloaded app. It doesn't check private functions, DOM structure or internal state shapes. A test should fail if the behaviour it names breaks, and keep passing through refactors.

Proposed seams, highest first. Three seams cover the system. Each is a boundary that already has to exist.

1. **Board Command API.** Tests send batches to a headless board model and assert on the returned result and the next `read` snapshot. This one seam covers manual edits, agent edits, brain dump sorting output, undo grouping, layout, validation errors, extension card types and two-author conflicts. Sorting tests use recorded or scripted agent output, not live models.
2. **Self-change transaction and merge queue.** Tests run against a temporary live layer repository. They start lanes, write files, then run check, queue, merge, apply and verify, and assert on the live commit, the recorded outcomes and whether a rollback or bounce happened. Cases include a good theme, a good extension, a syntax error, a canvas that never reports ready, a disabled extension, revert, a factory merge with and without conflicts, two disjoint lanes landing with no merge agent, two conflicting lanes resolved by a scripted merge agent, two lanes that merge cleanly but fail checks together, a lane that edits a protected file, and undoing one landed lane while keeping another. The headless boot used by Check doubles as the test harness.
3. **Agent host protocol.** Tests drive the sidecar's local interface with a fake model provider. They assert on run lifecycle events, parallel spawn, parent-child links, pause, resume, stop, follow-up messages, a waiting-for-user state, an expired sign-in error, and that board tools turn into Board Command API batches. Real ChatGPT and Claude sign-in gets a manual smoke check, recorded as manual and never presented as automated proof.

Browser tabs get a small set of end-to-end checks in the built app: a normal site, a site that blocks iframes, a local dev server, the switch between live and still while zooming, and an agent driving a tab.

Canvas speed gets a benchmark in the built app. It generates boards of set sizes, runs a scripted pan, zoom and agent-batch sequence, and records frame timings. A result over budget fails the run.

Prior art: Aegis has no code or tests yet, and Mochiboard ships no tests. Mars (`mars 3`) has the closest prior art: Node test runner suites for its updater and deploy watchdog, and its self-edit spec describes a start, check, finish and abandon flow with a health check and rollback watchdog. Aegis's self-change tests should follow that style. Mars's workbench reducer is prior art for persisted pane and tab state.

## Out of Scope

- Any hosted or server-side component, sync service, account system or multi-user collaboration.
- Mobile apps.
- Model providers other than ChatGPT and Claude subscription sign-in in the first version. Pi supports more, and adding them later is an extension.
- Sandboxing agents or restricting their file and shell access. Agents run as the local user, and the app states this plainly.
- Hot reloading the native Rust shell.
- Keeping any Mochiboard brand asset, character, art or music, or using the Mochiboard name.
- The Mobbin and Higgsfield integrations.
- A plugin marketplace or sharing extensions between users.
- Mochiboard's Windows release workflow and update feed. Aegis release packaging is a later spec.

## Further Notes

- "Tori" in the brief means Tauri, which Mochiboard already uses for its Windows and Linux shell. Mochiboard's Mac build uses a Swift wrapper. The stack proposal recommends Electron instead, because of the browser tab and agent host requirements. That needs the owner's OK.
- "Pi Agent inside the shell or Pi Durable": this spec picks Pi Durable as a sidecar because the brief needs runs that outlast the window, parallel agents and subagents, which Mars already proves on Pi Durable. Embedding a plain Pi agent in the webview was rejected because runs would die with the window.
- "Like Mars": Aegis borrows Mars's ideas (native Pi sign-in, agents that change their own app, health-checked rollback). It doesn't borrow Mars's server model. Mars runs a gateway and Next.js server. Aegis has no server, and the live app layer reloads in the webview.
- "Grok bot" means running several agents side by side and watching them all at once (confirmed by the owner). The lanes view and agent roster cover it.
- "No restrictions" is treated as no permission gates, not as no safety net. An app that can rewrite its own canvas can also break the code that would fix it, so automatic rollback and safe mode are part of the core design.
- Mochiboard's free-form assistant reply (`say`, `add`, `move`, `edit`, `remove`, `connect`, `collections`, `titles`) is a useful starting vocabulary for the Board Command API. Its parsing and its ad hoc placement logic should be replaced, not wrapped.
- Switching browser tabs between live native views and stills over a moving canvas is the riskiest part of the browser tab design. Prototype it first.
- Mochiboard keeps its whole canvas in one 4,751-line script. Parallel lanes editing one file would conflict all the time, so the baseline becomes a feature and design reference and the code is rebuilt as small modules.
- Zephium was considered as the base and rejected (see the stack proposal). It's a Tauri and Rust browser with a security model built around approvals and a locked-down core. Aegis wants an agent that can rewrite the whole app at runtime. Aegis borrows Zephium's browser design and Work canvas patterns instead.
