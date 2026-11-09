import test from 'node:test'
import assert from 'node:assert/strict'
import {clone,loanPaymentEvidence} from '../src/budget.js'
import {applyBankImport,linkLoanPayment} from '../src/bank-import-model.js'
import {loanPaymentCandidates} from '../frontend/src/app/loan-payment-candidates.ts'
import {fixture,rows,options} from './helpers/loan-payment-fixture.mjs'
async function history(){let {p}=await fixture();for(const month of ['2026-02','2026-03'])p=applyBankImport(p,await rows(month),options(month));return p}
test('Selected month/year changes loan candidates across actual saved bank reports without writes',async()=>{
 const p=await history(),before=JSON.stringify(p)
 for(const month of ['01','02','03']){const view=loanPaymentCandidates(p,'loan','?year=2026&month='+Number(month));assert.deepEqual(view.entries.map(row=>row.month),['2026-'+month]);assert.equal(view.from,'2026-'+month);assert.equal(view.to,view.from)}
 assert.equal(loanPaymentCandidates(p,'loan','?year=2026').entries.length,3)
 assert.deepEqual(loanPaymentCandidates(p,'loan','?year=2025').entries,[])
 assert.deepEqual(loanPaymentCandidates(p,'loan','?year=2027').entries,[])
 assert.equal(JSON.stringify(p),before)
})
test('Search applies within the selected period and keeps account/loan-term boundaries and labels for previous loan assignments',async()=>{
 const p=await history(),linked=linkLoanPayment(p,'loan',p.bankImport.entries[0].key,false),before=JSON.stringify(linked)
 assert.equal(loanPaymentCandidates(linked,'loan','?year=2026&month=1').entries[0].assignedLoan.id,'loan')
 assert.equal(loanPaymentCandidates(linked,'loan','?year=2026&month=2','2026-01').entries.length,0)
 for(const text of ['הוראת קבע','מוטב בדיקה','2026-02'])assert.equal(loanPaymentCandidates(linked,'loan','?year=2026&month=02',text).entries.length,1)
 assert.equal(loanPaymentEvidence(linked,'loan').paidCents,100000)
 assert.equal(JSON.stringify(linked),before)
 const scoped=clone(p);scoped.loans[0].from='2026-02';scoped.loans[0].months=2
 assert.equal(loanPaymentCandidates(scoped,'loan','?year=2026&month=1').outsideLoanTerm,true)
 assert.deepEqual(loanPaymentCandidates(scoped,'loan','?year=2026').entries.map(row=>row.month),['2026-03','2026-02'])
 const other=clone(p.bankImport.entries[1]);other.accountId='other';other.key='f'.repeat(64);scoped.bankImport.entries.push(other)
 assert.equal(loanPaymentCandidates(scoped,'loan','?year=2026&month=2').entries.length,1)
 scoped.loans.push({id:'other',repayments:{keys:[{key:p.bankImport.entries[1].key}]}})
 assert.equal(loanPaymentCandidates(scoped,'loan','?year=2026&month=2').entries[0].assignedLoan.id,'other')
})
test('Search can find older matches beyond the display cap and period switching never leaks another year',async()=>{
 const {p}=await fixture(),original=p.bankImport.entries[0]
 p.bankImport.entries=Array.from({length:250},(_,i)=>({...clone(original),key:i.toString(16).padStart(64,'0'),source:{...original.source,description:i===0?'פריט ישן לחיפוש':'תשלום '+i}}))
 p.bankImport.entries.push({...clone(original),key:'e'.repeat(64),month:'2025-12',source:{...original.source,date:'2025-12-15',description:'פריט ישן לחיפוש'}})
 assert.equal(loanPaymentCandidates(p,'loan','?year=2026&month=1').entries.length,250)
 assert.equal(loanPaymentCandidates(p,'loan','?year=2026&month=1','פריט ישן').entries.length,1)
 assert.equal(loanPaymentCandidates(p,'loan','?year=2026&month=2','פריט ישן').entries.length,0)
})
