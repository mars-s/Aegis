// This Playwright build does not poll an async waitForFunction predicate after it resolves false.
// Await each evaluation before deciding whether the host has reached the expected state.
export async function waitForAsync(page, predicate, arg, { timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await page.evaluate(predicate, arg);
    if (value) return value;
    await page.waitForTimeout(60);
  }
  throw new Error(`Host state did not settle within ${timeout} ms: ${String(predicate).slice(0, 160)}`);
}
