import test from 'node:test'
import assert from 'node:assert/strict'
import {clone,zero,validatePlan,addRegisteredCategory,setRegisteredCategoryColor,removeRegisteredCategory,categoryRemovalImpact,categoryRegistryEntry,expenseCategoryOptions,analyticalExpenseDetails,forecast} from '../src/budget.js'
import {financialProjection} from '../server/financial-data.mjs'
import {householdCategory} from '../frontend/src/app/household-categories.js'
import {prepareCategoryManagement} from '../frontend/src/app/category-management-command.ts'

const detail=(id,category,amount,status='cleared')=>({id,name:'דוח מקור '+id,category,method:'card1',amount,month:'2026-05',date:'2026-05-12',number:'',status,accounting:'included'})
const plan=()=>({startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,categoryGoals:{'קניות / כללי':100},details:[detail('one','קניות / כללי',50),detail('two','קניות / ביגוד והנעלה',20,'cancelled'),detail('three','מזון',30)],detailAnnotations:[{detailId:'one',sourceCents:5000,parts:[{category:'קניות / כללי',cents:3000,person:'',event:''},{category:'קניות / ביגוד והנעלה',cents:2000,person:'',event:''}]}]})

test('Category add and custom color appear in the household palette without changing financial values',()=>{
 const p=plan(),before=clone(p),next=addRegisteredCategory(p,'קניות / תחביבים','#2255aa')
 assert.equal(validatePlan(next),true)
 assert.ok(expenseCategoryOptions(next).includes('קניות / תחביבים'))
 assert.equal(householdCategory('קניות / תחביבים',next).color,'#2255aa')
 const colored=setRegisteredCategoryColor(next,'מזון','#00aa44')
 assert.equal(householdCategory('מזון',colored).color,'#00aa44')
 assert.deepEqual(colored.details,p.details)
 assert.deepEqual(forecast(colored),forecast(p))
 assert.deepEqual(p,before)
 assert.throws(()=>addRegisteredCategory(colored,'מזון','#000000'),/קיים/)
 assert.throws(()=>setRegisteredCategoryColor(colored,'מזון','red'),/צבע/)
})

test('Removing a parent warns for all stored detail and split references and moves historical analysis in one operation',()=>{
 const p=plan(),before=clone(p),old=financialProjection(p)
 const impact=categoryRemovalImpact(p,'קניות')
 assert.equal(impact.detailCount,2)
 assert.equal(impact.limits.length,1)
 assert.ok(impact.labels.includes('קניות / כללי'))
 assert.ok(impact.labels.includes('קניות / ביגוד והנעלה'))
 assert.throws(()=>removeRegisteredCategory(p,'קניות'),/העברה/)
 const next=removeRegisteredCategory(p,'קניות','מזון')
 assert.equal(validatePlan(next),true)
 assert.ok(!expenseCategoryOptions(next).includes('קניות'))
 assert.ok(!expenseCategoryOptions(next).includes('קניות / ביגוד והנעלה'))
 assert.equal(next.categoryGoals['מזון'],100)
 assert.equal(analyticalExpenseDetails(next).filter(row=>row.sourceDetailId==='one').every(row=>row.category==='מזון'),true)
 assert.equal(financialProjection(next).transactions.find(row=>row.id==='one').category_id,categoryRegistryEntry(next,'מזון').id)
 assert.deepEqual(next.details,p.details)
 assert.deepEqual(next.detailAnnotations,p.detailAnnotations)
 assert.deepEqual(forecast(next),forecast(p))
 assert.deepEqual(financialProjection(next).transactions.map(row=>row.amount_cents),old.transactions.map(row=>row.amount_cents))
 assert.deepEqual(p,before)
})

test('Unused removal archives cleanly; destination, cap and stale-choice guards fail closed',()=>{
 const p=plan(),added=addRegisteredCategory(p,'חדש','#2266aa')
 assert.equal(categoryRemovalImpact(added,'חדש').requiresTarget,false)
 const removed=removeRegisteredCategory(added,'חדש')
 assert.ok(!expenseCategoryOptions(removed).includes('חדש'))
 assert.ok(categoryRegistryEntry(removed,'חדש').archivedAt)
 assert.throws(()=>addRegisteredCategory(removed,'חדש','#112233'),/קיים/)
 assert.throws(()=>removeRegisteredCategory(p,'קניות','קניות / ביגוד והנעלה'),/יעד/)
 const conflict=clone(p);conflict.categoryGoals['מזון']=200
 assert.throws(()=>removeRegisteredCategory(conflict,'קניות','מזון'),/תקרות/)
 assert.deepEqual(conflict.details,p.details)
})

test('React command uses the same operations and validates color and target',()=>{
 const p=plan(),draft={operation:'add',source:'',target:'',name:'חדשה',color:'#aabbcc'}
 assert.equal(prepareCategoryManagement(p,draft).categoryRegistry.entries.at(-1).color,'#aabbcc')
 assert.equal(prepareCategoryManagement(p,{...draft,operation:'color',source:'מזון'}).categoryRegistry.entries.find(row=>row.label==='מזון').color,'#aabbcc')
 assert.throws(()=>prepareCategoryManagement(p,{...draft,operation:'color',source:'מזון',color:'bad'}),/צבע/)
 assert.throws(()=>prepareCategoryManagement(p,{...draft,operation:'remove',source:'קניות'}),/העברה/)
 assert.equal(validatePlan(prepareCategoryManagement(p,{...draft,operation:'remove',source:'קניות',target:'מזון'})),true)
})
