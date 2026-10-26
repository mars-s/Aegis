// Playwright is not a project dependency, so a check run does not pull a browser into the app.
// Set PLAYWRIGHT to its index.mjs, or install it anywhere Node can resolve it.
const from = process.env.PLAYWRIGHT;
const playwright = from ? await import(from) : await import('playwright').catch(() => {
  throw new Error('Playwright not found. Run: npm i -g playwright && npx playwright install chromium, or set PLAYWRIGHT=/path/to/playwright/index.mjs');
});
export const chromium = playwright.chromium ?? playwright.default.chromium;

export const webkit = playwright.webkit ?? playwright.default.webkit;
