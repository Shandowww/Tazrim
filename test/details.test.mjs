import test from 'node:test';
import assert from 'node:assert/strict';
import {clone,demoPlan,zero,forecast,validatePlan,detailSummary,categoryMonths,categoryGoalProgress,progressFor} from '../src/budget.js';
const budget=()=>({...clone(demoPlan),demo:false,expenses:[],defaults:{...zero(),card1:10000},details:[]});
const detail=(overrides={})=>({id:'kindergarten',name:'Kindergarten',category:'חינוך',amount:6000,method:'card1',month:'2026-10',date:'2026-10-10',number:'',status:'cleared',accounting:'included',...overrides});

test('A 6,000 detail explains a 10,000 card total without changing cash flow or goals',()=>{
 const p=budget(),before=forecast(p);p.details=[detail()];assert.equal(validatePlan(p),true);assert.deepEqual(forecast(p),before);
 const card=detailSummary(p,'2026-10').groups.find(g=>g.method==='card1');assert.equal(card.total,10000);assert.equal(card.included,6000);assert.equal(card.unexplained,4000);
 p.months['2026-10']={values:clone(p.defaults),actual:true,includesPlannedCard:false};assert.equal(progressFor(p,'2026-10').totals.spending,10000);
 p.details[0].amount=11000;assert.equal(detailSummary(p,'2026-10').groups[0].over,1000);assert.equal(forecast(p)[0].spending,10000);
});
test('Transfer, cash and included cheque details never add to monthly totals',()=>{
 const p=budget();p.defaults.transfers=600;p.defaults.variable=200;p.defaults.checks=900;
 const before=forecast(p);p.details=['transfers','variable','checks'].map((method,i)=>detail({id:String(i),method,amount:100}));assert.deepEqual(forecast(p),before);
});
test('Separate cheques count once on their due month, even after clearing, and cancellation removes them',()=>{
 const p=budget(),before=forecast(p);p.details=[detail({method:'checks',amount:100.01,accounting:'additional',status:'pending',month:'2026-11',date:'2026-11-20'})];
 assert.equal(validatePlan(p),true);assert.equal(forecast(p)[0].net,before[0].net);assert.equal(forecast(p)[1].net,before[1].net-100.01);
 const pending=forecast(p);p.details[0].status='cleared';assert.deepEqual(forecast(p),pending);
 p.details[0].status='cancelled';assert.deepEqual(forecast(p),before);
 p.details[0].status='pending';p.details[0].accounting='included';assert.deepEqual(forecast(p),before);
});
test('Cheques extend the forecast, preserve cents, and affect actual expense progress',()=>{
 const p=budget();p.details=[detail({method:'checks',accounting:'additional',amount:123.45,date:'2028-11-01',month:'2028-11',status:'pending'})];assert.equal(forecast(p).length,26);
 p.months['2028-11']={values:zero(),actual:true,includesPlannedCard:false};assert.equal(progressFor(p,'2028-11').totals.spending,123.45);
});
test('Older budgets without checks and optional detail fields still validate and forecast identically',()=>{
 const p=budget();delete p.defaults.checks;delete p.details;assert.equal(validatePlan(p),true);assert.equal(forecast(p)[0].net,-10000);p.defaults.checks=null;assert.equal(validatePlan(p),false);
});
test('Rejects invalid dates, mismatched cheque months, non-cheque additions, duplicate IDs and invalid caps',()=>{
 for(const override of [{date:'2026-02-30'},{method:'checks',date:'2026-11-10'},{accounting:'additional'},{method:'unknown'},{amount:-1},{status:'unknown'},{month:'2036-10'},{category:''}]){const p=budget();p.details=[detail(override)];assert.equal(validatePlan(p),false,JSON.stringify(override));}
 const p=budget();p.details=[detail(),detail()];assert.equal(validatePlan(p),false);p.details=[];p.categoryGoals={'חינוך':-1};assert.equal(validatePlan(p),false);
 assert.equal(validatePlan({...p,categoryGoals:{'חינוך':6000}}),true);
});
test('Trend distinguishes missing detail months from zero in a selected category',()=>{
 const p=budget();p.details=[detail(),detail({id:'nov',month:'2026-11',date:'2026-11-02',category:'מזון',amount:200})];const series=categoryMonths(p,'2026-12','חינוך');
 assert.deepEqual(series.map(s=>[s.month,s.amount,s.hasDetails]),[['2026-10',6000,true],['2026-11',0,true],['2026-12',0,false]]);
});
test('Category caps never confirm partial, estimated, demo or future-month results',()=>{
 const p=budget();p.details=[detail()];p.categoryGoals={'חינוך':7000};p.months['2026-10']={values:clone(p.defaults),actual:true,includesPlannedCard:false};
 assert.equal(categoryGoalProgress(p,'2026-10','חינוך','2026-10').confirmed,false);
 p.details.push(detail({id:'rest',category:'מזון',amount:4000}));assert.equal(categoryGoalProgress(p,'2026-10','חינוך','2026-10').withinTarget,true);
 assert.equal(categoryGoalProgress(p,'2026-10','חינוך','2026-09').confirmed,false);
 p.demo=true;assert.equal(categoryGoalProgress(p,'2026-10','חינוך','2026-10').confirmed,false);
 p.demo=false;p.months['2026-10'].actual=false;assert.equal(categoryGoalProgress(p,'2026-10','חינוך','2026-10').confirmed,false);
 p.categoryGoals['חינוך']=5000;assert.equal(categoryGoalProgress(p,'2026-10','חינוך','2026-10').exceeded,true);
});

test('Additional planned payments stay unclassified until included in a monthly total',()=>{
 const p=budget();p.details=[detail({amount:10000})];p.months['2026-10']={values:clone(p.defaults),actual:true,includesPlannedCard:false};p.expenses=[{id:'trip',name:'Trip',kind:'expense',source:'card',amount:300,fees:0,firstMonth:'2026-10',payments:1}];
 assert.equal(detailSummary(p,'2026-10').unexplained,300);assert.equal(categoryMonths(p,'2026-10')[0].complete,false);
 p.months['2026-10'].includesPlannedCard=true;assert.equal(detailSummary(p,'2026-10').unexplained,0);assert.equal(categoryMonths(p,'2026-10')[0].complete,true);
});
test('Distant included and cancelled records remain reachable without adding a payment',()=>{
 const p=budget();p.details=[detail({method:'checks',month:'2028-11',date:'2028-11-20',status:'cancelled'})];const rows=forecast(p);assert.equal(rows.length,26);assert.equal(rows[25].net,-10000);assert.equal(rows[25].planned,0);
});

test('Pending cheques and future actual flags never confirm category outcomes',()=>{
 const p=budget();p.defaults=zero();p.details=[detail({method:'checks',accounting:'additional',status:'pending'})];p.months['2026-10']={values:zero(),actual:true,includesPlannedCard:false};p.categoryGoals={'חינוך':7000};
 assert.equal(categoryGoalProgress(p,'2026-10','חינוך','2026-10').confirmed,false);assert.equal(categoryMonths(p,'2026-10')[0].complete,false);
 p.details[0].status='cleared';assert.equal(categoryGoalProgress(p,'2026-10','חינוך','2026-10').confirmed,true);assert.equal(categoryMonths(p,'2026-10','',6,'2026-09')[0].complete,false);
});
