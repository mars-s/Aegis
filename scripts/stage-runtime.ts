import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";

const PackageSchema = z.object({ name: z.string(), dependencies: z.record(z.string(), z.string()).optional() });
const marker = ".aegis-staged-runtime";
const workspaces = ["agent", "packages/domain", "packages/protocol"] as const;

function copyTree(source: string, destination: string): void {
  cpSync(source, destination, { recursive: true, verbatimSymlinks: true });
}

function assertContainedLinks(root: string, directory = root): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const destination = relative(root, realpathSync(path));
      if (destination === ".." || destination.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(destination)) {
        throw new Error(`Runtime symlink escapes staging directory: ${relative(root, path)}`);
      }
    } else if (entry.isDirectory()) assertContainedLinks(root, path);
  }
}

export function stageRuntime(args: { readonly root: string; readonly destination: string }): void {
  const root = realpathSync(args.root);
  const destination = resolve(args.destination);
  if (destination === root || root.startsWith(destination + "/")) throw new Error("Runtime output must not replace the checkout.");
  if (existsSync(destination)) {
    if (!existsSync(join(destination, marker))) throw new Error("Runtime output already exists without a staging marker.");
    rmSync(destination, { recursive: true });
  }
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, marker), "Aegis staged runtime\n");
  writeFileSync(join(destination, "package.json"), JSON.stringify({ private: true, type: "module", workspaces }, null, 2) + "\n");
  for (const workspace of workspaces) {
    const source = join(root, workspace);
    const target = join(destination, workspace);
    mkdirSync(target, { recursive: true });
    copyTree(join(source, "package.json"), join(target, "package.json"));
    const raw: unknown = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
    const metadata = PackageSchema.parse(raw);
    if (workspace === "agent") {
      copyTree(join(source, "skills"), join(target, "skills"));
      if (!existsSync(join(source, "dist/main.js"))) throw new Error("Agent host has no built entry. Run npm run build:shared first.");
      copyTree(join(source, "dist"), join(target, "dist"));
    } else {
      if (!existsSync(join(source, "dist"))) throw new Error(`${workspace} has no built ESM. Run npm run build:shared first.`);
      copyTree(join(source, "dist"), join(target, "dist"));
    }
    if (existsSync(join(source, "node_modules"))) copyTree(join(source, "node_modules"), join(target, "node_modules"));
    // The Tauri bundler drops symlinks when it copies resources, so the installed app would lose
    // its own packages. Copy each library package to where Node resolves it instead.
    if (workspace !== "agent") {
      const installedPackage = join(destination, "node_modules", metadata.name);
      mkdirSync(dirname(installedPackage), { recursive: true });
      copyTree(target, installedPackage);
    }
    // Nested workspace installs can share production dependencies with the root.
    for (const dependency of Object.keys(metadata.dependencies ?? {})) {
      if (dependency.startsWith("@aegis/")) continue;
      if (existsSync(join(source, "node_modules", dependency))) continue;
      const installed = join(root, "node_modules", dependency);
      if (!existsSync(installed)) throw new Error(`Missing installed production dependency ${dependency}. Run npm ci.`);
      const output = join(destination, "node_modules", dependency);
      if (!existsSync(output)) copyTree(installed, output);
    }
  }
  copyTree(join(root, "plugins/aegis"), join(destination, "plugins/aegis"));
  for (const file of readdirSync(root)) {
    if (file.startsWith("LICENSE") && lstatSync(join(root, file)).isFile()) copyTree(join(root, file), join(destination, file));
  }
  assertContainedLinks(destination);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const requested = process.argv[2];
  stageRuntime({ root, destination: requested ?? join(root, "runtime") });
  process.stdout.write(`Staged runtime at ${resolve(requested ?? join(root, "runtime"))}\n`);
}
