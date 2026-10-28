import * as inboxController from '../src/report-inbox-controller.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {zero,validatePlan,forecast} from '../src/budget.js';
import {bankIdentity,undoBankImport} from '../src/bank-import-model.js';
import {prepareCardStatement} from '../src/card-statement-model.js';
import {inboxHash,inboxTarget,inboxReceiptPresent,inboxCardProof,applyReportInbox} from '../src/report-inbox-model.js';
import {inspectIntake} from '../tools/bank-csv/intake-reader.mjs';
import {inspectCSV} from '../tools/bank-csv/parser.mjs';
const base=()=>({startMonth:'2026-01',opening:1000,buffer:100,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,creditCards:[{id:'card1',name:'כאל',alias:'0394',billingDay:15}],cashPlanning:{accounts:[{id:'a',label:'פועלים',bankName:'hapoalim',buffer:0,opening:1000},{id:'b',label:'וואן זירו',bankName:'one-zero',buffer:0,opening:500}],months:{},cardAccounts:{card1:'a'},transfers:[]}});
async function bankEntry(id,accountId,amount=10000){const records=await Promise.all([{line:1,date:'2026-02-28',reference:'ref-'+id,description:'משכורת',amountCents:amount,valid:true,currency:'ILS',balanceCents:null,details:'',beneficiary:'',purpose:''}].map(r=>bankIdentity(r,accountId)));return {records,options:{id,accountId,label:accountId,fileName:id+'.csv',from:'2026-02-01',to:'2026-02-28',asOf:'2026-10',coverageConfirmed:true,monthsConfirmed:true,rules:[],modes:{'2026-02':'full'},choices:{1:{field:'salary',reviewed:true}},directIncluded:{}}};}
const report={issuer:'cal',dueDate:'2026-03-15',amount:10,entries:[{date:'2026-02-13',merchant:'בית עסק',amountCents:1000,originalCents:1000,notes:''}]};
test('One mixed bank/card batch is immutable, validates all files before returning, preserves source accounting and has receipts',async()=>{
 const p=base(),before=JSON.stringify(p),banks=[await bankEntry('one','a'),await bankEntry('two','b',20000)],preview=await prepareCardStatement(p,report,'card1'),cards=[{cardId:'card1',accountId:'a',dueDate:report.dueDate,amount:report.amount,statement:preview,choices:{[preview.rows[0].id]:{category:'מזון'}}}],hash=await inboxHash('card'),receipts=[{hash,kind:'card',target:'card1',reference:report.dueDate},{hash:await inboxHash('bank'),kind:'bank',target:'a',reference:'one'}];
 const next=await applyReportInbox(p,banks,cards,receipts,[],'2026-10-16');assert.equal(validatePlan(next),true);assert.equal(JSON.stringify(p),before);assert.equal(next.months['2026-02'].values.salary,300);assert.equal(next.details[0].amount,10);assert.equal(await inboxReceiptPresent(next,next.reportInbox.receipts[0]),true);
 const bad=structuredClone(cards);bad[0].choices={};await assert.rejects(applyReportInbox(p,banks,bad,receipts,[],'2026-10-16'),/קטגוריה/);assert.equal(JSON.stringify(p),before);
 const changed=structuredClone(next);changed.cardBilling.reports[0].amount=11;assert.equal(await inboxReceiptPresent(changed,next.reportInbox.receipts[0]),false);
 const detailEdited=structuredClone(next);detailEdited.details[0].category='קניות';assert.equal(await inboxReceiptPresent(detailEdited,next.reportInbox.receipts[0]),true);
 const invalid=structuredClone(next);invalid.reportInbox.receipts[0].hash='bad';assert.equal(validatePlan(invalid),false);
});
test('Target recognition uses saved identity and unique provider/alias, never picks between two same-bank accounts',async()=>{
 const p=base();assert.equal(inboxTarget(p,{kind:'bank',provider:'one-zero'}),'b');assert.equal(inboxTarget(p,{kind:'card',identity:'cal:0394'}),'card1');p.cashPlanning.accounts.push({id:'c',label:'נוסף',bankName:'one-zero',buffer:0});assert.equal(inboxTarget(p,{kind:'bank',provider:'one-zero'}),'');
 const key=await inboxHash('source');p.reportInbox={version:1,bindings:[{key,kind:'bank',target:'c'}],receipts:[]};assert.equal(inboxTarget(p,{kind:'bank',provider:'one-zero',identityKey:key}),'c');p.reportInbox.bindings[0].target='deleted';assert.equal(inboxTarget(p,{kind:'bank',provider:'one-zero',identityKey:key}),'');
});
test('Bank receipt stops skipping after import undo; conflicting identity choices are not silently remembered',async()=>{
 const p=base(),entry=await bankEntry('one','a'),key=await inboxHash('ambiguous'),receipt={hash:await inboxHash('file'),kind:'bank',target:'a',reference:'one'},next=await applyReportInbox(p,[entry],[],[receipt],[{key,kind:'bank',target:'a'},{key,kind:'bank',target:'b'}],'2026-10-16');
 assert.equal(next.reportInbox.bindings.length,0);assert.equal(await inboxReceiptPresent(next,receipt),true);assert.equal(await inboxReceiptPresent(undoBankImport(next,'one'),receipt),false);
});
test('Automatic intake recognizes bank balance schemas and asks rather than guessing ambiguous signed tables',()=>{
 const bank=inspectIntake([inspectCSV('תאריך,תיאור,סכום,יתרה\n01/02/2026,משכורת,100,1000')]);assert.equal(bank.kind,'bank');assert.equal(bank.records[0].amountCents,10000);
 const ambiguous=inspectIntake([inspectCSV('תאריך,תיאור,סכום\n01/02/2026,חנות,-10')]);assert.equal(ambiguous.kind,'ambiguous');
 const cal=inspectIntake([{rows:[{cells:['פירוט כרטיס מאסטרקארד 0394']},{cells:['עסקאות לחיוב ב-15/03/2026: 10 ₪']},{cells:['תאריך עסקה','שם בית עסק','סכום חיוב']},{cells:['01/02/2026','בית עסק','10']}]}]);assert.equal(cal.kind,'card');assert.equal(cal.identity,'cal:0394');assert.equal(cal.report.amount,10);
 assert.throws(()=>inspectIntake([inspectCSV('bad,format\nx,y')]));
});

import vm from 'node:vm';import fs from 'node:fs';
test('Inbox save retries keep one applied draft and release only its own save guard without bypassing revision protection',async()=>{
 let mutations=0,attempts=0;const p=base(),ui={scope:'user/personal',revision:3,snapshot:JSON.stringify(p),build:{...p,buffer:111},applied:null,busy:false,saving:false,items:[{}],issues:0,origin:'details'};
 const c=vm.createContext({...inboxController,app:{addEventListener(){}},window:{addEventListener(){}},document:{getElementById:()=>({remove(){}})},accountId:'user',activeBudget:'personal',revision:3,plan:p,dirty:false,demoPreview:false,notify(){},render(){},ui,mutate:next=>{mutations++;c.plan=next;c.dirty=true;return true;},save:async()=>{attempts++;assert.equal(vm.runInContext('reportInboxHasDraft()',c),false);if(attempts===1)throw Error('connection lost');c.dirty=false;c.revision=4;}});
 vm.runInContext(fs.readFileSync('src/report-inbox-client.js','utf8'),c);vm.runInContext('reportInbox=ui;inboxRender=()=>{};',c);
 const event={target:{closest:selector=>selector==='[data-inbox]'?{dataset:{inbox:'save'}}:null}};
 await vm.runInContext('inboxClick',c)(event);assert.equal(mutations,1);assert.match(ui.error,/connection lost/);assert.equal(vm.runInContext('reportInboxHasDraft()',c),true);
 await vm.runInContext('inboxClick',c)(event);assert.equal(mutations,1);assert.equal(attempts,2);assert.equal(c.dirty,false);assert.equal(vm.runInContext('reportInbox',c),null);
});
test('Pending questions or a stale local plan cannot invoke mutation even with an artificially enabled save button',async()=>{
 let mutations=0;const p=base(),ui={scope:'u/b',revision:1,snapshot:JSON.stringify(p),build:{...p,buffer:111},applied:null,busy:false,items:[{}],issues:1};
 const c=vm.createContext({...inboxController,app:{addEventListener(){}},window:{addEventListener(){}},document:{},accountId:'u',activeBudget:'b',revision:1,plan:p,ui,mutate(){mutations++;},render(){}});vm.runInContext(fs.readFileSync('src/report-inbox-client.js','utf8'),c);vm.runInContext('reportInbox=ui;inboxRender=()=>{};',c);
 const event={target:{closest:selector=>selector==='[data-inbox]'?{dataset:{inbox:'save'}}:null}};await vm.runInContext('inboxClick',c)(event);assert.equal(mutations,0);ui.issues=0;c.plan={...p,buffer:112};await vm.runInContext('inboxClick',c)(event);assert.equal(mutations,0);assert.match(ui.error,/התקציב השתנה/);
});

test('A reported last-four identity contradicting the only known card never silently selects that card',async()=>{
 const p=base();assert.equal(inboxTarget(p,{kind:'card',identity:'cal:9999'}),'');const key=await inboxHash('cal:9999');p.reportInbox={version:1,bindings:[{key,kind:'card',target:'card1'}],receipts:[]};assert.equal(inboxTarget(p,{kind:'card',identity:'cal:9999',identityKey:key}),'');
});

test('Inbox metadata rejects invalid receipts and duplicate identities while old budgets remain compatible',async()=>{
 const p=base();assert.equal(validatePlan(p),true);const h=await inboxHash('x');p.reportInbox={version:1,bindings:[{key:h,kind:'bank',target:'a'}],receipts:[{hash:h,kind:'bank',target:'a',reference:'batch'}]};assert.equal(validatePlan(p),true);
 const before=JSON.stringify(p);p.reportInbox.receipts.push({...p.reportInbox.receipts[0]});assert.equal(validatePlan(p),false);Object.assign(p,JSON.parse(before));p.reportInbox.bindings[0].kind='guess';assert.equal(validatePlan(p),false);
});
test('Blank setup adapts its start month only while unconfigured and orphaned new targets are not saved',()=>{
 const p=base(),c=vm.createContext({...inboxController,app:{addEventListener(){}},window:{addEventListener(){}},plan:p,clone:structuredClone,cashPlanningBase:p=>structuredClone(p.cashPlanning),creditCards:p=>p.creditCards});vm.runInContext(fs.readFileSync('src/report-inbox-client.js','utf8'),c);
 const make=vm.runInContext('inboxBase',c);const next=make({blank:true,startMonth:'2025-01',items:[],newAccounts:[{id:'unused',label:'orphan'}],newCards:[{id:'unused',name:'orphan'}]});assert.equal(next.startMonth,'2025-01');assert.equal(next.setupCompleted,true);assert.equal(next.cashPlanning.accounts.length,2);assert.equal(next.creditCards.length,1);assert.equal(p.startMonth,'2026-01');
});

test('Isracard last-four identity chooses the matching card and refuses a contradictory saved binding',async()=>{const p=base();p.creditCards.push({id:'card2',name:'וואן זירו',alias:'1111',billingDay:15});p.defaults.card2=0;const item={kind:'card',provider:'isracard',identity:'isracard:1111',identityKey:await inboxHash('isracard:1111')};assert.equal(inboxTarget(p,item),'card2');p.reportInbox={version:1,bindings:[{key:item.identityKey,kind:'card',target:'card1'}],receipts:[]};assert.equal(inboxTarget(p,item),'card2');});
