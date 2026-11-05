import test from 'node:test'
import assert from 'node:assert/strict'
import {clone,demoPlan,forecast,loanPaymentEvidence} from '../src/budget.js'
import {chequeRegister,loanScheduleSummaries} from '../frontend/src/app/commitment-summary.js'
import {prepareDetailAction} from '../frontend/src/app/detail-management-command.ts'
import {fixture} from './helpers/loan-payment-fixture.mjs'
import {linkLoanPayment} from '../src/bank-import-model.js'
function checks(){const p=clone(demoPlan);p.expenses=[];p.cashPlanning={accounts:[{id:'a',label:'א',buffer:0},{id:'b',label:'ב',buffer:0}],months:{},cardAccounts:{card1:'a',card2:'b'},transfers:[]};p.details=[['old',35,'pending','2026-10','additional'],['paid',20,'cleared','2026-10','included'],['cancel',40,'cancelled','2026-11','additional'],['future',60.01,'pending','2026-12','additional']].map(([id,amount,status,month,accounting])=>({id,name:id,amount,status,month,accounting,method:'checks',date:month+'-04',category:'אחר',number:'1',cashAccountId:'a'}));return p}
test('Cheque register keeps overdue and future cheques pending, filters actual history and preserves signed cents without writes',()=>{
 const p=checks(),before=JSON.stringify(p),r=chequeRegister(p,{year:'2026',month:'10'})
 assert.equal(r.pending.count,2);assert.equal(r.pending.totalCents,9501);assert.equal(r.cleared.totalCents,2000);assert.equal(r.cancelled.count,0);assert.equal(r.pending.rows[0].payer.id,'a');assert.equal(JSON.stringify(p),before)
 const november=chequeRegister(p,{year:'2026',month:'11'});assert.equal(november.cancelled.totalCents,4000);assert.equal(november.cleared.count,0)
})
test('Clearing through the original command changes register groups without charging an additional cheque twice',()=>{
 const p=checks(),next=prepareDetailAction(p,'old','clear',true),r=chequeRegister(next,{year:'2026',month:'10'})
 assert.equal(r.pending.totalCents,6001);assert.equal(r.cleared.totalCents,5500);assert.deepEqual(forecast(next),forecast(p));assert.equal(p.details[0].status,'pending')
})
test('Loan calendar remainder remains separate from original payment evidence, even when months passed without reports',async()=>{
 const {p,r}=await fixture(),linked=linkLoanPayment(p,'loan',r[0].key,true),before=JSON.stringify(linked)
 const summary=loanScheduleSummaries(linked,'2026-03').find(row=>row.loan.id==='loan')
 assert.equal(summary.remainingMonths,1);assert.equal(summary.scheduledRemainingCents,100000);assert.deepEqual(summary.evidence,loanPaymentEvidence(linked,'loan'));assert.equal(summary.evidence.remainingCents,200000);assert.equal(summary.payer.id,'a')
 assert.equal(loanScheduleSummaries(linked,'2026-04')[0].remainingMonths,0);assert.equal(loanScheduleSummaries(linked,'2025-12')[0].remainingMonths,3);assert.equal(JSON.stringify(linked),before)
})
