import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {z} from 'zod/v4';
import {inspectSource} from '../../../scripts/check-safe-types.js';
import {BoardSchema,CardIdSchema,LegacyBoardSchema,preserve} from '@aegis/domain/schema';
import {applyBatch,emptyBoard} from '@aegis/domain/commands';
import {agentJsonSchemas,jsonSchema} from '@aegis/domain/objects';
import {decodeStoredBoard,decodeLegacyStoredBoard,encodeStoredBoard,decodeStoredLibrary,encodeStoredLibrary} from '@aegis/protocol/storage';
import {decodeBoardList,decodeBatchResponse,decodeHostEvent,decodeOkResponse} from '@aegis/protocol/http';
import {EventDecoder} from '@aegis/protocol/events';

test('all ported production and differential test files have zero safe-type findings',()=>{
  const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(path=>path.endsWith('.ts') && (path.startsWith('packages/domain/')||path.startsWith('packages/protocol/')||path.startsWith('checks/unit/domain/')||path==='agent/link-preview.ts'));
  const findings=paths.flatMap(path=>inspectSource(path,readFileSync(path,'utf8')));
  expect(findings).toEqual([]);
});
test('every agent object schema exports with unrepresentable constructs refused',()=>{
  const schemas=agentJsonSchemas();
  expect(schemas.size).toBe(18);
  for(const schema of schemas.values()) expect(schema.type).toBe('object');
  expect(()=>jsonSchema(z.date())).toThrow();
});
test('board and library codecs preserve JSON key order, metadata and omissions',()=>{
  const board={custom:{version:1},...emptyBoard('file','Saved'),view:{z:8,y:2,x:-3}};
  expect(encodeStoredBoard(decodeStoredBoard(board))).toBe(JSON.stringify(board));
  const legacy={...board,cards:[{id:'oldcard',type:'deck',text:'Old',props:{slides:[{id:'old',layout:'title'}]}}]};
  const parsed=decodeLegacyStoredBoard(legacy);
  expect(encodeStoredBoard(parsed)).toBe(JSON.stringify(legacy));
  expect(LegacyBoardSchema.safeParse(parsed).success).toBe(true);
  expect(BoardSchema.safeParse(parsed).success).toBe(false);
  const library={custom:true,boards:{file:'project'},nodes:[{name:'Work',id:'project',kind:'project',parent:null,cover:'local'}]};
  expect(encodeStoredLibrary(decodeStoredLibrary(library))).toBe(JSON.stringify(library));
  const cardId=CardIdSchema.parse('known');
  expect(preserve(CardIdSchema,cardId)).toBe(cardId);
});
test('HTTP decoders retain legacy success, error and all event variants',()=>{
  const rows=[{id:'b',name:'Board',cards:2,rev:1,boardParent:null,editedAt:null,subtitle:'Work'}];
  expect(decodeBoardList(rows)).toEqual(rows);
  expect(decodeBatchResponse({ok:true,rev:2,created:{n:'card01'}})).toEqual({ok:true,rev:2,created:{n:'card01'}});
  expect(decodeBatchResponse({ok:false,errors:[{index:0,reason:'no card old'}]}).ok).toBe(false);
  for(const event of [{type:'library'},{type:'auth',provider:'openai'},{type:'ui'},{type:'agent',id:'a',boardId:'b',revision:2,custom:{status:'Busy'}}]) expect(decodeHostEvent(event)).toEqual(event);
  const board={type:'board',boardId:'b',rev:2,baseRev:1,touched:[],focus:null,author:{kind:'user'},sentAt:5,patch:{cards:[],removed:[],fields:{bg:null,palette:null,tray:[]}}};
  expect(decodeHostEvent(board)).toEqual(board);
  expect(()=>decodeHostEvent({type:'unknown'})).toThrow();
  expect(()=>decodeHostEvent({})).toThrow();
  expect(()=>decodeOkResponse({ok:false})).toThrow();
  expect(decodeOkResponse({ok:true})).toBeUndefined();
});
test('SSE framing is independent of chunks and handles comments and CRLF',()=>{
  const decoder=new EventDecoder();
  expect(decoder.push(': hi\r\n\r\ndata: {"type":')).toEqual([]);
  expect(decoder.push('"library"}\r\n\r\ndata: first\ndata: second\n')).toEqual(['{"type":"library"}']);
  expect(decoder.push('\n: ping\n\n')).toEqual(['first\nsecond']);
  decoder.push('data: incomplete');decoder.reset();expect(decoder.push('\n\n')).toEqual([]);
});

test('malformed reserved presentation props are refused atomically',()=>{
  const board=emptyBoard('reserved-props');
  const result=applyBatch(board,{commands:[{op:'create',type:'note',props:{fixedHeight:'invalid'}}]});
  expect(result.ok).toBe(false);
  expect(result.board).toBe(board);
  expect(result.errors[0]?.reason).toContain('fixedHeight');
  expect(BoardSchema.safeParse(result.board).success).toBe(true);
});
