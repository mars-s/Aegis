import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const marker = ".aegis-ui-snapshot";

export function viteModule(repo: string): string {
  return createRequire(join(repo, "app/package.json")).resolve("vite");
}

export function viteExecutable(repo: string): string {
  const metadata = createRequire(join(repo, "app/package.json")).resolve("vite/package.json");
  return join(dirname(metadata), "bin/vite.js");
}

/** A complete frozen workspace, including the lockfile's actual module layout. */
export function createUiSnapshot(repo: string, prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const app = join(root, "app");
  mkdirSync(app);
  writeFileSync(join(root, marker), "Aegis UI check snapshot\n");
  for (const name of ["package.json", "package-lock.json", ".npmrc", "tsconfig.base.json", "tsconfig.json", "node_modules", "packages", "scripts"]) {
    const source = join(repo, name);
    if (existsSync(source)) cpSync(source, join(root, name), { recursive: true, verbatimSymlinks: true });
  }
  // Keep the agent workspace link resolvable without copying its runtime or data.
  mkdirSync(join(root, "agent"));
  cpSync(join(repo, "agent/package.json"), join(root, "agent/package.json"));
  for (const name of ["src", ...(process.env.AEGIS_BROWSER_BUILD === "production" ? ["dist"] : []), "index.html", "package.json", "tsconfig.json", "tsconfig.react.json", "vite.config.ts", "svelte.config.js", "public", "node_modules"]) {
    const source = join(repo, "app", name);
    if (existsSync(source)) cpSync(source, join(app, name), { recursive: true, verbatimSymlinks: true });
  }
  renameSync(join(app, "vite.config.ts"), join(app, "vite.snapshot-base.config.ts"));
  writeFileSync(join(app, "vite.config.ts"), `import {mergeConfig} from 'vite';\nimport base from './vite.snapshot-base.config.ts';\nexport default mergeConfig(base,{server:{fs:{allow:[${JSON.stringify(root)},${JSON.stringify(realpathSync(root))}]}}});\n`);
  return app;
}

export function disposeUiSnapshot(app: string): void {
  const root = dirname(app);
  if (readFileSync(join(root, marker), "utf8") !== "Aegis UI check snapshot\n") throw new Error("Not an owned UI snapshot.");
  rmSync(root, { recursive: true });
}
