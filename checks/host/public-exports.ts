/** Compile the emitted host declarations as a consumer, without starting the host. */
export type HostExports = {
  assets: typeof import('../../agent/dist/assets.js');
  boards: typeof import('../../agent/dist/boards.js');
  events: typeof import('../../agent/dist/events.js');
  files: typeof import('../../agent/dist/files.js');
  history: typeof import('../../agent/dist/history.js');
  library: typeof import('../../agent/dist/library.js');
  lifetime: typeof import('../../agent/dist/lifetime.js');
  mcp: typeof import('../../agent/dist/mcp.js');
  content: typeof import('../../agent/dist/mcp-content.js');
  configuration: typeof import('../../agent/dist/mcp-config.js');
  providers: typeof import('../../agent/dist/providers.js');
  runs: typeof import('../../agent/dist/runs.js');
  sandbox: typeof import('../../agent/dist/sandbox.js');
  status: typeof import('../../agent/dist/status.js');
  transcript: typeof import('../../agent/dist/transcript.js');
  ui: typeof import('../../agent/dist/ui-update.js');
};
