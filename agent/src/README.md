# Agent host

`main.ts` is the authenticated loopback HTTP entry, built to `agent/dist/main.js`.
Boards, assets, conversations, the personal profile and ChatGPT tokens live under
`AEGIS_DATA`, or `~/Library/Application Support/Aegis` by default.

`boards.ts` serialises all board changes through domain commands and revision
checks. `history.ts` keeps the conflict-aware Undo ledger. The canvas engine,
editors, local MCP bridge and UI update path remain independent of chrome tools.

## Providers

`providers.ts` keeps OpenAI's existing pi-ai Sign in with ChatGPT flow, including
dynamic client registration, the Aegis agent name and direct token scope. Only
OpenAI OAuth records belong in `DATA/auth.json`. Startup removes legacy Claude
and API key records. There is no API key route, input or environment fallback.
ChatGPT disconnect cancels an unfinished sign-in and removes its record.

Claude uses the official, unmodified Claude Code executable. The person installs
it and runs `claude` in Terminal to sign in themselves. Aegis never reads or
writes Claude's credential files or keychain. `claude-code.ts` searches PATH,
`~/.local/bin`, `/opt/homebrew/bin` and `/usr/local/bin`. `AEGIS_CLAUDE_BIN` selects
one exact executable for disposable checks. An unavailable override never falls
back to a real installation.

`GET /auth` reports `openai` and `claude`. Claude has `missing`, `signed-out` or
`ready` state and a version. Discovery uses asynchronous `--version` and
`auth status --json`, falling back to `auth status` for older CLIs. Failures mean
signed out. Each probe times out after three seconds, concurrent probes share
one promise, and successful results are cached for five seconds.
`POST /auth/claude/refresh` refreshes the cache and publishes an auth event.
Claude models are the `sonnet`, `opus` and `haiku` CLI aliases when ready.
The former `anthropic` OAuth route and provider catalogue are removed.

## Claude Code adapter

A small custom pi-ai provider is cleaner than a second conversation engine:
Pi Durable still owns OpenAI and Claude conversation records, follow-ups,
cancellation, window snapshots and streaming. On each Claude turn the adapter
passes the text transcript on stdin, appends Aegis's prompt sections, and reads
print-mode `stream-json` deltas. It also supports document rewrites. No session
ids or Claude tokens are copied into Pi. Pi's ambient-authorisation interface is
named `apiKey`; the adapter returns empty authorisation only when the CLI is
ready and has no key login or credential store.

Claude executes its own tools inside its process. `--mcp-config` uses the same
configuration as `mcp-config.ts`, with `--strict-mcp-config`. The explicit
`--allowedTools` list contains only the Aegis MCP tools. Built-in CLI tools are
disabled with `--tools ''`, and external settings sources are disabled. Board
writes still use MCP revision checks and the audited board command path.
The CLI runs in a private `DATA/claude-code` directory, with only HOME, PATH,
USER, LOGNAME, SHELL, TMPDIR, LANG and LC_ALL from its environment. It receives
no Aegis token or API secrets in its environment. The MCP subprocess discovers
the local bridge token through its existing private connection file.

Inference times out after three minutes and caps output at 8 MiB. The Effect
lifetime owns each process and kills its process group on cancel or shutdown.
Rewrite requests pass their HTTP cancellation signal through the adapter and
load an empty MCP configuration, so passage rewrites cannot change the board.
Each turn uses its own private configuration file, removed when the process ends.

Limits: this is a text adapter. Claude's internal tool traces are not Pi tool
calls, so its board changes are attributed as local MCP changes and use board
Undo, rather than Pi request-level Undo. Pi helper delegation and native image
transcript input are unavailable through this adapter. Claude can read attached
sources using MCP. No self-extending tool system is implemented in phase 1.

## Profile and introduction

The shared domain profile schema validates `DATA/profile.json`: version 1,
optional name, role, workflow, goals, canvasHelp and notes, plus a numeric
`updatedAt`. Writes are serial and atomic with private file permissions.
`GET /profile`, `POST /profile` (replacement) and `POST /profile/reset` require
the normal host token. Replacement accepts fields or a full returned profile;
the host owns the version and update time.

`profile_update` merges supplied fields and is available both to Pi runs and
MCP clients. Every run receives the saved profile in a separate prompt section,
including Claude's appended system prompt. Document rewrites receive it as data.
The app starts a welcome conversation once a provider is ready, resumes an
unfinished introduction locally, and marks completion after a profile is saved.
Settings can reset the profile and introduction. The AI learns about the person
and explains what it will set up next; it builds no tools or workflows yet.

## Checks

Use disposable `AEGIS_DATA` and `AEGIS_VITE_CACHE` folders. Provider checks use
`AEGIS_FAKE_MODEL` and copies of `checks/fixtures/claude.mjs`, never a real CLI
installation or provider account. The fake model recognises the welcome brief
and supports `profile_update` through `FAKETOOLS`.

```sh
npm run check
node --test checks/host/open-canvas.test.ts checks/host/claude-adapter.test.ts
node checks/ui/run.mjs open-canvas
```

The existing check command discovers all host tests, including these additions.
The UI suite runs Chromium by default; `AEGIS_CHECK_WEBKIT=1` also tries WebKit
and skips it if its executable or system dependencies are unavailable.
