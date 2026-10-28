# Overnight run

Working notes for unattended runs. Read this first, act on one item per tick,
append a log block at the end.

## North Star

From `PRODUCT.md`: the table is the product. Chrome recedes, the work and the
agents' work lead. Agents work in the open: every change is visible, attributed
and undoable. Instant under the hand. Local and owned. Self-changing, never
fragile. "Jarvis's table, built by Apple."

## Standing rules

- Work on `main` in `/Users/avi/Documents/ChatGPT/aegis`. Small commits.
- `npm run check` must pass before every commit. If it fails, fix or revert,
  never commit red.
- The sidebar redesign merged on 2026-10-29 as PR #27 (`fd65952`), so the old
  ownership list is lifted. Those files are normal to edit now.
- Tests use a temporary `AEGIS_DATA`. Never read or write
  `~/Library/Application Support/Aegis` except the live MCP connection file.
- No Docker restarts, no builds that fill the disk. Check free space first.
- Plain Australian English, no em dashes, no AI tells.
- Browser-side `import('/src/...')` inside a check must use the real `.ts`
  path. With `.js` the dev server serves a second copy of the module, so state
  set by the check never reaches the app. This broke docs and agent-edges.
- Verify in the running app or the built UI, not only in unit tests.

## Queue

1. **MCP presence.** Done 2026-10-28: a lasting "Local MCP changed N cards"
   chip on the canvas, plus the existing agent line. Follow-up: pass the real
   client name through the bridge instead of the hardcoded "Local MCP".
2. **Pre-existing UI suite failures.** These four failed at the base commit
   `ee8384c`. All four are fixed as of 2026-10-29; the list stays as history.
   - `checks/ui/docs.mjs`: `waitForFunction` timeout.
   - `checks/ui/wireframe.mjs`: NaN attribute at line 262.
   - `checks/ui/genui.mjs`: `$RefreshSig$` not defined in the Vite dev path.
   - `checks/ui/agent-edges.mjs`: assertion at line 125.
3. **Bundled runtime start test.** Done 2026-10-29. `check:runtime` now runs
   inside `npm run check`. Proof it catches the shipped crash: deleting a staged
   `@aegis/domain` makes it exit 1 with `ERR_MODULE_NOT_FOUND`. A symlinked
   stage alone does not fail, because relocation keeps relative links valid; the
   real failure was the bundler dropping the entry entirely.
4. **Native frame rate.** Measured 2026-10-29 in headless Chromium: 5000 cards,
   240 frames of pan then zoom, interval p50 8.3 ms, p95 10.1 ms, max 16.7 ms,
   callback CPU p95 2.9 ms. That is roughly one 120 Hz frame at the median.
   Native presentation is still unverified; headless timing cannot certify it.
5. **UX polish** against `.scratch/aegis-redesign/comps/6-zen-dark-LOCKED.png`,
   avoiding the files the sidebar session owns.

## Log

### 2026-10-28, evening

- Built the MCP presence chip (`app/src/features/agents/Presence.tsx`). It
  holds for 20 seconds, pulses for 4, and clicking it redraws the agent line.
- Found the agent line itself was fine all along: it draws behind cards, so a
  probe card sitting under a document hid it. No code change needed there.
- Verified with a headless browser against the live app: the chip appears
  bottom-left after an MCP batch.
- Cleaned the probe card off the `Demo assignment` board (now revision 13).
- Built and installed the native app (`~/Applications/Aegis.app`, new host on
  a fresh port). The old copy is at
  `~/.Trash/Aegis-0.3.0-2026-10-28-2341.app`. The installed binary embeds
  `index-CbE3ZkiR.js`, the build that contains the chip.
- The app relaunched clean and the board reads fine at revision 13.
- Not verified by eye: nobody has looked at the native window yet.

### 2026-10-29, early

- Added dictation: the Ask orb starts Apple's on-device recogniser and streams
  partial text into the box. `src-tauri/src/dictation.rs` owns the microphone
  tap and the recogniser; the page polls `speech_poll` every 120 ms.
- Installed and relaunched. The bundle links `Speech.framework` and carries both
  privacy strings.
- Not verified by ear: nobody has clicked the orb, so the two permission prompts
  and the transcript itself are still unseen.

### 2026-10-29, tick at 12:18am

- Fixed the first of the four broken UI suites: wireframe. Root cause was the
  colour editor. A box set to "No fill" carries the string `none`, which the
  editor turned into NaN slider values; React logged that as an error and the
  suite asserts on a clean console.
- The editor now starts from black when its value is not a hex.
- `checks/ui/wireframe.mjs` passes. Next: docs, genui, agent-edges.

### 2026-10-29, tick at 12:47am

- Fixed the genui suite. Vite's fast refresh injects an inline module into the
  page, and this check applies the app's real `script-src 'self'` policy, so the
  inline module can never run and React's refresh helpers went undefined.
  `server.hmr: false` removes it for this run only.
- That uncovered the next gap: the lifecycle step drives the shipped bundle,
  which needs a build with `AEGIS_TEST_FACADE=1`. The check now builds that
  itself instead of depending on a manual step.
- `checks/ui/genui.mjs` passes, Chromium and WebKit. Next: docs, agent-edges.

### 2026-10-29, tick at 1:05am

- Fixed the docs suite, the third of the four.
- Cause: from the browser, `import('/src/platform/document-test.js')` loads a
  different module copy than the app's own `/src/platform/document-test.ts`
  graph. The check registered its rewrite hook into the copy nobody reads, so
  the editor fell back to the host and the expected text never appeared.
- Import the real `.ts` path, and set the facade flag in the check so a
  standalone run matches `run.mjs`.
- `checks/ui/docs.mjs` passes with 17 sections. Next: agent-edges.

### 2026-10-29, tick at 1:25am

- Fixed the last of the four UI suites: agent-edges. Same trap as docs. The
  fixture imported `/src/lib/ui/dropdown.js`, which is a second copy of the
  dropdown module, so its shared popup registry was empty and End did not move
  focus to the last option.
- Importing `/src/lib/ui/dropdown.ts` and `/src/lib/ui/menu.ts` fixes it.
- All four suites now pass. Next: wire `npm run check:runtime` into
  `npm run check`.

### 2026-10-29, tick at 1:45am

- Added `npm run check:runtime` to `npm run check`, so a staged runtime that
  cannot start now fails the normal gate.
- Proved the gate works: removing `node_modules/@aegis/domain` from a copy of
  the staged runtime makes the check exit 1 with `ERR_MODULE_NOT_FOUND`, which is
  exactly the crash that shipped before `f5b1f04`.
- Learned that a symlinked stage still passes after relocation, so copying with
  verbatimSymlinks hides the old layout. Missing entries are the real signal.
- Next: native frame rate re-measure.

### 2026-10-29, tick at 2:05am

- Re-measured pan and zoom after the React cutover. 5000 cards, 150 pan wheel
  events then 90 zoom events: interval p50 8.3 ms, p95 10.1 ms, p99 and max
  16.7 ms, callback CPU p95 2.9 ms, 255 cards mounted near and 257 far.
- Compared with the recorded baseline (p50 9.3 ms, p95 21.3 ms, max 13800 ms),
  the current build is well ahead, and the 13.8 second outlier is gone.
- This is headless Chromium. The interval is time between produced frames, not
  display pacing, so it says the work fits a 120 Hz budget at the median and
  misses it on roughly one frame in twenty. It cannot certify the native window.
- No code changed, so the gate was re-run as a formality.
- Next: UX polish against the locked comp, avoiding the sidebar files.

### 2026-10-29, tick at 2:25am

- UX polish against the locked comp. Sampled both images: the comp's card body
  is `#0d0e0f` and its header strip `#131416`, while the app used `#141618` and
  `#1a1d20`. The whole dark ramp sat about seven shades high.
- Moved card, strip, inset and raised down by seven. The card now samples exactly
  `(13,14,15)` in the built UI, matching the comp, and cards still read as
  separate windows because the border and lighter header carry the edge.
- Verified with a fresh screenshot. Revert is one line in `app/src/styles/app.css`.
- The queue is now empty. Next candidates:

## Next

1. `checks/ui/editing.mjs` path fixed on 2026-10-29 after the sidebar merge.
2. Run the whole UI suite once (`node checks/ui/run.mjs`) and triage anything
   else that is red. It takes about an hour, so give it its own tick.
3. Document card typography against the comp, if the owner wants it tighter.

### 2026-10-29, tick at 2:55am

- The presence chip now names the client. The stdio bridge reads
  `clientInfo.name` from the initialize message and sends it as
  `x-aegis-client`; the host uses it as the board author, falling back to
  "Local MCP" when a client never names itself.
- Added a host test: a stdio client called `aegis-stdio-check` edits a board and
  the board event carries that name. 157 host tests.
- Built, installed and relaunched. A probe tagged "Claude Code" produced a chip
  reading "Claude Code changed 1 card", then deleted its own card.
- Gotcha: the host runs compiled JS, so a source edit is invisible to
  `node --test checks/host` until `npm run build:shared`.

### 2026-10-29, tick at 3:15am

- Pre-empted the module-copy trap in the rest of the UI checks. Switched
  `deck.mjs`, `editors.mjs`, `media.mjs` and `docs.mjs` to the real `.ts` paths.
- Ran all four suites: deck, media, editors and docs pass. Full check green,
  157 host tests.
- One left: `editing.mjs` still imports `board-export.js`, and that file belongs
  to the sidebar session, so it waits. The real path is `.tsx`.
- Nothing was broken before this; it was a trap waiting for the next test that
  needs shared module state.

### 2026-10-29, tick at 3:35am

- The queue is blocked: editing.mjs belongs to the sidebar session, and
  typography is the owner's call. Ran a regression sweep instead over objects,
  draw, canvas, parity and polish.
- objects, draw and canvas pass. parity and polish failed in helpers that drive
  the shipped bundle, because app/dist had been rebuilt without the test facade.
  Same precondition that bit genui.
- Fixed it once in `checks/ui/run.mjs`: build the UI with `AEGIS_TEST_FACADE=1`
  before any suite runs, and stop with a clear message if the build fails.
- `node checks/ui/run.mjs parity polish` passes 2 of 2. Full check green.

### 2026-10-29, tick at 3:55am

- The only actionable item was the full UI sweep, so it is running in the
  background at port offset 3800 across every suite. Results are triaged next
  tick; anything red becomes the queue.
- No code changed in this tick, so the gate was not re-run. The last full check
  was green minutes ago.

### 2026-10-29, tick at 4:15am (sweep result)

- Full UI sweep finished: 43 of 44 suites pass. Only `data-trust` failed.
- Cause was my own surface change. The settings "Panels" colour default was
  still `#141618`, and four ported CSS surfaces still carried the old ramp, so
  the check saw a button value that no longer matched the `--card` token.
- Aligned the panel default, `react-agents.css` strip and inset,
  `tokens.css` surface and float, and the dormant `scene.css` card literal
  (now `var(--card)`).
- `data-trust` passes again, 18 checks on Chromium and WebKit. Full check green.
- Lesson: a token change is only done when nothing else hardcodes the old value.
  The sweep is what caught the leftovers.

### 2026-10-29, tick at 4:35am

- Queue is clear, so closed a documentation gap instead. PRODUCT.md now records
  dictation (on-device Apple speech from the Ask orb) and the named MCP client,
  and voice capture is no longer listed as an open question.
- Started a second full UI sweep to prove the surface alignment did not shift
  any other suite. Result is triaged next tick.
- No code changed, so the gate was skipped; the last full check was green after
  the alignment commit.

### 2026-10-29, tick at 5:05am (sweep result)

- Second full UI sweep: 44 of 44 suites pass. The surface alignment shifted
  nothing else, so the whole browser suite is green for the first time tonight.
- Remaining queue: editing.mjs path (waits for the sidebar branch) and the
  document typography call (owner's).

### 2026-10-29, tick at 5:35am

- Queue still blocked, so I tested last night's presence chip at phone width,
  something nobody had looked at. At 390 px it sat at y 794 behind the board
  hub and was completely invisible.
- Moved it to the top-left under the board name below 700 px, matching the
  hub's own breakpoint. Verified: the chip is now at (12, 44) and on top at
  390x844, and unchanged at desktop width.
- Full check green.

### 2026-10-29, tick at 6:05am

- Followed the phone chip from last tick. It was 30 px tall, which is below the
  44 px touch target the app already uses for the board hub.
- Gave it `min-height: 44px` below 700 px. Verified at 390x844: 208 by 44,
  text centred, still clear of the title and the dock.
- Full check green.

### 2026-10-29, tick at 6:45am

- Queue still blocked: the sidebar branch is at `39aebe7`, unmerged. Nothing
  else is actionable without a decision from the owner.
- The installed app was one build behind main, missing the colour alignment and
  both phone chip fixes. Rebuilt, installed and relaunched. The binary embeds
  `index-BMEaTG_8.js`, so it is the current UI.
- Host healthy, Demo assignment board intact at revision 25. Old install is in
  Trash as `Aegis-0.3.0-2026-10-29-0645.app`.

### 2026-10-29, tick at 7:15am

- No action. Queue blocked on the sidebar branch and the owner's typography
  call; nothing was running. Checked the app instead: still healthy on the same
  process since 6:45, tree clean apart from untracked `.claude` folders.

### 2026-10-29, tick at 7:45am

- Turned the typography question into measurements instead of a guess.
- Locked comp, document card: 748 px wide, text column about 636, body line
  spacing 29 px, which works out at roughly 18 px type. That is about 65
  characters per line.
- The app's default document: 480 px wide with 62 px padding, so a 356 px
  column at 18 px / 28 px, roughly 35 characters per line. Imported PDFs get
  560, so still narrower than the comp.
- The type itself matches the comp. The difference is the default width, not the
  font. A default of about 720 px would land near 60 characters per line.
- Not applied: the queue says "if the owner wants it". One line in
  `packages/domain/src/commands.ts` (the `doc` default) plus the importer's 560
  if you want them the same.

### 2026-10-29, morning

- Owner decided: the presence chip stays at the bottom-left. Accepted trade-off
  is that an open Library panel covers it; no code change.
- Still open: the document default width (480 vs the comp's 748) and the orb
  click that grants dictation permission.

### 2026-10-29, merge of PR #27

- Merged the sidebar redesign. Dry-run found no conflicts; merged locally and
  ran the gate (45 test files, 157 host tests) plus the eight browser suites it
  touches: canvas-chrome, library, controls-polish, design-system, editing,
  media, sandbox-lifecycle, data-trust. All green.
- Merged on GitHub pinned to the tested head commit, then pulled. Main is at
  `fd65952`. The branch was left in place for the other worktree.
- Rebuilt, installed and relaunched the app. Healthy, Demo assignment intact at
  revision 29, and the binary embeds `index-DExjER3_.js`.

### 2026-10-29, tick at 9:55am

- Took the last code item, now unblocked by the merge: `editing.mjs` imported
  `/src/features/editing/board-export.js`, a second copy of a `.tsx` module.
  Switched it to the real path.
- `checks/ui/editing.mjs` passes. Full check green.
- That closes every code item the loop ever opened. What remains is owner
  decisions: document default width, and the orb click for dictation.
