import test from 'node:test';
import assert from 'node:assert/strict';
import {createSetupBudget,isUnconfiguredBudget,zero,validatePlan,forecast,savingsBalances} from '../src/budget.js';
const v={month:'2026-10',opening:'10000.25',buffer:'5000',salary:'19000',card1:'2000',card2:'500',variable:'3500',personalSaving:'1500',personalInvest:'1000',balance:'500000',goalEnabled:true,goalName:'בית',target:'600000',allocated:'400000',icon:'house'};
test('Guided setup separates opening cash, existing savings and estimated monthly deposits',()=>{
 const p=createSetupBudget(v,'house');assert.ok(validatePlan(p));assert.equal(p.opening,10000.25);assert.equal(p.defaults.salary,19000);assert.equal(p.defaults.personalSaving,1500);assert.deepEqual(p.months,{});assert.equal(forecast(p)[0].balance,20500.25);assert.equal(savingsBalances(p,'2026-10').balance,500000);assert.equal(savingsBalances(p,'2026-10').free,100000);assert.equal(p.savingsGoals.items[0].monthly,1500);
});
test('Blank optional amounts can be completed later and do not repeatedly restart setup',()=>{
 const p=createSetupBudget({month:'2026-10',goalEnabled:false});assert.ok(validatePlan(p));assert.deepEqual(p.defaults,zero());assert.equal(p.savingsGoals,undefined);assert.equal(isUnconfiguredBudget(p),false);
 const blank={...p};delete blank.setupCompleted;assert.equal(isUnconfiguredBudget(blank),true);assert.equal(isUnconfiguredBudget({...blank,opening:1}),false);assert.equal(isUnconfiguredBudget({...blank,details:[{}]}),false);assert.equal(isUnconfiguredBudget({...blank,months:{'2026-10':{}}}),false);
});
test('Setup rejects excess allocation, invalid targets, months and numeric values',()=>{
 for(const changes of [{allocated:500001},{goalName:''},{target:0},{balance:-1},{salary:'oops'},{month:'2026-13'},{icon:'unknown'}])assert.throws(()=>createSetupBudget({...v,...changes}));
 const p=createSetupBudget({...v,goalEnabled:false});assert.equal(p.savingsGoals.items.length,0);assert.equal(savingsBalances(p,'2026-10').free,500000);assert.equal(validatePlan({...p,setupCompleted:'yes'}),false);
});
