import test from 'node:test';import assert from 'node:assert/strict';import {createDemoPlan,annotateExpenseDetail,analyticalExpenseDetails,exploreExpenseDetails,forecast,clone,validatePlan,detailSummary,graphTopExpenses} from '../src/budget.js';import {createVault,unlockVault} from '../src/vault.js';
const sample=()=>{const p=createDemoPlan('2026-10');p.demo=false;p.details=[{id:'purchase',name:'סופר',amount:100.01,category:'מזון',method:'card1',month:'2026-09',date:'2026-09-03',number:'',status:'cleared',accounting:'included'}];return p;};
const parts=[{category:'מזון',cents:6001,person:'משותף',event:''},{category:'משפחה',cents:4000,person:'ילד א',event:'חג'}];
test('Split analytics preserve exact cents, source and forecast and support tag cuts and undo',()=>{
 const p=sample(),before=clone(p),next=annotateExpenseDetail(p,'purchase',parts);
 assert.deepEqual(p,before);assert.deepEqual(next.details,p.details);assert.deepEqual(forecast(next),forecast(p));assert.equal(validatePlan(next),true);
 assert.equal(analyticalExpenseDetails(next).reduce((s,r)=>s+Math.round(r.amount*100),0),10001);
 assert.equal(exploreExpenseDetails(next,{endMonth:'2026-09',count:1,person:'ילד א',event:'חג'}).netCents,4000);
 assert.equal(graphTopExpenses(next,'2026-09',{reportedOnly:true}).items[0].amount,100.01);assert.equal(detailSummary(next,'2026-09').recorded,100.01);assert.equal(detailSummary(next,'2026-09').categories.length,2);assert.equal(detailSummary(next,'2026-09').groups.find(g=>g.method==='card1').entries[0].id,'purchase');
 assert.equal(analyticalExpenseDetails(annotateExpenseDetail(next,'purchase',[])).length,1);
 const changed=clone(next);changed.details[0].amount=200;assert.equal(validatePlan(changed),true);assert.equal(analyticalExpenseDetails(changed)[0].annotationStale,true);assert.equal(analyticalExpenseDetails(changed)[0].amount,200);
});
test('Invalid split sums, opposite signs, duplicate source annotations and excessive metadata are rejected',()=>{
 const p=sample();assert.throws(()=>annotateExpenseDetail(p,'purchase',[{...parts[0],cents:10000}]));assert.throws(()=>annotateExpenseDetail(p,'purchase',[{...parts[0],cents:-10001}]));assert.throws(()=>annotateExpenseDetail(p,'missing',parts));
 const next=annotateExpenseDetail(p,'purchase',parts);next.detailAnnotations.push(clone(next.detailAnnotations[0]));assert.equal(validatePlan(next),false);
});
test('Splits and explicit person/event tags survive local encrypted recovery',async()=>{
 const p=annotateExpenseDetail(sample(),'purchase',parts),{envelope,recoveryKey}=await createVault(p,'synthetic long password','personal:split-test');assert.ok(!JSON.stringify(envelope).includes('ילד א'));
 const recovered=await unlockVault(envelope,recoveryKey,true);assert.deepEqual(recovered.plan.detailAnnotations,p.detailAnnotations);assert.equal(validatePlan(recovered.plan),true);
});
