import test from 'node:test';import assert from 'node:assert/strict';
import {zero,clone,applyScenario,scenarioAssessment,previewScenario,shortestScenarioPayments,paymentFor,validatePlan,forecast} from '../src/budget.js';
const budget=()=>({startMonth:'2026-10',opening:10000,buffer:5000,horizon:12,defaults:{...zero(),salary:1000},months:{},expenses:[],demo:false});
const item=(id,name,amount,payments,firstMonth='2026-10')=>({id,name,amount,payments,firstMonth,fees:0,source:'direct',enabled:true});
test('Bicycle and birthday combine, and changing bicycle installments immediately changes the tightest month',()=>{
 const p=budget(),bike=item('bike','Bike',6000,1),birthday=item('birthday','Birthday',3000,1);
 const snapshot=JSON.stringify(p),a=previewScenario(p,[bike,birthday]),b=previewScenario(p,[{...bike,payments:6},birthday]);
 assert.equal(a.rows[0].balance,2000);assert.equal(b.rows[0].balance,7000);assert.equal(b.rows[1].balance,7000);assert.equal(a.base[0].balance,11000);assert.equal(JSON.stringify(p),snapshot);
 assert.equal(previewScenario(p,[{...bike,payments:2},birthday]).rows[1].balance,3000);
 assert.equal(shortestScenarioPayments(p,[bike,birthday],'bike'),4);
});
test('Different start months and excluded items change the shared schedule; cents and fees are retained',()=>{
 const p=budget(),bike={...item('bike','Bike',6000.01,3),fees:1},birthday=item('birthday','Birthday',3000,1,'2026-12'),r=previewScenario(p,[bike,birthday]);
 assert.equal(r.rows[0].planned,2000.33);assert.equal(r.rows[2].planned,5000.35);assert.equal(r.rows.reduce((n,r)=>n+Math.round(r.planned*100),0),900101);
 const off=previewScenario(p,[bike,{...birthday,enabled:false}]);assert.equal(off.rows[2].planned,2000.35);assert.equal(r.plan.expenses.length,2);assert.equal(off.plan.expenses.length,1);
});
test('Trying an existing item replaces it once; omitting it can model cancelling that commitment',()=>{
 const p=budget();p.expenses=[{...item('saved-bike','Bike',6000,1),kind:'expense'}];const draft={...item('trial-bike','Bike',6000,6),originalId:'saved-bike'};
 const r=previewScenario(p,[draft]);assert.equal(r.plan.expenses.length,1);assert.equal(r.plan.expenses[0].id,'saved-bike');assert.equal(r.rows[0].planned,1000);assert.equal(r.base[0].planned,6000);
 assert.equal(previewScenario(p,[{...draft,enabled:false}]).rows[0].planned,0);
 assert.throws(()=>previewScenario(p,[draft,draft]));assert.throws(()=>previewScenario(p,[{...draft,originalId:'missing'}]));
});
test('New simulations are additional to actual card totals; existing included card items remain counted once',()=>{
 const p=budget();p.months['2026-10']={values:{...zero(),salary:1000,card1:2000},actual:true,includesPlannedCard:true};p.expenses=[{...item('saved','Saved card',2000,1),kind:'expense',source:'card'}];
 const r=previewScenario(p,[{...item('trial','New purchase',500,1),source:'card'}]);assert.equal(r.rows[0].planned,500);assert.equal(r.rows[0].balance,8500);
 const same=previewScenario(p,[{...p.expenses[0],id:'draft',originalId:'saved',enabled:true}]);assert.equal(same.rows[0].planned,0);
});
test('Empty drafts leave the budget unchanged; invalid installments and out-of-range dates never reach the budget',()=>{
 const p=budget();assert.deepEqual(previewScenario(p,[item('empty','',0,1)]).rows,forecast(p));
 for(const changed of [{payments:0},{payments:61},{payments:1.5},{amount:-1},{fees:-1},{firstMonth:'2026-09'},{firstMonth:'2036-10'}])assert.throws(()=>previewScenario(p,[{...item('x','X',1000,1),...changed}]));
 const r=previewScenario(p,[item('late','Late',1000,60,'2031-10')]);assert.equal(r.rows.length,120);assert.equal(validatePlan(r.plan),true);
 assert.equal(shortestScenarioPayments({...p,opening:0,defaults:zero()},[item('x','X',1000,1)],'x'),null);
});

test('Successive applications generate distinct permanent identifiers',()=>{
 const draft=item('temporary','New',500,1);let n=0;const nextId=()=>`saved-${++n}`;
 const first=applyScenario(budget(),[draft],nextId).plan,second=applyScenario(first,[draft],nextId).plan;
 assert.equal(second.expenses.length,2);assert.notEqual(second.expenses[0].id,second.expenses[1].id);assert.equal(validatePlan(second),true);
});
test('Card source survives apply and actual card inclusion counts the saved expense once',()=>{
 const p=budget();p.months['2026-10']={values:{...zero(),card1:2000},actual:true,includesPlannedCard:true};
 const draft={...item('temporary','Card',500,1),source:'card'};assert.equal(previewScenario(p,[draft]).rows[0].planned,500);
 const saved=applyScenario(p,[draft],()=> 'permanent').plan;assert.equal(saved.expenses[0].source,'card');assert.equal(forecast(saved)[0].planned,0);
 saved.months['2026-10'].includesPlannedCard=false;assert.equal(forecast(saved)[0].planned,500);
});
test('Past shortfalls remain in the chart but do not block future split assessment',()=>{
 const p={...budget(),startMonth:'2026-09',opening:0,buffer:500,defaults:{...zero(),salary:1000}};p.months['2026-09']={values:zero(),actual:true,includesPlannedCard:false};
 p.months['2026-10']={values:{...zero(),salary:1000},actual:false,includesPlannedCard:false};const draft=item('new','New',200,1);assert.equal(shortestScenarioPayments(p,[draft],'new'),null);
 assert.equal(shortestScenarioPayments(p,[draft],'new','2026-10'),1);assert.equal(scenarioAssessment(previewScenario(p,[draft]).rows,'2026-10').balance,800);
});
