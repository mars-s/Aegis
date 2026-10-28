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
- Verify in the running app or the built UI, not only in unit tests.

## Queue

1. **MCP presence.** Done 2026-10-28: a lasting "Local MCP changed N cards"
   chip on the canvas, plus the existing agent line. Follow-up: pass the real
   client name through the bridge instead of the hardcoded "Local MCP".
2. **Pre-existing UI suite failures.** These four fail at the base commit
   `ee8384c` and are unrelated to recent work. Fix one per tick.
   - `checks/ui/docs.mjs`: `waitForFunction` timeout.
   - `checks/ui/wireframe.mjs`: NaN attribute at line 262.
   - `checks/ui/genui.mjs`: `$RefreshSig$` not defined in the Vite dev path.
   - `checks/ui/agent-edges.mjs`: assertion at line 125.
3. **Bundled runtime start test.** The test already exists at
   `scripts/check-staged-runtime.ts` and runs as `npm run check:runtime`. It
   copies the staged runtime to a temp folder and waits for `{"aegis":"ready"}`.
   It is not part of `npm run check`. Wire it in so the symlink crash cannot
   ship again, and prove it fails against a symlinked stage.
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
