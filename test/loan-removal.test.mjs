import test from 'node:test'
import assert from 'node:assert/strict'
import {zero,clone,removeLoan,validatePlan} from '../src/budget.js'
function base(){return{startMonth:'2026-01',opening:1000,buffer:0,horizon:24,defaults:zero(),months:{'2026-09':{values:{...zero(),loanRepayment:150},actual:true,includesPlannedCard:false},'2026-10':{values:{...zero(),loanRepayment:300},actual:false,includesPlannedCard:false}},expenses:[],demo:false,cashPlanning:{accounts:[{id:'a',label:'A',buffer:0},{id:'b',label:'B',buffer:0}],months:{},cardAccounts:{},transfers:[]},loans:[{id:'one',name:'One',monthly:100,from:'2026-10',months:3,cashAccountId:'a'},{id:'two',name:'Two',monthly:200,from:'2026-10',months:6,cashAccountId:'b'}]}}
test('Removing an explicitly assigned loan in a multi-account budget preserves saved estimates, actual reports and other loan metadata',()=>{
 const p=base(),before=JSON.stringify(p);assert.ok(validatePlan(p));const result=removeLoan(p,'one');assert.deepEqual(result.loans,[p.loans[1]]);assert.deepEqual(result.months,p.months);assert.deepEqual(result.months['2026-09'],p.months['2026-09']);assert.deepEqual(result.cashPlanning,p.cashPlanning);assert.equal(JSON.stringify(p),before);assert.ok(validatePlan(result))
})
test('Removing an unassigned tracking loan needs no payer reconciliation and preserves financial amounts',()=>{
 const p=base();delete p.loans[0].cashAccountId;const next=removeLoan(p,'one');assert.deepEqual(next.loans,[p.loans[1]]);assert.deepEqual(next.months,p.months);assert.deepEqual(next.cashPlanning,p.cashPlanning);assert.equal(p.loans.length,2)
})
test('An unknown removal id preserves both loan records',()=>{const p=base();assert.deepEqual(removeLoan(p,'missing').loans,p.loans)})
