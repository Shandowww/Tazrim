import test from 'node:test'
import assert from 'node:assert/strict'
import {zero,clone,validatePlan} from '../src/budget.js'
import {initialMonthlyDraft,prepareMonthlyReport} from '../frontend/src/app/monthly-report.ts'
import {createMonthlyRecovery,readMonthlyRecovery} from '../frontend/src/app/monthly-recovery.ts'
const snapshot=()=>({accountId:'alice',accountEmail:'alice@example.test',revision:4,writeIdentityBound:true,plan:{startMonth:'2026-01',opening:1000,buffer:100,horizon:24,defaults:{...zero(),salary:1000},months:{},expenses:[],demo:false,setupCompleted:true}})
const month='2026-10',asOf='2026-10'
test('A valid downloaded draft remains an ordinary plan backup and restores exact edits locally without changing the saved baseline',async()=>{
 const base=snapshot(),draft=initialMonthlyDraft(base.plan,month);draft.values.salary='1,234.56';draft.actual=true;draft.includesCard=true
 const before=JSON.stringify(base),backup=await createMonthlyRecovery(base,'personal',month,draft,asOf)
 assert.equal(backup.format,'monthly-flow-v1');assert.ok(validatePlan(backup.plan));assert.equal(backup.plan.months[month].values.salary,1234.56);assert.equal(backup.monthlyDraft.baseRevision,4)
 const recovered=await readMonthlyRecovery(JSON.stringify(backup),base,'personal',month);assert.deepEqual(recovered,draft);assert.deepEqual(prepareMonthlyReport(base.plan,month,recovered,asOf),backup.plan);assert.equal(JSON.stringify(base),before)
 recovered.values.salary='9';assert.equal(backup.monthlyDraft.draft.values.salary,'1,234.56')
})
test('Unfinished invalid input survives a recovery file without pretending it is a valid financial plan',async()=>{
 const base=snapshot(),draft=initialMonthlyDraft(base.plan,month);draft.values.salary='1..2'
 const backup=await createMonthlyRecovery(base,'personal',month,draft,asOf);assert.equal(backup.format,'monthly-flow-monthly-draft-v1');assert.equal(backup.plan,undefined)
 const restored=await readMonthlyRecovery(JSON.stringify(backup),base,'personal',month);assert.equal(restored.values.salary,'1..2');assert.throws(()=>prepareMonthlyReport(base.plan,month,restored,asOf))
})
test('A draft never rebases into a different account, space, month, revision or changed same-revision snapshot',async()=>{
 const base=snapshot(),draft=initialMonthlyDraft(base.plan,month),text=JSON.stringify(await createMonthlyRecovery(base,'house',month,draft,asOf))
 for(const [other,space,m]of [[{...base,accountId:'bob'},'house',month],[base,'personal',month],[base,'house','2026-09'],[{...base,revision:5},'house',month],[{...base,plan:{...base.plan,buffer:101}},'house',month]])await assert.rejects(readMonthlyRecovery(text,other,space,m))
 assert.equal(base.revision,4);assert.equal(base.plan.months[month],undefined)
})
test('Malformed, oversized, injected or unsupported recovery files are rejected before changing a form',async()=>{
 const base=snapshot(),draft=initialMonthlyDraft(base.plan,month),backup=await createMonthlyRecovery(base,'personal',month,draft,asOf)
 for(const change of [b=>delete b.monthlyDraft,b=>b.monthlyDraft.extra=true,b=>b.monthlyDraft.version=2,b=>b.monthlyDraft.draft.actual='true',b=>b.monthlyDraft.draft.values.salary='1'.repeat(33),b=>b.monthlyDraft.draft.values.injected='2',b=>delete b.monthlyDraft.draft.values.salary,b=>b.monthlyDraft.draft.unknown=true,b=>b.extra={plan:'replace'},b=>b.monthlyDraft.baseHash='bad']){const copy=clone(backup);change(copy);await assert.rejects(readMonthlyRecovery(JSON.stringify(copy),base,'personal',month))}
 await assert.rejects(readMonthlyRecovery('{',base,'personal',month));await assert.rejects(readMonthlyRecovery('x'.repeat(12000001),base,'personal',month));await assert.rejects(readMonthlyRecovery(JSON.stringify({format:'monthly-flow-v1',plan:base.plan}),base,'personal',month))
})
test('Restoration ignores replacement plan payloads and uses only the checked draft against the exact saved base',async()=>{
 const base=snapshot(),draft=initialMonthlyDraft(base.plan,month);draft.values.salary='2000';const backup=await createMonthlyRecovery(base,'personal',month,draft,asOf);backup.plan={opening:999999999,secret:'injected'}
 const restored=await readMonthlyRecovery(JSON.stringify(backup),base,'personal',month),next=prepareMonthlyReport(base.plan,month,restored,asOf);assert.equal(next.opening,1000);assert.equal(next.secret,undefined);assert.equal(next.months[month].values.salary,2000)
})
test('Object-key order does not invalidate the same saved snapshot, while unsupported financial scopes remain blocked',async()=>{
 const base=snapshot(),draft=initialMonthlyDraft(base.plan,month),backup=await createMonthlyRecovery(base,'personal',month,draft,asOf),reverse=v=>v&&typeof v==='object'?Array.isArray(v)?v.map(reverse):Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v
 assert.deepEqual(await readMonthlyRecovery(JSON.stringify(backup),{...base,plan:reverse(base.plan)},'personal',month),draft)
 const accounts=clone(base);accounts.plan.cashPlanning={accounts:[{id:'a',label:'חשבון',buffer:0}],months:{},cardAccounts:{},transfers:[]};await assert.rejects(createMonthlyRecovery(accounts,'personal',month,draft,asOf),/חשבון/)
})
