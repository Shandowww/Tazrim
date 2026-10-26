import test from 'node:test';
import assert from 'node:assert/strict';
import {clone,createDemoPlan,exploreExpenseDetails,validatePlan,zero,dataViewsValid} from '../src/budget.js';

const detail=(id,amount,month,category,method='card1',status='cleared',name=id)=>({id,name,category,method,amount,month,date:month+'-10',number:'',status,accounting:'included'});
const sample=()=>{
 const plan=createDemoPlan('2026-10');plan.demo=false;plan.details=[
  detail('food',300,'2026-09','מזון / סופר ומכולת','card1','cleared','מכולת השכונה'),
  detail('restaurant',100,'2026-09','מזון / מסעדות ובתי קפה','card2','cleared','מסעדה'),
  detail('refund',-50,'2026-09','מזון / סופר ומכולת','card1','cleared','מכולת השכונה'),
  detail('cheque',200,'2026-09','חינוך','checks','pending','גן'),
  detail('cancelled',900,'2026-09','מזון','card1','cancelled','בוטל'),
  detail('older',80,'2026-08','דיור','card1','cleared','חשמל')
 ];return plan;
};

test('Exploration totals reconcile exactly to displayed detail, net of refunds and without pending cheques',()=>{
 const plan=sample(),before=clone(plan),result=exploreExpenseDetails(plan,{endMonth:'2026-09',count:1});
 assert.deepEqual(result.rows.map(row=>row.id),['food','refund','restaurant']);
 assert.equal(result.purchasesCents,40000);assert.equal(result.refundsCents,5000);assert.equal(result.netCents,35000);
 assert.equal(result.pendingCount,1);
 assert.equal(result.rows.reduce((sum,row)=>sum+Math.round(row.amount*100),0),result.netCents);
 assert.deepEqual(plan,before);
});

test('Parent category, method, merchant query and billing-month window filter the same source rows',()=>{
 const plan=sample();
 const food=exploreExpenseDetails(plan,{endMonth:'2026-09',count:1,category:'מזון'});
 assert.deepEqual(food.rows.map(row=>row.id),['food','refund','restaurant']);
 const matched=exploreExpenseDetails(plan,{endMonth:'2026-09',count:1,category:'מזון',method:'card1',query:'מכולת'});
 assert.deepEqual(matched.rows.map(row=>row.id),['food','refund']);assert.equal(matched.netCents,25000);
 const excluded=exploreExpenseDetails(plan,{endMonth:'2026-09',count:1,excludeMonth:'2026-09'});
 assert.deepEqual(excluded.rows,[]);
 assert.deepEqual(exploreExpenseDetails(plan,{endMonth:'2026-08',count:1}).rows.map(row=>row.id),['older']);
});

test('Card settlement, bank import and planned spending are not added to explorer totals',()=>{
 const plan=sample();plan.months['2026-09'].values.card1=1000;plan.expenses.push({id:'plan',name:'מכשיר',amount:1200,fees:0,firstMonth:'2026-09',payments:12,source:'card',kind:'expense'});plan.bankImport={version:1,accounts:[],entries:[{field:'card1',month:'2026-09',cents:100000}],batches:[]};
 const result=exploreExpenseDetails(plan,{endMonth:'2026-09',count:1});
 assert.equal(result.netCents,35000);assert.equal(result.rows.length,3);
});

test('Saved exploration filters validate as budget data and reject malformed or duplicate views',()=>{
 const plan=createDemoPlan('2026-10'),view={id:'view-1',name:'מזון בחצי שנה',count:6,end:'',category:'מזון',method:'',query:''};
 plan.dataViews=[view];assert.equal(validatePlan(plan),true);assert.deepEqual(clone(plan).dataViews,[view]);
 plan.dataViews.push({...view});assert.equal(validatePlan(plan),false);
 plan.dataViews=[{...view,method:'removed-card'}];assert.equal(validatePlan(plan),true);
 assert.deepEqual(exploreExpenseDetails(plan,{endMonth:'2026-09',method:'removed-card'}).rows,[]);
 plan.dataViews=[{...view,end:'2025-01'}];assert.equal(validatePlan(plan),true);
 plan.dataViews=[{...view,method:'a'.repeat(101)}];assert.equal(validatePlan(plan),false);
 plan.dataViews=[{...view,query:'a'.repeat(81)}];assert.equal(validatePlan(plan),false);
 plan.dataViews=[{...view,extra:'unexpected'}];assert.equal(validatePlan(plan),false);
 assert.throws(()=>exploreExpenseDetails(plan,{endMonth:'2026-09',count:25}));
});

test('Account and purchase-date filters preserve unknown ownership and exact refund totals',()=>{
 const p=sample();p.cashPlanning={accounts:[{id:'a',label:'א',opening:0,openingMonth:p.startMonth,buffer:0,defaults:zero()},{id:'b',label:'ב',opening:0,openingMonth:p.startMonth,buffer:0,defaults:zero()}],months:{},cardAccounts:{card1:'a',card2:'b'},transfers:[]};
 assert.equal(exploreExpenseDetails(p,{endMonth:'2026-09',count:1,account:'a'}).netCents,25000);
 assert.equal(exploreExpenseDetails(p,{endMonth:'2026-09',count:1,account:'b'}).netCents,10000);
 p.details.push({...detail('unassigned',33,'2026-09','מזון','variable')});
 assert.deepEqual(exploreExpenseDetails(p,{endMonth:'2026-09',count:1,account:'unassigned'}).rows.map(r=>r.id),['unassigned']);
 p.details[0].date='2026-08-10';
 assert.ok(!exploreExpenseDetails(p,{endMonth:'2026-09',count:1,dateBasis:'purchase'}).rows.some(r=>r.id==='food'));
 assert.ok(exploreExpenseDetails(p,{endMonth:'2026-08',count:1,dateBasis:'purchase'}).rows.some(r=>r.id==='food'));
 assert.ok(!exploreExpenseDetails(p,{endMonth:'2026-08',count:1,dateBasis:'purchase',excludeMonth:'2026-09'}).rows.some(r=>r.id==='food'));
 assert.throws(()=>exploreExpenseDetails(p,{endMonth:'2026-09',dateBasis:'unknown'}));
 p.dataViews=[{id:'v',name:'חשבון א לפי קנייה',count:6,end:'',category:'',method:'',query:'',account:'a',dateBasis:'purchase'}];assert.equal(dataViewsValid(p),true);
});

test('Merchant changes plus uncovered remainder exactly explain the reported monthly change',async()=>{
 const {merchantExpenseChange}=await import('../src/budget.js');const p=sample();p.months['2026-08'].values={...zero(),card1:500};p.months['2026-09'].values={...zero(),card1:700};
 const result=merchantExpenseChange(p,{month:'2026-09',asOf:'2026-10'});assert.equal(result.available,true);assert.equal(result.parts.reduce((sum,row)=>sum+row.differenceCents,0)+result.remainderCents,20000);assert.equal(result.changeCents,20000);
 assert.equal(merchantExpenseChange(p,{month:'2026-09',asOf:'2026-10',excludeMonth:'2026-08'}).available,false);
});
