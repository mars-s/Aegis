import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { out } from './out.mjs';
import { chromium, webkit } from './playwright.mjs';
export async function verifySandboxLifecycle() {
const root=new URL('../..',import.meta.url).pathname.replace(/\/$/,''),output=dirname(out('sandbox-lifecycle.json')),token=`snapshot-${process.pid}`;
const host=spawn(process.execPath,['dist/main.js'],{cwd:root+'/agent',env:{...process.env,AEGIS_PORT:'0',AEGIS_TOKEN:token,AEGIS_FAKE_MODEL:'1',AEGIS_UI:root+'/app/dist',AEGIS_UI_IMPL:'react',AEGIS_DATA:mkdtempSync(join(tmpdir(),'aegis-snapshot-data-')),AEGIS_VITE_CACHE:mkdtempSync(join(tmpdir(),'aegis-snapshot-cache-'))},stdio:['ignore','pipe','pipe']});
const port=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error(log)),20000);host.on('error',reject);host.stdout.on('data',chunk=>{log+=chunk;const m=/"port":(\d+)/.exec(log);if(m){clearTimeout(timer);resolve(m[1]);}});host.stderr.on('data',chunk=>log+=chunk);});
const results=[];
try {
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await engine.launch();
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const checks=[];const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks.push(label);console.log(name,label);};
  try {
   await page.addInitScript(()=>{if(self!==top)return;localStorage.setItem('aegis:onboarded','1');localStorage.setItem('aegis:orb-hint-seen','1');});
   await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);await page.waitForFunction(()=>window.aegis?.canvas.board);
   await page.evaluate(async()=>{
    const board=await aegis.host.post('/boards',{name:'Acknowledged sandbox'});aegis.canvas.setBoard(board);
    aegis.apply([{op:'create',newId:'snapshotwidget',type:'object',kind:'html',text:'Snapshot widget',x:180,y:150,w:450,h:280,props:{fixedHeight:true},data:{html:'<button id="queue">Queue final state and depart</button><output id="value"></output>',css:'',js:'window.aegisState={count:0};window.nextCount=42;document.getElementById("queue").onclick=()=>{queueMicrotask(()=>window.aegisState.count=nextCount-1);setTimeout(()=>window.aegisState.count=nextCount,0);parent.postMessage({type:"probe-depart"},"*");};const drawSize=()=>document.body.style.minHeight=(80+window.aegisState.count*10)+"px";addEventListener("aegis:restore",drawSize);drawSize();'}}]);
    aegis.apply([{op:'create',newId:'snapshotsecond',type:'object',kind:'html',text:'Second widget',x:700,y:150,w:300,h:250,data:{html:'<p id=second>Second view</p>',css:'',js:'window.aegisState={count:0};'}}]);
   });
   const open=async()=>{await page.frameLocator('.card[data-id="snapshotwidget"] iframe').locator('#queue').waitFor();await page.evaluate(()=>{aegis.canvas.select(['snapshotwidget']);document.getElementById('stage').focus();});await page.keyboard.press('Enter');await page.waitForFunction(()=>aegis.workspace.ui.getSnapshot().editor?.id==='snapshotwidget');await page.frameLocator('.side-editor iframe').locator('#queue').waitFor();};
   await page.frameLocator('.card[data-id="snapshotwidget"] iframe').locator('#queue').waitFor();await page.frameLocator('.card[data-id="snapshotsecond"] iframe').locator('#second').waitFor();await page.evaluate(()=>aegis.flush());await open();
   const observe=async()=>page.evaluate(()=>{
    window.departureAction='close';window.ackEvents=[];window.departureRetention=[];window.canvasHeights=[];
    addEventListener('message',event=>{
     if(event.source===document.querySelector('.card[data-id="snapshotwidget"] iframe')?.contentWindow&&event.data?.type==='aegis:html-height')canvasHeights.push(event.data.height);
     if(event.data?.type==='aegis:html-snapshot-result') ackEvents.push({present:!!document.querySelector('.side-editor'),kind:event.data.kind});
     if(event.data?.type==='probe-depart'){
      const before=!!document.querySelector('.side-editor');
      if(departureAction==='close')document.querySelector('.side-editor [data-close]').click();
      else if(departureAction==='width')document.querySelector('.side-editor [aria-label="Full width"]').click();
      else if(departureAction==='other')dispatchEvent(new CustomEvent('aegis:open-card',{detail:{id:'snapshotsecond',keyboard:true}}));
      else if(departureAction==='board')document.querySelector('[data-add="board"]').click();
      departureRetention.push({before,after:!!document.querySelector('.side-editor')});
     }
    });
   });
   await observe();
   await page.frameLocator('.side-editor iframe').locator('#queue').click();await page.waitForFunction(()=>!aegis.workspace.ui.getSnapshot().editor);await page.evaluate(()=>aegis.flush());
   check(await page.evaluate(()=>departureRetention),[{before:true,after:true}],'close retains the real editor until acknowledgement');
   check(await page.evaluate(()=>ackEvents.some(e=>e.present&&e.kind==='ok')),true,'real opaque sandbox acknowledges while editor is mounted');
   check(await page.evaluate(async()=>JSON.parse((await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).cards.find(c=>c.id==='snapshotwidget').data.state).custom.count),42,'queued script-only final state reaches durable host');
   await page.reload();await page.waitForFunction(()=>window.aegis?.canvas.board);await open();await observe();
   check(await page.frameLocator('.side-editor iframe').locator('html').evaluate(()=>aegisState.count),42,'reload and reopen restore acknowledged state');
   await page.evaluate(()=>{departureAction='width';});await page.frameLocator('.side-editor iframe').locator('html').evaluate(()=>{nextCount=43;});await page.frameLocator('.side-editor iframe').locator('#queue').click();await page.waitForFunction(()=>aegis.workspace.ui.getSnapshot().editor?.view==='full');
   check(await page.evaluate(()=>JSON.parse(aegis.canvas.board.cards.find(c=>c.id==='snapshotwidget').data.state).custom.count),43,'width change waits for final snapshot');
   await page.waitForFunction(()=>canvasHeights.includes(510));
   check(await page.locator('.card[data-id="snapshotwidget"] iframe').evaluate(el=>el.clientHeight),500,'expanded capture does not resize the inactive canvas');
   await page.locator('.side-editor [data-close]').click();await page.waitForFunction(()=>!aegis.workspace.ui.getSnapshot().editor);
   await page.waitForFunction(()=>document.querySelector('.card[data-id="snapshotwidget"] iframe')?.clientHeight===510,undefined,{timeout:2000});
   check(await page.locator('.card[data-id="snapshotwidget"] iframe').evaluate(el=>el.clientHeight),510,'resumed canvas applies its own latest height after acknowledgement');
   await open();
   await page.frameLocator('.side-editor iframe').locator('html').evaluate(()=>{aegisState.self=aegisState;});await page.locator('.side-editor [data-close]').click();await page.getByRole('status').filter({hasText:'Could not capture'}).first().waitFor();
   check(await page.evaluate(()=>aegis.workspace.ui.getSnapshot().editor?.id),'snapshotwidget','circular state refusal retains editor');
   await page.frameLocator('.side-editor iframe').locator('html').evaluate(()=>{aegisState={count:44};});await page.locator('.side-editor [data-close]').click();await page.waitForFunction(()=>!aegis.workspace.ui.getSnapshot().editor);await page.evaluate(()=>aegis.flush());await open();
   check(await page.frameLocator('.side-editor iframe').locator('html').evaluate(()=>aegisState.count),44,'explicit retry acknowledges fresh valid state');
   await page.locator('.side-editor iframe').evaluate(el=>{window.snapshotSrc=el.src;el.src='data:text/html,<p>Silent view</p>';});await page.frameLocator('.side-editor iframe').getByText('Silent view').waitFor();
   const started=Date.now();await page.locator('.side-editor [data-close]').click();await page.waitForTimeout(100);check(await page.evaluate(()=>!!aegis.workspace.ui.getSnapshot().editor),true,'missing reply keeps editor mounted while pending');
   check(await page.evaluate(()=>{try{aegis.canvas.setBoard(aegis.canvas.board);return false;}catch{return true;}}),true,'synchronous replacement refuses while preparation is pending');
   await page.waitForFunction(()=>document.querySelector('.side-editor')?.textContent.includes('(timeout)'));check(Date.now()-started>=1400&&Date.now()-started<4000,true,'hung frame reaches bounded deadline');
   await page.locator('.side-editor iframe').evaluate(el=>{el.src=snapshotSrc;});await page.frameLocator('.side-editor iframe').locator('#queue').waitFor();await page.frameLocator('.side-editor iframe').locator('html').evaluate(()=>{aegisState={count:45};});await page.locator('.side-editor [data-close]').click();await page.waitForFunction(()=>!aegis.workspace.ui.getSnapshot().editor);await page.evaluate(()=>aegis.flush());await open();
   await page.evaluate(()=>{departureAction='other';});await page.frameLocator('.side-editor iframe').locator('html').evaluate(()=>{nextCount=46;});await page.frameLocator('.side-editor iframe').locator('#queue').click();await page.waitForFunction(()=>aegis.workspace.ui.getSnapshot().editor?.id==='snapshotsecond');
   check(await page.evaluate(()=>JSON.parse(aegis.canvas.board.cards.find(c=>c.id==='snapshotwidget').data.state).custom.count),46,'open-other preserves the requested destination and final source state');
   await page.frameLocator('.side-editor iframe').locator('#second').waitFor();
   await page.evaluate(()=>dispatchEvent(new CustomEvent('aegis:open-card',{detail:{id:'snapshotwidget',keyboard:true}})));await page.waitForFunction(()=>aegis.workspace.ui.getSnapshot().editor?.id==='snapshotwidget');await page.frameLocator('.side-editor iframe').locator('#queue').waitFor();
   await page.frameLocator('.side-editor iframe').locator('html').evaluate(()=>{aegisState={count:47};});
   await page.evaluate(()=>{
    const newer=event=>{
     if(event.source!==document.querySelector('.side-editor iframe')?.contentWindow||event.data?.type!=='aegis:html-snapshot-result')return;
     removeEventListener('message',newer);
     const card=aegis.canvas.board.cards.find(c=>c.id==='snapshotwidget'),state=JSON.parse(card.data.state);state.custom={count:88};aegis.apply([{op:'object_set',id:card.id,path:['state'],value:JSON.stringify(state)}]);
    };
    addEventListener('message',newer);
    document.querySelector('.side-editor [data-close]').click();
   });
   await page.waitForFunction(()=>document.querySelector('.side-editor')?.textContent.includes('(conflict)'));
   check(await page.evaluate(()=>({editor:aegis.workspace.ui.getSnapshot().editor?.id,count:JSON.parse(aegis.canvas.board.cards.find(c=>c.id==='snapshotwidget').data.state).custom.count})),{editor:'snapshotwidget',count:88},'external state conflict retains the editor and newer workspace state');
   await page.waitForFunction(()=>document.querySelector('.side-editor iframe')?.isConnected);
   check(await page.frameLocator('.side-editor iframe').locator('html').evaluate(()=>aegisState.count),88,'conflict restores newer state before any retry can overwrite it');
   await page.route('**/boards/*/batch',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Snapshot save fixture offline'})}));
   await page.evaluate(()=>{departureAction='board';});await page.frameLocator('.side-editor iframe').locator('html').evaluate(()=>{nextCount=47;});const blockedBoard=await page.evaluate(()=>aegis.canvas.board.id);await page.frameLocator('.side-editor iframe').locator('#queue').click();await page.waitForFunction(()=>aegis.workspace.saving.getSnapshot().kind==='blocked');
   await page.getByRole('status').filter({hasText:'Retry saving, then open the board again.'}).waitFor();
   check(await page.evaluate(()=>({id:aegis.canvas.board.id,editor:aegis.workspace.ui.getSnapshot().editor?.id})),{id:blockedBoard,editor:'snapshotwidget'},'blocked host save retains the source board and editor');
   await page.unroute('**/boards/*/batch');await page.evaluate(()=>aegis.workspace.retry());await page.waitForFunction(()=>aegis.workspace.saving.getSnapshot().kind==='saved');
   check(await page.evaluate(()=>({id:aegis.canvas.board.id,editor:aegis.workspace.ui.getSnapshot().editor?.id})),{id:blockedBoard,editor:'snapshotwidget'},'Retry save cannot replay a previously refused departure');
   await page.locator('.side-editor [data-close]').click();await page.waitForFunction(()=>!aegis.workspace.ui.getSnapshot().editor);await page.frameLocator('.card[data-id="snapshotwidget"] iframe').locator('#queue').waitFor();
   await page.frameLocator('.card[data-id="snapshotwidget"] iframe').locator('html').evaluate(()=>{aegisState={count:49};});
   const background=await page.evaluate(()=>{
    const stage=document.getElementById('stage'),rect=stage.getBoundingClientRect();
    for(let y=120;y<rect.height-80;y+=100)for(let x=100;x<rect.width-80;x+=100){const target=document.elementFromPoint(rect.x+x,rect.y+y);if(stage.contains(target)&&!target.closest('.card')&&!aegis.canvas.engine.hitTest({x,y}))return{x,y};}
    throw Error('No visible canvas background for the export menu');
   });
   await page.locator('#stage').click({position:background,button:'right'});
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('menuitem',{name:'Export board as PNG',exact:true}).click()]);await download.saveAs(join(output,`${name}-acknowledged-export.png`));
   check(await page.evaluate(async()=>JSON.parse((await aegis.host.get(`/boards/${aegis.canvas.board.id}`)).cards.find(c=>c.id==='snapshotwidget').data.state).custom.count),49,'actual export menu awaits snapshot and durable host save');
   await open();
   await page.evaluate(()=>{departureAction='board';});await page.frameLocator('.side-editor iframe').locator('html').evaluate(()=>{nextCount=48;});const old=await page.evaluate(()=>aegis.canvas.board.id);await page.frameLocator('.side-editor iframe').locator('#queue').click();await page.waitForFunction(id=>aegis.canvas.board.id!==id,old);
   check(await page.evaluate(async id=>JSON.parse((await aegis.host.get(`/boards/${id}`)).cards.find(c=>c.id==='snapshotwidget').data.state).custom.count,old),48,'board departure waits for snapshot and host replication');
   check(errors,[],'composed app has no page errors');await page.screenshot({path:join(output,`${name}-sandbox-departure.png`)});
   results.push({engine:name,checks});console.log(JSON.stringify(results.at(-1)));writeFileSync(join(output,'sandbox-lifecycle.json'),JSON.stringify(results,null,2));
  } catch(error) {
    console.log('FAIL DIAGNOSTICS',await page.evaluate(()=>({ui:aegis.workspace.ui.getSnapshot(),saving:aegis.workspace.saving.getSnapshot(),selected:aegis.canvas.selection(),card:aegis.canvas.board.cards.find(c=>c.id==='snapshotwidget'),statuses:[...document.querySelectorAll('[role=status]')].map(el=>el.textContent),frames:[...document.querySelectorAll('iframe')].map(el=>({src:el.src,inert:el.inert}))})));await page.screenshot({path:join(output,`${name}-failure.png`)});throw error;
  } finally {await browser.close();}
 }
} finally {host.kill('SIGTERM');}

}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) await verifySandboxLifecycle();
