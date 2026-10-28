import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {zero,clone,forecast,expenseCategoryOptions,setCategorySpendingLimit,removeCategorySpendingLimit,detailCategories,analyticalExpenseDetails,categoryRegistryEntry,categoryGoalProgress,validatePlan} from '../src/budget.js'
import {prepareCategoryLimit} from '../frontend/src/app/category-limit-command.ts'
import {initialDetailDraft} from '../frontend/src/app/detail-management-command.ts'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts'
import {savePreparedPlan,SaveConflict,SaveUncertain} from '../frontend/src/app/plan-save.ts'
const base=()=>({startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,details:[{id:'detail',name:'חנות',category:'מזון',method:'card1',amount:25.01,month:'2026-10',date:'2026-10-12',number:'',status:'cleared',accounting:'included'}]}),draft={category:'מזון',amount:'100.02',remove:false,confirmed:false}
test('Native spending limits equal original set/remove transitions without changing financial data or claiming complete records',()=>{
 const p=base(),before=clone(p),next=prepareCategoryLimit(p,draft),expected=clone(p);expected.categoryGoals={...expected.categoryGoals,'מזון':100.02};assert.deepEqual(next,expected);assert.deepEqual(next,setCategorySpendingLimit(p,'מזון',100.02));assert.deepEqual(forecast(next),forecast(p));assert.deepEqual(next.details,p.details);assert.deepEqual(next.months,p.months);const progress=categoryGoalProgress(next,'2026-10','מזון','2026-10');assert.equal(progress.amount,25.01);assert.equal(progress.confirmed,false);assert.equal(Math.round(progress.remaining*100),7501);const removed=prepareCategoryLimit(next,{...draft,remove:true,confirmed:true});assert.deepEqual(removed,removeCategorySpendingLimit(next,'מזון'));assert.deepEqual(removed.details,p.details);assert.deepEqual(p,before)
})
test('Shared category choices retain original analytical/registered labels and the original editor uses today only in the current month',()=>{
 const plan=base(),ctx=vm.createContext({plan,detailCategories,analyticalExpenseDetails,categoryRegistryEntry});vm.runInContext("result=[...new Set([...detailCategories,...analyticalExpenseDetails(plan).map(e=>e.category),...Object.keys(plan.categoryGoals??{}),...(plan.categoryRegistry?.entries??[]).map(entry=>entry.label)].map(label=>categoryRegistryEntry(plan,label)?.label??label))].filter(label=>!categoryRegistryEntry(plan,label)?.archivedAt)",ctx);assert.deepEqual(expenseCategoryOptions(plan),JSON.parse(JSON.stringify(ctx.result)));assert.equal(initialDetailDraft(plan,'','2026-10','checks','2026-10-28').date,'2026-10-28');assert.equal(initialDetailDraft(plan,'','2026-11','checks','2026-10-28').date,'2026-11-01')
})
test('Native limit inputs reject unconfirmed removal, inactive/unknown category, malformed cents and foreign fields',()=>{const p=base();for(const bad of [{...draft,amount:'0'},{...draft,amount:'-1'},{...draft,amount:'1.001'},{...draft,amount:''},{...draft,category:'unknown'},{...draft,remove:true},{...draft,remove:true,confirmed:true},{...draft,accountId:'foreign'}])assert.throws(()=>prepareCategoryLimit(p,bad));assert.ok(validatePlan(prepareCategoryLimit(p,draft)))})
test('Category limit save recovers one lost acknowledgment through the original service and keeps another identity unchanged',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://limits.test',hash=s=>createHash('sha256').update(s).digest('hex')
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(u),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  for(const u of ['alice','bob'])await req(u,'/api/plan','PUT',{plan:base(),revision:0})
  let puts=0,lost=true;const fetcher=async(path,opt={})=>{if(opt.method==='PUT'){puts++;const r=await req('alice',path,'PUT',JSON.parse(opt.body));if(lost){lost=false;return Response.json({error:'lost'},{status:503})}return r}return req('alice',path)}
  const snapshot=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,plan=prepareCategoryLimit(snapshot.plan,draft),input={budgetId:'personal',base:snapshot,plan};await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain);const saved=await savePreparedPlan(input,fetcher);assert.equal(saved.recovered,true);assert.equal(puts,1);assert.equal(saved.value.plan.categoryGoals['מזון'],100.02);assert.equal((await(await req('bob','/api/plan')).json()).revision,1);await assert.rejects(savePreparedPlan({...input,plan:prepareCategoryLimit(snapshot.plan,{...draft,amount:'101'})},fetcher),SaveConflict);assert.equal(puts,1)
 }finally{db.close()}
})
