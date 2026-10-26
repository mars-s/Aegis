# Aegis for Claude Code

Use Claude with your running local Aegis app. It can read imported PDFs and
PowerPoint slides, view page images, make cards and drawings, and create
documents you can edit in Aegis.

Open Aegis, then copy the plugin launch command from **Settings > Integrations**.
It starts Claude Code with this plugin and the app's current data folder.
Use `/aegis:board` or ask Claude to work on an Aegis board.

For an existing Claude Code setup or another MCP client, copy the MCP command
or configuration from the same settings page. Install either the plugin or
the standalone MCP connection to avoid exposing the tools twice.

The plugin has no npm dependencies. Its stdio bridge reads the app's private
connection file on every call, so it follows port and token changes after an
app restart. Keep Aegis open while using the tools. A custom data folder needs
`AEGIS_DATA` in the client environment, as shown in the copied configuration.

The bridge connects only to `127.0.0.1`. It forwards requests to the app, which
checks and saves each change through the same commands as the canvas.
Connected sessions can read and change all boards in that data folder.
Claude processes the content you ask it to read through your Claude account.

See [the integration guide](../../docs/local-mcp.md) for tools, limits and checks.
