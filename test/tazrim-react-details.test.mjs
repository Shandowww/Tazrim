import test from 'node:test'
import assert from 'node:assert/strict'
import {clone,validatePlan,annotateExpenseDetail,forecast} from '../src/budget.js'
import {demoDetailPlan} from '../frontend/src/app/demo-fixture.ts'
import {budgetDetailView,budgetDetailSource,detailSearchResults} from '../frontend/src/app/detail-adapter.js'
import {detailResultHref} from '../frontend/src/app/navigation-query.js'
const purchaseId='cal-'+'a'.repeat(64)
const options={year:'2026',month:'10',asOf:'2026-10'}

test('React detail analysis uses cleared source rows, signed refunds and exact cents without changing monthly cash flow',()=>{
 const p=clone(demoDetailPlan),before=JSON.stringify(p),cash=forecast(p),v=budgetDetailView(p,options)
 assert.ok(validatePlan(p));assert.equal(v.rows.length,2);assert.equal(v.purchasesCents,10101);assert.equal(v.refundsCents,1002);assert.equal(v.valueCents,9099);assert.equal(v.coverage.complete,false);assert.equal(v.coverage.pendingCount,1)
 assert.deepEqual(v.positiveCategories,{'מזון':101.01});assert.ok(v.categories.some(row=>row.cents===-1002));assert.deepEqual(forecast(p),cash);assert.equal(JSON.stringify(p),before)
})
test('Billing periods, future exclusion, account/card filters and zero-versus-unknown remain explicit',()=>{
 const p=clone(demoDetailPlan);assert.equal(budgetDetailView(p,{...options,month:'09'}).valueCents,null);assert.equal(budgetDetailView(p,{...options,month:'11'}).valueCents,null)
 assert.equal(budgetDetailView(p,{...options,account:'sample-bank-1',card:'card1'}).valueCents,9099);assert.throws(()=>budgetDetailView(p,{...options,account:'other-space'}),/אינו זמין/);assert.throws(()=>budgetDetailView(p,{...options,card:'other-card'}),/אינו זמין/)
 p.details[0].amount=10.02;assert.equal(budgetDetailView(p,options).valueCents,0);assert.equal(budgetDetailView(p,{...options,query:'לא קיים'}).valueCents,null)
 assert.throws(()=>budgetDetailView(p,{...options,month:'13'}),/תקופה/)
})
test('Category/name filtering keeps refund-only categories and never pulls another saved source into the view',()=>{
 const p=clone(demoDetailPlan),refund=budgetDetailView(p,{...options,category:'קניות'})
 assert.equal(refund.valueCents,-1002);assert.equal(refund.rows.length,1);assert.equal(budgetDetailView(p,{...options,query:'סופר'}).valueCents,10101)
 assert.equal(budgetDetailSource(p,'demo-pending',options),null);assert.equal(budgetDetailSource(p,purchaseId,{...options,month:'09'}),null);assert.equal(budgetDetailSource(p,'foreign',options),null);assert.equal(budgetDetailSource(p,purchaseId,{...options,category:'קניות'}),null);assert.equal(budgetDetailSource(p,purchaseId,{...options,query:'החזר'}),null)
 const results=detailSearchResults(p,refund.rows);assert.equal(results[0].amount,-10.02);assert.equal(results[0].accountName,'חשבון יומי');assert.equal(results[0].ignored,false)
})
test('Source drill-down preserves one original statement row separately from split analytical amounts',()=>{
 const p=annotateExpenseDetail(clone(demoDetailPlan),purchaseId,[{category:'מזון',cents:4000,person:'',event:''},{category:'קניות',cents:6101,person:'',event:''}]),v=budgetDetailView(p,options),part=v.rows.find(row=>row.cents===4000),source=budgetDetailSource(p,part.id,options)
 assert.equal(v.valueCents,9099);assert.equal(source.row.cents,4000);assert.equal(source.source.amountCents,10101);assert.equal(source.source.name,'סופר השכונה');assert.equal(source.source.statement.dueDate,'2026-10-10');assert.equal(p.details.filter(row=>row.id===purchaseId).length,1)
 assert.deepEqual(Object.keys(source.source.statement).sort(),['dueDate','foreignCents','issuer','notes','originalCents','originalCurrency','page'].sort())
})
test('Detail result URLs retain the selected space, period and filters while encoding the complete source identity',()=>{
 const href=detailResultHref('row#part:1','?budget=house&year=2026&month=10&category=food&query=shop&card=card1&page=2&token=private','search'),url=new URL(href,'https://test.local')
 assert.equal(url.pathname,'/details/row%23part%3A1');assert.equal(url.searchParams.get('budget'),'house');assert.equal(url.searchParams.get('from'),'search');assert.equal(url.searchParams.get('page'),'2');assert.equal(url.searchParams.get('token'),null);assert.equal(url.searchParams.get('card'),'card1')
})
