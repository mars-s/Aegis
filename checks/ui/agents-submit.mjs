import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,webkit} from './playwright.mjs';
import {out} from './out.mjs';
export async function verifyAgentSubmission(){
 const root=new URL('../..',import.meta.url).pathname.replace(/\/$/,''),results=[],failures=[];
 const check=(actual,expected,label)=>{try{assert.deepEqual(actual,expected,label);}catch(error){failures.push(error.message);}console.log(label,JSON.stringify(actual));};
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const token=`agent-submit-${name}-${process.pid}`,host=spawn(process.execPath,['dist/main.js'],{cwd:root+'/agent',env:{...process.env,AEGIS_PORT:'0',AEGIS_TOKEN:token,AEGIS_UI:root+'/app/dist',AEGIS_DATA:mkdtempSync('/tmp/aegis-submit-data-'),AEGIS_VITE_CACHE:mkdtempSync('/tmp/aegis-submit-cache-'),AEGIS_FAKE_MODEL:'1',AEGIS_FAKE_DELAY_MS:'1800'},stdio:['ignore','pipe','pipe']});
  let browser,release;
  try{
   const port=await new Promise((done,fail)=>{let log='';const timer=setTimeout(()=>fail(Error(log)),15000);host.stdout.on('data',data=>{log+=data;const m=/"port":(\d+)/.exec(log);if(m){clearTimeout(timer);done(m[1]);}});host.once('exit',fail);});
   browser=await engine.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});
   await page.addInitScript(()=>{localStorage.setItem('aegis:introduction-complete','1');localStorage.setItem('aegis:orb-hint-seen','1');localStorage.setItem('aegis:model','fake|fake');});
   await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);await page.waitForFunction(()=>window.aegis?.canvas.board);
   const gate=new Promise(done=>{release=done;});
   await page.route('**/agents',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}const response=await route.fetch();await gate;await route.fulfill({response});});
   await page.keyboard.press('/');await page.locator('#prompt').waitFor({state:'visible'});
   await page.locator('#orbMenuButton').click();await page.locator('#orbMenu').getByRole('menuitem',{name:'Agent count',exact:false}).click();await page.locator('#orbMenu').getByRole('menuitemradio',{name:'2 agents',exact:true}).click();
   await page.locator('#prompt').fill('FAKE []');await page.locator('#prompt').press('Enter');await page.waitForFunction(()=>document.querySelectorAll('.agent-window').length===2);
   check(await page.locator('#prompt').isVisible(),false,`${name}: accepted submit collapses before its held HTTP acknowledgement`);
   await page.keyboard.press('/');await page.locator('#orbMenuButton').click();await page.locator('#orbMenu').getByRole('menuitem',{name:'Agent count',exact:false}).click();await page.locator('#orbMenu').getByRole('menuitemradio',{name:'1 agent',exact:true}).click();
   release();await page.waitForFunction(()=>!document.getElementById('send').disabled);
   check(await page.locator('#prompt').isVisible(),true,`${name}: late acknowledgement retains the newer native slash and menu intent`);
   await page.unroute('**/agents');await page.route('**/agents',route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Submission fixture unavailable'})}):route.continue());
   await page.locator('#prompt').fill('Keep this unsent thought');await page.locator('#prompt').press('Alt+Enter');await page.getByRole('alert').filter({hasText:'Submission fixture unavailable'}).waitFor();
   check({text:await page.locator('#prompt').inputValue(),visible:await page.locator('#prompt').isVisible()},{text:'Keep this unsent thought',visible:true},`${name}: refused submission restores the untouched draft`);
   check(await page.locator('.agent-window').count(),2,`${name}: refused submission starts no additional agents`);
   results.push({engine:name});
  }finally{release?.();await browser?.close();host.kill('SIGTERM');}
 }
 writeFileSync(out('agents-submit.json'),JSON.stringify({results,failures},null,2));assert.deepEqual(failures,[]);
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await verifyAgentSubmission();
