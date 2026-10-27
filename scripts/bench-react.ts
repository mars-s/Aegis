import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { TestFacade } from "../app/src/platform/test-facade.js";
import { withReactBrowser } from "./react-browser.ts";

const output = resolve(process.env.AEGIS_CHECK_OUT ?? "/tmp/aegis-react-bench");
mkdirSync(output, { recursive: true });
const result = await withReactBrowser(async page => ({
  ...await page.evaluate(async () => {
  const facade: TestFacade | undefined = window.aegis;
  if (!facade) throw new Error("Missing test facade");
  return facade.benchmark(5000);
  }),
  browser: page.context().browser()?.version() ?? "unavailable",
  viewport: page.viewportSize(),
  dpr: await page.evaluate(() => devicePixelRatio),
  node: process.version,
  build: "development",
  pacing: process.env.AEGIS_HEADED === "1" ? "headed, display refresh unverified" : "headless, display refresh unverified",
}));
const comparison = {
  suppliedMain: { p50: 9.3, p95: 21.3, max: 13800 },
  untouchedFoundation: { p50: 8.7, p95: 33.5, max: 13318.8 },
  beatsSuppliedMain: result.interval.p50 < 9.3 && result.interval.p95 < 21.3 && result.interval.max < 13800,
};
writeFileSync(join(output, "react-benchmark.json"), JSON.stringify({ ...result, comparison }, null, 2) + "\n");
process.stdout.write(JSON.stringify({ ...result, samples: undefined, comparison, output }) + "\n");
assert.ok(comparison.beatsSuppliedMain, "React benchmark must beat the supplied main intervals");
