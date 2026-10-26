import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoPlan,clone,saveMonthReport,reportAdditionalSavings,forecast,savingsBalances,validatePlan,setReportedCashBalance} from '../src/budget.js';
const month='2026-10';
function bankPlan(){const p=createDemoPlan(month);return setReportedCashBalance(p,month,forecast(p).find(r=>r.month===month).balance);}
test('Bank balance anchors the confirmed month and later forecasts while preserving earlier history',()=>{
 const original=createDemoPlan(month),before=forecast(original);
 const draft=setReportedCashBalance(original,month,25000.5);
 // Inputs can be entered in either order; confirmation captures the final monthly net.
 draft.months[month].values.salary+=1500;
 const saved=saveMonthReport(draft,month,true,month),rows=forecast(saved),anchor=rows.find(r=>r.month===month);
 assert.equal(anchor.balance,25000.5);
 assert.equal(saved.months[month].cashReport.pending,undefined);
 for(let i=0;i<rows.length;i++){
  if(rows[i].month<month)assert.deepEqual(rows[i],before[i]);
  if(rows[i].month>month)assert.equal(Math.round(rows[i].balance*100),Math.round((rows[i-1].balance+rows[i].net)*100));
 }
 assert.equal(original.months[month].cashReport,undefined);
 const restored=JSON.parse(JSON.stringify(saved));assert.ok(validatePlan(restored));assert.deepEqual(forecast(restored),rows);
});
test('A new bank reading replaces the anchor, while reconfirming an unchanged report preserves later transfers',()=>{
 const p=saveMonthReport(setReportedCashBalance(createDemoPlan(month),month,25000.5),month,true,month);
 const transfer=reportAdditionalSavings(p,month,100.25,0,month);
 assert.equal(forecast(transfer).find(r=>r.month===month).balance,24900.25);
 assert.equal(forecast(saveMonthReport(transfer,month,true,month)).find(r=>r.month===month).balance,24900.25);
 const refreshed=saveMonthReport(setReportedCashBalance(transfer,month,24000.75),month,true,month);
 assert.equal(forecast(refreshed).find(r=>r.month===month).balance,24000.75);
 const estimate=saveMonthReport(refreshed,month,false,month);
 assert.equal(estimate.months[month].cashReport,undefined);
});
test('Bank readings accept zero and overdrafts, reject malformed cents, and are required before extra savings',()=>{
 for(const amount of [0,-1234.56]){
  const p=saveMonthReport(setReportedCashBalance(createDemoPlan(month),month,amount),month,true,month);
  assert.equal(forecast(p).find(r=>r.month===month).balance,amount);assert.ok(validatePlan(p));
 }
 for(const amount of [NaN,Infinity,1.001,100000001])assert.throws(()=>setReportedCashBalance(createDemoPlan(month),month,amount));
 assert.throws(()=>reportAdditionalSavings(saveMonthReport(createDemoPlan(month),month,true,month),month,10,0,month),/מהבנק/);
 const invalid=bankPlan();invalid.months[month].cashReport.balance=0.001;assert.equal(validatePlan(invalid),false);
});
test('Confirmed extra savings moves cents from cash into the free pool without changing goals or other month values',()=>{
 const p=saveMonthReport(bankPlan(),month,true,month),before=forecast(p).find(r=>r.month===month),pool=savingsBalances(p,month);
 const next=reportAdditionalSavings(p,month,100.25,50.5,month),after=forecast(next).find(r=>r.month===month);
 assert.equal(Math.round((before.balance-after.balance)*100),15075);
 assert.equal(Math.round((savingsBalances(next,month).balance-pool.balance)*100),15075);
 assert.equal(Math.round((savingsBalances(next,month).free-pool.free)*100),15075);
 assert.deepEqual(next.savingsGoals.items,p.savingsGoals.items);
 assert.equal(next.months[month].values.salary,p.months[month].values.salary);
 assert.ok(validatePlan(next));
 const oldRows=forecast(p),newRows=forecast(next);
 for(let i=0;i<oldRows.length;i++)if(oldRows[i].month>month){
  assert.equal(newRows[i].saving,oldRows[i].saving);
  assert.equal(Math.round((oldRows[i].balance-newRows[i].balance)*100),15075);
 }
 const repeated=saveMonthReport(next,month,true,month);
 assert.deepEqual(savingsBalances(repeated,month),savingsBalances(next,month));
});
test('A one-time extra deposit preserves later explicit months and their inherited saving pace',()=>{
 const p=saveMonthReport(bankPlan(),month,true,month);
 p.months['2027-01']={values:{...p.months[month].values,personalSaving:700},actual:false,includesPlannedCard:false};
 const next=reportAdditionalSavings(p,month,10,0,month);
 const before=forecast(p),after=forecast(next);
 for(let i=0;i<before.length;i++)if(before[i].month>month)assert.equal(after[i].saving,before[i].saving);
 assert.deepEqual(next.months['2027-01'],p.months['2027-01']);
});
test('Savings choice rejects estimates, future months, zero, invalid amounts and buffer overspend without mutation',()=>{
 const p=saveMonthReport(bankPlan(),month,true,month),before=clone(p);
 for(const amounts of [[0,0],[-1,1],[NaN,0],[1.001,0],[100000000,0]])assert.throws(()=>reportAdditionalSavings(p,month,...amounts,month));
 const estimate=saveMonthReport(p,month,false,month);assert.throws(()=>reportAdditionalSavings(estimate,month,100,0,month));
 assert.throws(()=>reportAdditionalSavings(p,'2026-11',100,0,month));
 assert.deepEqual(p,before);
});
