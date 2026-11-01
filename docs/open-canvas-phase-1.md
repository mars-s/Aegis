# Open canvas phase 1

Made by Sol 6.1 (gpt-6.1-sol, high reasoning) via the Codex CLI on branch
`codex/open-canvas-providers`. No dependencies were added and `src-tauri` is
untouched. Verification outside the Codex sandbox is summarised in the pull
request.

The shipped creation rail, Templates, Tools tiles, toolbar preferences, starter
actions and tour are removed. Scene, domain commands, editors, selection,
keyboard Undo/Redo, Library, Layers, dropped imports, agent windows, MCP and UI
updates remain. Legacy template-group drag behaviour was moved into the canvas
adapter instead of deleting support for existing boards. `canvasExtensions` in
`composition.tsx` is the frozen, typed, empty-by-default tool and panel seam.

The dock and Settings share provider rows. ChatGPT retains its existing OAuth
flow and a disconnect action. Claude uses a custom pi-ai adapter over the official
CLI, keeping Pi Durable as the conversation engine. The CLI owns its credentials;
Aegis removes legacy Anthropic and API key records and accepts no key input.
Claude discovery, streaming, cancellation, minimal environment, private working
directory and restricted MCP configuration are documented in `agent/src/README.md`.
Passage rewrites receive no board tools. Inference configuration files are private,
unique per turn and removed on completion.

The validated local profile has authenticated read, replace and reset endpoints.
Pi and MCP expose `profile_update`; every run receives the saved profile. The
normal conversation UI presents the first-run introduction and stores completion
locally. Reset introduction clears the profile and starts a new conversation.
The fake model supports the introduction and profile updates deterministically.

## Design and limits

The existing quiet Zen dark direction is preserved: Inter, neutral flat surfaces,
restrained spacing, the existing orb and a compact dock-anchored connection panel.
The connection panel is nonmodal, closes on Escape or an outside pointer press,
and restores focus to the dock. No new artwork or external assets were added.

Claude supports text conversations, MCP board actions and document rewrites.
Its internal tool trace is not represented as Pi tool calls, so board edits use
local MCP attribution and board Undo rather than Pi request-level Undo. Claude
cannot initiate Pi helper delegation or receive native image transcript input;
it can read imported sources through MCP. The self-extending system is outside
phase 1. Live official-provider behaviour has not been exercised in this sandbox.

Browser screenshots and full HTTP/runtime checks remain incomplete. The sandbox
refuses loopback listeners and Chromium startup. A minimal Node subprocess probe
also received no piped stdout, so the CLI adapter ready/stream test could not be
validated here. These are reported as failed or blocked checks, not passes.

## Validation commands and results

Repeated implementation checks below list their final result. Exploratory file
reads and searches are omitted.

| Exact command | Result |
| --- | --- |
| `npm run build:shared` | Passed. |
| `npm run check:types` | Passed for all projects. |
| `npm run check:lint` | Passed with `oxlint --deny-warnings`. |
| `npm --prefix app run build` | Passed, production Vite bundle; Vite reports its large-chunk advisory. |
| `npm run check:safe-types` | Blocked by `spawnSync git EPERM`. |
| `git ls-files --cached --others --exclude-standard -z > /tmp/aegis-safe-files` then `node /tmp/aegis-safe-inspect.mjs` | Passed: 435 TypeScript source files, zero findings from the same exported inspector. Script below. |
| `npm run check` | Dependencies passed; stopped at the same safe-type subprocess restriction. |
| `npm run check:unit` | 39 files passed; 277 tests passed, 87 skipped. Five files failed because they require loopback listeners or synchronous git subprocesses; two individual tests failed. |
| `npx vitest run --exclude checks/unit/domain/differential.test.ts --exclude checks/unit/domain/contracts.test.ts --exclude checks/unit/scene/browser.test.ts --exclude checks/unit/workspace/stream-browser.test.ts --exclude checks/unit/workspace/legacy-host.test.ts` | Passed: 39 files, 272 tests. |
| `node --test checks/host/open-canvas.test.ts` | Could not run its host fixtures in this sandbox. |
| `node checks/host/open-canvas.test.ts` | All five HTTP tests blocked by `listen EPERM` on loopback. |
| `node --test --test-isolation=none checks/host/claude-adapter.test.ts` | Two passed; CLI readiness assertion failed because the subprocess probe returned no stdout. |
| `npm run check:runtime` | Runtime staging passed; relocated host startup blocked by `listen EPERM`. |
| `node checks/ui/open-canvas.mjs` | Chromium startup blocked: sandbox shutdown operation not permitted. No screenshots produced. |
| `for file in checks/ui/*.mjs checks/fixtures/claude.mjs; do node --check "$file" \|\| break; done` | Passed syntax checks. |
| `git diff --check` | Passed. |
| `/home/box/.agents/skills/impeccable/scripts/impeccable detect --json app/src/chrome/Chrome.tsx app/src/features/settings/ProviderConnections.tsx app/src/features/settings/provider-connections.css app/src/features/agents/Agents.tsx` | Passed, no findings. |
| `node /home/box/.codex/skills/design-taste-frontend/scripts/lint.mjs --app app/src/features/settings/ProviderConnections.tsx app/src/features/settings/provider-connections.css app/src/features/agents/Agents.tsx app/src/chrome/Chrome.tsx` | Zero failures. One shadow warning is intentional: the shadow belongs to the floating connection popover. |

The exact filtered host command was:

```sh
node --test --test-isolation=none --test-name-pattern='profile merges|durable introduction' checks/host/claude-adapter.test.ts
```

The safe-type fallback script in `/tmp/aegis-safe-inspect.mjs` was:

```js
import { inspectSource } from '/workspace/aegis/scripts/check-safe-types.ts';
import { readFileSync, existsSync } from 'node:fs';
const files = [...new Set(readFileSync('/tmp/aegis-safe-files', 'utf8').split('\0'))]
  .filter(path => /\.(?:[cm]?ts|tsx)$/.test(path) && existsSync(path));
const findings = files.flatMap(path => inspectSource(path, readFileSync(path, 'utf8')));
for (const finding of findings) console.log(finding);
console.log(`${files.length} source files, ${findings.length} findings`);
process.exitCode = findings.length ? 1 : 0;
```

The existing `npm run check` already discovers new host tests, so no package
script change was necessary. `checks/ui/run.mjs` registers `open-canvas` and
removes obsolete placement/tour suites. Retained browser suites seed the new
introduction-complete flag and create their fixtures through board commands or
the retained importer instead of removed controls. The new suite uses Chromium;
`AEGIS_CHECK_WEBKIT=1` optionally tries WebKit and permits unavailable WebKit to
be skipped. Captures go to `AEGIS_CHECK_OUT`.

## File inventory

### Added: 15

- `agent/src/claude-code.ts`
- `agent/src/profile.ts`
- `app/src/canvas/legacy-groups.ts`
- `app/src/chrome/ShortcutDialog.tsx`
- `app/src/chrome/shortcut-references.ts`
- `app/src/chrome/shortcuts.css`
- `app/src/features/agents/introduction.ts`
- `app/src/features/settings/ProviderConnections.tsx`
- `app/src/features/settings/provider-connections.css`
- `checks/fixtures/claude.mjs`
- `checks/host/claude-adapter.test.ts`
- `checks/host/open-canvas.test.ts`
- `checks/ui/open-canvas.mjs`
- `docs/open-canvas-phase-1.md`
- `packages/domain/src/profile.ts`

### Removed: 26

- `app/src/chrome/CoreTools.ts`
- `app/src/chrome/MobileTools.tsx`
- `app/src/chrome/Shortcuts.tsx`
- `app/src/chrome/TemplateMenu.tsx`
- `app/src/chrome/templates.test.ts`
- `app/src/chrome/templates.ts`
- `app/src/features/first-minute/FirstMinute.tsx`
- `app/src/features/first-minute/first-minute.css`
- `app/src/features/first-minute/react-first-minute.css`
- `app/src/features/media/placement-tool.ts`
- `app/src/features/onboarding/Onboarding.tsx`
- `app/src/features/onboarding/OrbHint.tsx`
- `app/src/features/onboarding/onboarding.css`
- `app/src/features/onboarding/shortcuts.ts`
- `app/src/features/wireframe/WireframePanel.tsx`
- `app/src/features/wireframe/registrations.ts`
- `app/src/features/wireframe/tool.ts`
- `app/src/platform/deck-placement.ts`
- `checks/ui/chrome.mjs`
- `checks/ui/double-note-input.mjs`
- `checks/ui/draw.mjs`
- `checks/ui/first-minute.mjs`
- `checks/ui/media.mjs`
- `checks/ui/parity.mjs`
- `checks/ui/polish.mjs`
- `checks/ui/wireframe.mjs`

### Changed: 94

- `PRODUCT.md`
- `README.md`
- `agent/src/README.md`
- `agent/src/main.ts`
- `agent/src/mcp.ts`
- `agent/src/providers.ts`
- `agent/src/requests.ts`
- `agent/src/runs.ts`
- `agent/src/transcript.ts`
- `app/src/App.tsx`
- `app/src/canvas/wireframe-policies.ts`
- `app/src/cards/deck/index.tsx`
- `app/src/cards/document/registration.tsx`
- `app/src/chrome/CanvasDoor.tsx`
- `app/src/chrome/Chrome.tsx`
- `app/src/chrome/InputCommands.ts`
- `app/src/chrome/LIBRARY.md`
- `app/src/chrome/Preferences.tsx`
- `app/src/chrome/README.md`
- `app/src/chrome/chrome.css`
- `app/src/chrome/controls.tsx`
- `app/src/chrome/index.tsx`
- `app/src/chrome/layout.ts`
- `app/src/composition.tsx`
- `app/src/editors/deck/README.md`
- `app/src/editors/document/README.md`
- `app/src/features/README.md`
- `app/src/features/agents/AgentShell.tsx`
- `app/src/features/agents/Agents.tsx`
- `app/src/features/agents/Options.tsx`
- `app/src/features/agents/model-choice.ts`
- `app/src/features/agents/runtime.tsx`
- `app/src/features/agents/verification.test.ts`
- `app/src/features/draw/README.md`
- `app/src/features/imports/README.md`
- `app/src/features/imports/react.tsx`
- `app/src/features/media/README.md`
- `app/src/features/mobile/MobileHub.tsx`
- `app/src/features/settings/Settings.tsx`
- `app/src/features/settings/preferences-store.ts`
- `app/src/features/settings/service.ts`
- `app/src/features/wireframe/README.md`
- `app/src/lib/shortcuts.ts`
- `app/src/lib/ui/README.md`
- `app/src/platform/CreativeImports.tsx`
- `checks/host/fixture.ts`
- `checks/host/host.test.ts`
- `checks/ui/agent-drafts.mjs`
- `checks/ui/agent-edges.mjs`
- `checks/ui/agent-motion.mjs`
- `checks/ui/agent-race.mjs`
- `checks/ui/agent-types.mjs`
- `checks/ui/agents-submit.mjs`
- `checks/ui/agents.mjs`
- `checks/ui/ask-selection.mjs`
- `checks/ui/canvas-chrome.mjs`
- `checks/ui/canvas.mjs`
- `checks/ui/chart-defaults.mjs`
- `checks/ui/controls-polish.mjs`
- `checks/ui/crop-a11y.mjs`
- `checks/ui/data-import.mjs`
- `checks/ui/data-trust.mjs`
- `checks/ui/deck-studio.mjs`
- `checks/ui/deck.mjs`
- `checks/ui/design-system.mjs`
- `checks/ui/docs.mjs`
- `checks/ui/editing.mjs`
- `checks/ui/editor-context.mjs`
- `checks/ui/editor-return.mjs`
- `checks/ui/editors.mjs`
- `checks/ui/evidence-fidelity.mjs`
- `checks/ui/fit-finish.mjs`
- `checks/ui/genui.mjs`
- `checks/ui/imports.mjs`
- `checks/ui/library.mjs`
- `checks/ui/mcp.mjs`
- `checks/ui/objects.mjs`
- `checks/ui/office.mjs`
- `checks/ui/orb-capture.mjs`
- `checks/ui/overview-model.mjs`
- `checks/ui/pan.mjs`
- `checks/ui/prod-composer.mjs`
- `checks/ui/refine-settings.mjs`
- `checks/ui/run.mjs`
- `checks/ui/sandbox-lifecycle.mjs`
- `checks/ui/semantic-zoom.mjs`
- `checks/ui/spatial-interaction.mjs`
- `checks/ui/spatial-memory.mjs`
- `checks/ui/startup-board.mjs`
- `checks/ui/trust-undo.mjs`
- `checks/unit/workspace/legacy-host.test.ts`
- `packages/host-client/src/connection.ts`
- `packages/host-client/src/contracts.ts`
- `packages/protocol/src/services.ts`

