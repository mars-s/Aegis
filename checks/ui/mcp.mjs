// Import real files in the production UI, then edit the same board through an external MCP process.
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { waitForAsync } from './poll.mjs';
import { codexMcpClient } from '../mcp/codex-client.ts';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Client } from '../../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const data = await mkdtemp(join(tmpdir(), 'aegis-mcp-ui-'));
const token = `mcp-ui-${process.pid}`;
const host = spawn(process.execPath, ['--no-warnings', 'dist/main.js'], { cwd: repo + '/agent', env: {
  ...process.env, AEGIS_DATA: data, AEGIS_PORT: '0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL: '1', AEGIS_UI: repo + '/app/dist',
}, stdio: ['pipe', 'pipe', 'pipe'] });
let hostErrors = '';
host.stderr.on('data', bytes => { hostErrors += bytes; });
let browser, client;
try {
  const port = await new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('Host startup timed out: ' + hostErrors)), 10000);
    host.stdout.on('data', bytes => {
      text += bytes;
      const match = /"port":(\d+)/.exec(text);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    host.once('exit', code => { clearTimeout(timer); reject(new Error(`Host exited ${code}: ${hostErrors}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/ui/index.html?port=${port}&token=${token}`);
  await page.waitForFunction(() => window.aegis?.canvas.board, null, { timeout: 20000 });
  const boardId = await page.evaluate(() => aegis.canvas.board.id);
  const config = await (await fetch(base + '/integrations/mcp', { headers: { authorization: `Bearer ${token}` } })).json();
  if (process.env.AEGIS_MCP_CLIENT === 'codex') {
    client = await codexMcpClient(config.config);
    console.log('PASS installed Codex app-server connects to Aegis and discovers its board tools');
  }
  else {
    client = new Client({ name: 'external-study-session', version: '1' });
    await client.connect(new StdioClientTransport({ ...config.config.mcpServers.aegis, stderr: 'pipe' }));
  }
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, result.content?.[0]?.text);
    return result.structuredContent;
  };
  // Each retry reads a new revision before proposing the write again.
  const edit = async (name, args) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await call('board_read', { boardId });
      const result = await client.callTool({ name, arguments: { ...args, boardId, expectedRev: current.rev } });
      if (!result.isError) return result.structuredContent;
      assert.match(result.content[0].text, /board changed/);
    }
    throw new Error('Board did not settle after five reads.');
  };
  const imports = [repo + '/checks/fixtures/two-pages.pdf', repo + '/checks/fixtures/two-slides.pptx'];
  {
    const picker = page.waitForEvent('filechooser');
    await page.locator('[data-tool="import-image"]').dispatchEvent('click');
    await (await picker).setFiles(imports);
  }
  await waitForAsync(page, async () => {
    const saved = await aegis.host.get(`/boards/${aegis.canvas.board.id}`);
    return saved.cards.filter(c => c.props?.import).length === 2;
  }, null, { timeout: 30000 });
  const sources = await call('board_read', { boardId });
  const pdf = sources.cards.find(c => c.source?.name === 'two-pages.pdf');
  const slides = sources.cards.find(c => c.source?.name === 'two-slides.pptx');
  assert.ok(pdf && slides, 'Both imported sources must be in the MCP board read.');
  const sourceText = await call('card_read', { boardId, cardId: pdf.id });
  assert.match(sourceText.content, /Original Aegis import fixture/);
  const slideText = await call('card_read', { boardId, cardId: slides.id });
  assert.match(slideText.content, /Slide 1.*Slide 2/s);
  const sourceImage = sourceText.assets.find(a => /\.(jpg|png)$/.test(a.name));
  const image = await client.callTool({ name: 'asset_read', arguments: { boardId, name: sourceImage.name } });
  assert.equal(image.content[0].type, 'image');
  const original = await client.readResource({ uri: sourceText.assets.find(a => a.name.endsWith('.pdf')).uri });
  assert.equal(Buffer.from(original.contents[0].blob, 'base64').subarray(0, 4).toString(), '%PDF');
  console.log('PASS actual PDF/PPTX imports are readable as text, numbered slides, page images and original bytes through external MCP');

  const doc = await call('document_write', { boardId, title: 'Study notes', body: '## Source notes\nRead the lecture and specification together.', x: 0, y: 750 });
  const drawing = await edit('board_apply', { commands: [
    { op: 'create', type: 'shape', text: 'Lecture', props: { shape: 'rect' }, x: 820, y: 760, ref: 'lecture' },
    { op: 'create', type: 'shape', text: 'Revision', props: { shape: 'circle' }, x: 1080, y: 760, ref: 'revision' },
    { op: 'connect', a: '$lecture', b: '$revision', label: 'review' },
    { op: 'create', type: 'note', text: 'Read the original sources first.', x: 820, y: 970, ref: 'reminder' },
  ] });
  await page.waitForFunction(id => aegis.canvas.board.cards.some(c => c.id === id), doc.cardId);
  await page.waitForFunction(id => aegis.canvas.board.cards.some(c => c.id === id), drawing.created.revision);
  await edit('board_apply', { commands: [
    { op: 'move', id: drawing.created.reminder, x: 840, y: 1000 },
    { op: 'layout', ids: [drawing.created.lecture, drawing.created.revision], shape: 'row', x: 800, y: 760 },
  ] });
  const arranged = await call('board_read', { boardId });
  assert.equal(arranged.cards.find(c => c.id === drawing.created.reminder).x, 840);
  assert.deepEqual(arranged.cards.filter(c => [drawing.created.lecture, drawing.created.revision].includes(c.id)).map(c => [c.x, c.y]), [[800, 760], [1004, 760]]);
  await page.waitForFunction(ids => {
    const cards = aegis.canvas.board.cards;
    return cards.find(c => c.id === ids.reminder)?.x === 840 && cards.find(c => c.id === ids.revision)?.x === 1004;
  }, drawing.created);
  await page.evaluate(id => aegis.canvas.frameIds([id], 1), doc.cardId);
  await page.locator(`.card[data-id="${doc.cardId}"]`).dblclick();
  await page.waitForFunction(() => document.querySelector('.docs-prose')?.textContent.includes('Read the lecture'));
  await page.locator('.docs-prose').click();
  await page.locator('.docs-prose').press('ControlOrMeta+End');
  await page.keyboard.type(' Added by hand.');
  await page.waitForFunction(() => document.querySelector('.docs-panel [data-saved]')?.textContent === 'Saved');
  const edited = await call('card_read', { boardId, cardId: doc.cardId });
  assert.match(edited.content, /Added by hand/);
  await edit('document_write', { cardId: doc.cardId, body: '## Updated notes\nRevision from the external session.' });
  await page.waitForFunction(() => document.querySelector('.docs-prose')?.textContent.includes('Revision from the external session.'));
  await edit('document_write', { cardId: doc.cardId, body: '## Final notes\nA second external edit remains visible.' });
  await page.waitForFunction(() => document.querySelector('.docs-prose')?.textContent.includes('A second external edit remains visible.'));
  await page.screenshot({ path: out('mcp-editable-document.png') });
  await page.getByLabel('Close document', { exact: true }).click();
  await page.evaluate(() => aegis.canvas.fit());
  await page.screenshot({ path: out('mcp-board.png') });
  console.log('PASS MCP creates, moves and layouts appear live, handwritten edits return through MCP, and repeated external edits refresh the open document');

  await page.mouse.move(1500, 20);
  await page.locator('#settingsBtn').click();
  await page.getByRole('tab', { name: 'Integrations', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.integration-status')?.textContent.startsWith('Ready.'));
  await page.getByRole('button', { name: 'Copy MCP configuration', exact: true }).click();
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(copied.mcpServers.aegis.env.AEGIS_DATA, data);
  assert.ok(!JSON.stringify(copied).includes(token));
  await page.getByRole('button', { name: 'Copy Codex command', exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), config.codexCommand);
  await page.getByRole('button', { name: 'Copy Codex configuration', exact: true }).click();
  const codexConfig = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(codexConfig, config.codexConfig);
  assert.match(codexConfig, /\[mcp_servers\.aegis\]/);
  await page.screenshot({ path: out('mcp-integrations.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Integrations', exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#settings-integrations').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await page.screenshot({ path: out('mcp-integrations-phone.png') });
  await page.locator('#closeSettings').click();
  await page.reload(); await page.waitForFunction(() => window.aegis?.canvas.board);
  assert.match((await call('card_read', { boardId, cardId: doc.cardId })).content, /second external edit/);
  assert.deepEqual(errors, []);
  console.log('PASS Settings connection copy, phone layout, persisted content after reload and no page errors');
} finally {
  await client?.close(); await browser?.close();
  if (host.exitCode === null) { const stopped = once(host, 'exit'); host.kill(); await stopped; }
  await rm(data, { recursive: true, force: true });
}
