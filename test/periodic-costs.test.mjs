import test from 'node:test';
import assert from 'node:assert/strict';
import {clone,createDemoPlan,forecast,markPeriodicCostPaid,periodicCostOutlook,setPeriodicCost,validatePlan} from '../src/budget.js';

function budget(){const plan=createDemoPlan('2026-10');plan.demo=false;plan.expenses=[];return plan;}
const insurance={id:'insurance',name:'ביטוח רכב',amount:1200,dueMonth:'2026-12',repeat:'yearly',paidMonths:[]};

test('Periodic preparation is metadata; it never posts an expense into the forecast',()=>{
 const plan=budget(),baseline=forecast(plan),next=setPeriodicCost(plan,insurance);
 assert.equal(validatePlan(next),true);
 assert.deepEqual(forecast(next),baseline);
 assert.equal(periodicCostOutlook(next,'2026-10').monthlyReserveCents,40000);
 assert.equal(periodicCostOutlook(next,'2026-12').rows[0].status,'due');
 assert.equal(periodicCostOutlook(next,'2027-01').rows[0].status,'overdue');
 assert.equal(periodicCostOutlook(next,'2027-01').rows[0].nextMonth,'2026-12');
 assert.deepEqual(plan.periodicCosts,undefined);
});

test('Annual events advance only after explicit payment; undo restores overdue occurrence',()=>{
 const plan=setPeriodicCost(budget(),insurance),baseline=forecast(plan);
 assert.throws(()=>markPeriodicCostPaid(plan,'insurance','2026-12',true,'2026-11'));
 const paid=markPeriodicCostPaid(plan,'insurance','2026-12',true,'2026-12');
 assert.equal(periodicCostOutlook(paid,'2027-01').rows[0].nextMonth,'2027-12');
 assert.equal(periodicCostOutlook(paid,'2027-01').monthlyReserveCents,10000);
 assert.deepEqual(forecast(paid),baseline);
 const undone=markPeriodicCostPaid(paid,'insurance','2026-12',false,'2027-01');
 assert.equal(periodicCostOutlook(undone,'2027-01').rows[0].status,'overdue');
 assert.deepEqual(plan.periodicCosts[0].paidMonths,[]);
});

test('One-off payment is completed and does not repeat',()=>{
 const plan=setPeriodicCost(budget(),{...insurance,repeat:'once'});
 const paid=markPeriodicCostPaid(plan,'insurance','2026-12',true,'2027-01');
 const outlook=periodicCostOutlook(paid,'2027-04');
 assert.equal(outlook.rows[0].status,'paid');assert.equal(outlook.monthlyReserveCents,0);assert.equal(outlook.overdueCents,0);
});

test('Reject malformed schedules and preserve existing budget compatibility',()=>{
 const plan=budget();assert.equal(validatePlan(plan),true);
 for(const item of [{...insurance,amount:1.001},{...insurance,paidMonths:['2026-11']},{...insurance,paidMonths:['2026-12','2026-12']},{...insurance,dueMonth:'2025-01'},{...insurance,extra:true}]){
  const invalid=clone(plan);invalid.periodicCosts=[item];assert.equal(validatePlan(invalid),false);
 }
 const duplicate=clone(plan);duplicate.periodicCosts=[insurance,{...insurance}];assert.equal(validatePlan(duplicate),false);
});

test('Periodic source and planning links remain evidence only and detect edits or deletion',async()=>{
 const {linkPeriodicSource,unlinkPeriodicSource,periodicSourceLinkState}=await import('../src/budget.js');let p=setPeriodicCost(budget(),insurance);p.details=[{id:'paid',name:'ביטוח',category:'כספים / ביטוחים',amount:1200,method:'card1',month:'2026-11',date:'2026-11-01',status:'cleared',accounting:'included',number:''}];const baseline=forecast(p),before=clone(p);const next=linkPeriodicSource(p,{costId:'insurance',month:'2026-12',type:'detail',sourceId:'paid'});assert.equal(validatePlan(next),true);assert.equal(periodicSourceLinkState(next,next.periodicSourceLinks[0]),'confirmed');assert.deepEqual(next.periodicCosts,p.periodicCosts);assert.deepEqual(forecast(next),baseline);assert.deepEqual(p,before);assert.equal(next.periodicCosts[0].paidMonths.length,0);const changed=clone(next);changed.details[0].amount=1300;assert.equal(periodicSourceLinkState(changed,changed.periodicSourceLinks[0]),'stale');delete changed.details;assert.equal(validatePlan(changed),true);assert.equal(periodicSourceLinkState(changed,changed.periodicSourceLinks[0]),'stale');assert.equal(unlinkPeriodicSource(next,next.periodicSourceLinks[0]).periodicSourceLinks.length,0);assert.throws(()=>linkPeriodicSource(p,{costId:'insurance',month:'2026-11',type:'detail',sourceId:'paid'}));
 const malformed=clone(p);malformed.periodicSourceLinks=[null];assert.equal(validatePlan(malformed),false);
});
