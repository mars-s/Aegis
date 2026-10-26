/** Rasterise authored SVGs with Chromium. No network or app runtime is used. */
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT;
const { chromium } = modulePath ? await import(pathToFileURL(resolve(modulePath))) : require('playwright');
const jobs = JSON.parse(await readFile(process.argv[2], 'utf8'));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.route('**/*', route => route.abort());
  for (const { source, output, size } of jobs) {
    const svg = await readFile(source, 'utf8');
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await mkdir(resolve(output, '..'), { recursive: true });
    await page.screenshot({ path: output, omitBackground: true });
  }
} finally {
  await browser.close();
}
