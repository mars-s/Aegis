import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { chromium } from 'playwright';
import { z } from 'zod/v4';
import { BoardSchema, JsonRecordSchema } from '@aegis/domain/schema';
import { hostFixture } from './fixture.ts';

const implementation = 'react';
const output = fileURLToPath(new URL('.', import.meta.url));
const evidence = process.env.AEGIS_CHECK_OUT ?? output;
const source = await readFile(new URL('../ui/agent-types.mjs', import.meta.url), 'utf8');
const literal = /const batch = (\[[\s\S]*?)\n\];/.exec(source)?.[1];
if (!literal) throw new Error('Agent feature fixture was not found');
const raw: unknown = runInNewContext(literal + '\n]');
const commands = z.array(JsonRecordSchema).parse(raw);
const host = await hostFixture({ ui: fileURLToPath(new URL('../../app/dist/', import.meta.url)) });
const browser = await chromium.launch();
try {
  await mkdir(evidence, { recursive: true });
  const board = BoardSchema.parse(await host.json('/boards', { name: 'Host parity fixture' }));
  await host.json('/agents', { boardId: board.id, brief: 'FAKE ' + JSON.stringify(commands), model: { provider: 'fake', modelId: 'fake' } });
  let saved = board;
  for (let attempt = 0; attempt < 100; attempt++) {
    saved = BoardSchema.parse(await host.json('/boards/' + board.id));
    if (saved.cards.length === 12) break;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  if (saved.cards.length !== 12) throw new Error('Feature fixture did not finish');
  const view = { x: 120, y: 70, z: 0.8 };
  await host.json(`/boards/${board.id}/view`, { view });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
  await page.goto(`${host.base}/ui/index.html?port=${new URL(host.base).port}&token=${host.token}`);
  try { await page.getByText('Member A', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 10000 }); }
  catch (error) { await page.screenshot({ path: join(evidence, `same-state-${implementation}-failed.png`) }); await writeFile(join(evidence, `same-state-${implementation}-failed.txt`), await page.locator('body').innerText()); throw error; }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(evidence, `same-state-${implementation}.png`) });
  await writeFile(join(evidence, `same-state-${implementation}.json`), JSON.stringify({ implementation, viewport: { width: 1600, height: 1000 }, dpr: 1, requestedView: view, seededCommands: commands, board: saved }, null, 2));
} finally { await browser.close(); await host.close(); }
