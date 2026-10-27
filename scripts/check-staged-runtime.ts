import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";

const ReadySchema = z.object({ aegis: z.literal("ready"), port: z.int().positive() });
const BoardProbeSchema = z.object({
  id: z.string(), rev: z.int().nonnegative(),
  cards: z.array(z.object({ id: z.string(), type: z.string(), text: z.string() })),
});

export async function checkStagedRuntime(staged: string): Promise<void> {
  const relocated = join(mkdtempSync(join(tmpdir(), "aegis-runtime-relocated-")), "runtime");
  cpSync(staged, relocated, { recursive: true, verbatimSymlinks: true });
  const script = join(relocated, "agent/server.mjs");
  assert.ok(existsSync(script), "staged host entry exists");
  const token = randomUUID();
  const isolated = process.platform === "darwin";
  const child = spawn(isolated ? "/usr/bin/sandbox-exec" : process.execPath,
    isolated ? ["-p", "(version 1)(allow default)(deny network-outbound)", process.execPath, "--no-warnings", script] : ["--no-warnings", script], {
      cwd: relocated,
      env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), "aegis-runtime-data-")), AEGIS_VITE_CACHE: mkdtempSync(join(tmpdir(), "aegis-runtime-cache-")), AEGIS_PORT: "0", AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: "1", AEGIS_PRINT_TOKEN: "", AEGIS_PARENT_PIPE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
  let diagnostics = "";
  child.stderr.on("data", (chunk: Buffer) => { diagnostics = (diagnostics + chunk.toString()).slice(-8000); });
  try {
    const port = await new Promise<number>((done, fail) => {
      const timer = setTimeout(() => fail(new Error(`Relocated host did not start: ${diagnostics}`)), 20000);
      let output = "";
      const exit = (code: number | null): void => { clearTimeout(timer); fail(new Error(`Relocated host exited ${code}: ${diagnostics}`)); };
      child.once("exit", exit);
      child.once("error", error => { clearTimeout(timer); fail(error); });
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        for (;;) {
          const newline = output.indexOf("\n");
          if (newline < 0) break;
          const line = output.slice(0, newline);
          output = output.slice(newline + 1);
          let raw: unknown;
          try { raw = JSON.parse(line); } catch { continue; }
          const parsed = ReadySchema.safeParse(raw);
          if (parsed.success) { clearTimeout(timer); child.removeListener("exit", exit); done(parsed.data.port); }
        }
      });
    });
    const call = async (path: string, body?: unknown): Promise<unknown> => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(response.status, 200, `relocated host ${path}`);
      const raw: unknown = await response.json();
      return raw;
    };
    const board = BoardProbeSchema.parse(await call("/boards", { name: "Relocated runtime proof" }));
    await call(`/boards/${board.id}/batch`, { commands: [{ op: "create", newId: "runtimeproof", type: "note", text: "Saved outside checkout", x: 10, y: 20 }] });
    const saved = BoardProbeSchema.parse(await call(`/boards/${board.id}`));
    assert.equal(saved.cards.find(card => card.id === "runtimeproof")?.text, "Saved outside checkout");
    assert.equal(saved.rev, board.rev + 1);
    process.stdout.write(JSON.stringify({ ok: true, relocated, outboundNetwork: isolated ? "denied by macOS sandbox" : "not restricted", proof: "ready, authenticated board creation, command persistence and reload" }) + "\n");
  } finally {
    child.stdin.end();
    if (child.exitCode === null) {
      await new Promise<void>(done => {
        const timer = setTimeout(() => { child.kill("SIGTERM"); done(); }, 3000);
        child.once("exit", () => { clearTimeout(timer); done(); });
      });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkStagedRuntime(resolve(process.argv[2] ?? fileURLToPath(new URL("../runtime", import.meta.url))));
}
