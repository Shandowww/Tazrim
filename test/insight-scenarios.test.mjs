import test from 'node:test';
import assert from 'node:assert/strict';
import {clone,createDemoPlan,forecast,setInsightScenario,simulateInsightScenario,validatePlan} from '../src/budget.js';

const assumption={id:'food-cut',category:'מזון',monthlyReduction:300,startMonth:'2026-11',months:3};
function budget(){const plan=createDemoPlan('2026-10');plan.demo=false;plan.expenses=[];return plan;}

test('A saved insight is only a hypothesis and has no effect on budget cash flow',()=>{
 const plan=budget(),before=forecast(plan),saved=setInsightScenario(plan,assumption);
 assert.equal(validatePlan(saved),true);assert.deepEqual(forecast(saved),before);
 assert.deepEqual(plan.insightScenarios,undefined);
 const preview=simulateInsightScenario(saved,assumption,'2026-10');
 assert.equal(preview.totalPotentialCents,90000);
 for(const month of ['2026-11','2026-12','2027-01']){
  const base=preview.base.find(row=>row.month===month),simulated=preview.simulated.find(row=>row.month===month);
  assert.equal(simulated.spending,base.spending-300);
 }
 assert.equal(preview.simulated.find(row=>row.month==='2027-02').balance,preview.base.find(row=>row.month==='2027-02').balance+900);
 assert.deepEqual(forecast(saved),before);
});

test('The forecast comparison uses the future low point and never awards actual goal achievement',()=>{
 const plan=budget(),result=simulateInsightScenario(plan,assumption,'2026-10');
 assert.ok(result.baseLow.month>='2026-11');assert.ok(result.simulatedLow.month>='2026-11');
 assert.equal(result.firstAfter,result.firstSpending-300);
 assert.equal(result.goal,15000);
 assert.equal(plan.months['2026-11'].actual,false);
});

test('Reject assumptions in past, beyond planning horizon, or larger than monthly spending',()=>{
 const plan=budget();
 assert.throws(()=>simulateInsightScenario(plan,{...assumption,startMonth:'2026-10'},'2026-10'));
 assert.throws(()=>simulateInsightScenario(plan,{...assumption,monthlyReduction:1000000},'2026-10'));
 const anchored=clone(plan);anchored.months['2026-12'].cashReport={balance:5000,net:0};assert.throws(()=>simulateInsightScenario(anchored,assumption,'2026-10'));
 for(const bad of [{...assumption,months:0},{...assumption,monthlyReduction:1.001},{...assumption,category:'x'.repeat(61)},{...assumption,startMonth:'2037-01'}, {...assumption,extra:true}]){
  const altered=clone(plan);altered.insightScenarios=[bad];assert.equal(validatePlan(altered),false);
 }
 const duplicate=clone(plan);duplicate.insightScenarios=[assumption,{...assumption}];assert.equal(validatePlan(duplicate),false);
 assert.equal(validatePlan(plan),true);
});
