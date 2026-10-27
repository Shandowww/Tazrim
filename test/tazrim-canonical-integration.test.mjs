import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {zero,addImportMigrationGuards,clone} from '../src/budget.js'
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts'
import {initialMonthlyDraft,saveMonthlyReport} from '../frontend/src/app/monthly-report.ts'
import {savePreparedPlan,SaveConflict} from '../frontend/src/app/plan-save.ts'
const hash=s=>createHash('sha256').update(s).digest('hex')
const base=()=>addImportMigrationGuards({startMonth:'2026-01',opening:1000,buffer:100,horizon:24,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true},[{key:hash('retained movement'),fingerprint:hash('retained fingerprint')}],[hash('retained receipt')])
test('React saves retain canonical migration protection in both private and shared budgets; stripped guards cannot overwrite',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://canonical-frontend.test',user='actor',token='synthetic-integration'
 try{
  db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user,'Actor','actor@example.test',Date.now())
  db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(token),user,Date.now()+3600000)
  const app=createApp({db,DB,origin,allowedEmails:['actor@example.test']})
  const req=(path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  const shared=(await(await req('/api/budgets','POST',{name:'Integration shared'})).json()).id
  for(const budgetId of ['personal',shared]){
   assert.equal((await req('/api/plan?budget='+budgetId,'PUT',{plan:base(),revision:0})).status,200)
   const fetcher=(path,options={})=>req(path,options.method||'GET',options.body?JSON.parse(options.body):undefined)
   const snapshot=(await loadBudgetSnapshot(budgetId,new AbortController().signal,fetcher)).value
   const draft=initialMonthlyDraft(snapshot.plan,'2026-10');draft.values.salary='1234.56';draft.actual=true
   const result=await saveMonthlyReport({budgetId,base:snapshot,month:'2026-10',draft,asOf:'2026-10'},fetcher)
   assert.deepEqual(result.value.plan.importMigrationGuards,snapshot.plan.importMigrationGuards)
   const loaded=(await loadBudgetSnapshot(budgetId,new AbortController().signal,fetcher)).value
   assert.equal(loaded.revision,2);assert.equal(loaded.plan.months['2026-10'].values.salary,1234.56)
   const stripped=clone(loaded.plan);delete stripped.importMigrationGuards
   await assert.rejects(savePreparedPlan({budgetId,base:loaded,plan:stripped},fetcher),SaveConflict)
   const after=(await loadBudgetSnapshot(budgetId,new AbortController().signal,fetcher)).value
   assert.equal(after.revision,2);assert.deepEqual(after.plan,loaded.plan)
  }
 }finally{db.close()}
})
