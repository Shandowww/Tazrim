import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoPlan,clone,validatePlan,savingsBalances,savingsProjection,applySavingsDeposit,applySavingsRate,reallocateSavings,forecast} from '../src/budget.js';
const month='2026-10';
test('Optional goals preserve old budgets and validate allocation and ledger limits',()=>{
 const p=createDemoPlan(month);assert.ok(validatePlan(p));const old=clone(p);delete old.savingsGoals;assert.ok(validatePlan(old));
 for(const change of [q=>q.savingsGoals.items[0].allocated=500001,q=>q.savingsGoals.items[0].icon='unknown',q=>q.savingsGoals.items[1].id='house',q=>q.savingsGoals.deposits[month]={house:100000},q=>q.savingsGoals.balance=-1]){const q=clone(p);change(q);assert.equal(validatePlan(q),false);}
 assert.deepEqual(savingsBalances(p,month).items.map(g=>g.current),[400000,50000,20000,30000]);assert.equal(savingsBalances(p,month).free,0);
});
test('Deposit confirmation replaces the ledger, counts once and only raises uncovered budget amounts',()=>{
 const p=createDemoPlan(month),before=forecast(p);let q=applySavingsDeposit(p,'house',month,2000,month);assert.equal(savingsBalances(q,month).balance,502000);assert.equal(q.months[month].values.personalSaving,p.months[month].values.personalSaving);assert.deepEqual(forecast(q),before);
 q=applySavingsDeposit(q,'house',month,2000,month);assert.equal(savingsBalances(q,month).balance,502000);
 q=applySavingsDeposit(q,'holiday',month,4000,month);assert.equal(q.months[month].values.personalSaving+q.months[month].values.sharedSaving,6000);assert.equal(savingsBalances(q,month).balance,506000);
 q=applySavingsDeposit(q,'house',month,1000,month);assert.equal(savingsBalances(q,month).balance,505000);assert.equal(q.months[month].values.card1,p.months[month].values.card1);assert.equal(q.months[month].actual,p.months[month].actual);
 assert.throws(()=>applySavingsDeposit(p,'house','2026-11',100,month));assert.throws(()=>applySavingsDeposit(p,'house',month,-1,month));assert.equal(p.savingsGoals.balance,500000);
});
test('Reallocation conserves the savings pool, allows free funds and preserves current-month corrections',()=>{
 let p=applySavingsDeposit(createDemoPlan(month),'house',month,2000,month);p=reallocateSavings(p,[390000,60000,20000,30000],month);assert.equal(savingsBalances(p,month).balance,502000);assert.equal(savingsBalances(p,month).free,2000);
 p=applySavingsDeposit(p,'house',month,2000,month);assert.equal(savingsBalances(p,month).balance,502000);
 p=applySavingsDeposit(p,'house',month,2500,month);assert.equal(savingsBalances(p,month).balance,502500);assert.equal(savingsBalances(p,month).items[0].current,390500);
 const q=JSON.parse(JSON.stringify(p));assert.ok(validatePlan(q));assert.deepEqual(savingsBalances(q,month),savingsBalances(p,month));assert.throws(()=>reallocateSavings(p,[600000,0,0,0],month));
});
test('Projection uses cents, counts remaining deposits, handles zero pace and calendar rollover',()=>{
 assert.deepEqual(savingsProjection(0,100,10,30,'2026-12'),{count:4,futureCount:3,month:'2027-03'});
 assert.equal(savingsProjection(0,100,10,30,'2026-12',true).count,3);
 assert.equal(savingsProjection(0,0.31,0.1,0.1,month).count,4);
 assert.equal(savingsProjection(0,100,0,0,month),null);assert.equal(savingsProjection(100,100,0,0,month).count,0);
});
test('Future rate changes affordability without rewriting actual months, planned purchases or the funded balance',()=>{
 const p=createDemoPlan(month),q=applySavingsRate(p,'house',3000,month);assert.equal(q.defaults.personalSaving+q.defaults.sharedSaving,p.defaults.personalSaving+p.defaults.sharedSaving+1000);assert.deepEqual(q.months[month],p.months[month]);assert.equal(q.months['2026-11'].values.personalSaving,p.months['2026-11'].values.personalSaving+1000);assert.deepEqual(q.expenses,p.expenses);assert.deepEqual(savingsBalances(q,month),{...savingsBalances(p,month),items:savingsBalances(p,month).items.map(g=>g.id==='house'?{...g,monthly:3000}:g)});assert.ok(validatePlan(q));
});

test('Centered transfer previews both directions without changing savings or cash-flow records',async()=>{
 const {previewSavingsTransfer,applySavingsTransfer}=await import('../src/budget.js'),p=createDemoPlan(month);
 const zero=previewSavingsTransfer(p,'house','holiday',0,month);assert.equal(zero.amount,0);assert.equal(zero.top.after,400000);assert.equal(zero.bottom.after,50000);
 const right=previewSavingsTransfer(p,'house','holiday',-200,month);assert.equal(right.top.after,410000);assert.equal(right.bottom.after,40000);
 const left=previewSavingsTransfer(p,'house','holiday',25,month);assert.equal(left.top.after,390000);assert.equal(left.bottom.after,60000);
 const next=applySavingsTransfer(p,'house','holiday',25,month);assert.equal(savingsBalances(next,month).balance,500000);assert.equal(savingsBalances(next,month).free,0);assert.deepEqual(next.months,p.months);assert.deepEqual(next.defaults,p.defaults);assert.deepEqual(next.expenses,p.expenses);assert.deepEqual(forecast(next),forecast(p));assert.ok(validatePlan(next));assert.equal(p.savingsGoals.items[0].allocated,400000);
 assert.equal(savingsProjection(left.top.after,left.top.target,2000,2000,month).count,105);assert.equal(savingsProjection(left.bottom.after,left.bottom.target,400,400,month).count,50);
});
test('Transfers handle unallocated money, full balances and cents without counting deposits twice',async()=>{
 const {previewSavingsTransfer,applySavingsTransfer}=await import('../src/budget.js');let p=applySavingsDeposit(createDemoPlan(month),'house',month,2000.01,month);
 p=applySavingsTransfer(p,'house','',1000,month);assert.equal(savingsBalances(p,month).free,402000.01);assert.equal(savingsBalances(p,month).items[0].current,0);
 p=applySavingsTransfer(p,'house','',-1000,month);assert.equal(savingsBalances(p,month).free,0);assert.equal(savingsBalances(p,month).items[0].current,402000.01);
 p=applySavingsDeposit(p,'house',month,2000.01,month);assert.equal(savingsBalances(p,month).balance,502000.01);assert.ok(validatePlan(JSON.parse(JSON.stringify(p))));
 const trial=previewSavingsTransfer(p,'house','holiday',1,month);assert.equal(Math.round((trial.top.after+trial.bottom.after)*100),45200001);
 for(const args of [['house','house',0],['missing','holiday',0],['house','holiday',1001],['house','holiday',NaN],['house','holiday',1.1]])assert.throws(()=>previewSavingsTransfer(p,...args,month));
});

test('Combined monthly savings enter free funds once, survive allocation and preserve cash flow',async()=>{
 const {confirmMonthlySavings,applySavingsTransfer}=await import('../src/budget.js');let p=createDemoPlan(month),before=forecast(p),total=p.months[month].values.personalSaving+p.months[month].values.sharedSaving;
 p=confirmMonthlySavings(p,month,month);assert.equal(savingsBalances(p,month).balance,500000+total);assert.equal(savingsBalances(p,month).free,total);assert.deepEqual(forecast(p),before);
 p=confirmMonthlySavings(p,month,month);assert.equal(savingsBalances(p,month).free,total);
 p=applySavingsTransfer(p,'house','',-1000,month);assert.equal(savingsBalances(p,month).free,0);assert.equal(savingsBalances(p,month).items[0].current,400000+total);
 p=confirmMonthlySavings(p,month,month);assert.equal(savingsBalances(p,month).balance,500000+total);assert.equal(savingsBalances(p,month).free,0);
 const reduced=clone(p);reduced.months[month].values.personalSaving=0;reduced.months[month].values.sharedSaving=0;assert.throws(()=>confirmMonthlySavings(reduced,month,month),/לשחרר כסף/);
 p=applySavingsTransfer(p,'house','',1000,month);p.months[month].values.personalSaving=0;p.months[month].values.sharedSaving=0;p=confirmMonthlySavings(p,month,month);assert.equal(savingsBalances(p,month).balance,500000);assert.ok(validatePlan(JSON.parse(JSON.stringify(p))));
});
test('Existing goal deposits are included in the combined report, with only the remainder unallocated',async()=>{
 const {confirmMonthlySavings}=await import('../src/budget.js');let p=applySavingsDeposit(createDemoPlan(month),'house',month,2000,month);const total=p.months[month].values.personalSaving+p.months[month].values.sharedSaving;
 p=confirmMonthlySavings(p,month,month);assert.equal(savingsBalances(p,month).balance,500000+total);assert.equal(savingsBalances(p,month).items[0].current,402000);assert.equal(savingsBalances(p,month).free,total-2000);
 p=reallocateSavings(p,[390000,60000,20000,30000],month);p=confirmMonthlySavings(p,month,month);assert.equal(savingsBalances(p,month).balance,500000+total);assert.ok(validatePlan(p));assert.throws(()=>confirmMonthlySavings(p,'2026-11',month));
});

test('Confirmed saving keeps its own month record when recurring estimates change',async()=>{
 const {confirmMonthlySavings}=await import('../src/budget.js'),p=createDemoPlan(month);delete p.months[month];let q=confirmMonthlySavings(p,month,month);const balance=savingsBalances(q,month).balance;
 q.defaults.personalSaving+=500;assert.ok(validatePlan(q));assert.equal(savingsBalances(q,month).balance,balance);assert.equal(q.months[month].actual,false);
});

test('New goal illustrations persist without altering saved allocations or cash flow',()=>{
 const p=createDemoPlan(month),before=forecast(p);for(const icon of ['car','safety-fund','business']){const next=clone(p);next.savingsGoals.items[0].icon=icon;const restored=JSON.parse(JSON.stringify(next));assert.equal(validatePlan(restored),true);assert.equal(restored.savingsGoals.items[0].icon,icon);assert.deepEqual(forecast(restored),before);assert.equal(savingsBalances(restored,month).balance,500000);}
});

test('Free allocation distributes existing cents without changing totals or monthly reports',async()=>{
 const {allocateFreeSavings,confirmMonthlySavings}=await import('../src/budget.js');const p=confirmMonthlySavings(createDemoPlan(month),month,month),pool=savingsBalances(p,month);
 const next=allocateFreeSavings(p,{house:1000.01,holiday:500.02},month),after=savingsBalances(next,month);
 assert.equal(after.balance,pool.balance);assert.equal(after.free,(Math.round(pool.free*100)-150003)/100);assert.equal(after.items[0].current,pool.items[0].current+1000.01);assert.deepEqual(next.months,p.months);assert.deepEqual(forecast(next),forecast(p));assert.ok(validatePlan(next));
 assert.throws(()=>allocateFreeSavings(p,{house:pool.free+0.01},month));assert.throws(()=>allocateFreeSavings(p,{unknown:1},month));assert.throws(()=>allocateFreeSavings(p,{house:-1},month));
});
test('Only newly confirmed actual cash is eligible for celebration, including positive corrections',async()=>{
 const {newlyAvailableSavings,saveMonthReport}=await import('../src/budget.js');const p=createDemoPlan(month),actual=saveMonthReport(p,month,true,month),amount=savingsBalances(actual,month).free;
 assert.equal(newlyAvailableSavings(p,actual,month),amount);assert.equal(newlyAvailableSavings(actual,actual,month),0);
 const estimate=saveMonthReport(p,month,false,month);assert.equal(newlyAvailableSavings(p,estimate,month),0);
 const edited=clone(actual);edited.months[month].values.personalSaving+=100;const corrected=saveMonthReport(edited,month,true,month);assert.equal(newlyAvailableSavings(actual,corrected,month),100);
 const allocated=reallocateSavings(actual,savingsBalances(actual,month).items.map((g,i)=>g.current+(i===0?amount:0)),month);assert.equal(newlyAvailableSavings(actual,allocated,month),0);
});
