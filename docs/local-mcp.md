# Local MCP for Codex and Claude

Create a board in Aegis and drop or paste your PDFs, PowerPoint slides or
Keynote files onto it. Connect a local Codex or Claude session, then ask it to read the
sources, draw explanations, organise cards or write an editable document.
Your changes and the session's changes appear on the same live board.

## Connect

Keep Aegis open. In **Settings > Integrations**, choose one connection:

- **Copy Codex command** registers the stdio server with Codex. Paste it into
  a terminal, then reload Codex's MCP servers or start a new Codex session.
- **Copy Codex configuration** gives the TOML entry for Codex's
  `mcp_servers.aegis` configuration. Add it to the active Codex config file,
  preserving any existing settings. This is different from the JSON used by
  other MCP clients.
- **Copy Claude Code command** registers the stdio server with Claude Code.
  Paste the command into a terminal, then start a new Claude session.
- **Copy plugin launch command** starts Claude Code with the local plugin and
  its `/aegis:board` skill. It includes the same MCP tools.
- **Copy MCP configuration** gives a `mcpServers` entry for Claude Desktop or
  another stdio MCP client. Merge it with the client's existing configuration,
  then restart that client. The exact configuration location depends on the client.

Use either the plugin or the standalone connection in a session. The copied
configuration uses absolute Node and bridge paths and includes `AEGIS_DATA`,
so it works with development launches and custom data folders. The Claude
plugin directory is self-contained and needs no npm install. Its `node`
command must be on the client's PATH. The standalone connection uses a private
bridge installed in the Aegis data folder. Its path stays the same when the
app bundle moves or is replaced. Each app launch updates that bridge.

Codex reads the same source text, slide images and drawing properties as
Claude. It can create and edit cards, move individual windows, arrange groups
in rows, columns or grids, connect them, and write editable documents. The
server's tool descriptions include the board workflow, so the standalone
Codex connection does not require the Claude plugin skill.

Example request: "Read my lecture slides and assignment specification on the
FIT board. Make revision notes in a document, add a checklist of requirements,
and draw how the main concepts connect. Cite the source cards."

## Tools and resources

| Tool | What it does |
| --- | --- |
| `board_list` | Lists boards, projects and folders |
| `board_create` | Creates a board in an optional project or folder |
| `board_read` | Pages through card previews, positions, links and the board revision |
| `board_search` | Searches full document text, slide text, notes, checklists and object data |
| `card_read` | Reads text or the editable card JSON, with character pagination and source assets |
| `board_apply` | Applies up to 500 commands atomically for cards, documents, slides, shapes, paths, connections and layouts |
| `document_write` | Creates or replaces an editable Markdown document |
| `library_apply` | Creates, renames, moves or removes empty project and folder entries |
| `object_schema` | Reads exact data shapes for diagrams, charts, sheets and other object kinds |
| `asset_read` | Reads attached page images, pictures or original file bytes |

`aegis://guide` describes commands and feature card types. `aegis://boards`
lists the library. Board, card and asset resource templates use
`aegis://boards/{boardId}`, `/cards/{cardId}` and `/assets/{name}`.
The `study_board` prompt helps a session read sources before creating notes.

Board reads return `rev`. Edits to existing content require `expectedRev`.
If someone changes the board first, the edit fails without changing anything.
Read again and propose the edit against the new content. Related commands
belong in one batch; use `ref` on creates and `$ref` in later commands.

Document text updates clear the old rich editor representation, so the canvas,
open editor and MCP reads agree. A complete body replacement resets its rich
formatting. For precise rich edits, read the card JSON and update `props.doc`
and its plain `props.body` mirror together. Imported page images and the
original file remain attached when only the body changes.

## Local connection

The app exposes authenticated Streamable HTTP at `http://127.0.0.1:<port>/mcp`.
The port and launch token are stored in `mcp-connection.json` in the data
folder, with file mode `0600`. The stdio plugin reads this file for every
request and forwards to that loopback address. App restarts therefore work
without putting a launch token into client configuration. Normal shutdown
removes the connection file. A stale file after a forced quit gives a clear
connection error until the app starts again.

HTTP requests require the app bearer token. Requests from a browser origin
other than the app's own loopback origin are refused. The endpoint is stateless;
client conversations remain in the MCP client. Canvas changes use the normal
board lock, validation, atomic save and live event broadcast. The bridge
cannot run shell commands or read arbitrary local paths.

Connected clients can read and change all boards in that data folder. The
client decides which content to send to its model provider. The integration
does not add an Aegis cloud service.

## Limits

PDFs and PPTX slides use Aegis's existing import conversion. Keynote uses its
available previews. Scanned PDFs and image-only slides may need `asset_read`
to view the source. No OCR or original slide-layout reconstruction is added.
Images return MCP image content. Original PDFs and presentation files return
MCP resource bytes, whose display support depends on the client.

Text reads default to 20,000 characters and support up to 50,000 per call.
Follow `nextOffset` to continue. Asset reads allow up to 20 MB per call;
read text or individual page images for larger source files. This connection
uses files already imported onto the board. It does not import arbitrary
filesystem paths on the client's behalf.

## Verify

```sh
npm run check
npm --prefix app run build
PLAYWRIGHT=/path/to/playwright/index.mjs node checks/ui/mcp.mjs
claude plugin validate --strict plugins/aegis
# On macOS, after npm run build:
node checks/native/mcp.mjs
# Verify the installed Codex client, without a model turn or saved chat:
AEGIS_MCP_CLIENT=codex PLAYWRIGHT=/path/to/playwright/index.mjs node checks/ui/mcp.mjs
AEGIS_MCP_CLIENT=codex node checks/native/mcp.mjs
```

The host checks connect real SDK clients over both HTTP and stdio, including
a copied plugin with no dependencies. They check atomic writes, revision
conflicts, pagination, assets, authentication and restart discovery. The UI
check uses temporary data and real PDF/PPTX fixtures with the production UI.
It checks live edits in both directions, the open document editor, Settings
copy actions, phone layout and persisted content after reload.
The native check launches the built Mac app with disposable data and verifies
the bundled plugin can read and save an editable document through MCP.
With `AEGIS_MCP_CLIENT=codex`, these checks use the installed Codex app-server
and its MCP tool and resource calls. They use a temporary workspace, an
ephemeral session and an Aegis-only MCP override. They do not change the user's
Codex settings or run a model. The UI check also verifies saved and visible
positions after individual moves and a group layout.

The server uses the MIT-licensed `@modelcontextprotocol/sdk` 1.32.2 and Zod
4.6.7. The implementation follows the SDK's [stateless HTTP example](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/examples/server/simpleStatelessStreamableHttp.ts)
and Claude Code's [plugin manifest reference](https://code.claude.com/docs/en/plugins-reference).
Codex setup follows the [official MCP configuration documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
