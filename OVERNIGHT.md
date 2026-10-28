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
- Another session owns the sidebar redesign on branch
  `claude/sidebar-cursor-redesign-97b378`. Do not touch:
  `app/src/chrome/*`, `app/src/lib/ui/rows.css`,
  `app/src/platform/available-area.ts`, `app/src/styles/buttons.css`,
  `checks/ui/canvas-chrome.mjs`, `checks/ui/library.mjs`,
  `checks/ui/controls-polish.mjs`, `checks/ui/design-system.mjs`,
  `checks/ui/editing.mjs`, `checks/ui/sandbox-lifecycle.mjs`.
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
4. **Native frame rate.** Re-measure pan and zoom FPS in the installed app.
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
