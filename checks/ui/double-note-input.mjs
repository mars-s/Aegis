import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,webkit} from './playwright.mjs';
import {out} from './out.mjs';
export async function verifyDoubleNoteInput(){
 const root=new URL('../..',import.meta.url).pathname.replace(/\/$/,''),results=[],failures=[];
 const check=(actual,expected,label)=>{try{assert.deepEqual(actual,expected,label);}catch(error){failures.push(error.message);}console.log(label,JSON.stringify(actual));};
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const token=`double-note-${name}-${process.pid}`,host=spawn(process.execPath,['dist/main.js'],{cwd:root+'/agent',env:{...process.env,AEGIS_PORT:'0',AEGIS_TOKEN:token,AEGIS_UI:root+'/app/dist',AEGIS_DATA:mkdtempSync('/tmp/aegis-double-data-'),AEGIS_VITE_CACHE:mkdtempSync('/tmp/aegis-double-cache-'),AEGIS_FAKE_MODEL:'1'},stdio:['ignore','pipe','pipe']});
  let browser;
  try{
   const port=await new Promise((done,fail)=>{let log='';const timer=setTimeout(()=>fail(Error(log)),15000);host.stdout.on('data',data=>{log+=data;const m=/"port":(\d+)/.exec(log);if(m){clearTimeout(timer);done(m[1]);}});host.once('exit',fail);});
   browser=await engine.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});
   await page.addInitScript(()=>{localStorage.setItem('aegis:onboarded','1');localStorage.setItem('aegis:orb-hint-seen','1');});
   await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);await page.waitForFunction(()=>window.aegis?.canvas.board);
   await page.evaluate(()=>{aegis.canvas.setView({x:2000,y:2000,z:1});localStorage.setItem('aegis:double-click-note','off');});
   await page.waitForTimeout(100);
   const initial=await page.evaluate(()=>aegis.canvas.board.cards.length);
   await page.evaluate(()=>{
    const request=window.requestAnimationFrame.bind(window),held=[];let id=0;
    window.requestAnimationFrame=callback=>{held.push(callback);return --id;};
    window.restoreDoubleNoteFrames=()=>{window.requestAnimationFrame=request;for(const callback of held)request(callback);delete window.restoreDoubleNoteFrames;};
   });
   await page.waitForTimeout(60);
   await page.mouse.dblclick(900,300);
   check(await page.evaluate(()=>aegis.canvas.board.cards.length),initial,`${name}: disabled double-click remains inert while paint is held`);
   await page.evaluate(()=>localStorage.setItem('aegis:double-click-note','on'));
   await page.mouse.dblclick(900,300);
   check(await page.evaluate(()=>aegis.canvas.board.cards.length),initial+1,`${name}: native double-click commits before the next paint`);
   await page.evaluate(()=>window.restoreDoubleNoteFrames());
   await page.waitForFunction(count=>aegis.canvas.board.cards.length===count,initial+1);
   await page.waitForFunction(()=>document.querySelector('#saveState, .bar-right [data-save-state]').textContent.toLowerCase()==='saved');
   const board=await page.evaluate(()=>aegis.host.get(`/boards/${aegis.canvas.board.id}`));
   check(board.cards.length,initial+1,`${name}: release of held paint retains one persisted creation`);
   results.push({engine:name});
  }finally{await browser?.close();host.kill('SIGTERM');}
 }
 writeFileSync(out('double-note-input.json'),JSON.stringify({results,failures},null,2));assert.deepEqual(failures,[]);
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await verifyDoubleNoteInput();
