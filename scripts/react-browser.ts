import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { viteExecutable } from "../checks/support/ui-snapshot.ts";
import type { Page } from "playwright";

export async function withReactBrowser<T>(run: (page: Page) => Promise<T>): Promise<T> {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const token = `react-foundation-${process.pid}`;
  const offset = Number(process.env.AEGIS_PORT_OFFSET ?? 4100);
  const webPort = 5189 + offset;
  const data = mkdtempSync(join(tmpdir(), "aegis-react-data-"));
  const cache = mkdtempSync(join(tmpdir(), "aegis-react-vite-"));
  const environment = {
    ...process.env,
    AEGIS_DATA: data,
    AEGIS_VITE_CACHE: cache,
    AEGIS_TOKEN: token, AEGIS_PORT: "0", AEGIS_FAKE_MODEL: "1", AEGIS_UI_IMPL: "react", AEGIS_TEST_FACADE: "1", AEGIS_PRINT_TOKEN: "",
  };
  const host = spawn(process.execPath, ["--no-warnings", "dist/main.js"], { cwd: join(root, "agent"), env: environment, stdio: ["ignore", "pipe", "pipe"] });
  let web: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  const errors: string[] = [];
  function ready(child: ChildProcess, pattern: RegExp): Promise<string> {
    return new Promise((done, fail) => {
      let output = "";
      const timer = setTimeout(() => fail(new Error(`Process startup timed out: ${output.slice(-5000)}`)), 20000);
      child.once("error", error => { clearTimeout(timer); fail(error); });
      child.once("exit", code => { clearTimeout(timer); fail(new Error(`Process exited ${code}: ${output.slice(-5000)}`)); });
      const receive = (chunk: Buffer): void => {
        output += chunk.toString();
        const match = pattern.exec(output);
        if (match?.[1]) { clearTimeout(timer); done(match[1]); }
      };
      child.stdout?.on("data", receive);
      child.stderr?.on("data", receive);
    });
  }
  try {
    const port = await ready(host, /"port":(\d+)/);
    const preview = process.env.AEGIS_BROWSER_BUILD === "production" ? ["preview"] : [];
    web = spawn(process.execPath, [viteExecutable(root), ...preview, "--port", String(webPort), "--strictPort"], { cwd: join(root, "app"), env: environment, stdio: ["ignore", "pipe", "pipe"] });
    await ready(web, /Local:.*:(\d+)/);
    browser = await chromium.launch({ headless: process.env.AEGIS_HEADED !== "1" });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("aegis:onboarded", "1");
      localStorage.setItem("aegis:orb-hint-seen", "1");
    });
    await page.goto(`http://127.0.0.1:${webPort}/?port=${port}&token=${token}`);
    await page.waitForFunction(() => window.aegis?.canvas.board);
    const result = await run(page);
    assert.deepEqual(errors, [], "no browser errors");
    return result;
  } finally {
    await browser?.close();
    await Promise.all([stop(web), stop(host)]);
    rmSync(data, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
}

async function stop(child: ChildProcess | null): Promise<void> {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>(done => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 4000);
    child.once("exit", () => { clearTimeout(timer); done(); });
    child.kill("SIGTERM");
  });
}
