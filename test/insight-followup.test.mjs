import test from 'node:test';import assert from 'node:assert/strict';import {createDemoPlan,zero,setInsightScenario,insightScenarioActuals,expenseAnomalies,decideExpenseInsight,validatePlan,clone} from '../src/budget.js';
const sample=()=>{const p=createDemoPlan('2026-10');p.demo=false;p.expenses=[];p.details=[];for(const [month,value]of [['2026-06',1000],['2026-07',1100],['2026-08',1000],['2026-09',2000]])p.months[month]={actual:true,values:{...zero(),variable:value},includesPlannedCard:true};return p;};
test('Anomaly uses consecutive closed reported months, a median and monetary/percentage floors; decisions follow evidence',()=>{
 const p=sample(),result=expenseAnomalies(p,{asOf:'2026-10'});assert.equal(result.items[0].differenceCents,100000);
 const next=decideExpenseInsight(p,result.items[0].key,'expected');assert.equal(validatePlan(next),true);assert.equal(expenseAnomalies(next,{asOf:'2026-10'}).items[0].decision,'expected');
 const changed=clone(next);changed.months['2026-09'].values.variable=2500;assert.equal(expenseAnomalies(changed,{asOf:'2026-10'}).items[0].decision,null);
 assert.equal(expenseAnomalies(p,{asOf:'2026-10',excludeMonth:'2026-07'}).available,false);delete p.months['2026-06'];assert.equal(expenseAnomalies(p,{asOf:'2026-10'}).available,false);
});
test('Scenario actuals use immutable saved baseline and withhold comparisons for changed/missing/pending months',()=>{
 const p=sample(),row={id:'s',category:'',monthlyReduction:200,startMonth:'2026-09',months:3},next=setInsightScenario(p,row),saved=next.insightScenarios[0];
 assert.deepEqual(saved.baseline,{month:'2026-08',cents:100000});assert.equal(insightScenarioActuals(next,saved,'2026-10').rows[0].differenceCents,-100000);
 assert.equal(insightScenarioActuals(next,saved,'2026-10','2026-09').rows[0].actualCents,null);
 next.months['2026-08'].values.variable=1200;assert.equal(insightScenarioActuals(next,saved,'2026-10').available,false);
 assert.equal(insightScenarioActuals(p,row,'2026-10').available,false);
});
