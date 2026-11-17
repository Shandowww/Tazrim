import test from 'node:test'
import assert from 'node:assert/strict'
import {zero,cashAccountForecast,forecast} from '../src/budget.js'
import {householdOutlook} from '../frontend/src/app/outlook-model.js'
import {fixture as loanFixture} from './helpers/loan-payment-fixture.mjs'
import {linkLoanPayment} from '../src/bank-import-model.js'
function fixture(){return {startMonth:'2026-10',opening:9100,buffer:0,horizon:12,defaults:{...zero(),salary:2000},months:{},expenses:[],demo:false,cashPlanning:{accounts:[{id:'a',label:'א',opening:100,openingMonth:'2026-10',buffer:500,defaults:{...zero(),salary:1000}},{id:'b',label:'ב',opening:9000,openingMonth:'2026-10',buffer:1000,defaults:{...zero(),salary:1000}}],months:{},cardAccounts:{card1:'a',card2:'b'},transfers:[]}}}
const purchase={id:'purchase',name:'רכישה',amount:2500,fees:0,firstMonth:'2026-11',payments:1,source:'direct',cashAccountId:'a',kind:'expense'}
test('Outlook keeps original per-account projections and negative balances without mutating inputs',()=>{
 const p=fixture();p.expenses=[purchase];const before=JSON.stringify(p),result=householdOutlook(p,'2026-10','2026-11')
 assert.deepEqual(result.months,['2026-11','2026-12','2027-01']);assert.equal(result.accounts.length,2)
 for(const account of result.accounts)assert.deepEqual(account.rows.map(r=>r.balance),cashAccountForecast(p,account.id,[],4).slice(1,4).map(r=>r.balance))
 assert.equal(result.accounts[0].rows[0].balance,-400);assert.equal(result.accounts[1].rows[0].balance,11000);assert.equal(JSON.stringify(p),before)
})
test('Unknown opening or unassigned monthly money never becomes a numeric outlook',()=>{
 const p=fixture();delete p.cashPlanning.accounts[0].opening
 assert(householdOutlook(p,'2026-10','2026-11').accounts[0].rows.every(r=>r.balance===null))
 const q=fixture();q.defaults.variable=200
 assert(householdOutlook(q,'2026-10','2026-11').accounts.every(a=>a.rows.every(r=>r.balance===null&&r.issues.length)))
})
test('Reporting freshness is separate from valid projection math and year rollover',()=>{
 const p=fixture(),record={actual:true,values:zero(),balance:500,includesPlannedCard:true}
 p.cashPlanning.months['2026-10']={a:record}
 assert.equal(householdOutlook(p,'2026-10','2026-11').accounts[0].stale,false)
 assert.equal(householdOutlook(p,'2026-10','2026-12').accounts[0].stale,true)
 assert.deepEqual(householdOutlook(p,'2026-12','2026-11').months,['2027-01','2027-02','2027-03'])
 assert.equal(householdOutlook(p,'bad','2026-11').start,'2026-11')
})
test('Legacy budgets use the existing aggregate forecast',()=>{
 const p=fixture();delete p.cashPlanning
 assert.deepEqual(householdOutlook(p,'2026-10','2026-11').accounts[0].rows.map(r=>r.balance),forecast(p,undefined,4).slice(1,4).map(r=>r.balance))
})
test('Saved bills suppress matching installment reminders; cancelled and past-due rows are excluded; month-only dates stay unknown',()=>{
 const p=fixture();p.expenses=[purchase,{...purchase,id:'card-plan',source:'card',cardId:'card1',amount:100}]
 p.cardBilling={version:1,reports:[{cardId:'card1',accountId:'a',dueDate:'2026-11-20',amount:900,status:'pending',source:'manual'}]}
 p.details=[{id:'pending',name:'צ׳ק',method:'checks',status:'pending',date:'2026-11-25',month:'2026-11',amount:50,cashAccountId:'b'},{id:'cancelled',method:'checks',status:'cancelled',date:'2026-11-25',month:'2026-11',amount:50}]
 const r=householdOutlook(p,'2026-10','2026-11','2026-11-11')
 assert.equal(r.upcoming.length,3);assert.equal(r.upcoming[0].kind,'card');assert.equal(r.upcoming[1].accountId,'b');assert.equal(r.upcoming[2].date,null);assert.equal(r.upcoming[2].href,'/plans')
 assert(!householdOutlook(p,'2026-10','2026-11','2026-11-21').upcoming.some(r=>r.kind==='card'))
})
test('Evidenced loan payments disappear from reminders without additional forecast deductions',async()=>{
 const {p,r}=await loanFixture(),before=householdOutlook(p,'2025-12','2026-01'),linked=linkLoanPayment(p,'loan',r[0].key,true),after=householdOutlook(linked,'2025-12','2026-01')
 assert.equal(before.upcoming.filter(r=>r.kind==='loan').length,3);assert.equal(after.upcoming.filter(r=>r.kind==='loan').length,2);assert.deepEqual(after.accounts,before.accounts)
})
