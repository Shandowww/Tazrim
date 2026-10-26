import test from 'node:test';import assert from 'node:assert/strict';
import {createDemoPlan,clone,monthlyValues,updateSavingSchedule,validatePlan,forecast,savingsBalances,saveMonthReport} from '../src/budget.js';
const asOf='2026-10';
test('Separate recurring amounts replace future estimates but preserve reported history and balances',()=>{
 const p=createDemoPlan(asOf),before=clone(p),pool=savingsBalances(p,asOf),next=updateSavingSchedule(p,'2026-11',{personalSaving:1000.01,sharedSaving:500.02});
 assert.deepEqual(p,before);assert.deepEqual(next.months[asOf],p.months[asOf]);assert.deepEqual(next.defaults,p.defaults);assert.deepEqual(savingsBalances(next,asOf),pool);
 assert.equal(monthlyValues(next,'2026-11').personalSaving,1000.01);assert.equal(monthlyValues(next,'2028-03').sharedSaving,500.02);assert.ok(validatePlan(next));
 assert.equal(forecast(next)[0].balance,forecast(p)[0].balance);assert.ok(forecast(next).at(-1).balance>forecast(p).at(-1).balance);
});
test('Actual records do not replace the intended saving schedule in later missing months',()=>{
 const p=createDemoPlan(asOf);p.months['2026-11']={values:{...p.defaults,personalSaving:777,sharedSaving:888},actual:true,includesPlannedCard:false};
 const next=updateSavingSchedule(p,'2026-10',{personalSaving:0,sharedSaving:1500});assert.deepEqual(next.months[asOf],p.months[asOf]);assert.equal(monthlyValues(next,'2026-11').personalSaving,777);assert.equal(monthlyValues(next,'2026-12').personalSaving,0);
 next.months['2026-12'].values.personalSaving=123;assert.equal(monthlyValues(next,'2026-12').personalSaving,123);assert.equal(monthlyValues(next,'2028-08').personalSaving,0);
 const reported=saveMonthReport(next,'2026-12',true,'2026-12');assert.equal(reported.months['2026-12'].actual,true);assert.equal(monthlyValues(reported,'2028-08').sharedSaving,1500);
});
test('Later schedule replaces earlier planned rates without changing previous months',()=>{
 const first=updateSavingSchedule(createDemoPlan(asOf),'2026-10',{personalSaving:100,sharedSaving:200}),second=updateSavingSchedule(first,'2027-01',{personalSaving:300,sharedSaving:0});
 assert.equal(monthlyValues(second,'2026-12').sharedSaving,200);assert.equal(monthlyValues(second,'2027-02').personalSaving,300);
 const replacement=updateSavingSchedule(second,'2026-12',{personalSaving:400,sharedSaving:500});assert.equal(monthlyValues(replacement,'2027-02').personalSaving,400);assert.equal(replacement.savingSchedules.length,2);
});
test('Malformed schedules and invalid cents never pass server or client validation',()=>{
 const p=createDemoPlan(asOf);for(const amounts of [{personalSaving:-1,sharedSaving:0},{personalSaving:1.001,sharedSaving:0},{personalSaving:Infinity,sharedSaving:0}])assert.throws(()=>updateSavingSchedule(p,asOf,amounts));
 assert.throws(()=>updateSavingSchedule(p,'2026-03',{personalSaving:0,sharedSaving:0}));
 for(const bad of [null,{},[{from:'bad',personalSaving:0,sharedSaving:0}],Array(121).fill({from:asOf,personalSaving:0,sharedSaving:0})])assert.equal(validatePlan({...p,savingSchedules:bad}),false);
});
