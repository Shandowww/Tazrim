import test from 'node:test';
import assert from 'node:assert/strict';
import {zero,clone,validatePlan,setLoan,removeLoan,monthlyValues,forecast,saveMonthReport,setReportedCashBalance,planSavingTransfer,completeSavingTransfer,savingsBalances} from '../src/budget.js';
const base=()=>({startMonth:'2026-10',opening:50000,buffer:5000,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,savingsGoals:{balance:1000,snapshotMonth:'2026-10',items:[],deposits:{}}});
function reported(){return saveMonthReport(setReportedCashBalance(base(),'2026-10',50000),'2026-10',true,'2026-10');}
test('Loans stop after remaining months, preserve actual reports and remain valid in old backups',()=>{
 const p=base();delete p.defaults.loanRepayment;assert.equal(validatePlan(p),true);
 const next=setLoan(p,{id:'loan',name:'הלוואה לבדיקה',monthly:1000.25,from:'2026-10',months:3});
 assert.deepEqual(forecast(next).slice(0,4).map(r=>r.spending),[1000.25,1000.25,1000.25,0]);
 next.months['2026-10']={values:{...zero(),loanRepayment:800},actual:true,includesPlannedCard:false};
 const edited=setLoan(next,{...next.loans[0],monthly:1200});assert.equal(monthlyValues(edited,'2026-10').loanRepayment,800);
 assert.equal(monthlyValues(removeLoan(edited,'loan'),'2026-11').loanRepayment,0);
 for(const monthly of [0,-1,1.001,NaN])assert.throws(()=>setLoan(p,{id:'bad',name:'bad',monthly,from:'2026-10',months:3}));
});
test('Planning reserves cash without posting savings; bank completion posts exactly once',()=>{
 const p=reported(),before=clone(p),pending=planSavingTransfer(p,'request','2026-10',20000,0,'2026-10');
 assert.deepEqual(p,before);assert.equal(savingsBalances(pending,'2026-10').balance,1000);
 assert.equal(forecast(pending)[0].balance,30000);
 const done=completeSavingTransfer(pending,'request','2026-10');
 assert.equal(savingsBalances(done,'2026-10').balance,21000);assert.equal(forecast(done)[0].balance,30000);
 assert.deepEqual(completeSavingTransfer(done,'request','2026-10'),done);
 assert.throws(()=>planSavingTransfer(pending,'request','2026-10',1,0,'2026-10'));
 assert.throws(()=>planSavingTransfer(pending,'over','2026-10',30000,0,'2026-10'));
});
test('New bank balance keeps outstanding planned transfer outside the actual anchor',()=>{
 const pending=planSavingTransfer(reported(),'request','2026-10',20000,0,'2026-10');
 const updated=saveMonthReport(setReportedCashBalance(pending,'2026-10',51000),'2026-10',true,'2026-10');
 assert.equal(forecast(updated)[0].balance,31000);
 assert.equal(forecast(completeSavingTransfer(updated,'request','2026-10'))[0].balance,31000);
});
test('A transfer already included in the report is reconciled rather than added again',()=>{
 let pending=planSavingTransfer(reported(),'request','2026-10',20000,0,'2026-10');
 pending.months['2026-10'].values.personalSaving=20000;
 pending=saveMonthReport(pending,'2026-10',true,'2026-10');
 pending=saveMonthReport(setReportedCashBalance(pending,'2026-10',30000),'2026-10',true,'2026-10');
 const done=completeSavingTransfer(pending,'request','2026-10',true);
 assert.equal(done.months['2026-10'].values.personalSaving,20000);assert.equal(forecast(done)[0].balance,30000);
 assert.throws(()=>completeSavingTransfer(planSavingTransfer(reported(),'request','2026-10',20000,0,'2026-10'),'request','2026-10',true));
});
