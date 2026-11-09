import test from 'node:test';
import assert from 'node:assert/strict';
import {zero,validatePlan} from '../src/budget.js';
import {buildReportInbox,changeReportInbox,reportInboxDraft,inboxBankGroupKey} from '../src/report-inbox-controller.js';
import {reportClassificationRows,reportReviewChecks,optionalCategoryCounts,bankClassificationOptions} from '../frontend/src/app/report-classification-model.ts';
import * as classifier from '../tools/bank-csv/classifier.mjs';
const plan=()=>({startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true,creditCards:[{id:'card1',name:'בדיקה',provider:'cal',alias:'1234'}],cashPlanning:{accounts:[{id:'a',label:'חשבון',bankName:'hapoalim',buffer:0}],months:{},cardAccounts:{card1:'a'},transfers:[]}});
const record=(line,amountCents=-1000,description='פעולה לבדיקה',reference='ref-'+line)=>({line,date:'2026-02-'+String(line+1).padStart(2,'0'),reference,description,amountCents,valid:true,currency:'ILS',balanceCents:null,details:'',beneficiary:'',purpose:''});
const bank=records=>({id:'bank-source',storedId:'bank-source',storedRevision:1,name:'file.pdf',kind:'bank',target:'a',from:'2026-02-01',to:'2026-02-28',records,hash:'a'.repeat(64),decisions:{},directIncluded:{},monthDecisions:{},bankOptions:{scope:'complete'}});
const ui=items=>({items,newAccounts:[],newCards:[],categoryChoices:new Map(),bankChoices:new Map(),startMonth:'2026-01',duplicates:0,merchantRules:[],groupId:'classification-group'});
const build=(p,u)=>buildReportInbox(p,u,{month:'2026-11',today:'2026-11-09',classifier,activityAPI:null});

test('Seven matching conflicts show every source movement and seven exact actionable checks without inventing missing categories',async()=>{
 const p=plan(),rows=Array.from({length:7},(_,i)=>record(i+1,-1000,'תנועת בדיקה '+i,'')),first=ui([bank(rows)]);
 for(const row of rows)first.bankChoices.set(inboxBankGroupKey(first.items[0],row),{field:'variable',refund:false});
 await build(p,first);assert.equal(first.issues,0);assert.ok(first.build);
 const saved=first.build,before=JSON.stringify(saved),next=ui([bank(rows)]);next.items[0].id='second';next.items[0].hash='b'.repeat(64);await build(saved,next);
 assert.equal(next.issues,7);assert.equal(next.bankGroups.length,0);assert.equal(next.bankReviewGroups.length,0);
 const shown=reportClassificationRows(next)[0].rows,checks=reportReviewChecks(next);
 assert.equal(shown.length,7);assert.ok(shown.every(row=>row.status==='נדרשת בדיקת התאמה'&&!row.editable&&row.checkId));
 assert.equal(checks.length,7);assert.ok(checks.every(check=>check.step==='exceptions'&&check.label==='בדיקה אם התנועה כבר נרשמה'));
 assert.deepEqual(shown.map(row=>row.checkId),checks.map(check=>check.id));assert.equal(optionalCategoryCounts(next).missing,0);assert.equal(JSON.stringify(saved),before);assert.equal(next.build,null);
});
test('Automatic and selected bank groups remain visible and editable through the original group choice, with exact cents and draft resume',async()=>{
 const p=plan(),before=JSON.stringify(p),u=ui([bank([record(1,100000,'משכורת'),record(2),record(3)])]);await build(p,u);
 assert.equal(u.bankGroups.length,1);assert.equal(u.bankReviewGroups.length,2);assert.ok(reportClassificationRows(u)[0].rows.every(row=>row.editable));
 const groupIndex=u.bankReviewGroups.findIndex(g=>g.rows.length===2);await changeReportInbox(p,u,{dataset:{inboxBankReviewGroup:String(groupIndex)},value:'variable'});await build(p,u);
 assert.equal(u.bankGroups.length,0);assert.equal(reportClassificationRows(u)[0].rows.length,3);assert.equal(u.build.months['2026-02'].values.variable,20);
 const salary=u.bankReviewGroups.findIndex(g=>g.rows[0].amountCents>0);await changeReportInbox(p,u,{dataset:{inboxBankReviewGroup:String(salary)},value:'otherIncome'});await build(p,u);
 assert.equal(u.build.months['2026-02'].values.salary,0);assert.equal(u.build.months['2026-02'].values.otherIncome,1000);assert.equal(u.build.bankImport.entries.length,3);assert.equal(validatePlan(u.build),true);
 const draft=reportInboxDraft(u,'classification-test'),resumed={...ui(structuredClone(draft.items)),bankChoices:new Map(draft.bankChoices),categoryChoices:new Map(draft.categoryChoices)};await build(p,resumed);assert.deepEqual(resumed.build,u.build);assert.equal(JSON.stringify(p),before);
 await assert.rejects(changeReportInbox(p,u,{dataset:{inboxBankReviewGroup:'999'},value:'salary'}));
});
test('Refund classification reuses the original sign rules and protected or imported movements stay read-only',async()=>{
 const p=plan(),u=ui([bank([record(1,1234,'החזר לבדיקה'),record(2,-2000,'תשלום רגיל')])]);u.bankChoices.set(inboxBankGroupKey(u.items[0],u.items[0].records[1]),{field:'variable',refund:false});await build(p,u);
 assert.ok(!bankClassificationOptions(p,u.bankReviewGroups[0].rows).some(([key])=>key==='outgoingTransfers'));
 await changeReportInbox(p,u,{dataset:{inboxBankReviewGroup:'0'},value:'variable'});await build(p,u);assert.equal(u.build.bankImport.entries[0].cents,1234);assert.equal(u.build.months['2026-02'].values.variable,7.66);
 const imported=ui([bank([record(1,1234,'החזר לבדיקה')])]);await build(u.build,imported);assert.equal(reportClassificationRows(imported)[0].rows[0].editable,false);
 const future=ui([bank([record(1)])]);future.items[0].from='2027-02-01';future.items[0].to='2027-02-28';future.items[0].records[0].date='2027-02-02';await build(p,future);assert.equal(reportClassificationRows(future)[0].rows[0].editable,false);assert.ok(reportReviewChecks(future).some(check=>check.label==='בחירת טיפול בחודש מוגן'));
});
const card=()=>({id:'card-source',storedId:'card-source',storedRevision:1,name:'card.pdf',kind:'card',target:'card1',payer:'a',hash:'c'.repeat(64),decisions:{},directIncluded:{},monthDecisions:{},bankOptions:{scope:'complete'},report:{issuer:'cal',dueDate:'2026-03-15',amount:10,entries:[{date:'2026-02-10',merchant:'חנות בדיקה',amountCents:1000,originalCents:1000,notes:''}]}});
test('Clearing an inherited card category persists explicitly while existing imported detail remains protected',async()=>{
 const p=plan(),first=ui([card()]);first.categoryChoices.set('חנות בדיקה','מזון');await build(p,first);assert.equal(first.issues,0);const stored=first.build,before=JSON.stringify(stored);
 const second=card();second.id='second-card';second.hash='d'.repeat(64);second.report.dueDate='2026-04-15';second.report.entries[0].date='2026-03-10';const next=ui([second]);await build(stored,next);assert.equal(optionalCategoryCounts(next).classified,1);
 await changeReportInbox(stored,next,{dataset:{inboxCategory:'חנות בדיקה'},value:''});await build(stored,next);
 assert.equal(optionalCategoryCounts(next).missing,1);assert.equal(reportClassificationRows(next)[0].rows[0].current,'');assert.equal(next.build.details.find(d=>d.month==='2026-04').category,'לסיווג');assert.equal(next.build.details.find(d=>d.month==='2026-03').category,'מזון');assert.equal(JSON.stringify(stored),before);
 const original=ui([card()]);await build(stored,original);const shown=reportClassificationRows(original)[0].rows[0];assert.equal(shown.editable,false);assert.equal(shown.current,'מזון');assert.deepEqual(optionalCategoryCounts(original),{total:0,missing:0,classified:0});
});
test('Exception anchors keep original question indices and meaningful month descriptions',()=>{
 const review={bankGroups:[],items:[{name:'source',questions:[{type:'statement-conflict'},{type:'duplicate',row:{line:1}},{type:'protected-month',month:'2026-02'}]}]};
 assert.deepEqual(reportReviewChecks(review).map(check=>check.id),['report-check-0-0','report-match-0-1','report-check-0-2']);assert.equal(reportReviewChecks(review)[2].month,'2026-02');
});

test('Changed card reports expose their original comparison action beside every uneditable source row',()=>{
 const item=card();item.statementConflict={};item.questions=[{type:'statement-conflict'}];item.preview=null;const review={items:[item],bankReviewGroups:[],cardGroups:[],categoryChoices:new Map(),bankChoices:new Map()};
 const row=reportClassificationRows(review)[0].rows[0];assert.equal(row.editable,false);assert.equal(row.status,'נדרשת השוואה לדוח שכבר נשמר');assert.equal(row.checkId,'report-check-0-0');
});

import {bankMatchCandidates,reportMatchRows} from '../frontend/src/app/report-match-model.ts';
test('Bank matching choices remain editable after New, Same, reset and original draft round-trip without changing financial records',async()=>{
 const initial=plan(),records=[record(1,-1000,'תשלום ראשון',''),record(2,-2000,'תשלום שני','')],original=ui([bank(records)]);
 for(const row of records)original.bankChoices.set(inboxBankGroupKey(original.items[0],row),{field:'variable',refund:false});await build(initial,original);assert.ok(original.build);
 const saved=original.build,before=JSON.stringify(saved),next=ui([bank(records)]);next.items[0].id='followup';next.items[0].hash='e'.repeat(64);await build(saved,next);assert.equal(next.items[0].matchReviews.length,2);
 const choose=async(value)=>{await changeReportInbox(saved,next,{dataset:{inboxDuplicate:'0',row:'1'},value});await build(saved,next)};
 await choose('new');assert.equal(next.items[0].questions.filter(q=>q.type==='duplicate').length,1);assert.equal(next.items[0].matchReviews[0].decision,'new');assert.equal(reportMatchRows(next).length,2);assert.equal(reportClassificationRows(next)[0].rows[0].checkId,'report-match-0-1');
 const draft=reportInboxDraft(next,'matching-choice-test');assert.equal(draft.items[0].matchReviews,undefined);assert.deepEqual(draft.items[0].records,records);
 const resumed={...ui(structuredClone(draft.items)),bankChoices:new Map(draft.bankChoices),categoryChoices:new Map(draft.categoryChoices)};await build(saved,resumed);assert.equal(resumed.items[0].matchReviews[0].decision,'new');
 await changeReportInbox(saved,resumed,{dataset:{inboxDuplicate:'0',row:'1'},value:''});await build(saved,resumed);assert.equal(resumed.items[0].questions.filter(q=>q.type==='duplicate').length,2);assert.equal(Object.hasOwn(resumed.items[0].decisions,'1'),false);
 await choose('same');assert.equal(next.items[0].matchReviews[0].decision,'same');assert.equal(next.items[0].questions.filter(q=>q.type==='duplicate').length,1);
 await choose('');assert.equal(next.items[0].matchReviews[0].decision,'');assert.equal(next.items[0].questions.filter(q=>q.type==='duplicate').length,2);assert.equal(next.build,null);assert.equal(JSON.stringify(saved),before);
 await choose('same');await changeReportInbox(saved,next,{dataset:{inboxDuplicate:'0',row:'2'},value:'same'});await build(saved,next);assert.equal(next.items[0].already,true);assert.equal(reportMatchRows(next).length,2);assert.ok(reportMatchRows(next).every(value=>value.match.decision==='same'));
});
test('Inline comparisons are account-scoped, disclose changed/missing evidence, search locally, and never authorize a merely similar row',()=>{
 const p=plan(),incoming=record(1,-12345,'תיאור נכנס',''),stored=(key,accountId,date,cents,description,reference)=>({key,fingerprint:key,accountId,month:date?.slice(0,7)??'2026-02',cents,field:'variable',batchId:'saved',source:{date,description,reference}});
 p.bankImport={version:1,accounts:[],batches:[{id:'saved',file:'stored.csv'}],entries:[stored('exact','a','2026-02-02',-12345,'תיאור שמור','REF-1'),stored('foreign','b','2026-02-02',-12345,'פרטי חשבון אחר','SECRET'),stored('changed','a','2026-02-02',-555,'סכום אחר','REF-2'),stored('other-month','a','2026-01-10',-12345,'ישן','REF-3'),stored('legacy','a',undefined,-12345,'ישן ללא תאריך','REF-4')]};
 const item={target:'a'},match={row:incoming,previous:p.bankImport.entries[0],canMatch:false},before=JSON.stringify(p),results=bankMatchCandidates(p,item,match);
 assert.deepEqual(results.map(c=>c.entry.key),['exact','changed','legacy']);assert.ok(results.every(c=>!c.authorized));assert.ok(results.find(c=>c.entry.key==='changed').differences.includes('סכום שונה'));assert.ok(results.find(c=>c.entry.key==='legacy').differences.includes('התאריך המקורי אינו שמור'));
 assert.equal(bankMatchCandidates(p,item,match,'SECRET').length,0);assert.deepEqual(bankMatchCandidates(p,item,match,'REF-3').map(c=>c.entry.key),['other-month']);assert.equal(bankMatchCandidates(p,item,{...match,canMatch:true})[0].authorized,true);assert.equal(JSON.stringify(p),before);
 const temporary={...stored('draft-only','a','2026-02-02',-12345,'דוח בקבוצה','TEMP'),batchId:'draft-batch'};const group=bankMatchCandidates(p,item,{row:incoming,previous:temporary,previousFile:'other-group.csv',canMatch:true});assert.equal(group[0].saved,false);assert.equal(group[0].batch.file,'other-group.csv');
});
test('Card manual-detail matching also retains reversible New and existing-detail decisions',async()=>{
 const p=plan(),source=card();p.details=[{id:'manual',name:source.report.entries[0].merchant,amount:10,category:'מזון',method:'card1',month:'2026-03',date:'2026-02-10',number:'',status:'cleared',accounting:'included'}];assert.equal(validatePlan(p),true);const before=JSON.stringify(p),next=ui([source]);await build(p,next);const id=next.items[0].preview.rows[0].id;assert.equal(next.items[0].matchReviews.length,1);
 for(const [value,pending]of [['new',0],['',1],['manual',0],['',1]]){await changeReportInbox(p,next,{dataset:{inboxDuplicate:'0',row:id},value});await build(p,next);assert.equal(next.items[0].matchReviews.length,1);assert.equal(next.items[0].matchReviews[0].decision,value);assert.equal(next.items[0].questions.filter(q=>q.type==='card-match').length,pending);}
 assert.equal(JSON.stringify(p),before);
});
