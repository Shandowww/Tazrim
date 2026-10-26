import test from 'node:test';
import assert from 'node:assert/strict';
import {suggest,classify,monthlyProposal} from './classifier.mjs';
const row=(description,amountCents,line=1,extra={})=>({description,amountCents,line,date:'2026-10-12',valid:true,inPeriod:true,currency:'ILS',...extra});
test('Salary, securities purchase, cheques and loans use purpose and direction',()=>{
 assert.equal(suggest(row('משכורת-נט',10000)).destination,'salary');
 assert.equal(suggest(row('משכורת',-10000)).destination,'');
 assert.equal(suggest(row('ני״ע-קניה',-10000)).destination,'personalSaving');
 assert.equal(suggest(row('הפק.שיק בסלולר',10000)).destination,'otherIncome');
 assert.equal(suggest(row('תשלום שיק',-10000)).destination,'checks');
 assert.equal(suggest(row('הו״ק הלואה קרן',-10000)).destination,'loanRepayment');
 assert.equal(suggest(row('הלואה קרן/כללי',10000)).destination,'exclude');
 assert.equal(suggest(row('העברה לחיסכון משותף',-10000)).destination,'sharedSaving');
 assert.equal(suggest(row('משיכת פיקדון',10000)).destination,'exclude');
 assert.equal(suggest(row('כאל',-10000)).destination,'');
 assert.equal(suggest(row('העברה-נייד',-10000,1,{beneficiary:'שרותי בורסה והשקעות בישר'})).destination,'personalInvest');
});
test('Proposals never count suggestions before explicit review, nor invent missing monthly fields',()=>{
 const records=[row('משכורת',50000),row('העברה',-10000,2),row('חיוב שיק',-20000,3),row('משכורת',30000,4,{inPeriod:false}),row('משכורת',30000,5,{currency:'USD'})];
 assert.equal(monthlyProposal(records,classify(records)).included,0);
 const classification=classify(records,{overrides:{1:{destination:'salary',confirmed:true},2:{destination:'sharedSaving',confirmed:true},3:{destination:'checks',confirmed:true},4:{destination:'salary',confirmed:true},5:{destination:'salary',confirmed:true}}});
 const p=monthlyProposal(records,classification);assert.equal(p.included,3);assert.equal(p.pending,0);
 assert.deepEqual(p.months[0].valuesCents,{salary:50000,sharedSaving:10000,checks:20000});
 assert.equal(p.months[0].valuesCents.transfers,undefined);
});
test('Personal rules match direction and context, remain unconfirmed, and reveal conflicts',()=>{
 const r=row('העברה-נייד',-10000,1,{beneficiary:'חשבון בדיקה'});
 const rules=[{text:'חשבון בדיקה',direction:'out',destination:'personalSaving'}];
 assert.equal(suggest(r,rules).destination,'personalSaving');assert.equal(classify([r],{rules})[0].confirmed,false);
 assert.equal(suggest({...r,amountCents:10000},rules).destination,'incomingTransfers');
 assert.equal(suggest(r,[...rules,{...rules[0],destination:'sharedSaving'}]).destination,'');
 assert.equal(classify([r],{overrides:{1:{destination:'salary',confirmed:true}}})[0].confirmed,false);
});
test('Reviewed exclusions never become income; edits can move a row without double counting',()=>{
 const records=[row('העברה',-10000),row('הלוואה',20000,2)];
 let c=classify(records,{overrides:{1:{destination:'transfers',confirmed:true},2:{destination:'exclude',confirmed:true}}});
 assert.equal(monthlyProposal(records,c).excluded,1);
 c=classify(records,{overrides:{1:{destination:'personalInvest',confirmed:true},2:{destination:'exclude',confirmed:true}}});
 assert.deepEqual(monthlyProposal(records,c).months[0].valuesCents,{personalInvest:10000});
});

test('Exact learned action and beneficiary rules work across amounts, keep direction and do not match other payees',()=>{const r={line:1,valid:true,currency:'ILS',amountCents:-12345,description:'העברה',beneficiary:'מוטב א',details:'',purpose:''},rules=[{text:'מוטב א',action:'העברה',beneficiary:'מוטב א',direction:'out',destination:'personalSaving'}];assert.equal(suggest(r,rules).strength,'explicit');assert.equal(suggest({...r,amountCents:-99999},rules).destination,'personalSaving');assert.notEqual(suggest({...r,beneficiary:'מוטב ב'},rules).destination,'personalSaving');assert.notEqual(suggest({...r,description:'עמלה'},rules).destination,'personalSaving');assert.notEqual(suggest({...r,amountCents:12345},rules).destination,'personalSaving');});
