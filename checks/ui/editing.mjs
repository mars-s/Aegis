import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), TOKEN = 'editing-' + process.pid;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-editing-')), AEGIS_PORT: '0', AEGIS_TOKEN: TOKEN, AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
host.stderr.on('data', d => process.stderr.write(String(d)));
const port = await new Promise(r => host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) r(m[1]); }));
const vite = spawn('npx', ['vite', '--port', '5187', '--strictPort'], { cwd: repo + '/app', stdio: 'pipe' });
await new Promise((r, reject) => { vite.stdout.on('data', d => { if (/Local/.test(String(d))) r(); }); vite.on('exit', reject); });
const browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' }); const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const key = s => page.keyboard.press(s.replaceAll('Mod', mod));
const pause = () => page.waitForTimeout(480);
const board = () => page.evaluate(() => structuredClone(aegis.canvas.board));
const select = async ids => { await page.evaluate(ids => { document.activeElement?.blur(); aegis.canvas.select(ids); document.getElementById('stage').focus(); }, ids); await page.waitForTimeout(70); };
const saved = async () => { await page.waitForFunction(async () => { const b = await aegis.host.get(`/boards/${aegis.canvas.board.id}`); return b.rev === aegis.canvas.board.rev; }); return page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`)); };
try {
  await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
  await page.goto(`http://127.0.0.1:5187/?port=${port}&token=${TOKEN}`); await page.waitForFunction(() => window.aegis?.canvas?.board);
  await page.evaluate(() => aegis.apply([
    { op: 'create', newId: 'noteaa', type: 'note', text: 'First idea', x: -300, y: -100, w: 220, h: 120 },
    { op: 'create', newId: 'notebb', type: 'note', text: 'Second idea', x: 0, y: -40, w: 220, h: 120 },
    { op: 'create', newId: 'todocc', type: 'todo', text: 'Checklist', x: 300, y: 20, items: [{ text: 'First task', done: false }] },
    { op: 'create', newId: 'notedd', type: 'note', text: 'Outside focus', x: 800, y: 100 },
    { op: 'connect', newId: 'linkaa', a: 'noteaa', b: 'notebb' },
  ])); await saved(); await pause();
  await select(['noteaa']); await key('Mod+d'); await pause(); assert.equal((await board()).cards.length, 5);
  await key('Mod+z'); await pause(); assert.equal((await saved()).cards.length, 4);
  await key('Mod+Shift+z'); await pause(); assert.equal((await saved()).cards.length, 5); console.log('undo, redo, duplicate saved');
  await key('Mod+z'); await pause();
  await select(['noteaa']); await page.getByRole('button', { name: 'Bold', exact: true }).click(); await page.getByLabel('Note name', { exact: true }).fill('Named idea'); await page.getByLabel('Note name', { exact: true }).press('Tab'); await page.getByLabel('Label', { exact: true }).fill('Read first'); await page.getByLabel('Label', { exact: true }).press('Tab'); await pause();
  assert.equal((await saved()).cards.find(c => c.id === 'noteaa').props.bold, true); assert.equal((await board()).cards.find(c => c.id === 'noteaa').heading, 'Named idea'); console.log('name, label and formatting saved');
  await select(['noteaa', 'notebb', 'todocc']); await page.getByLabel('Align selection').selectOption('top'); await pause(); const aligned = (await saved()).cards.filter(c => ['noteaa','notebb','todocc'].includes(c.id)); assert.equal(new Set(aligned.map(c => c.y)).size, 1);
  await page.getByLabel('Align selection').selectOption('distribute-x'); await pause(); console.log('align and distribute saved');
  await select(['noteaa','notebb']); await key('Mod+g'); await pause(); assert.ok((await saved()).cards.find(c => c.id === 'noteaa').group);
  await page.evaluate(() => aegis.canvas.setView({ x: 700, y: 350, z: 1 })); await pause();
  let card = page.locator('#world [data-id="noteaa"]'); let r = await card.boundingBox();
  await page.mouse.move(r.x + 15, r.y + r.height - 15); await page.mouse.down(); await page.mouse.move(r.x + 75, r.y + r.height + 25, { steps: 8 }); await page.mouse.up(); await pause();
  let moved = await saved(); assert.equal(moved.cards.find(c => c.id === 'noteaa').x, -240); assert.equal(moved.cards.find(c => c.id === 'notebb').x, 60); console.log('group drag moves both cards');
  await key('Mod+Shift+g'); await pause(); assert.equal((await saved()).cards.find(c => c.id === 'noteaa').group, '');
  await select(['noteaa']); await key('f'); await pause(); assert.equal(await page.locator('#world [data-id="notedd"]').evaluate(el => el.classList.contains('focus-dim')), true); await key('Escape'); await pause(); assert.equal(await page.locator('.card.focus-dim').count(),0);
  await key('Mod+\\'); assert.equal(await page.locator('.show-panels').isVisible(), true); await page.getByText('Show panels', { exact: true }).click(); console.log('focus, clean mode');
  await key('Mod+k'); await page.getByLabel('Capture idea').fill('Captured thought'); await page.getByLabel('Capture idea').press('Enter'); await pause(); assert.equal((await saved()).tray[0].text, 'Captured thought');
  await page.getByRole('button', { name: 'Captured thought', exact: true }).click(); await pause(); assert.equal((await saved()).tray.length, 0); assert.ok((await board()).cards.some(c => c.text === 'Captured thought')); console.log('capture and tray release saved');
  await select(['noteaa']); await key('Mod+c'); await pause(); assert.ok(await page.evaluate(() => localStorage.getItem('aegis:clip')));
  await key('Mod+v'); await pause(); assert.equal((await saved()).cards.filter(c => c.text === 'First idea').length, 2); console.log('OS clipboard paste');
  const original = await board();
  await page.evaluate(() => { document.querySelector('#side [data-panel="layers"] .fold')?.click(); });
  // Expand Layers if it was folded.
  if (!(await page.locator('.layer-list').isVisible())) await page.locator('[data-panel="layers"] .fold').click();
  await page.locator('.layer-row[data-id="notedd"] .layer-action[aria-label^="Hide"]').click(); await pause(); assert.equal((await saved()).cards.find(c => c.id === 'notedd').props.hidden, true); assert.equal(await page.locator('#world [data-id="notedd"]').count(), 0);
  await page.locator('.layer-row[data-id="notedd"] .layer-action[aria-label^="Hide"]').click(); await page.locator('.layer-row[data-id="noteaa"] .layer-action[aria-label^="Lock"]').click(); await pause(); assert.equal((await saved()).cards.find(c => c.id === 'noteaa').props.locked, true);
  await page.locator('.layer-row[data-id="noteaa"] .layer-action[aria-label^="Lock"]').click(); console.log('layer hide, lock saved');
  await select(['noteaa']); await page.evaluate(() => aegis.canvas.frameIds(['noteaa'],1)); await pause();
  const handle = page.getByRole('button', { name: 'Rotate selection', exact: true }); r = await handle.boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2); await page.mouse.down(); await page.keyboard.down('Shift'); await page.mouse.move(r.x+r.width/2+120,r.y+r.height/2+80,{steps:8}); await page.mouse.up(); await page.keyboard.up('Shift'); await pause(); assert.equal((await saved()).cards.find(c => c.id==='noteaa').rot % 15,0); console.log('rotation saved');
  await select(['noteaa','notebb']); await page.getByRole('button', {name:'Collect',exact:true}).click(); await pause(); let collection=(await saved()).cards.find(c=>c.type==='coll'); assert.equal(collection.props.kids.length,2); console.log('collection saved');
  await select(['todocc']); await page.evaluate(()=>aegis.canvas.frameIds(['todocc'],1)); await pause();
  const item=page.locator('#world [data-id="todocc"] .todo-item span').first(); await item.dblclick(); await item.press('End'); await item.press('Enter'); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='todocc').items.length,2);
  await page.keyboard.type('Second task'); await page.keyboard.press('Tab'); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='todocc').items[1].text,'Second task'); assert.equal((await board()).cards.find(c=>c.id==='todocc').items[0].done,false); console.log('checklist insert saved');
  await select(['todocc']); const download=page.waitForEvent('download'); await page.getByRole('button',{name:'PNG',exact:true}).click(); const file=await download; await file.saveAs(out('editing-selection.png')); console.log('PNG downloaded',file.suggestedFilename());
  await key('Mod+0'); await pause(); assert.equal((await page.evaluate(()=>aegis.canvas.view.z)),1);
  await page.getByRole('button',{name:'Zoom menu',exact:true}).click(); await page.getByRole('button',{name:'50%',exact:true}).click(); await pause(); assert.equal(await page.evaluate(()=>aegis.canvas.view.z),.5);
  await key('Shift+1'); await pause();
  await page.screenshot({path:out('editing-overview.png')});
  await page.locator('#settingsBtn').click(); await page.getByRole('tab', { name: 'Toolbar', exact: true }).click(); await page.locator('[data-size]').selectOption('large'); await page.getByRole('checkbox',{name:'Show readme',exact:true}).uncheck(); await page.locator('#closeSettings').click(); assert.equal(await page.locator('[data-tool="readme"]').isVisible(),false); console.log('toolbar preferences applied');
  // Export PDF, verify cloning while dragging, and move a rich selection to another board.
  await select(['todocc']); const pdfDownload=page.waitForEvent('download'); await page.getByRole('button',{name:'PDF',exact:true}).click(); await (await pdfDownload).saveAs(out('editing-selection.pdf'));
  await select(['notedd']); await page.evaluate(()=>aegis.canvas.frameIds(['notedd'],1)); await pause();
  const originalOutside=(await board()).cards.find(c=>c.id==='notedd'), countBefore=(await board()).cards.length; r=await page.locator('#world [data-id="notedd"]').boundingBox();
  await page.keyboard.down('Alt'); await page.mouse.move(r.x+30,r.y+r.height-20); await page.mouse.down(); await page.mouse.move(r.x+90,r.y+r.height+20,{steps:8}); await page.mouse.up(); await page.keyboard.up('Alt'); await pause();
  const cloned=await saved(); assert.equal(cloned.cards.length,countBefore+1); assert.equal(cloned.cards.find(c=>c.id==='notedd').x,originalOutside.x); assert.ok(cloned.cards.some(c=>c.id!=='notedd'&&c.text==='Outside focus'&&c.x===originalOutside.x+60)); console.log('Option drag keeps original and saves clone');
  await select(['noteaa','notebb']); await key('Mod+c'); await pause(); const copied=await page.evaluate(()=>JSON.parse(localStorage.getItem('aegis:clip'))); assert.equal(copied.links.length,1); assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),copied.text);
  const oldBoardId=(await board()).id; await page.locator('[data-add="board"]').click(); await page.waitForFunction(old=>aegis.canvas.board.id!==old,oldBoardId); await pause();
  assert.equal(await page.evaluate(()=>aegis.editing.history.status.undo),false); await select([]); const centre=await page.evaluate(()=>aegis.canvas.centre()); await key('Mod+v'); await pause(); const other=await saved();
  assert.equal(other.cards.length,2); assert.equal(other.links.length,1); assert.ok(other.links.every(l=>other.cards.some(c=>c.id===l.a)&&other.cards.some(c=>c.id===l.b)));
  assert.equal(other.cards.some(c=>c.id==='noteaa'),false); const bx=Math.min(...other.cards.map(c=>c.x)), br=Math.max(...other.cards.map(c=>c.x+c.w)); assert.ok(Math.abs((bx+br)/2-centre.x)<1); console.log('cross-board paste centred and links remapped');
  await select(other.cards.map(c=>c.id)); await key('Mod+x'); await pause(); assert.equal((await saved()).cards.length,0); assert.equal((await saved()).links.length,0); await key('Mod+z'); await pause(); assert.equal((await saved()).cards.length,2); console.log('cut, attached links and undo saved');
  const panel=page.locator('[data-panel="layers"]'); await panel.locator('.fold').click(); const folded=await panel.evaluate(el=>el.classList.contains('folded')); assert.equal(folded,true);
  await page.reload(); await page.waitForFunction(()=>window.aegis?.canvas?.board); assert.equal(await page.locator('[data-panel="layers"]').evaluate(el=>el.classList.contains('folded')),true); assert.equal(await page.locator('[data-tool="readme"]').isVisible(),false); assert.equal((await board()).cards.length,2); assert.equal(await page.evaluate(()=>aegis.editing.history.status.undo),false);
  await page.locator('[data-panel="layers"] .fold').click(); await page.screenshot({path:out('editing-cross-board.png')}); console.log('board state and panel preferences survive reload, history resets');
  // Selection gestures, native text undo and the tray use the same persisted command path.
  await select([]); await page.evaluate(()=>aegis.canvas.setView({x:700,y:350,z:1})); await pause();
  const ids=(await board()).cards.map(c=>c.id); await select([ids[0]]); const targetCard=(await board()).cards.find(c=>c.id===ids[1]); const p=await page.evaluate(c=>aegis.canvas.worldToScreen(c.x,c.y),targetCard);
  await page.keyboard.down('Shift'); await page.mouse.move(p.x-8,p.y-8); await page.mouse.down(); await page.mouse.move(p.x+targetCard.w+8,p.y+targetCard.h+8,{steps:6}); await page.mouse.up(); await page.keyboard.up('Shift'); assert.equal((await page.evaluate(()=>aegis.canvas.selection())).length,2); console.log('Shift marquee retains existing selection');
  await select(ids); await key('Mod+g'); await pause(); await select([]); r=await page.locator(`#world [data-id="${ids[0]}"]`).boundingBox(); await page.keyboard.down(mod); await page.mouse.click(r.x+20,r.y+r.height-15); await page.keyboard.up(mod); assert.deepEqual(await page.evaluate(()=>aegis.canvas.selection()),[ids[0]]); console.log('Command click drills into group');
  await select(ids); await page.getByRole('button',{name:'Collect',exact:true}).click(); await pause(); const parent=(await saved()).cards.find(c=>c.type==='coll');
  const corner=await page.getByRole('button',{name:'Resize selection',exact:true}).boundingBox(); await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2); await page.mouse.down(); await page.mouse.move(corner.x+350,corner.y+40,{steps:6}); await page.mouse.up(); await pause(); assert.ok((await saved()).cards.find(c=>c.id===parent.id).props.cols>=2); console.log('collection resize updates columns and child layout');
  // Fold other panels with their own controls so Unsorted is available for an ordinary pointer drop.
  for(const id of ['library','layers','keys','wireframe','draw']) { const panel=page.locator(`[data-panel="${id}"]`); if(await panel.count() && !(await panel.evaluate(el=>el.classList.contains('folded')))) await panel.locator('.fold').click(); }
  await select([parent.id]); await page.evaluate(id=>aegis.canvas.frameIds([id],1),parent.id); await pause(); const beforeTray=await board();
  const tray=page.locator('[data-panel="unsorted"]'); const tr=await tray.boundingBox(), co=await page.locator(`#world [data-id="${parent.id}"]`).boundingBox();
  await page.mouse.move(co.x+20,co.y+20); await page.mouse.down(); await page.mouse.move(tr.x+tr.width/2,tr.y+20,{steps:12}); await page.mouse.up(); await pause(); const inTray=await saved(); assert.equal(inTray.cards.length,0); assert.equal(inTray.links.length,0); assert.equal(inTray.tray.length,1);
  const idea=page.locator('.tray-item').first(); const ir=await idea.boundingBox(); await page.mouse.move(ir.x+20,ir.y+15); await page.mouse.down(); await page.mouse.move(850,500,{steps:12}); await page.mouse.up(); await pause(); const released=await saved(); assert.equal(released.tray.length,0); assert.equal(released.cards.length,beforeTray.cards.length); assert.equal(released.links.length,beforeTray.links.length); console.log('drag to tray and back preserves collection and internal link');
  await page.screenshot({path:out('editing-tray.png')});
  writeFileSync(out('editing-saved-board.json'),JSON.stringify(await saved(),null,2));
  assert.deepEqual(errors,[]); console.log('PASS, no page errors');
} catch(e) { console.error(e); console.error('page errors',errors); await page.screenshot({path:out('editing-fail.png')}); process.exitCode=1; }
finally { await browser.close(); host.kill(); vite.kill(); }
