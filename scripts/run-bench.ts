import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uiImplementation } from "./ui-implementation.ts";

process.env.AEGIS_DATA ??= mkdtempSync(join(tmpdir(), "aegis-bench-data-"));
process.env.AEGIS_VITE_CACHE ??= mkdtempSync(join(tmpdir(), "aegis-bench-vite-"));
uiImplementation(process.env.AEGIS_UI_IMPL);
await import("./bench-react.ts");
