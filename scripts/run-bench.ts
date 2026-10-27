import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uiImplementation } from "./ui-implementation.ts";

process.env.AEGIS_DATA ??= mkdtempSync(join(tmpdir(), "aegis-bench-data-"));
process.env.AEGIS_VITE_CACHE ??= mkdtempSync(join(tmpdir(), "aegis-bench-vite-"));
const implementation = uiImplementation(process.env.AEGIS_UI_IMPL);
await import(new URL(implementation === "react" ? "./bench-react.ts" : "../checks/ui/bench.mjs", import.meta.url).href);
