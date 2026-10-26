import test from 'node:test';
import assert from 'node:assert/strict';
import {clone,createDemoPlan,sustainedExpenseTrend,zero} from '../src/budget.js';

const months=['2026-07','2026-08','2026-09'];
function budget(amounts=[100,160,230]){
 const plan=createDemoPlan('2026-10');plan.demo=false;plan.expenses=[];plan.details=[];plan.months={};
 for(let index=0;index<3;index++){
  const month=months[index];
  plan.months[month]={values:{...zero(),card1:amounts[index]},actual:true,includesPlannedCard:false,includesPlannedDirect:false};
  plan.details.push({id:'food-'+month,name:'מזון',month,date:month+'-10',amount:amounts[index],category:'מזון / סופר ומכולת',method:'card1',status:'cleared',accounting:'included',number:''});
 }
 return plan;
}

test('Three closed actual months identify sustained growth only above a monetary threshold',()=>{
 const plan=budget(),before=clone(plan),options={endMonth:'2026-09',asOf:'2026-10',minimumChange:100};
 const result=sustainedExpenseTrend(plan,options);
 assert.equal(result.available,true);assert.equal(result.direction,'increase');assert.equal(result.change,130);
 assert.deepEqual(result.months.map(row=>[row.month,row.amount]),[['2026-07',100],['2026-08',160],['2026-09',230]]);
 assert.equal(sustainedExpenseTrend(plan,{...options,minimumChange:150}).direction,'none');
 assert.equal(sustainedExpenseTrend(budget([230,160,100]),options).direction,'decrease');
 assert.equal(sustainedExpenseTrend(budget([100,230,160]),options).direction,'none');
 assert.deepEqual(plan,before);
});

test('Open, missing and pending actual months cannot create a trend from estimates or zeros',()=>{
 const plan=budget(),options={endMonth:'2026-09',asOf:'2026-10'};
 assert.equal(sustainedExpenseTrend(plan,{...options,asOf:'2026-09'}).available,false);
 plan.months['2026-08'].actual=false;assert.equal(sustainedExpenseTrend(plan,options).available,false);
 plan.months['2026-08'].actual=true;assert.equal(sustainedExpenseTrend(plan,{...options,excludeMonth:'2026-08'}).available,false);
 assert.equal(sustainedExpenseTrend(plan,{...options,endMonth:'2026-05'}).available,false);
});

test('Category trends require reconciled detail in all three months and use net cents',()=>{
 const plan=budget(),options={endMonth:'2026-09',asOf:'2026-10',category:'מזון',minimumChange:100};
 assert.equal(sustainedExpenseTrend(plan,options).direction,'increase');
 plan.details.push({id:'refund',name:'זיכוי',month:'2026-09',date:'2026-09-15',amount:-20,category:'מזון / סופר ומכולת',method:'card1',status:'cleared',accounting:'included',number:''});
 plan.details.find(row=>row.id==='food-2026-09').amount=250;
 const withRefund=sustainedExpenseTrend(plan,options);assert.equal(withRefund.available,true);assert.equal(withRefund.months.at(-1).amount,230);
 plan.details=plan.details.filter(row=>row.id!=='food-2026-08');
 assert.equal(sustainedExpenseTrend(plan,options).available,false);
 assert.equal(sustainedExpenseTrend(plan,{...options,category:''}).available,true);
});

test('Invalid trend periods and thresholds are rejected',()=>{
 const plan=budget();
 for(const options of [{endMonth:'2026-13'},{minimumChange:-1},{minimumChange:100.001},{minimumChange:1000001}])assert.throws(()=>sustainedExpenseTrend(plan,{endMonth:'2026-09',asOf:'2026-10',...options}));
});
