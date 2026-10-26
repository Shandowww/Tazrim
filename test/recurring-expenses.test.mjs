import test from 'node:test';
import assert from 'node:assert/strict';
import {clone,createDemoPlan,forecast,exploreExpenseDetails,recurringExpenseCandidates,recurringMerchantKey,setRecurringExpenseDecision,validatePlan,zero} from '../src/budget.js';

const months=['2026-07','2026-08','2026-09'];
const detail=(id,month,amount,name='נטפליקס',day='10')=>({id,name,month,date:month+'-'+day,amount,category:'בילויים / מנויים ודיגיטל',method:'card1',status:'cleared',accounting:'included',number:''});
function budget(){
 const plan=createDemoPlan('2026-10');plan.demo=false;plan.expenses=[];plan.months={};plan.details=[];
 for(let i=0;i<3;i++){
  const month=months[i];plan.months[month]={values:{...zero(),card1:120},actual:true,includesPlannedCard:false};
  plan.details.push(detail('sub-'+i,month,[50,52,60][i],i===1?'  נטפליקס  ':'נטפליקס',String(10+i).padStart(2,'0')));
 }
 return plan;
}

test('A repeated single charge is a candidate and displays the latest charge change separately',()=>{
 const plan=budget(),before=clone(plan),result=recurringExpenseCandidates(plan,{asOf:'2026-10'});
 assert.equal(result.available,true);assert.equal(result.candidates.length,1);
 const row=result.candidates[0];assert.equal(row.latestAmount,60);assert.equal(row.previousAmount,52);assert.equal(row.change,8);
 assert.deepEqual(row.months.map(item=>item.month),months);
 assert.equal(result.estimatedAmount,0);assert.equal(row.status,'candidate');assert.deepEqual(exploreExpenseDetails(plan,{endMonth:'2026-09',count:3,method:'card1',query:'נטפליקס'}).rows.map(item=>item.id),['sub-2','sub-1','sub-0']);assert.deepEqual(plan,before);
});

test('Confirmation is explicit budget metadata and never adds another forecast charge',()=>{
 const plan=budget(),baseline=forecast(plan),merchant=recurringMerchantKey('נטפליקס');
 plan.recurringDecisions=[{merchant,method:'card1',name:'נטפליקס',status:'confirmed'}];
 assert.equal(validatePlan(plan),true);
 const result=recurringExpenseCandidates(plan,{asOf:'2026-10'});
 assert.equal(result.candidates[0].status,'confirmed');assert.equal(result.estimatedAmount,60);
 assert.deepEqual(forecast(plan),baseline);
 plan.recurringDecisions[0].status='dismissed';assert.equal(recurringExpenseCandidates(plan,{asOf:'2026-10'}).estimatedAmount,0);
});

test('Accept, dismiss and reset decisions preserve financial values and require a current candidate',()=>{
 const plan=budget(),baseline=forecast(plan),merchant=recurringMerchantKey('נטפליקס'),options={asOf:'2026-10',merchant,method:'card1'};
 const accepted=setRecurringExpenseDecision(plan,{...options,status:'confirmed'});
 assert.equal(plan.recurringDecisions,undefined);assert.equal(accepted.recurringDecisions[0].status,'confirmed');
 assert.equal(recurringExpenseCandidates(accepted,{asOf:'2026-10'}).estimatedAmount,60);
 assert.deepEqual(forecast(accepted),baseline);
 const dismissed=setRecurringExpenseDecision(accepted,{...options,status:'dismissed'});
 assert.equal(dismissed.recurringDecisions[0].status,'dismissed');assert.equal(recurringExpenseCandidates(dismissed,{asOf:'2026-10'}).estimatedAmount,0);
 assert.deepEqual(setRecurringExpenseDecision(dismissed,{...options,status:'reset'}).recurringDecisions,[]);
 assert.throws(()=>setRecurringExpenseDecision(plan,{...options,merchant:'לא קיים',status:'confirmed'}));
 const withoutCurrent=clone(accepted);withoutCurrent.months['2026-09'].actual=false;
 assert.deepEqual(setRecurringExpenseDecision(withoutCurrent,{...options,status:'reset'}).recurringDecisions,[]);
});

test('Repeated installments, multiple charges and missing actual months do not imply recurrence',()=>{
 const plan=budget();for(const row of plan.details)row.date='2026-05-10';
 assert.equal(recurringExpenseCandidates(plan,{asOf:'2026-10'}).candidates.length,0);
 plan.details=budget().details;plan.details.push(detail('extra','2026-08',10));
 assert.equal(recurringExpenseCandidates(plan,{asOf:'2026-10'}).candidates.length,0);
 plan.details=budget().details;plan.months['2026-08'].actual=false;
 assert.equal(recurringExpenseCandidates(plan,{asOf:'2026-10'}).available,false);
 plan.months['2026-08'].actual=true;assert.equal(recurringExpenseCandidates(plan,{asOf:'2026-10',excludeMonth:'2026-08'}).available,false);
 plan.details[2].amount=-60;assert.equal(recurringExpenseCandidates(plan,{asOf:'2026-10'}).candidates.length,0);
 plan.details[2].amount=500;assert.equal(recurringExpenseCandidates(plan,{asOf:'2026-10'}).candidates.length,0);
});

test('Saved decisions reject duplicates, extra fields and unbounded values',()=>{
 const plan=budget(),row={merchant:'נטפליקס',method:'card1',name:'נטפליקס',status:'confirmed'};
 plan.recurringDecisions=[row];assert.equal(validatePlan(plan),true);
 plan.recurringDecisions=[row,{...row}];assert.equal(validatePlan(plan),false);
 plan.recurringDecisions=[{...row,extra:true}];assert.equal(validatePlan(plan),false);
 plan.recurringDecisions=[{...row,status:'automatic'}];assert.equal(validatePlan(plan),false);
 plan.recurringDecisions=[{...row,merchant:'a'.repeat(101)}];assert.equal(validatePlan(plan),false);
});
