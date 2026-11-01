import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,webkit} from './playwright.mjs';
import {out} from './out.mjs';
export async function verifyStartupBoard(){
 const root=new URL('../..',import.meta.url).pathname.replace(/\/$/,''),failures=[],results=[];
 const check=(actual,expected,label)=>{try{assert.deepEqual(actual,expected,label);}catch(error){failures.push(error.message);}console.log(label,JSON.stringify(actual));};
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const data=mkdtempSync('/tmp/aegis-startup-data-'),boards=join(data,'boards');mkdirSync(boards);
  const board=id=>({id,name:id,rev:1,cards:[],links:[],view:{x:0,y:0,z:1}});
  writeFileSync(join(boards,'zzzzboard.json'),JSON.stringify(board('zzzzboard')));
  const token=`startup-${name}-${process.pid}`,host=spawn(process.execPath,['dist/main.js'],{cwd:root+'/agent',env:{...process.env,AEGIS_PORT:'0',AEGIS_TOKEN:token,AEGIS_UI:root+'/app/dist',AEGIS_DATA:data,AEGIS_VITE_CACHE:mkdtempSync('/tmp/aegis-startup-cache-'),AEGIS_FAKE_MODEL:'1'},stdio:['ignore','pipe','pipe']});let browser;
  try{
   const port=await new Promise((done,fail)=>{let log='';const timer=setTimeout(()=>fail(Error(log)),15000);host.stdout.on('data',data=>{log+=data;const m=/"port":(\d+)/.exec(log);if(m){clearTimeout(timer);done(m[1]);}});host.once('exit',fail);});
   browser=await engine.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});
   await page.addInitScript(()=>{localStorage.setItem('aegis:introduction-complete','1');localStorage.setItem('aegis:orb-hint-seen','1');});
   await page.goto(`http://127.0.0.1:${port}/ui/index.html?port=${port}&token=${token}`);await page.waitForFunction(()=>window.aegis?.canvas.board);
   check(await page.evaluate(()=>aegis.canvas.board.id),'zzzzboard',`${name}: first startup opens the only real board`);
   check(await page.evaluate(()=>localStorage.getItem('aegis:board')),'zzzzboard',`${name}: startup retains the actual loaded board identity`);
   writeFileSync(join(boards,'aaaaboard.json'),JSON.stringify(board('aaaaboard')));
   check((await page.evaluate(()=>aegis.host.get('/boards')))[0].id,'aaaaboard',`${name}: another real board now leads the host listing`);
   await page.reload();await page.waitForFunction(()=>window.aegis?.canvas.board);
   check(await page.evaluate(()=>aegis.canvas.board.id),'zzzzboard',`${name}: reload retains the original board despite changed listing order`);
   results.push({engine:name});
  }finally{await browser?.close();host.kill('SIGTERM');}
 }
 writeFileSync(out('startup-board.json'),JSON.stringify({results,failures},null,2));assert.deepEqual(failures,[]);
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await verifyStartupBoard();
