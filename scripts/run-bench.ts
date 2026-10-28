import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.AEGIS_DATA ??= mkdtempSync(join(tmpdir(), "aegis-bench-data-"));
process.env.AEGIS_VITE_CACHE ??= mkdtempSync(join(tmpdir(), "aegis-bench-vite-"));
await import(new URL("./bench-react.ts", import.meta.url).href);
