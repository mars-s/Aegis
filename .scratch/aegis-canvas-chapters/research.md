# Research: generative UI, data, wireframes for Aegis

Checked 2026-10-25. Sources are primary where possible. Versions and licences come from `npm view` and the GitHub API on that date.

## pen.dev (was Pencil)

- pen.dev calls itself "an agentic canvas". It works with ChatGPT or Claude subscriptions, API keys, MCP, WebMCP or a CLI. It has a custom WebGL renderer, HTML and Figma import, components, variables and a built-in browser. Source: https://www.pen.dev/ (fetched page text).
- It is free while in early access. The `.pen` format is documented JSON, but the app is not open source. Source: https://open-design.ai/alternatives/pencil-dev/ and https://www.therundown.ai/tools/pencil
- Open alternatives:
  - **OpenPencil** `open-pencil/open-pencil`: MIT, about 9.2k stars, pushed 2026-10-24. Opens `.fig` and `.pen`, has built-in AI with 100+ tools, a CLI and a headless Vue SDK. https://github.com/open-pencil/open-pencil
  - **openpencil** `ZSeven-W/openpencil`: MIT, about 6.6k stars, pushed 2026-10-24. Concurrent agent teams, embeddable read-only viewer SDK, imports kits from `.pen`. https://github.com/ZSeven-W/openpencil
  - **Penpot**: open source, web and self-hosted. Heavy for a local canvas app.

Takeaway: do not rebuild a vector design tool. Make wireframes a card kind on the Aegis canvas, built from the same UI catalogue as data views. Keep OpenPencil as the escape hatch for real design files.

## Generative UI options

| Option | What it is | Licence | Fit for Aegis |
| --- | --- | --- | --- |
| json-render (Vercel Labs) | Catalogue of components defined with Zod. The model emits a flat JSON spec, streamed, rendered by React, Vue, Svelte and others. Has `$state` and `$computed` bindings. `@json-render/core` 0.21.3. | Apache-2.0 | Good model of the idea. Renderers need a framework and build step. Aegis is plain ESM today. |
| A2UI (Google) | Protocol: `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`. Flat component list plus a separate data model. Client owns the catalogue. Transport-agnostic. | Apache-2.0 | Best shape for agent-to-canvas messages. Easy to render with vanilla DOM. |
| AG-UI | Event transport between agent and UI. Carries A2UI. Not a renderer. | open | Not needed: Pi Durable plus SSE already carry events. |
| MCP Apps (SEP-1865, final 2026-01-26) | Tools point at `ui://` HTML resources. Host renders them in a sandboxed iframe and talks JSON-RPC over `postMessage`. Network denied unless declared in CSP. ChatGPT, Claude, VS Code and Goose render them. | open spec | Best escape hatch for "anything goes" cards, and lets Aegis show UIs from MCP servers such as LifeOS later. |

Sources:
- https://github.com/vercel-labs/json-render and https://www.infoq.com/news/2026/03/vercel-json-render/
- https://atamel.dev/posts/2026/03-30_a2ui_with_adk/ (message types, v0.9 example)
- https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html
- https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx

What we know about ChatGPT: OpenAI's Apps SDK fed into MCP Apps, and ChatGPT renders MCP Apps. We do not know how ChatGPT's own built-in generative UI works inside, and the spec does not assume it.

## Data libraries

| Library | Version | Licence | Use |
| --- | --- | --- | --- |
| Papa Parse | 5.7.0 | MIT | CSV parsing in a worker, streaming |
| DuckDB-Wasm | 1.33.1-dev57.0 on npm `latest` | MIT | SQL over CSV and Parquet in a worker, for large sets. Dev-tagged build: pin and test before use. Memory heavy. |
| Apache ECharts | 6.1.0 | Apache-2.0 | Charts, canvas renderer, built-in dataset and transforms |
| Vega-Lite | 6.5.0 | BSD-3-Clause | Declarative charts, very model friendly. Alternative to ECharts. |

## Image generation through Pi

`@earendil-works/pi-ai` 1.3.0 as installed has no image generation path in its OpenAI provider. The only image API file is `api/openrouter-images`. Pi Durable has image *input* processing (Photon), not generation. So a "GPT helper generates images with the ChatGPT subscription" flow is unproven. It needs a spike: check the Codex backend for an image tool, or fall back to an API key or OpenRouter.
