import test from 'node:test';
import assert from 'node:assert/strict';
import {clone,createDemoPlan,familyReviewMonth,forecast,setFamilyReview,validatePlan,zero} from '../src/budget.js';

function budget(){
 const plan=createDemoPlan('2026-10');plan.demo=false;plan.expenses=[];plan.details=[];plan.months={'2026-09':{values:{...zero(),card1:150},actual:true,includesPlannedCard:false}};
 const detail=(id,category,amount,date='2026-09-08')=>({id,name:'הוצאה לדוגמה',category,method:'card1',amount,month:'2026-09',date,number:'',status:'cleared',accounting:'included'});
 plan.details.push(detail('food','מזון / סופרמרקט',80),detail('health','בריאות / רופא',20));
 const key='a'.repeat(64);plan.details.push({...detail('cal-'+key,'מזון / סופרמרקט',-5),statement:{issuer:'cal',dueDate:'2026-09-15',key,originalCents:-500}});
 return plan;
}

test('Family review separates cleared category net from the authoritative reported total',()=>{
 const plan=budget(),view=familyReviewMonth(plan,'2026-09','2026-10');
 assert.equal(validatePlan(plan),true);assert.equal(view.available,true);
 assert.equal(view.total,150);assert.equal(view.detailedCents,9500);assert.equal(view.remainderCents,5500);
 assert.deepEqual(view.categories.map(row=>[row.category,row.amount]),[['מזון',75],['בריאות',20]]);
 assert.equal(view.statusCents.unmarked,9500);assert.equal(view.coverage.detail.status,'partial');
 assert.equal(familyReviewMonth(plan,'2026-10','2026-10').available,false);
 assert.equal(familyReviewMonth(plan,'2026-09','2026-10','2026-09').available,false);
});

test('Only an explicit family mark changes review metadata, never cash flow or actual achievements',()=>{
 const plan=budget(),before=forecast(plan),marked=setFamilyReview(plan,{month:'2026-09',category:'מזון',status:'worthwhile',asOf:'2026-10'});
 assert.deepEqual(forecast(marked),before);assert.equal(plan.familyReviews,undefined);
 const view=familyReviewMonth(marked,'2026-09','2026-10');assert.equal(view.statusCents.worthwhile,7500);assert.equal(view.statusCents.unmarked,2000);
 const checked=setFamilyReview(marked,{month:'2026-09',category:'מזון',status:'review',asOf:'2026-10'});
 assert.equal(checked.familyReviews.length,1);assert.equal(familyReviewMonth(checked,'2026-09','2026-10').statusCents.review,7500);
 assert.equal(setFamilyReview(checked,{month:'2026-09',category:'מזון',status:'reset',asOf:'2026-10'}).familyReviews.length,0);
 assert.throws(()=>setFamilyReview(plan,{month:'2026-09',category:'דיור',status:'reduce',asOf:'2026-10'}));
});

test('Old marks after recategorization are visible and removable without blocking the budget',()=>{
 const plan=setFamilyReview(budget(),{month:'2026-09',category:'מזון',status:'reduce',asOf:'2026-10'});
 for(const detail of plan.details)if(detail.category.startsWith('מזון'))detail.category='קניות / כללי';
 assert.equal(validatePlan(plan),true);
 const view=familyReviewMonth(plan,'2026-09','2026-10');assert.equal(view.unreviewed.length,1);assert.equal(view.statusCents.reduce,0);
 assert.equal(setFamilyReview(plan,{month:'2026-09',category:'מזון',status:'reset',asOf:'2026-10'}).familyReviews.length,0);
});

test('Saved marks reject duplicates, unexpected fields and invalid month/status',()=>{
 const plan=budget();assert.equal(validatePlan(plan),true);
 const row={month:'2026-09',category:'מזון',status:'review'};
 for(const reviews of [[row,row],[{...row,extra:true}],[{...row,month:'2026-10-01'}],[{...row,status:'automatic'}]]){
  const changed=clone(plan);changed.familyReviews=reviews;assert.equal(validatePlan(changed),false);
 }
});
