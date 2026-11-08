import assert from 'node:assert/strict';
import {guidedFixture,hash} from './guided-report-fixture.mjs';
import {readAutomaticSource} from '../../server/report-automation.mjs';
import {loadBudgetSnapshot} from '../../frontend/src/app/budget-api.ts';
import {loadReportGroup} from '../../frontend/src/app/report-group-loader.ts';
import {buildReportInbox} from '../../src/report-inbox-controller.js';
import * as classifier from '../../tools/bank-csv/classifier.mjs';
import * as activityAPI from '../../tools/bank-csv/cal-activity.mjs';
import XLSX from '../../tools/bank-csv/vendor/xlsx-mini.cjs';

export function duplicateBankWorkbook(author='original'){
 const workbook=XLSX.utils.book_new();workbook.Props={Author:author};XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['הפועלים'],['מספר חשבון 123456'],['תאריך','תיאור','אסמכתא','חובה','זכות','יתרה'],['28/02/2026','משכורת','1001','',100.01,1100.01]]),'תנועות');return Buffer.from(XLSX.write(workbook,{type:'array',bookType:'xlsx'}));
}
export function installReportReaderWorker(){
 const previous=globalThis.Worker;
 globalThis.Worker=class{postMessage(message){const name=message.action==='pdf'?'source.pdf':message.format==='xls'?'source.xls':'source.xlsx';readAutomaticSource(name,new Uint8Array(message.bytes)).then(({parsed})=>this.onmessage?.({data:{id:message.id,intake:parsed}})).catch(error=>this.onmessage?.({data:{id:message.id,error:error.message}}))}terminate(){}};
 return ()=>{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous};
}
export async function duplicateCompletionFixture({bank=false,exact=false,committed=false,count=1}={}){
 const sourceName=bank?'bank.xlsx':'cal.pdf',c=await guidedFixture(bank?{sourceName,sourceBytes:duplicateBankWorkbook()}:{});
 await c.progress(committed?'later':'resolved');await c.commit();
 let ids=[];
 if(committed)ids=[c.id];
 else if(exact){c.db.prepare("UPDATE report_sources SET state='received',draft=NULL WHERE id=?").run(c.id);c.db.prepare('DELETE FROM report_lifecycle WHERE source_id=?').run(c.id);ids=[c.id]}
 else for(let index=0;index<count;index++){
  const bytes=bank?duplicateBankWorkbook('equivalent-'+index):Buffer.concat([c.bytes,Buffer.from('\n% duplicate encoding '+index+'\n')]);
  const received=await(await c.receive(bytes,bank?'duplicate-'+index+'.xlsx':'duplicate-'+index+'.pdf')).json();
  assert.ok(received.receiptId);assert.equal((await c.post('/api/report-intake',{action:'approve',id:received.receiptId,sourceHash:hash(bytes),revision:1,confirm:true})).status,200);
  const base=(await loadBudgetSnapshot('personal',new AbortController().signal,c.fetcher)).value;
  const response=await c.post('/api/report-intake',{action:'route',id:received.receiptId,sourceHash:hash(bytes),revision:1,confirm:true,budget:'personal',budgetRevision:base.revision,kind:bank?'bank':'card',target:bank?'bank-a':'card1',identityKey:hash(bank?'bank:hapoalim:123456':'cal:1234'),remember:false,bindingRevision:1});
  const routed=await response.json();assert.ok(routed.reportId,JSON.stringify(routed));ids.push(routed.reportId);
 }
 const base=(await loadBudgetSnapshot('personal',new AbortController().signal,c.fetcher)).value;
 const group=await loadReportGroup('personal',base,ids,new AbortController().signal,c.fetcher,false,{kind:bank?'bank':'card',target:bank?'bank-a':'card1'});
 await buildReportInbox(base.plan,group.ui,{month:'2026-11',today:'2026-11-08',classifier,activityAPI});
 return {c,base,group,ids};
}
