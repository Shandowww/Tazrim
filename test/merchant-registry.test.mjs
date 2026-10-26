import test from 'node:test';import assert from 'node:assert/strict';import {createDemoPlan,assignMerchantDisplayName,merchantDisplayName,analyticalExpenseDetails,resetMerchantRegistry,validatePlan,clone} from '../src/budget.js';
test('Explicit merchant aliases preserve original source text and cents, merge only by user selection and reset cleanly',()=>{
 const p=createDemoPlan('2026-10');p.demo=false;p.details=[{id:'d',name:'חנות סניף1',category:'מזון',amount:100,method:'card1',month:'2026-09',date:'2026-09-01',number:'',status:'cleared',accounting:'included'}];
 const first=assignMerchantDisplayName(p,'חנות סניף1','חנות'),next=assignMerchantDisplayName(first,'חנות סניף2','חנות');
 assert.equal(validatePlan(next),true);assert.equal(next.merchantRegistry.length,1);assert.equal(merchantDisplayName(next,'חנות סניף2'),'חנות');assert.equal(analyticalExpenseDetails(next)[0].name,'חנות');assert.equal(next.details[0].name,'חנות סניף1');assert.equal(analyticalExpenseDetails(next)[0].amount,100);
 const dup=clone(next);dup.merchantRegistry.push({...dup.merchantRegistry[0],id:'merchant_11111111-1111-4111-8111-111111111111'});assert.equal(validatePlan(dup),false);
 assert.equal(merchantDisplayName(resetMerchantRegistry(next),'חנות סניף1'),'חנות סניף1');
});
