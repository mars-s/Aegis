import { waitForAsync } from './poll.mjs';
import { choose } from './dropdown.mjs';
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const PORT_OFFSET = Number(process.env.AEGIS_PORT_OFFSET || 0); // separate worktrees can run checks at once
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), TOKEN = 'editing-' + process.pid;
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-editing-')), AEGIS_PORT: '0', AEGIS_TOKEN: TOKEN, AEGIS_FAKE_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
host.stderr.on('data', d => process.stderr.write(String(d)));
const port = await new Promise(r => host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) r(m[1]); }));
const vite = spawn('npx', ['vite', '--port', String(5187 + PORT_OFFSET), '--strictPort'], { cwd: repo + '/app', stdio: 'pipe' });
await new Promise((r, reject) => { vite.stdout.on('data', d => { if (/Local/.test(String(d))) r(); }); vite.on('exit', reject); });
const browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' }); const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const key = s => page.keyboard.press(s.replaceAll('Mod', mod));
const pause = () => page.waitForTimeout(480);
const board = () => page.evaluate(() => structuredClone(aegis.canvas.board));
const select = async ids => { await page.evaluate(ids => { document.activeElement?.blur(); document.querySelector('.selection-more')?.removeAttribute('open'); aegis.canvas.select(ids); document.getElementById('stage').focus(); }, ids); await page.waitForTimeout(70); };
const reveal = async locator => { if (!(await locator.isVisible())) { const more = page.getByLabel('More selection controls', { exact: true }); if (!(await page.locator('.selection-more').evaluate(el => el.open))) await more.click(); } return locator; };
const clickControl = async name => (await reveal(page.getByRole('button', { name, exact: true }))).click();
const saved = async () => { await waitForAsync(page, async () => { const b = await aegis.host.get(`/boards/${aegis.canvas.board.id}`); return b.rev === aegis.canvas.board.rev; }); return page.evaluate(() => aegis.host.get(`/boards/${aegis.canvas.board.id}`)); };
try {
  await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
  await page.goto(`http://127.0.0.1:${5187 + PORT_OFFSET}/?port=${port}&token=${TOKEN}`); await page.waitForFunction(() => window.aegis?.canvas?.board);
  await page.evaluate(() => aegis.apply([
    { op: 'create', newId: 'noteaa', type: 'note', text: 'First idea', x: -300, y: -100, w: 220, h: 120 },
    { op: 'create', newId: 'notebb', type: 'note', text: 'Second idea', x: 0, y: -40, w: 220, h: 120 },
    { op: 'create', newId: 'todocc', type: 'todo', text: 'Checklist', x: 300, y: 20, items: [{ text: 'First task', done: false }] },
    { op: 'create', newId: 'notedd', type: 'note', text: 'Outside focus', x: 800, y: 100 },
    { op: 'connect', newId: 'linkaa', a: 'noteaa', b: 'notebb' },
  ])); await saved(); await pause();
  assert.equal((await board()).cards.length, 4);
  await select(['noteaa']); await key('Mod+d'); await pause(); assert.equal((await board()).cards.length, 5);
  await key('Mod+z'); await pause(); assert.equal((await saved()).cards.length, 4);
  await key('Mod+Shift+z'); await pause(); assert.equal((await saved()).cards.length, 5); console.log('undo, redo, duplicate saved');
  await key('Mod+z'); await pause();
  await select(['noteaa']); await page.getByRole('button', { name: 'Bold', exact: true }).click(); await (await reveal(page.getByLabel('Note name', { exact: true }))).fill('Named idea'); await page.getByLabel('Note name', { exact: true }).press('Tab'); await (await reveal(page.getByLabel('Label', { exact: true }))).fill('Read first'); await page.getByLabel('Label', { exact: true }).press('Tab'); await pause();
  assert.equal((await saved()).cards.find(c => c.id === 'noteaa').props.bold, true); assert.equal((await board()).cards.find(c => c.id === 'noteaa').heading, 'Named idea'); console.log('name, label and formatting saved');
  await select(['noteaa', 'notebb', 'todocc']); await page.getByLabel('Align and distribute', { exact: true }).click(); await page.getByRole('button', { name: 'Align top', exact: true }).click(); await pause(); const aligned = (await saved()).cards.filter(c => ['noteaa','notebb','todocc'].includes(c.id)); assert.equal(new Set(aligned.map(c => c.y)).size, 1);
  await page.getByRole('button', { name: 'Distribute horizontally', exact: true }).click(); await pause(); console.log('align and distribute saved');
  await select(['noteaa','notebb']); await key('Mod+g'); await pause(); assert.ok((await saved()).cards.find(c => c.id === 'noteaa').group);
  await page.evaluate(() => aegis.canvas.setView({ x: 700, y: 350, z: 1 })); await pause();
  let card = page.locator('#world [data-id="noteaa"]'); let r = await card.boundingBox();
  await page.mouse.move(r.x + 15, r.y + r.height - 15); await page.mouse.down(); await page.mouse.move(r.x + 75, r.y + r.height + 25, { steps: 8 }); await page.mouse.up(); await pause();
  let moved = await saved(); assert.equal(moved.cards.find(c => c.id === 'noteaa').x, -240); assert.equal(moved.cards.find(c => c.id === 'notebb').x, 60); console.log('group drag moves both cards');
  await key('Mod+Shift+g'); await pause(); assert.equal((await saved()).cards.find(c => c.id === 'noteaa').group, '');
  await select(['noteaa']); await key('f'); await pause(); assert.equal(await page.locator('#world [data-id="notedd"]').evaluate(el => el.classList.contains('focus-dim')), true); await key('Escape'); await pause(); assert.equal(await page.locator('.card.focus-dim').count(),0);
  await key('Mod+\\'); assert.equal(await page.locator('.show-panels').isVisible(), true); await page.getByText('Show panels', { exact: true }).click(); console.log('focus, clean mode');
  await page.locator('#quickCapture').click(); await page.getByLabel('Capture idea').fill('Captured thought'); await page.getByLabel('Capture idea').press('Enter'); await pause(); assert.equal((await saved()).tray[0].text, 'Captured thought');
  await page.locator('#boardName').click();
  await page.getByRole('button', { name: 'Captured thought', exact: true }).click(); await pause(); assert.equal((await saved()).tray.length, 0); assert.ok((await board()).cards.some(c => c.text === 'Captured thought')); console.log('capture and tray release saved');
  await select(['noteaa']); await key('Mod+c'); await pause(); assert.ok(await page.evaluate(() => localStorage.getItem('aegis:clip')));
  await key('Mod+v'); await pause(); assert.equal((await saved()).cards.filter(c => c.text === 'First idea').length, 2); console.log('OS clipboard paste');
  const original = await board();
  await page.evaluate(() => { document.querySelector('#side [data-panel="layers"] .fold')?.click(); });
  // Expand Layers if it was folded.
  if (!(await page.locator('.layer-list').isVisible())) await page.locator('[data-panel="layers"] .fold').click();
  await page.locator('.layer-row[data-id="notedd"] .row-more').click(); await page.getByRole('menuitem', { name: 'Hide', exact: true }).click(); await pause(); assert.equal((await saved()).cards.find(c => c.id === 'notedd').props.hidden, true); assert.equal(await page.locator('#world [data-id="notedd"]').count(), 0);
  await page.locator('.layer-row[data-id="notedd"] .row-more').click(); await page.getByRole('menuitem', { name: 'Show', exact: true }).click(); await page.locator('.layer-row[data-id="noteaa"] .row-more').click(); await page.getByRole('menuitem', { name: 'Lock', exact: true }).click(); await pause(); assert.equal((await saved()).cards.find(c => c.id === 'noteaa').props.locked, true);
  await page.locator('.layer-row[data-id="noteaa"] .row-more').click(); await page.getByRole('menuitem', { name: 'Unlock', exact: true }).click(); console.log('layer hide, lock saved');
  await select(['noteaa']); await page.evaluate(() => aegis.canvas.frameIds(['noteaa'],1)); await pause();
  const handle = page.getByRole('button', { name: 'Rotate selection', exact: true }); r = await handle.boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2); await page.mouse.down(); await page.keyboard.down('Shift'); await page.mouse.move(r.x+r.width/2+120,r.y+r.height/2+80,{steps:8}); await page.mouse.up(); await page.keyboard.up('Shift'); await pause(); assert.equal((await saved()).cards.find(c => c.id==='noteaa').rot % 15,0); console.log('rotation saved');
  await select(['noteaa','notebb']); await clickControl('Collect'); await pause(); let collection=(await saved()).cards.find(c=>c.type==='coll'); assert.equal(collection.props.kids.length,2); console.log('collection saved');
  await select(['todocc']); await page.evaluate(()=>aegis.canvas.frameIds(['todocc'],1)); await pause();
  const item=page.locator('#world [data-id="todocc"] .todo-item span').first(); await item.dblclick(); await item.press('End'); await item.press('Enter'); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='todocc').items.length,2);
  await page.keyboard.type('Second task'); await page.keyboard.press('Tab'); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='todocc').items[1].text,'Second task'); assert.equal((await board()).cards.find(c=>c.id==='todocc').items[0].done,false); console.log('checklist insert saved');
  await select(['todocc']); const download=page.waitForEvent('download'); await clickControl('PNG'); const file=await download; await file.saveAs(out('editing-selection.png')); console.log('PNG downloaded',file.suggestedFilename());
  await key('Mod+0'); await pause(); assert.equal((await page.evaluate(()=>aegis.canvas.view.z)),1);
  await page.getByRole('button',{name:'Zoom menu',exact:true}).click(); await page.getByRole('menuitem',{name:'50%',exact:true}).click(); await pause(); await page.waitForFunction(()=>aegis.canvas.view.z===.5);
  await key('Shift+1'); await pause();
  await page.screenshot({path:out('editing-overview.png')});
  await page.locator('#settingsBtn').click(); await page.getByRole('tab', { name: 'Toolbar', exact: true }).click(); await choose(page.locator('[data-size]'), 'large'); await page.getByRole('checkbox',{name:'Show readme',exact:true}).uncheck(); await page.locator('#closeSettings').click(); assert.equal(await page.locator('[data-tool="readme"]').isVisible(),false); console.log('toolbar preferences applied');
  // Export PDF, verify cloning while dragging, and move a rich selection to another board.
  await select(['todocc']); const pdfDownload=page.waitForEvent('download'); await clickControl('PDF'); await (await pdfDownload).saveAs(out('editing-selection.pdf'));
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
  await select(ids); await clickControl('Collect'); await pause(); const parent=(await saved()).cards.find(c=>c.type==='coll');
  const corner=await page.getByRole('button',{name:'Resize selection',exact:true}).boundingBox(); await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2); await page.mouse.down(); await page.mouse.move(corner.x+350,corner.y+40,{steps:6}); await page.mouse.up(); await pause(); assert.ok((await saved()).cards.find(c=>c.id===parent.id).props.cols>=2); console.log('collection resize updates columns and child layout');
  // Fold other panels with their own controls so Unsorted is available for an ordinary pointer drop.
  for(const id of ['library','layers','keys','wireframe','draw']) { const panel=page.locator(`[data-panel="${id}"]`); if(await panel.count() && !(await panel.evaluate(el=>el.classList.contains('folded')))) await panel.locator('.fold').click(); }
  await select([parent.id]); await page.evaluate(id=>aegis.canvas.frameIds([id],1),parent.id); await pause(); const beforeTray=await board();
  const tray=page.locator('[data-panel="unsorted"]'); const tr=await tray.boundingBox(), co=await page.locator(`#world [data-id="${parent.id}"]`).boundingBox();
  await page.mouse.move(co.x+20,co.y+20); await page.mouse.down(); await page.mouse.move(tr.x+tr.width/2,tr.y+20,{steps:12}); await page.mouse.up(); await pause(); const inTray=await saved(); assert.equal(inTray.cards.length,0); assert.equal(inTray.links.length,0); assert.equal(inTray.tray.length,1);
  const idea=page.locator('.tray-item').first(); const ir=await idea.boundingBox(); await page.mouse.move(ir.x+20,ir.y+15); await page.mouse.down(); await page.mouse.move(850,500,{steps:12}); await page.mouse.up(); await pause(); const released=await saved(); assert.equal(released.tray.length,0); assert.equal(released.cards.length,beforeTray.cards.length); assert.equal(released.links.length,beforeTray.links.length); console.log('drag to tray and back preserves collection and internal link');
  await page.screenshot({path:out('editing-tray.png')});

  // Isolate the audited editing behaviours from the earlier clipboard and tray fixture.
  await select([]); await page.evaluate(() => aegis.apply([{ op: 'restore', cards: [], links: [], tray: [] }])); await saved();
  await page.evaluate(() => aegis.apply([
    { op: 'create', type: 'coll', newId: 'columns', text: 'Drop columns', x: 100, y: 100, w: 530, h: 300, props: { kids: [] } },
    { op: 'create', type: 'note', newId: 'dropone', text: 'First drop', x: -100, y: 130, w: 150, h: 80 },
    { op: 'create', type: 'note', newId: 'droptwo', text: 'Second drop', x: -100, y: 300, w: 150, h: 80 },
  ])); await saved(); await page.evaluate(() => aegis.canvas.setView({ x: 500, y: 120, z: 1 })); await pause();
  const dragTo = async (id, x, y) => { await select([id]); const r = await page.locator(`#world .card[data-id="${id}"]`).boundingBox(); const target = await page.evaluate(p => aegis.canvas.worldToScreen(p.x,p.y),{x,y}); await page.mouse.move(r.x+20,r.y+r.height-12); await page.mouse.down(); await page.mouse.move(target.x,target.y,{steps:12}); await page.mouse.up(); await pause(); return saved(); };
  let dropped = await dragTo('dropone',500,190); assert.equal(dropped.cards.find(c=>c.id==='columns').props.colOf.dropone,1);
  dropped = await dragTo('droptwo',500,180); assert.deepEqual(dropped.cards.find(c=>c.id==='columns').props.kids,['droptwo','dropone']); assert.equal(dropped.cards.find(c=>c.id==='dropone').x,dropped.cards.find(c=>c.id==='droptwo').x);
  await select(['columns']); await clickControl('Hide header'); await pause(); let col=(await saved()).cards.find(c=>c.id==='columns'); assert.equal(col.props.head,false); assert.equal(await page.locator('#world [data-id="columns"] .collection-head').isVisible(),false); const headerlessY=(await board()).cards.find(c=>c.id==='droptwo').y;
  await select(['columns']); await clickControl('Show header'); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='droptwo').y,headerlessY+60);
  // Layer reading order is independent of the stack order, and retains chosen columns.
  const layersPanel=page.locator('[data-panel="layers"]'); if(await layersPanel.evaluate(el=>el.classList.contains('folded'))) await layersPanel.locator('.fold').click();
  const layerRow=id=>page.locator(`.layer-row[data-id="${id}"]`);
  const rowOrder=()=>page.locator('.layer-row[data-parent="columns"]').evaluateAll(rows=>rows.map(r=>r.dataset.id));
  assert.deepEqual(await rowOrder(),['droptwo','dropone']);
  const rowDrop=async(source,target,above=true)=>{ const dt=await page.evaluateHandle(()=>new DataTransfer()); await layerRow(source).dispatchEvent('dragstart',{dataTransfer:dt}); const r=await layerRow(target).boundingBox(); await layerRow(target).dispatchEvent('dragover',{dataTransfer:dt,clientY:r.y+(above?2:r.height-2)}); await layerRow(target).dispatchEvent('drop',{dataTransfer:dt}); await pause(); await dt.dispose(); };
  await rowDrop('dropone','droptwo'); assert.deepEqual((await saved()).cards.find(c=>c.id==='columns').props.kids,['dropone','droptwo']); assert.deepEqual(await rowOrder(),['dropone','droptwo']); assert.equal((await board()).cards.find(c=>c.id==='columns').props.colOf.dropone,1); console.log('drop column, within-column reorder, header and layer reading order saved');
  // Sections nest by centre point, and the row menu applies to its row selection.
  await page.evaluate(()=>aegis.apply([
    {op:'create',type:'section',newId:'outersec',text:'Outer section',x:1500,y:0,w:800,h:700},
    {op:'create',type:'section',newId:'innersec',text:'Inner section',x:1600,y:100,w:400,h:400},
    {op:'create',type:'note',newId:'nestednote',text:'Inside section',x:1700,y:200,w:150,h:90},
  ])); await saved(); await pause();
  assert.equal(await layerRow('innersec').getAttribute('data-parent'),'outersec'); assert.equal(await layerRow('nestednote').getAttribute('data-parent'),'innersec');
  await layerRow('outersec').getByRole('button',{name:'Collapse Outer section',exact:true}).click(); await pause(); assert.equal(await layerRow('nestednote').count(),0);
  await select(['nestednote']); await pause(); assert.equal(await layerRow('nestednote').isVisible(),true);
  await layerRow('nestednote').click({button:'right'}); assert.deepEqual(await page.evaluate(()=>aegis.canvas.selection()),['nestednote']); await page.getByRole('menuitem',{name:'Duplicate',exact:true}).click(); await pause(); assert.equal((await saved()).cards.filter(c=>c.text==='Inside section').length,2); console.log('geometric section nesting, ancestor reveal and row context menu');
  await select(['nestednote']); await page.evaluate(()=>aegis.canvas.frameIds(['nestednote'],1)); await pause();
  assert.equal(await page.locator('#tools').isVisible(),false); assert.equal(await page.locator('#selectionBar').isVisible(),true);
  await clickControl('Tilt'); await page.getByRole('button',{name:'30°',exact:true}).click(); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='nestednote').rot,30);
  await page.getByLabel('Tilt in degrees',{exact:true}).fill('-17'); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='nestednote').rot,-17);
  await page.getByRole('button',{name:'Reset tilt',exact:true}).click(); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='nestednote').rot,0); await page.getByLabel('Tilt in degrees',{exact:true}).press('Escape'); assert.equal(await page.locator('.editing-tilt').isVisible(), false); assert.equal(await page.getByRole('button', { name: 'Tilt', exact: true }).evaluate(el => document.activeElement === el), true);
  const rotHandle=await page.getByRole('button',{name:'Rotate selection',exact:true}).boundingBox(); const model=(await board()).cards.find(c=>c.id==='nestednote'); const mid=await page.evaluate(c=>aegis.canvas.worldToScreen(c.x+c.w/2,c.y+c.h/2),model); const hx=rotHandle.x+rotHandle.width/2,hy=rotHandle.y+rotHandle.height/2,angle=Math.atan2(hy-mid.y,hx-mid.x)+14*Math.PI/180,radius=Math.hypot(hx-mid.x,hy-mid.y);
  await page.mouse.move(hx,hy); await page.mouse.down(); await page.mouse.move(mid.x+Math.cos(angle)*radius,mid.y+Math.sin(angle)*radius,{steps:8}); await page.mouse.up(); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='nestednote').rot,15);
  await layerRow('nestednote').click({button:'right'}); await page.getByRole('menuitem',{name:'Reset tilts',exact:true}).click(); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='nestednote').rot,0); console.log('tilt presets, exact angle, reset menu and near-angle snapping');
  await select(['nestednote']); const heightInput=await reveal(page.getByLabel('Line height',{exact:true})); await heightInput.fill('1.65'); await heightInput.press('Tab'); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='nestednote').props.lh,1.65);
  const slider=await reveal(page.getByLabel('Line height slider',{exact:true})); await slider.fill('1.9'); await slider.dispatchEvent('input'); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='nestednote').props.lh,1.9);
  await choose(await reveal(page.getByLabel('Spacing',{exact:true})), 'normal'); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='nestednote').props.lh,undefined); console.log('continuous line height and per-type reset');
  await page.evaluate(()=>aegis.apply([{op:'create',type:'title',newId:'heighttitle',text:'Title spacing',x:2400,y:200}])); await saved(); await select(['heighttitle']); await page.evaluate(()=>aegis.canvas.frameIds(['heighttitle'],1)); await pause(); assert.equal(await page.locator('#world [data-id="heighttitle"]').evaluate(el=>{const s=getComputedStyle(el);return Number.parseFloat(s.lineHeight)/Number.parseFloat(s.fontSize);}),1); await select(['nestednote']);
  // Narrow windows fold the same live controls into More without clipping the bar.
  await page.setViewportSize({width:900,height:900}); await pause(); await select(['nestednote']); const more=page.getByLabel('More selection controls',{exact:true}); assert.equal(await more.isVisible(),true); const barRect=await page.locator('#selectionBar').boundingBox(); assert.ok(barRect.x>=0&&barRect.x+barRect.width<=900);
  await more.click(); const letter=page.getByLabel('Letter spacing',{exact:true}); assert.equal(await letter.isVisible(),true); await letter.fill('2'); await letter.press('Tab'); await pause(); assert.equal((await saved()).cards.find(c=>c.id==='nestednote').props.ls,2); await select([]); assert.equal(await page.locator('#tools').isVisible(),true); await page.setViewportSize({width:1600,height:1100}); await pause();
  // Older customised toolbar orders insert missing tools at their default indices.
  const toolbarExpected=await page.evaluate(()=>{ const defaults=[...document.querySelectorAll('#tools [data-tool]')].map(b=>b.dataset.tool), missing='coll', saved=[...defaults].reverse().filter(id=>id!==missing); localStorage.setItem('aegis:toolbar',JSON.stringify({order:saved})); return {saved,missing,defaultIndex:defaults.indexOf(missing)}; });
  await page.reload(); await page.waitForFunction(()=>window.aegis?.canvas?.board); await pause(); const actualToolbar=await page.locator('#tools [data-tool]').evaluateAll(buttons=>buttons.map(b=>b.dataset.tool)); assert.equal(actualToolbar.indexOf(toolbarExpected.missing),toolbarExpected.defaultIndex); assert.deepEqual(actualToolbar.filter(id=>id!==toolbarExpected.missing),toolbarExpected.saved); console.log('responsive More, contextual toolbar swap and default insertion');
  // Owned colour fixtures make missing media visible in exported PNG pixels.
  const colours=await page.evaluate(()=>{const make=colour=>{const c=document.createElement('canvas');c.width=100;c.height=100;const p=c.getContext('2d');p.fillStyle=colour;p.fillRect(0,0,100,100);return c.toDataURL('image/png');};return{red:make('#ff0000'),green:make('#00ff00')};});
  await page.evaluate(({red,green})=>aegis.apply([{op:'restore',cards:[],links:[],tray:[]},{op:'create',type:'image',newId:'exportimg',url:red,x:0,y:0,w:200,h:200,props:{tag:'Legacy caption'}},{op:'create',type:'video',newId:'exportvid',url:'data:video/webm;base64,',text:'Poster fixture',x:250,y:0,w:200,h:200,props:{poster:green}}]),colours); await saved(); await select(['exportimg']); await page.evaluate(()=>aegis.canvas.frameIds(['exportimg','exportvid'],1)); await pause();
  const caption=await reveal(page.getByLabel('Caption',{exact:true})); assert.equal(await caption.inputValue(),'Legacy caption'); await caption.fill('One caption'); await caption.press('Tab'); await pause(); const imageCard=(await saved()).cards.find(c=>c.id==='exportimg'); assert.equal(imageCard.props.tagText,'One caption'); assert.equal(imageCard.props.tag,undefined); assert.equal(await page.locator('#world [data-id="exportimg"] .image-caption').innerText(),'One caption'); assert.equal(await page.locator('#world [data-id="exportimg"] .card-tag').count(),0);
  const exportCheck=await page.evaluate(async()=>{const {prepareExportCard}=await import('/src/features/editing/export.js'); const c=aegis.canvas.board.cards.find(c=>c.id==='exportimg'), original=aegis.canvas.mountedEl(c.id), clone=original.cloneNode(true); const media=await prepareExportCard(clone,original,c,aegis.host.assetUrl); return {controls:clone.querySelectorAll('button,.media-actions,input:not([type=checkbox]),select').length,images:media.length,originalControls:original.querySelectorAll('button').length};}); assert.equal(exportCheck.controls,0); assert.equal(exportCheck.images,1); assert.ok(exportCheck.originalControls>0);
  await select(['exportimg']); const beforeExport=await page.evaluate(()=>({ids:aegis.canvas.selection(),view:aegis.canvas.view}));
  const pngDownload=page.waitForEvent('download'); await page.locator('#stage').dispatchEvent('contextmenu',{clientX:1300,clientY:200}); await page.getByRole('menuitem',{name:'Export board as PNG',exact:true}).click(); const png=await pngDownload; await png.saveAs(out('editing-media.png'));
  const bytes=await (await import('node:fs/promises')).readFile(out('editing-media.png')); const pixels=await page.evaluate(async src=>{const im=new Image();im.src=src;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const p=c.getContext('2d');p.drawImage(im,0,0);const data=p.getImageData(0,0,c.width,c.height).data;let red=0,green=0;for(let i=0;i<data.length;i+=4){if(data[i]>240&&data[i+1]<15&&data[i+2]<15)red++;if(data[i]<15&&data[i+1]>240&&data[i+2]<15)green++;}return{red,green};},'data:image/png;base64,'+bytes.toString('base64')); assert.ok(pixels.red>1000,JSON.stringify(pixels)); assert.ok(pixels.green>1000,JSON.stringify(pixels)); assert.deepEqual(await page.evaluate(()=>({ids:aegis.canvas.selection(),view:aegis.canvas.view})),beforeExport);
  const mediaPdf=page.waitForEvent('download'); await page.locator('#stage').dispatchEvent('contextmenu',{clientX:1300,clientY:200}); await page.getByRole('menuitem',{name:'Export board as PDF',exact:true}).click(); await (await mediaPdf).saveAs(out('editing-media.pdf')); const pdfBytes=await (await import('node:fs/promises')).readFile(out('editing-media.pdf')); assert.ok(pdfBytes.includes(Buffer.from('/DCTDecode'))); assert.ok(pdfBytes.length>2000);
  await page.screenshot({path:out('editing-audit.png')}); console.log('one canonical caption, image and video poster pixels exported to PNG and PDF, controls removed');
  // No selection must do no card rectangle work. A selected card must not measure card descendants.
  const geometryReads=async(ids)=>{await select(ids);await pause();return page.evaluate(async()=>{const original=Element.prototype.getBoundingClientRect;let descendants=0,roots=0;Element.prototype.getBoundingClientRect=function(){if(this.matches('#world .card *'))descendants++;if(this.matches('#world .card'))roots++;return original.call(this);};try{for(let i=0;i<5;i++){aegis.canvas.setView({...aegis.canvas.view,x:aegis.canvas.view.x+1});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}return{descendants,roots};}finally{Element.prototype.getBoundingClientRect=original;}});};
  assert.deepEqual(await geometryReads([]),{descendants:0,roots:0}); assert.equal((await geometryReads(['exportimg'])).descendants,0); console.log('selection geometry avoids descendant reads and does no card reads without a selection');

  await select([]); await page.locator('#stage').focus(); await page.keyboard.press('p'); await pause(); assert.equal(await page.getByLabel('Drawing controls',{exact:true}).isVisible(),true); assert.equal(await page.locator('#tools').isVisible(),false); await page.getByRole('button',{name:'Done',exact:true}).click(); await pause(); assert.equal(await page.locator('#tools').isVisible(),true);
  // The selection toolbar stays compact, follows the camera and preserves its controls on phone.
  if (await page.locator('#side').evaluate(el => el.classList.contains('open'))) await page.getByLabel('Hide library and layers', { exact: true }).click();
  await page.evaluate(() => { aegis.apply([
    { op: 'restore', cards: [], links: [], tray: [] },
    { op: 'create', newId: 'toolnote', type: 'note', text: 'A quieter place to think.\nKeep the useful things close.', x: 0, y: 0, w: 300, h: 160 },
    { op: 'create', newId: 'toolnext', type: 'note', text: 'Another thought', x: 340, y: 70, w: 240, h: 140 },
    { op: 'create', newId: 'toolthird', type: 'note', text: 'One more idea', x: 620, y: 0, w: 240, h: 160 },
    { op: 'create', newId: 'toolobject', type: 'object', kind: 'sheet', text: 'Sleep log', x: 0, y: 240, w: 420, h: 240, data: { columns: [{ label: 'Night', kind: 'text' }, { label: 'Hours', kind: 'number' }], rows: [{ cells: ['Monday', '7.4'] }, { cells: ['Tuesday', '7.8'] }], note: 'Fictional test data' } },
  ]); aegis.canvas.setView({ x: 450, y: 300, z: 1 }); }); await saved(); await pause();
  await select(['toolnote']); await pause();
  const toolbar = page.locator('#selectionBar').filter({ has: page.locator('.selection-inline') }), toolbarBox = () => toolbar.boundingBox();
  const actions = () => page.locator('.selection-inline > button, .selection-inline > details > summary').evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
  assert.deepEqual(await actions(), ['Bold', 'Italic', 'Align', 'Colour', 'More selection controls']);
  assert.equal(await page.locator('.selection-inline > select').count(), 0); assert.ok((await toolbarBox()).width < 340);
  let selectionBox = await page.locator('#world [data-id="toolnote"]').boundingBox(), toolbarRect = await toolbarBox();
  assert.ok(toolbarRect.y + toolbarRect.height < selectionBox.y); assert.ok(Math.abs(toolbarRect.x + toolbarRect.width / 2 - selectionBox.x - selectionBox.width / 2) < 2);
  await page.screenshot({ path: out('selection-note.png') });
  const beforePan = toolbarRect; await page.evaluate(() => aegis.canvas.setView({ x: 490, y: 330, z: 1 })); await pause(); toolbarRect = await toolbarBox(); assert.ok(Math.abs(toolbarRect.x - beforePan.x - 40) < 2); assert.ok(Math.abs(toolbarRect.y - beforePan.y - 30) < 2);
  await page.evaluate(() => aegis.canvas.setView({ x: 490, y: 60, z: .8 })); await pause(); selectionBox = await page.locator('#world [data-id="toolnote"]').boundingBox(); toolbarRect = await toolbarBox(); assert.ok(toolbarRect.y >= selectionBox.y + selectionBox.height);
  await page.evaluate(() => aegis.canvas.setView({ x: -120, y: 300, z: 1 })); await pause(); assert.ok((await toolbarBox()).x >= 8);
  await page.evaluate(() => aegis.canvas.setView({ x: 450, y: 300, z: 1 })); await pause();
  await page.getByLabel('More selection controls', { exact: true }).click(); assert.equal(await page.getByLabel('Font', { exact: true }).isVisible(), true); assert.equal(await page.getByLabel('Letter spacing', { exact: true }).isVisible(), true); await page.waitForTimeout(30); await page.screenshot({ path: out('selection-more.png') });
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.selection-more').evaluate(el => el.open), false); assert.equal(await toolbar.isVisible(), true);
  await select(['toolobject']); await pause(); assert.deepEqual(await actions(), ['Open', 'Duplicate', 'Delete', 'More selection controls']); await page.screenshot({ path: out('selection-object.png') });
  await toolbar.getByRole('button', { name: 'Open', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.side-editor.is-open')); await page.getByLabel('Close editor', { exact: true }).click(); await page.evaluate(() => aegis.canvas.setView({ x: 450, y: 300, z: 1 })); await pause();
  await select(['toolnote', 'toolnext', 'toolthird']); await pause(); assert.equal(await page.locator('.selection-count').innerText(), '3 selected'); assert.deepEqual(await actions(), ['Align and distribute', 'Group', 'Duplicate', 'Delete', 'More selection controls']); await page.screenshot({ path: out('selection-multi.png') });
  await select(['toolnote']); await pause(); selectionBox = await page.locator('#world [data-id="toolnote"]').boundingBox();
  await page.mouse.move(selectionBox.x + 20, selectionBox.y + selectionBox.height - 15); await page.mouse.down(); await page.mouse.move(selectionBox.x + 70, selectionBox.y + selectionBox.height + 15, { steps: 4 }); assert.equal(await toolbar.isVisible(), false); await page.mouse.up(); await pause(); assert.equal(await toolbar.isVisible(), true);
  await page.evaluate(url => aegis.apply([{ op: 'create', newId: 'toolimage', type: 'image', text: 'Owned colour fixture', url, x: 950, y: 0, w: 200, h: 200 }]), colours.green); await saved(); await select(['toolimage']); await pause(); assert.deepEqual(await actions(), ['Replace', 'Download', 'More selection controls']);
  await page.getByLabel('More selection controls', { exact: true }).click(); await toolbar.getByRole('button', { name: 'Lock', exact: true }).click(); await pause(); assert.equal((await saved()).cards.find(c => c.id === 'toolimage').props.locked, true); assert.equal(await toolbar.getByRole('button', { name: 'Unlock', exact: true }).isVisible(), true); await toolbar.getByRole('button', { name: 'Unlock', exact: true }).click(); await pause(); assert.equal((await saved()).cards.find(c => c.id === 'toolimage').props.locked, false);
  const mediaDownload = page.waitForEvent('download'); await toolbar.getByRole('button', { name: 'Download', exact: true }).click(); await (await mediaDownload).saveAs(out('selection-download.png'));
  const replaceChooser = page.waitForEvent('filechooser'); await toolbar.getByRole('button', { name: 'Replace', exact: true }).click(); await (await replaceChooser).setFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: Buffer.from(colours.red.split(',')[1], 'base64') }); await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.id === 'toolimage').url !== '' && !aegis.canvas.board.cards.find(c => c.id === 'toolimage').url.startsWith('data:')); await saved();
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await select([]); await page.locator('#stage').focus(); await key('Mod+a'); await page.waitForTimeout(20); assert.equal(await toolbar.evaluate(el => el.getAnimations().length), 0);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => aegis.canvas.setView({ x: 24, y: 180, z: 1 })); await pause(); await select(['toolnote']); await pause();
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('phone')), true); const hubBox = await page.locator('#mobileHub').boundingBox(); toolbarRect = await toolbarBox(); assert.ok(toolbarRect.y + toolbarRect.height <= hubBox.y - 6); assert.ok(toolbarRect.x >= 0 && toolbarRect.x + toolbarRect.width <= 390);
  assert.ok(await toolbar.locator('button').first().evaluate(el => el.getBoundingClientRect().height >= 44)); await page.screenshot({ path: out('selection-phone.png') });
  await page.getByLabel('More selection controls', { exact: true }).click(); assert.equal(await page.getByLabel('Font', { exact: true }).isVisible(), true); const menuBox = await page.locator('.selection-overflow').boundingBox(); assert.ok(menuBox.x >= 0 && menuBox.y >= 0 && menuBox.x + menuBox.width <= 390 && menuBox.y + menuBox.height <= 844); await page.screenshot({ path: out('selection-phone-more.png') });
  await select([]); assert.equal(await toolbar.isVisible(), false); await page.setViewportSize({ width: 1600, height: 1100 });
  console.log('compact selection actions, anchor flip and clamping, pan and zoom, More, object open, multi-select, drag hiding, instant keyboard selection and phone dock');
  writeFileSync(out('editing-saved-board.json'),JSON.stringify(await saved(),null,2));
  assert.deepEqual(errors,[]); console.log('PASS, no page errors');
} catch(e) { console.error(e); console.error('page errors',errors); await page.screenshot({path:out('editing-fail.png')}); process.exitCode=1; }
finally { await browser.close(); host.kill(); vite.kill(); }
