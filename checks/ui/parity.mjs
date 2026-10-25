import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const PORT_OFFSET = Number(process.env.AEGIS_PORT_OFFSET || 0); // separate worktrees can run checks at once
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), token = 'parity-' + process.pid;
const data = mkdtempSync(join(tmpdir(), 'aegis-parity-'));
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: data, AEGIS_PORT:'0', AEGIS_TOKEN: token, AEGIS_FAKE_MODEL:'1' }, stdio:['ignore','pipe','pipe'] });
host.stderr.on('data', d => process.stderr.write(d));
const port = await new Promise((resolve,reject) => { host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if(m) resolve(m[1]); }); host.on('exit', reject); });
const vite = spawn('npx', ['vite','--port',String(5187 + PORT_OFFSET),'--strictPort'], {cwd:repo+'/app',stdio:'pipe'});
await new Promise((resolve,reject) => {vite.stdout.on('data',d=> { if(/Local/.test(String(d))) resolve(); }); vite.on('exit',reject);});
const browser = await chromium.launch();
const context = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true, deviceScaleFactor:1 });
let page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const url = `http://127.0.0.1:${5187 + PORT_OFFSET}/?port=${port}&token=${token}`;
const waitSaved = async () => {await page.waitForFunction(()=>document.getElementById('saveState').textContent==='saved'); return page.evaluate(()=>aegis.host.get(`/boards/${aegis.canvas.board.id}`));};
const log = (...a)=>console.log(...a);
try {
  await page.goto(url); await page.waitForFunction(()=>window.aegis?.canvas?.board);
  assert.equal(await page.getByText('Welcome to Aegis',{exact:true}).isVisible(),true);
  await page.screenshot({path:out('parity-welcome.png')});
  await page.getByRole('button',{name:'Start tour',exact:true}).click();
  for(let i=1;i<=7;i++) {await page.getByRole('heading',{name:new RegExp(`^${i} of 7:`)}).waitFor(); if(i===5) await page.screenshot({path:out('parity-phone-tour.png')}); await page.keyboard.press('ArrowRight');}
  assert.equal(await page.locator('.onboarding').evaluate(el=>el.open),false);
  await page.reload(); await page.waitForFunction(()=>window.aegis?.canvas?.board); assert.equal(await page.locator('.onboarding').evaluate(el=>el.open),false); log('first run, seven tour steps, arrow navigation, once-only reload');
  const hub = page.getByRole('navigation',{name:'Board hub'});
  await hub.getByRole('button',{name:'Boards',exact:true}).tap(); await page.locator('.mobile-sheet .tree-row[data-board]').first().tap(); await page.locator('.mobile-sheet').waitFor({state:'hidden'});
  await hub.getByRole('button',{name:'Layers',exact:true}).tap(); await page.getByRole('button',{name:'Close sheet',exact:true}).tap();
  await hub.getByRole('button',{name:'Unsorted',exact:true}).tap(); await page.locator('.mobile-veil').tap({position:{x:20,y:100}});
  await hub.getByRole('button',{name:'Add',exact:true}).tap();
  for(const name of ['Basics','Wireframe','Colours']) assert.equal(await page.getByRole('heading',{name,exact:true}).isVisible(),true);
  await page.screenshot({path:out('parity-phone-add.png')});
  await page.locator('.mobile-content').getByRole('button',{name:'Note',exact:true}).tap(); await page.locator('.mobile-sheet').waitFor({state:'hidden'}); await page.touchscreen.tap(200,260);
  await page.waitForFunction(()=>aegis.canvas.board.cards.length===1); await page.evaluate(()=>document.activeElement?.blur()); const note=(await waitSaved()).cards[0];
  await hub.getByRole('button',{name:'Layers',exact:true}).tap(); await page.locator('.mobile-sheet .layer-row .name').first().tap(); await page.locator('.mobile-sheet').waitFor({state:'hidden'}); assert.equal(await page.evaluate(()=>aegis.canvas.selection().length),1);
  await hub.getByRole('button',{name:'Add',exact:true}).tap(); await page.locator('.mobile-content').getByRole('button',{name:'Wireframe',exact:true}).tap(); await page.locator('.mobile-content [data-wf="box"]').tap(); await page.locator('.mobile-sheet').waitFor({state:'hidden'}); assert.equal(await page.evaluate(()=>aegis.canvas.tool),'wireframe'); await page.evaluate(()=>aegis.canvas.setTool(null));
  await hub.getByRole('button',{name:'Add',exact:true}).tap(); await page.getByRole('button',{name:'Quick capture (Cmd+K)',exact:true}).tap();
  await page.getByLabel('Capture idea',{exact:true}).fill('Phone captured idea'); await page.getByLabel('Capture idea',{exact:true}).press('Enter'); await waitSaved();
  await hub.getByRole('button',{name:'Unsorted',exact:true}).tap(); await page.getByRole('button',{name:'Phone captured idea',exact:true}).tap(); await page.locator('.mobile-sheet').waitFor({state:'hidden'}); assert.equal((await waitSaved()).tray.length,0);
  await hub.getByRole('button',{name:'Agents',exact:true}).tap(); assert.equal(await page.locator('.mobile-content #prompt').isVisible(),true); await page.screenshot({path:out('parity-phone-agents.png')}); await page.getByRole('button',{name:'Close sheet',exact:true}).tap();
  log('hub, sheet backdrop and close, board/layer/tool picks, grouped Add and Wireframe catalogue, Agents composer');
  const cdp=await context.newCDPSession(page);
  const touch = async (type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});
  await hub.getByRole('button',{name:'Layers',exact:true}).tap(); const grab=await page.locator('.mobile-grab').boundingBox();
  await touch('touchStart',[[1,180,grab.y+10]]); await touch('touchMove',[[1,180,grab.y+60]]); await touch('touchMove',[[1,180,grab.y+115]]); await touch('touchEnd',[]); await page.locator('.mobile-sheet').waitFor({state:'hidden'});
  await page.waitForTimeout(500);
  await page.evaluate(()=>{aegis.canvas.select([]);aegis.canvas.setView({x:1000,y:1000,z:1});});
  await touch('touchStart',[[1,140,330]]); await touch('touchMove',[[1,165,355]]); await touch('touchMove',[[1,200,390]]); await touch('touchEnd',[]);
  let v=await page.evaluate(()=>aegis.canvas.view); assert.equal(v.x,1060); assert.equal(v.y,1060);
  await touch('touchStart',[[1,130,330]]); await touch('touchStart',[[1,130,330],[2,230,330]]); await touch('touchMove',[[1,100,330],[2,260,330]]); await touch('touchEnd',[]);
  v=await page.evaluate(()=>aegis.canvas.view); assert.ok(Math.abs(v.z-1.6)<.01); await page.waitForTimeout(600); assert.ok(Math.abs((await page.evaluate(()=>aegis.host.get(`/boards/${aegis.canvas.board.id}`))).view.z-1.6)<.01); log('real CDP touch: drag-down >90px, one-finger pan +60/+60, pinch 1 to 1.6');
  await touch('touchStart',[[1,180,340]]); await page.waitForTimeout(570); await touch('touchEnd',[]); await page.getByText('New note here',{exact:true}).waitFor(); await page.screenshot({path:out('parity-phone-longpress.png')}); await page.keyboard.press('Escape');
  // Moving beyond eight pixels cancels the hold, even when it returns to its start.
  await touch('touchStart',[[1,180,340]]); await touch('touchMove',[[1,200,340]]); await touch('touchMove',[[1,180,340]]); await page.waitForTimeout(560); await touch('touchEnd',[]); assert.equal(await page.getByText('New note here',{exact:true}).isVisible(),false);
  await page.evaluate(id=>aegis.apply([{op:'order',ids:[id],to:'front'}]),note.id); await waitSaved();
  await page.evaluate(c=>{aegis.canvas.setView({x:120-c.x,y:260-c.y,z:1});aegis.canvas.select([]);},note); await page.waitForTimeout(70);
  await touch('touchStart',[[1,140,340]]); await page.waitForTimeout(570); await touch('touchEnd',[]); await page.getByText('Bring to front',{exact:true}).waitFor(); assert.deepEqual(await page.evaluate(()=>aegis.canvas.selection()),[note.id]); await page.screenshot({path:out('parity-phone-card-menu.png')}); await page.keyboard.press('Escape');
  log('520ms board/card context-menu path and 8px cancellation, quick capture and Unsorted release');
  // Slow and failed saves, followed by retry and authoritative disk-backed host reads.
  let mode='slow';
  await page.route(`http://127.0.0.1:${port}/boards/*/batch`,async route=>{if(mode==='fail'){await route.abort();return;} if(mode==='slow') await new Promise(r=>setTimeout(r,400)); await route.continue();});
  await page.evaluate(()=>aegis.apply([{op:'create',newId:'savest',type:'note',text:'Save feedback',x:NaN,y:Infinity,w:-1,h:NaN,rot:Infinity}]));
  await page.waitForFunction(()=>document.getElementById('saveState').textContent==='saving'); let b=await waitSaved(); const repaired=b.cards.find(c=>c.id==='savest'); assert.ok(['x','y','w','h','rot'].every(k=>Number.isFinite(repaired[k]))); assert.ok(repaired.w>0&&repaired.h>0);
  mode='fail'; await page.evaluate(()=>aegis.apply([{op:'update',id:'savest',set:{text:'Kept after failure'}}])); await page.waitForFunction(()=>document.getElementById('saveState').textContent==='not saved');
  await page.evaluate(()=>aegis.apply([{op:'update',id:'savest',set:{heading:'Queued behind failure'}}])); assert.equal(await page.evaluate(()=>aegis.canvas.board.cards.find(c=>c.id==='savest').text),'Kept after failure');
  mode='ok'; await page.getByRole('button',{name:'Retry',exact:true}).tap(); b=await waitSaved(); assert.equal(b.cards.find(c=>c.id==='savest').text,'Kept after failure'); assert.equal(b.cards.find(c=>c.id==='savest').heading,'Queued behind failure');
  log('saving/saved/not saved + retry, ordered retained edits, repaired finite geometry saved');
  const external=await page.evaluate(()=>aegis.host.post('/boards',{name:'Focus refresh evidence'})); await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await hub.getByRole('button',{name:'Boards',exact:true}).tap(); await page.locator(`.mobile-sheet [data-board="${external.id}"]`).waitFor(); await page.getByRole('button',{name:'Close sheet',exact:true}).tap();
  // Reuse the same context at desktop width to verify controls restore to their original homes.
  await page.setViewportSize({width:1440,height:1000}); await page.waitForFunction(()=>!document.body.classList.contains('phone')); assert.equal(await page.locator('#mobileHub').isVisible(),false); assert.equal(await page.locator('#side [data-panel="library"]').count(),1); await page.locator('#askPill').waitFor({state:'visible'});
  await page.locator('#settingsBtn').click();
  for(const name of ['General','Board','Toolbar','Panels','Accounts','About']) {await page.getByRole('tab',{name,exact:true}).click(); assert.equal(await page.getByRole('tabpanel',{name,exact:true}).isVisible(),true);}
  await page.getByRole('tab',{name:'General',exact:true}).click(); await page.getByLabel('Double-click creates a note',{exact:true}).uncheck(); await page.getByLabel('Default note colour',{exact:true}).selectOption('purple'); await page.locator('#closeSettings').click();
  await page.evaluate(()=>{aegis.canvas.select([]);aegis.canvas.setView({x:2000,y:2000,z:1});}); const count=await page.evaluate(()=>aegis.canvas.board.cards.length); await page.mouse.dblclick(900,300); assert.equal(await page.evaluate(()=>aegis.canvas.board.cards.length),count);
  await page.locator('#settingsBtn').click(); await page.getByLabel('Double-click creates a note',{exact:true}).check(); await page.getByRole('tab',{name:'Board',exact:true}).click(); await page.getByLabel('Motion',{exact:true}).uncheck(); await page.getByLabel('Tilt loose cards',{exact:true}).check(); await page.getByLabel('Show grid',{exact:true}).uncheck(); assert.equal(await page.evaluate(()=>localStorage.getItem('aegis:grid')),'none'); await page.getByLabel('Show grid',{exact:true}).check();
  await page.locator('#settings').getByLabel('Snap to grid',{exact:true}).check(); await page.locator('#closeSettings').click();
  await page.mouse.dblclick(900,300); b=await waitSaved(); assert.equal(b.cards.length,count+1); assert.equal(b.cards.at(-1).color,'purple'); await page.evaluate(()=>{document.activeElement?.blur();aegis.canvas.glideTo({x:300,y:300,z:1});}); await page.waitForTimeout(60); assert.equal(await page.evaluate(()=>aegis.canvas.view.x),300);
  const purple=b.cards.at(-1); await page.evaluate(c=>{document.activeElement?.blur();aegis.canvas.setView({x:700-c.x,y:300-c.y,z:1});aegis.canvas.select([c.id]);},purple); await page.waitForTimeout(80);
  const box=await page.locator(`#world [data-id="${purple.id}"]`).boundingBox(); await page.mouse.move(box.x+20,box.y+box.height-15); await page.mouse.down(); await page.mouse.move(box.x+57,box.y+box.height+10,{steps:6}); await page.mouse.up(); b=await waitSaved(); const snapped=b.cards.find(c=>c.id===purple.id); assert.equal(Math.abs(snapped.x%24),0); assert.equal(Math.abs(snapped.y%24),0); log('grid snap saved at',snapped.x,snapped.y);
  await page.locator('#settingsBtn').click(); await page.getByRole('tab',{name:'Toolbar',exact:true}).click(); await page.locator('[data-size]').selectOption('large'); await page.getByRole('checkbox',{name:'Show readme',exact:true}).uncheck(); await page.getByRole('tab',{name:'Panels',exact:true}).click(); await page.locator('[data-panel-visibility="keys"]').uncheck(); await page.getByRole('button',{name:'Reset layout',exact:true}).click(); await page.getByRole('tab',{name:'About',exact:true}).click(); await page.screenshot({path:out('parity-desktop-about.png')}); await page.getByRole('button',{name:'Replay welcome and tour',exact:true}).click(); await page.getByRole('button',{name:'Start tour',exact:true}).click(); for(let i=0;i<4;i++) await page.keyboard.press('ArrowRight'); await page.screenshot({path:out('parity-desktop-tour.png')}); await page.keyboard.press('ArrowLeft'); await page.getByRole('heading',{name:'4 of 7: Library',exact:true}).waitFor(); await page.getByRole('button',{name:'Next',exact:true}).click(); await page.getByRole('button',{name:'Back',exact:true}).click(); await page.getByRole('button',{name:'Skip',exact:true}).click();
  await page.reload(); await page.waitForFunction(()=>window.aegis?.canvas?.board); assert.equal(await page.locator('#tools [data-tool="readme"]').isVisible(),false); await page.locator('#settingsBtn').click(); await page.getByRole('tab',{name:'General',exact:true}).click(); assert.equal(await page.getByLabel('Default note colour',{exact:true}).inputValue(),'purple'); await page.locator('#closeSettings').click();
  log('focus library refresh, desktop restoration, six tabs, double-click preference, default colour, motion, tilt, grid, toolbar/panels, replay, persisted preferences');
  writeFileSync(out('parity-saved-board.json'),JSON.stringify(await waitSaved(),null,2));
  assert.deepEqual(errors,[]); log('PASS, no page errors. Temporary data:',data);
} catch(e) {console.error(e); console.error('page errors:',errors); await page.screenshot({path:out('parity-fail.png')}); process.exitCode=1;}
finally {await browser.close();host.kill();vite.kill();}
