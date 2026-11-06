import test from 'node:test';
import assert from 'node:assert/strict';
import {fullReportGroup,fullReportReceipt} from '../server/report-cleanup.mjs';
import {reportHash} from '../server/report-crypto.mjs';
const hash='a'.repeat(64);
function fixture(){
 const item={id:'batch',storedId:'source',storedRevision:2,hash,kind:'bank',target:'bank',bankOptions:{scope:'complete'},monthDecisions:{},from:'2026-01-01',to:'2026-01-31',records:[{date:'2026-01-15',valid:true,currency:'ILS'}]};
 const row={id:'source',source_hash:hash,revision:2,parsedDraft:{version:1,items:[item]}};
 const plan={bankImport:{batches:[{id:'batch',accountId:'bank'}]},reportInbox:{receipts:[{hash,kind:'bank',target:'bank',reference:'batch'}]}};
 return {row,item,plan};
}
test('Partial, activity-cycle, ambiguous, skipped and inconsistent groups never prove full import',()=>{
 const {row,plan}=fixture();assert.equal(fullReportGroup(plan,[row]).length,1);
 for(const mutate of [i=>i.activity={entries:[{dueDate:'2026-01-01'},{dueDate:'2026-02-01'}]},i=>i.sheets=[{},{}],i=>i.from='2026-01-16',i=>i.to='2026-01-14',i=>i.records[0].valid=false,i=>i.skip=true,i=>i.error='failed',i=>i.kind='sheets',i=>i.bankOptions.scope='partial',i=>i.monthDecisions['2026-01']='skip',i=>i.hash='b'.repeat(64),i=>i.storedId='other']){
  const f=fixture();mutate(f.item);assert.equal(fullReportGroup(f.plan,[f.row]),null);
 }
 const f=fixture();f.row.parsedDraft.items.push({...f.item,storedId:'pending'});assert.equal(fullReportGroup(f.plan,[f.row]),null);
 assert.equal(fullReportGroup(plan,[row,{...row,id:'pending',parsedDraft:{version:1,items:[]}}]),null);
 plan.reportInbox.receipts=[];assert.equal(fullReportGroup(plan,[row]),null);
});
test('Card completion requires the full-file receipt and current bill/detail proof; cycle receipts do not qualify',()=>{
 const member={hash,kind:'card',target:'card',reference:'2026-01-15'},plan={cardBilling:{reports:[{cardId:'card',dueDate:member.reference,amount:10}]},details:[{id:'detail',method:'card',statement:{dueDate:member.reference}}],reportInbox:{receipts:[{...member,proof:reportHash(JSON.stringify([10,['detail']]))}]}};
 assert.equal(fullReportReceipt(plan,member),true);
 plan.cardBilling.reports[0].amount=11;assert.equal(fullReportReceipt(plan,member),false);
 plan.cardBilling.reports[0].amount=10;plan.details.push({id:'other',method:'card',statement:{dueDate:member.reference}});assert.equal(fullReportReceipt(plan,member),false);
 plan.details.pop();plan.reportInbox.receipts[0].hash=reportHash(hash+':cal-cycle:'+member.reference);assert.equal(fullReportReceipt(plan,member),false);
});
