import test from 'node:test'
import assert from 'node:assert/strict'
import {zero,clone,forecast,validatePlan} from '../src/budget.js'
import {moneyInputCents,initialMonthlyDraft,monthlyDraftFingerprint,manualMonthEligibility,prepareMonthlyReport} from '../frontend/src/app/monthly-report.ts'
const base=()=>({startMonth:'2026-01',opening:1000,buffer:100,horizon:24,defaults:{...zero(),salary:1000,card1:200},months:{},expenses:[],demo:false,setupCompleted:true})
test('Money drafts preserve exact cents and normalize formatting/zero without inventing dirty edits',()=>{
 const p=base(),a=initialMonthlyDraft(p,'2026-10'),b=clone(a);b.values.salary='1,000.00';b.values.otherIncome='';assert.equal(monthlyDraftFingerprint(a),monthlyDraftFingerprint(b));assert.equal(moneyInputCents('1,234.56'),123456);assert.equal(moneyInputCents('0.29'),29)
 b.values.salary='1,00';assert.notEqual(monthlyDraftFingerprint(a),monthlyDraftFingerprint(b));for(const n of ['-1','1,00','NaN','Infinity','1.001','100000000.01'])assert.throws(()=>moneyInputCents(n))
})
test('Monthly reporting preserves included installments, direct plans, metadata and exact forecast math without mutating its source',()=>{
 const p=base();p.expenses=[{id:'card',name:'כרטיס',amount:100.01,fees:0.02,firstMonth:'2026-10',payments:3,source:'card',kind:'expense',cardId:'card1'},{id:'direct',name:'ישיר',amount:60,fees:0,firstMonth:'2026-10',payments:3,source:'direct',kind:'expense'}];p.profileName='private';const before=JSON.stringify(p),d=initialMonthlyDraft(p,'2026-10');d.actual=true;d.includesCard=true;d.includesDirect=true;d.values.variable='50.01'
 const next=prepareMonthlyReport(p,'2026-10',d,'2026-10'),row=forecast(next).find(r=>r.month==='2026-10');assert.equal(row.planned,0);assert.equal(row.net,749.99);assert.equal(next.months['2026-10'].actual,true);assert.deepEqual(next.expenses,p.expenses);assert.equal(next.profileName,'private');assert.ok(validatePlan(next));assert.equal(JSON.stringify(p),before)
})
test('The original salary propagation updates saved future estimates and preserves actual reports',()=>{
 const p=base();p.months['2026-09']={values:{...zero(),salary:700},actual:true,includesPlannedCard:false};p.months['2026-10']={values:{...zero(),salary:1000},actual:false,includesPlannedCard:false};const d=initialMonthlyDraft(p,'2026-08');d.values.salary='2000'
 const next=prepareMonthlyReport(p,'2026-08',d,'2026-10');assert.equal(next.months['2026-10'].values.salary,2000);assert.equal(next.months['2026-09'].values.salary,700);assert.equal(next.defaults.salary,1000)
})
test('Unsupported account/import/source scopes, future actuals and injected fields fail without changing data',()=>{
 const p=base(),d=initialMonthlyDraft(p,'2026-10');d.actual=true;assert.throws(()=>prepareMonthlyReport(p,'2026-11',d,'2026-10'),/עתידי/)
 const extra=clone(d);extra.values.injected='3';assert.throws(()=>prepareMonthlyReport(p,'2026-10',extra,'2026-10'));assert.throws(()=>prepareMonthlyReport(p,'2026-10',d,'bad'))
 const account=base();account.cashPlanning={accounts:[{id:'a',label:'בנק',buffer:0}],months:{},cardAccounts:{},transfers:[]};assert.match(manualMonthEligibility(account,'2026-10'),/חשבון/)
 const anchored=base();anchored.months['2026-10']={values:zero(),actual:true,includesPlannedCard:false,cashReport:{balance:1,net:0}};assert.match(manualMonthEligibility(anchored,'2026-10'),/מקורות/)
 assert.equal(p.months['2026-10'],undefined)
})
