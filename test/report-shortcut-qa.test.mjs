import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {request as httpRequest} from 'node:http';
import {startReportShortcutQA,qaModes} from '../scripts/report-shortcut-qa.mjs';

const send=(qa,body=readFileSync(join(qa.input,qa.filenames[0])),token=qa.token)=>fetch(qa.endpoint+'?name='+encodeURIComponent(qa.filenames[0]),{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/octet-stream'},body});
test('native QA endpoint uses real encrypted intake, raw bytes, UTF-8 names and dedup, without moving files or creating a budget',async()=>{
 const qa=await startReportShortcutQA();const root=qa.input;
 try{
  assert.match(qa.origin,/^http:\/\/127\.0\.0\.1:\d+$/);
  const before=readFileSync(join(qa.input,qa.filenames[0]));
  const collision=readFileSync(join(qa.uploaded,'collision.csv'));
  const response=await send(qa);assert.equal(response.status,201);const receipt=await response.json();
  assert.equal(receipt.stored,true);assert.equal(receipt.sourceHash,qa.sourceHash);assert.equal(receipt.cleanupEligible,false);
  const duplicate=await (await send(qa)).json();assert.equal(duplicate.receiptId,receipt.receiptId);assert.equal(duplicate.duplicate,true);
  const status=await fetch(qa.endpoint+'?receipt='+receipt.receiptId,{headers:{authorization:'Bearer '+qa.token}});
  assert.equal(status.status,200);assert.equal((await status.json()).sourceHash,qa.sourceHash);
  assert.deepEqual(qa.stats(),{requests:3,rejectedBodies:0,sources:1,budgets:0});
  assert.deepEqual(readFileSync(join(qa.input,qa.filenames[0])),before);
  assert.deepEqual(readFileSync(join(qa.uploaded,'collision.csv')),collision);
 }finally{await qa.close();}assert.equal(existsSync(root),false);
});
test('QA sink rejects arbitrary report contents, JSON wrappers, unknown tokens and private routes',async()=>{
 const qa=await startReportShortcutQA();try{
  assert.equal((await send(qa,Buffer.from('arbitrary report — must never be accepted'))).status,422);
  assert.equal((await send(qa,Buffer.from(JSON.stringify({file:'wrapped'})))).status,422);
  assert.equal((await send(qa,undefined,'X'.repeat(43))).status,401);
  assert.equal((await fetch(qa.origin+'/api/plan')).status,404);
  // fetch owns its Host header; use HTTP directly to exercise rebinding rejection.
  const wrongHost=await new Promise((resolve,reject)=>{const request=httpRequest(qa.endpoint,{headers:{host:'budgit.duckdns.org'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);request.end();});
  assert.equal(wrongHost,403);
  assert.equal((await send(qa,Buffer.alloc(5*1024*1024+1))).status,413);
  assert.equal(qa.stats().sources,0);assert.equal(qa.stats().budgets,0);
 }finally{await qa.close();}
});
test('native acceptance fault cases really produce invalid receipts or transport failures while preserving fixture bytes',async()=>{
 for(const mode of qaModes.filter(m=>m!=='success')){
  const qa=await startReportShortcutQA({mode});try{
   const original=readFileSync(join(qa.input,qa.filenames[0]));
   if(mode==='disconnect')await assert.rejects(send(qa));
   else{
    const response=await send(qa);
    if(mode==='unauthorized'||mode==='unavailable'){assert.equal(response.status,mode==='unauthorized'?401:503);assert.equal(qa.stats().sources,0);}
    else if(mode==='malformed-json')await assert.rejects(response.json());
    else{assert.equal(response.status,200);const receipt=await response.json();
     if(mode==='wrong-hash')assert.notEqual(receipt.sourceHash,qa.sourceHash);
     else if(mode==='missing-receipt')assert.equal(receipt.receiptId,undefined);
     else assert.notEqual(receipt.stored,true);
    }
   }
   assert.deepEqual(readFileSync(join(qa.input,qa.filenames[0])),original,mode);
   assert.equal(qa.stats().budgets,0);
  }finally{await qa.close();}
 }
});
