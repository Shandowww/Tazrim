import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoPlan,categoryTrend,categoryColor,categoryParent,detailCategories,graphTopExpenses,expenseChange,clone,forecast,validatePlan,zero,cents} from '../src/budget.js';
const detail=(id,month,amount,category='ילדים ותינוקות / מזון ותמ״ל')=>({id,name:id,month,amount,category,method:'card1',status:'cleared',accounting:'included',date:month+'-10',number:''});
function budget(){const p=createDemoPlan('2026-10');p.demo=false;p.expenses=[];p.details=[detail('a','2026-08',100),detail('b','2026-09',150),detail('c','2026-10',75)];return p;}
test('Expense changes reconcile category deltas and the unexplained remainder to actual monthly spending',()=>{
 const p=budget();p.months['2026-09'].values={...zero(),card1:100};p.months['2026-10'].values={...zero(),card1:200};p.details=[detail('a','2026-09',50,'מזון'),detail('b','2026-10',100,'מזון')];
 const before=clone(p),result=expenseChange(p,{month:'2026-10',asOf:'2026-11'});
 assert.equal(result.available,true);assert.equal(result.change,100);assert.deepEqual(result.parts.map(part=>[part.category,part.change]),[['ללא פירוט או התאמה',50],['מזון',50]]);
 assert.equal(result.parts.reduce((sum,part)=>sum+cents(part.change),0),cents(result.change));assert.deepEqual(p,before);
});
test('Expense changes reject missing actual months and disclose incomplete or current-month comparisons',()=>{
 const p=budget();p.months['2026-09'].actual=false;
 assert.equal(expenseChange(p,{month:'2026-10',asOf:'2026-10'}).available,false);
 p.months['2026-09'].actual=true;p.details=[];
 const result=expenseChange(p,{month:'2026-10',asOf:'2026-10'});assert.equal(result.available,true);assert.equal(result.partialMonth,true);assert.equal(result.detailMatched,false);assert.equal(result.parts.length,1);assert.equal(result.parts[0].remainder,true);
 assert.equal(expenseChange(p,{month:p.startMonth,asOf:'2026-10'}).available,false);
});
test('Refunds and over-detailed months preserve signed cents and disclose reconciliation',()=>{
 const p=budget();p.months['2026-09'].values={...zero(),card1:100};p.months['2026-10'].values={...zero(),card1:80};
 p.details=[detail('purchase','2026-09',90,'מזון'),detail('refund','2026-10',-30,'מזון'),detail('other','2026-10',120,'דיור')];
 const result=expenseChange(p,{month:'2026-10',asOf:'2026-11'});
 assert.equal(result.change,-20);assert.equal(result.detailMatched,false);
 assert.equal(result.parts.find(part=>part.category==='מזון').change,-120);
 assert.equal(result.parts.find(part=>part.category==='ללא פירוט או התאמה').current,-10);
 assert.equal(result.parts.reduce((sum,part)=>sum+cents(part.change),0),cents(result.change));
});
test('Category history compares adjacent calendar months in either direction without changing records or forecasts',()=>{
 const p=budget(),before=clone(p),flow=forecast(p),options={category:'ילדים ותינוקות',endMonth:'2026-10',asOf:'2026-10',count:3};
 const previous=categoryTrend(p,options);assert.deepEqual(previous.map(r=>r.percent),[null,50,-50]);assert.equal(previous[1].change,50);assert.equal(previous[0].baselineMonth,'2026-07');
 const next=categoryTrend(p,{...options,compare:'next'});assert.deepEqual(next.map(r=>r.percent),[-33.3,100,null]);assert.equal(next[0].baselineMonth,'2026-09');assert.deepEqual(p,before);assert.deepEqual(forecast(p),flow);
});
test('Missing months and pending edits cannot become zero-spending comparisons; partial coverage stays explicit',()=>{
 const p=budget();p.details=p.details.filter(d=>d.month!=='2026-09');let rows=categoryTrend(p,{category:'ילדים ותינוקות',endMonth:'2026-10',asOf:'2026-10',count:3});assert.equal(rows[1].hasDetails,false);assert.equal(rows[2].percent,null);assert.equal(rows[2].comparisonComplete,false);
 p.details.push(detail('b','2026-09',150));rows=categoryTrend(p,{endMonth:'2026-10',asOf:'2026-10',count:3,excludeMonth:'2026-09'});assert.equal(rows[1].hasDetails,false);assert.equal(rows[2].change,null);
});
test('Zero baselines and net refunds never manufacture infinite percentages; absent category in a detailed month is zero',()=>{
 const p=budget();p.details[0].category='דיור';const options={category:'ילדים ותינוקות',endMonth:'2026-10',asOf:'2026-10',count:3};let rows=categoryTrend(p,options);assert.equal(rows[0].amount,0);assert.equal(rows[0].hasDetails,true);assert.equal(rows[1].percent,null);assert.equal(rows[1].baselineAmount,0);
 p.details[0].category='ילדים ותינוקות / מזון ותמ״ל';p.details[0].amount=-50;rows=categoryTrend(p,options);assert.equal(rows[1].percent,null);assert.equal(rows[1].change,200);p.details[1].amount=-100;rows=categoryTrend(p,options);assert.equal(rows[1].percent,null);assert.equal(rows[2].percent,null);
 p.details[0].amount=100;rows=categoryTrend(p,options);assert.equal(rows[1].percent,-200);
});
test('Top categories roll up all detail, net refunds, exclude cancelled and unclassified planned amounts, independent of top three individual items',()=>{
 const p=budget();p.details=[detail('a','2026-10',100),detail('b','2026-10',100),detail('c','2026-10',-20),detail('d','2026-10',150,'דיור'),detail('e','2026-10',90,'בריאות / פארם'),{...detail('cancel','2026-10',9999,'תחבורה'),status:'cancelled'}];
 p.expenses=[{id:'plan',name:'תכנון ללא קטגוריה',amount:1000,fees:0,payments:1,firstMonth:'2026-10',source:'direct',kind:'expense'}];const result=graphTopExpenses(p,'2026-10');assert.deepEqual(result.categories.map(c=>[c.category,c.amount]),[['ילדים ותינוקות',180],['דיור',150],['בריאות',90]]);assert.equal(result.items[0].id,'plan');assert.equal(result.items.length,3);assert.equal(result.explained,1420);
 assert.equal(graphTopExpenses(p,'2026-10',{plannedOnly:true}).categories.length,0);
});
test('Children category choices are separate, compatible with old records, and share stable parent colors across views',()=>{
 const p=budget();assert.ok(detailCategories.includes('ילדים ותינוקות / תרופות ובריאות לילדים'));assert.ok(detailCategories.includes('ילדים ותינוקות / גן ומעון'));assert.ok(detailCategories.includes('בריאות / פארם'));assert.ok(detailCategories.includes('משפחה / ילדים ותינוקות'));
 assert.equal(categoryParent('ילדים ותינוקות / מזון ותמ״ל'),'ילדים ותינוקות');assert.equal(categoryColor('ילדים ותינוקות'),categoryColor('ילדים ותינוקות / גן ומעון'));assert.equal(categoryColor('custom'),categoryColor('custom'));assert.notEqual(categoryColor('ילדים ותינוקות'),categoryColor('בריאות'));assert.equal(validatePlan(p),true);
});
test('Category history rejects invalid controls and reports future billing as unconfirmed',()=>{
 const p=budget();p.details.push(detail('future','2026-11',500));const rows=categoryTrend(p,{endMonth:'2026-11',asOf:'2026-10',count:3});assert.equal(rows.at(-1).actual,false);assert.equal(rows.at(-1).complete,false);for(const bad of [{count:0},{count:25},{compare:'invalid'},{endMonth:'2026-13'}])assert.throws(()=>categoryTrend(p,{endMonth:'2026-10',asOf:'2026-10',...bad}));
});

test('Year comparison uses the same calendar month and preserves missing/partial source status',()=>{
 const p=budget();p.startMonth='2025-01';p.details.push(detail('prior-year','2025-10',50));p.months['2025-10']={actual:true,values:{...zero(),card1:50}};p.months['2026-10']={actual:true,values:{...zero(),card1:75}};
 let row=categoryTrend(p,{endMonth:'2026-10',asOf:'2026-11',count:1,compare:'year'})[0];assert.equal(row.baselineMonth,'2025-10');assert.equal(row.change,25);assert.equal(row.percent,50);assert.equal(row.comparisonComplete,true);
 p.details=p.details.filter(d=>d.month!=='2025-10');row=categoryTrend(p,{endMonth:'2026-10',asOf:'2026-11',count:1,compare:'year'})[0];assert.equal(row.change,null);assert.equal(row.comparisonComplete,false);
});
