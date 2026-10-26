import test from 'node:test';import assert from 'node:assert/strict';import {createDemoPlan,setPeriodReviewed,periodReviewState,adoptExistingCategories,clone,validatePlan,categoryRegistryEntry} from '../src/budget.js';
test('Explicit month closure reopens after changed evidence and can be undone without financial edits',()=>{
 const p=createDemoPlan('2026-10');p.demo=false;const month=Object.keys(p.months).filter(m=>m<'2026-10'&&p.months[m].actual).sort().at(-1),next=setPeriodReviewed(p,month,true,'2026-10');
 assert.equal(validatePlan(next),true);assert.equal(periodReviewState(next,month),'closed');assert.deepEqual(next.months,p.months);
 const changed=clone(next);changed.months[month].values.salary+=1;assert.equal(periodReviewState(changed,month),'reopened');
 assert.equal(periodReviewState(setPeriodReviewed(next,month,false,'2026-10'),month),'open');assert.throws(()=>setPeriodReviewed(p,'2026-10',true,'2026-10'));assert.throws(()=>setPeriodReviewed(p,month,true,'2026-10',month));
});
test('Category identity adoption preserves old labels and amounts and is repeatable',()=>{
 const p=createDemoPlan('2026-10');p.demo=false;p.details=[{id:'d',name:'חנות',category:'מזון / סופר ומכולת',amount:100,method:'card1',month:'2026-09',date:'2026-09-01',number:'',status:'cleared',accounting:'included'}];
 const next=adoptExistingCategories(p);assert.deepEqual(next.details,p.details);assert.ok(categoryRegistryEntry(next,p.details[0].category));assert.deepEqual(adoptExistingCategories(next),next);
});
