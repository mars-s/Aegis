import { afterAll, describe, expect, test, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
const requireBaseline = createRequire(import.meta.url);
import { z } from 'zod/v4';
import { checkObject, OBJECT_KINDS, SHAPES } from '../../../packages/domain/src/objects.js';
import {applyBatch,emptyBoard} from '../../../packages/domain/src/commands.js';
import {CardSchema, BoardSchema} from '../../../packages/domain/src/schema.js';
import {sandboxDocument} from '@aegis/protocol/sandbox';
import {themeCss,themeHtml} from '@aegis/protocol/html-theme';
import {cardSummary} from '@aegis/domain/summary';
import {parseHtmlState} from '@aegis/domain/html-state';
import { parseCsv, queryDataset, profileDataset } from '../../../packages/domain/src/dataset.js';

const baseline = mkdtempSync(join(tmpdir(), 'aegis-domain-baseline-'));
const originalPaths = execFileSync('git', ['ls-tree','-r','--name-only','5dadce5','--','app/src/lib/board','app/src/objects/chart','app/src/objects/kinds/html-sandbox.js','app/src/objects/kinds/html-theme.js'], {encoding:'utf8'}).trim().split('\n').filter(path => /\.(?:js|ts)$/.test(path));
writeFileSync(join(baseline,'package.json'), JSON.stringify({type:'module'}));
for (const path of originalPaths) {
  const destination = join(baseline,path);
  mkdirSync(dirname(destination), {recursive:true});
  writeFileSync(destination,execFileSync('git',['show',`5dadce5:${path}`]));
}
const functions = z.object({checkObject:z.function({input:[z.unknown(),z.unknown()],output:z.unknown()})});
const datasetFunctions = z.object({parseCsv:z.function({input:[z.string()],output:z.unknown()}),queryDataset:z.function({input:[z.unknown(),z.unknown()],output:z.unknown()}),profileDataset:z.function({input:[z.unknown()],output:z.unknown()})});
const oldObjectModule: unknown = requireBaseline(join(baseline,'app/src/lib/board/objects.js'));
const oldDatasetModule: unknown = requireBaseline(join(baseline,'app/src/lib/board/dataset.js'));
const old = functions.parse(oldObjectModule);
const oldData = datasetFunctions.parse(oldDatasetModule);
requireBaseline(join(baseline,'app/src/lib/board/types/index.js'));
const oldCommandModule: unknown = requireBaseline(join(baseline,'app/src/lib/board/commands.js'));
const oldCommands=z.object({applyBatch:z.function({input:[z.unknown(),z.unknown()],output:z.unknown()})}).parse(oldCommandModule);
afterAll(() => rmSync(baseline,{recursive:true,force:true}));
function result(run:()=>unknown): unknown {
  try { return {value:run()}; } catch (error) { return {error: error instanceof Error ? error.message : String(error)}; }
}
function sample(schema: z.core.$ZodType): unknown {
  if (schema instanceof z.ZodOptional) return sample(schema.unwrap());
  const type = z.globalRegistry.get(schema)?.['legacyType'];
  if (type === 'value') return 2;
  if (type === 'tableCell') return 'text';
  if (schema instanceof z.ZodString) return 'x';
  if (schema instanceof z.ZodNumber) return Math.max(1,schema.minValue ?? 0);
  if (schema instanceof z.ZodBoolean) return false;
  if (schema instanceof z.ZodEnum) return schema.options[0];
  if (schema instanceof z.ZodArray) {
    const json = z.toJSONSchema(schema,{unrepresentable:'throw'});
    return Array.from({length:typeof json.minItems === 'number' ? json.minItems : 0},()=>sample(schema.element));
  }
  if (schema instanceof z.ZodObject) {
    const fields: Record<string,z.core.$ZodType> = schema.shape;
    return Object.fromEntries(Object.entries(fields).filter(([,sub]) => !(sub instanceof z.ZodOptional)).map(([key,sub])=>[key,sample(sub)]));
  }
  return null;
}
describe('object validator fidelity against git baseline',()=>{
  for (const kind of OBJECT_KINDS) test(kind,()=>{
    const seed = sample(SHAPES[kind]);
    const cases: unknown[] = [undefined,null,false,0,'text',[],{},seed];
    const record = z.record(z.string(),z.unknown()).parse(seed);
    cases.push({...record,unknown:'x'});
    for (const key of Object.keys(record)) {
      cases.push({...record,[key]:null},{...record,[key]:undefined},{...record,[key]:[]},{...record,[key]:{}},{...record,[key]:'x'.repeat(66000)});
    }
    for (const value of cases) expect(result(()=>checkObject(kind,value))).toEqual(result(()=>old.checkObject(kind,value)));
  });
});
test('CSV parsing and exact query fidelity over generated data',()=>{
  for (let count=1;count<=80;count++) {
    const csv='group,value,date\n'+Array.from({length:count},(_,i)=>`${i%3},${i*3-20},2026-01-${String(i%28+1).padStart(2,'0')}`).join('\n');
    const data=parseCsv(csv);
    expect(data).toEqual(oldData.parseCsv(csv));
    expect(profileDataset(data)).toEqual(oldData.profileDataset(data));
    for (const op of ['count','sum','avg','min','max','median','distinct']) {
      const spec={groupBy:'group',measures:[{op,column:'value'}]};
      expect(queryDataset(data,spec)).toEqual(oldData.queryDataset(data,spec));
    }
  }
  for (const csv of ['', '\ufeffa,b\r\n"a,b","x""y"\r\n', 'a;a;\n1;2;3', 'a\tb\n"multiline\ntext"\t5','a,b\n,\n1']) expect(result(()=>parseCsv(csv))).toEqual(result(()=>oldData.parseCsv(csv)));
});

function deterministic(run:()=>unknown): unknown {
  let seed=8129;
  const random=vi.spyOn(Math,'random').mockImplementation(()=>{seed=(seed*48271)%2147483647;return seed/2147483647;});
  const clock=vi.spyOn(Date,'now').mockReturnValue(1800000000000);
  try {return result(run);} finally {random.mockRestore();clock.mockRestore();}
}
test('atomic command outputs and errors match baseline on generated batches',()=>{
  const board=emptyBoard('fixture','Fixture');
  for(let i=0;i<120;i++) {
    const commands: unknown[]=[
      {op:'create',type:'note',ref:'first',text:`Fixture ${i}`,x:i*5,y:i*2,newId:'firstone'},
      {op:'create',type:'todo',ref:'second',items:[{text:'A',done:i%2===0},'B'],newId:'secondxx'},
      {op:'update',id:'$first',set:{heading:'Heading',w:120+i,props:{custom:i}}},
      {op:'move',id:'$second',x:i*20,y:-i*2},
      {op:'connect',a:'$first',b:'$second',newId:'linkxxxx'},
      {op:'layout',ids:['$first','$second'],shape:i%3===0?'column':i%3===1?'row':'grid',cols:2},
      {op:'focus',ids:['$first']},
    ];
    if(i%5===0) commands.push({op:'update',id:'missing',set:{text:'fails atomically'}});
    const batch={commands};
    expect(deterministic(()=>applyBatch(board,batch))).toEqual(deterministic(()=>oldCommands.applyBatch(board,batch)));
    expect(board).toEqual(emptyBoard('fixture','Fixture'));
  }
  for(const commands of [[],[null],[{op:'unknown'}],[{op:'create',type:'bad'}],[{op:'measure',id:'none',h:0}],[{op:'restore'}],[{op:'board_set',set:{palette:[{hex:'bad',name:'x'}]}}]]) expect(deterministic(()=>applyBatch(board,{commands}))).toEqual(deterministic(()=>oldCommands.applyBatch(board,{commands})));
});
test('feature props, links, nested references and object updates remain exact',()=>{
  const plot={style:'line',x:{kind:'category'},y:{format:'number'},basis:'Fixture',series:[{name:'series',points:[{x:'a',y:1},{x:'b',y:3}]}]};
  const batches=[
    {commands:[{op:'create',type:'doc',text:'Title',props:{body:'# Title\n\nText'},newId:'document'}]},
    {commands:[{op:'create',type:'deck',props:{slides:[{id:'slide1',layout:'title',title:'Title'}]},newId:'deckxxxx'}]},
    {commands:[{op:'create',type:'object',kind:'plot',data:plot,newId:'plotxxxx'}]},
    {commands:[{op:'object_set',id:'plotxxxx',path:['series',0,'points',1,'y'],value:7}]},
    {commands:[{op:'create',type:'note',newId:'notexxxx'},{op:'connect',a:'plotxxxx',b:'notexxxx',newId:'linkxxxx'}]},
    {commands:[{op:'link_update',id:'linkxxxx',set:{bend:42,dash:true,pa:{u:0,v:0.5},arrow:'both',label:'Words'}}]},
    {commands:[{op:'update',id:'document',set:{props:{body:'# Title\nChanged'}}},{op:'order',id:'notexxxx',to:'back'}]},
    {commands:[{op:'board_set',set:{bg:'#101010',palette:[{hex:'#AABBCC',name:'  Test  '}],tray:[{custom:true}]}}]},
    {commands:[{op:'delete',id:'plotxxxx'}]},
  ];
  let board=emptyBoard('features');
  for(const batch of batches) {
    expect(deterministic(()=>applyBatch(board,batch))).toEqual(deterministic(()=>oldCommands.applyBatch(board,batch)));
    const next=applyBatch(board,batch);
    expect(next.ok).toBe(true);
    board=BoardSchema.parse(next.board);
  }
  expect(CardSchema.array().safeParse(board.cards).success).toBe(true);
});

const fixturePath=join(baseline,'genui-fixtures.mjs');
writeFileSync(fixturePath,execFileSync('git',['show','5dadce5:agent/checks/genui-fixtures.mjs']));
const fixtureModule:unknown=requireBaseline(fixturePath);
const fixtureInputs=z.object({genuiSamples:z.record(z.string(),z.unknown())}).parse(fixtureModule).genuiSamples;
const coreInputs:Record<string,unknown>={
  reply:{headline:'A result',text:'A supported answer',figures:[{label:'Value',value:12}],points:['One']},
  plot:{style:'line',x:{kind:'category'},y:{format:'number'},basis:'Fixture',series:[{name:'Value',points:[{x:'A',y:'$1,234'},{x:'B',y:9},{x:'Gap',y:null}]}]},
  sheet:{columns:[{label:'Value',kind:'number'}],rows:[{cells:[5]},{cells:[null]}]},
  diagram:{nodes:[{id:'a',name:'Start',kind:'step'},{id:'b',name:'End',kind:'step'}],edges:[{from:'a',to:'b'}]},
  plan:{steps:[{title:'Start',kind:'task',date:'2026-10-27'}]},
  list:{style:'todo',items:[{title:'Read',done:false}]},
  code:{language:'js',text:'const x = 1;',notes:[{from:1,to:1,text:'A value'}]},
};
function mutate(value:unknown,path:readonly string[],replacement:unknown):unknown {
  const [first,...rest]=path;
  if(first===undefined) return replacement;
  if(Array.isArray(value)) return value.map((item:unknown,index:number)=>String(index)===first ? mutate(item,rest,replacement) : item);
  const record=z.record(z.string(),z.unknown()).parse(value);
  return {...record,[first]:mutate(record[first],rest,replacement)};
}
function paths(value:unknown,prefix:string[]=[]):string[][] {
  if(value===null || typeof value !== 'object') return [prefix];
  if(Array.isArray(value)) return [prefix,...value.slice(0,2).flatMap((item:unknown,i:number)=>paths(item,[...prefix,String(i)]))];
  return [prefix,...Object.entries(value).flatMap(([key,item])=>paths(item,[...prefix,key]))];
}
for(const kind of OBJECT_KINDS) test(`valid and nested mutated ${kind} fixture fidelity`,()=>{
  const input=coreInputs[kind] ?? fixtureInputs[kind];
  expect(()=>checkObject(kind,input)).not.toThrow();
  expect(checkObject(kind,input)).toEqual(old.checkObject(kind,input));
  for(const path of paths(input).slice(0,30)) for(const replacement of [null,undefined,false,0,'bad',[],{}]) {
    const value=mutate(input,path,replacement);
    expect(result(()=>checkObject(kind,value))).toEqual(result(()=>old.checkObject(kind,value)));
  }
});
const oldSummaryModule:unknown=requireBaseline(join(baseline,'app/src/lib/board/summary.js'));
const oldSummary=z.object({cardSummary:z.function({input:[z.unknown(),z.unknown()],output:z.unknown()})}).parse(oldSummaryModule);
const oldSandboxModule:unknown=requireBaseline(join(baseline,'app/src/objects/kinds/html-sandbox.js'));
const oldSandbox=z.object({sandboxDocument:z.function({input:[z.unknown(),z.string(),z.string(),z.string(),z.boolean()],output:z.string()}),parseHtmlState:z.function({input:[z.unknown()],output:z.unknown()})}).parse(oldSandboxModule);
const oldThemeModule:unknown=requireBaseline(join(baseline,'app/src/objects/kinds/html-theme.js'));
const oldTheme=z.object({themeCss:z.function({input:[z.string()],output:z.string()}),themeHtml:z.function({input:[z.string(),z.string()],output:z.string()})}).parse(oldThemeModule);
test('summaries of every valid object fixture match baseline',()=>{
  for(const kind of OBJECT_KINDS) {
    const data=checkObject(kind,coreInputs[kind] ?? fixtureInputs[kind]);
    const card=CardSchema.parse({id:'fixture',type:'object',kind,data,text:'Evidence',color:'plain',x:0,y:0,w:500,h:300,ver:1});
    expect(cardSummary(card,[])).toEqual(oldSummary.cardSummary(card,[]));
  }
});
test('sandbox HTML, theme rewrites and bounded state match baseline',()=>{
  const html={html:'<h2 style="color:#fff">Fixture</h2>',css:'body{background:white;color:black}button{background:blue;color:white}',js:'window.fixture=1'};
  for(const motion of [true,false]) expect(sandboxDocument(html,'channel','--card:#111;','',motion)).toBe(oldSandbox.sandboxDocument(html,'channel','--card:#111;','',motion));
  for(const css of ['',html.css,'p{color:rgba(255,255,255,.5);box-shadow:0 2px 6px red}','/* aegis: own-colours */p{color:gold}']) {
    expect(themeCss(css)).toBe(oldTheme.themeCss(css));
    expect(themeHtml(html.html,css)).toBe(oldTheme.themeHtml(html.html,css));
  }
  for(const state of [null,'bad','{}',JSON.stringify({version:1,controls:[],text:[],custom:{count:2}}),JSON.stringify({version:1,controls:[],text:[],custom:'x'.repeat(66000)})]) expect(parseHtmlState(state)).toEqual(oldSandbox.parseHtmlState(state));
});
test('successful and restored board serialisation retains baseline insertion order',()=>{
  const board=emptyBoard('order');
  const batch={commands:[{op:'create',newId:'orderone',type:'doc',text:'Title',props:{custom:2,body:'# Title\nWords'}},{op:'update',id:'orderone',set:{badge:'New',props:{next:true}}}]};
  expect(JSON.stringify(deterministic(()=>applyBatch(board,batch)))).toBe(JSON.stringify(deterministic(()=>oldCommands.applyBatch(board,batch))));
});

test('dataset row previews and link metadata previews keep their distinct shapes',()=>{
 const board=emptyBoard('previews');
 const batch={commands:[{op:'create',type:'dataset',newId:'datasetx',props:{src:'asset:fixture.csv',name:'fixture.csv',rows:2,columns:['task','hours'],preview:[['Review','4'],['Publish','2']],profile:{rows:2,columns:[]}}},{op:'create',type:'link',newId:'linkcard',url:'https://example.com',props:{preview:{title:'Example',description:'Details'}}}]};
 expect(deterministic(()=>applyBatch(board,batch))).toEqual(deterministic(()=>oldCommands.applyBatch(board,batch)));
});

test('object_set retains optional removal, array length and invalid path errors',()=>{
 const created=applyBatch(emptyBoard('paths'),{commands:[{op:'create',type:'object',kind:'plot',newId:'pathplot',data:coreInputs.plot}]});
 const board=BoardSchema.parse(created.board);
 for(const command of [
  {op:'object_set',id:'pathplot',path:['headline'],value:undefined},
  {op:'object_set',id:'pathplot',path:['series',0,'points','length'],value:1},
  {op:'object_set',id:'pathplot',path:['series',0,'points',2,'y','extra'],value:1},
  {op:'object_set',id:'pathplot',path:['series',0,'points',0,'y','extra'],value:1},
  {op:'object_set',id:'pathplot',path:['series',0,'points',0,'x',0],value:'B'},
  {op:'object_set',id:'pathplot',path:['absent','x'],value:1},
 ]) expect(deterministic(()=>applyBatch(board,{commands:[command]}))).toEqual(deterministic(()=>oldCommands.applyBatch(board,{commands:[command]})));
});

test('legacy in-memory chart snapshots with explicit missing headlines remain editable',()=>{
 const first={commands:[
  {op:'create',type:'object',kind:'sheet',newId:'sourcesh',data:{columns:[{label:'Name',kind:'text'},{label:'Value',kind:'number'}],rows:[{cells:['A','1']},{cells:['B','3']}]}},
  {op:'create',type:'object',kind:'plot',newId:'sourcepl',data:{style:'line',x:{kind:'category'},y:{format:'number'},basis:'Fixture',source:{cardId:'sourcesh',xColumn:0,yColumns:[1]},series:[{name:'Value',points:[{x:'A',y:1},{x:'B',y:3}]}]}},
  {op:'create',type:'deck',newId:'sourcedk',props:{slides:[{id:'live',title:'Before',chart:{sourceId:'sourcepl'}}],current:0}},
 ]};
 const created=applyBatch(emptyBoard('live'),first);
 const board=BoardSchema.parse(created.board);
 const deck=board.cards.find(card=>card.id==='sourcedk');
 const legacySpec=deck?.props?.slides?.[0]?.chart?.spec;
 if(!legacySpec)throw new Error('Missing legacy chart snapshot fixture');
 Object.defineProperty(legacySpec,'headline',{value:undefined,enumerable:true,writable:true,configurable:true});
 expect(Object.hasOwn(deck?.props?.slides?.[0]?.chart?.spec ?? {},'headline')).toBe(true);
 const slides=structuredClone(deck?.props?.slides ?? []);
 const slide=slides[0];if(slide)slide.title='After';
 const batch={commands:[{op:'update',id:'sourcedk',set:{props:{slides,current:0}}}]};
 expect(deterministic(()=>applyBatch(board,batch))).toEqual(deterministic(()=>oldCommands.applyBatch(board,batch)));
 expect(applyBatch(board,batch).ok).toBe(true);
});
