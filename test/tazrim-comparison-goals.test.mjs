import {initialComparisonGoals,prepareComparisonGoals,comparisonProgress} from '../frontend/src/app/comparison-goals-command.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {zero,clone,cents,forecast,investmentHistoryFor,investmentDepositsFor,updateInvestmentGoal,updateProfileName,updateComparisonGoal,progressFor,yearProgress,achievements,validatePlan} from '../src/budget.js'
import {investmentProjection} from '../src/investment-model.js'
import {initialInvestmentDraft,prepareInvestmentProjection,prepareInvestmentGoal} from '../frontend/src/app/investment-command.ts'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {loadBudgetSnapshot,AccessError} from '../frontend/src/app/budget-api.ts'
import {savePreparedPlan,SaveConflict,SaveUncertain,WritePermissionError} from '../frontend/src/app/plan-save.ts'
const base=()=>({startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:zero(),months:Object.fromEntries([['2026-01',true,10.01,20.02],['2026-03',true,30.01,0],['2026-05',true,0,40.01],['2026-09',false,999,999],['2026-10',true,20,30],['2026-11',true,1000,1000]].map(([m,actual,personalInvest,sharedInvest])=>[m,{values:{...zero(),personalInvest,sharedInvest},actual,includesPlannedCard:false}])),expenses:[],demo:false,goals:{saving:10,invest:0,spending:20,income:30}}),draft={...initialInvestmentDraft(),monthly:'100.01',years:'2',annualReturn:'5',annualIncrease:'1.5'}
test('Comparison targets match frozen original overlay and actual progress helpers without turning missing, future or demo reports into achievements',()=>{const p=base(),initial=initialComparisonGoals(p),expected=clone(p);expected.goals={saving:10,invest:0,spending:20,income:123.45};assert.deepEqual(prepareComparisonGoals(p,{...initial,income:'123.45'}),expected);assert.deepEqual(prepareComparisonGoals(p,initial),p);const actual=comparisonProgress(p,'2026-10','2026-10');assert.deepEqual(actual.totals,progressFor(p,'2026-10').totals);assert.deepEqual(actual.annual,yearProgress(p,'2026','2026-10'));assert.deepEqual(actual.wins,achievements(p,'2026-10','2026-10'));for(const month of ['2026-09','2026-11','2026-12']){const r=comparisonProgress(p,month,'2026-10');assert.equal(r.totals,null);assert.deepEqual(r.wins,[])}assert.equal(comparisonProgress({...p,demo:true},'2026-10','2026-10').totals,null);for(const d of [{...initial,income:'-1'},{...initial,income:'1.001'},{...initial,unknown:'1'}])assert.throws(()=>prepareComparisonGoals(p,d));assert.match(readFileSync('src/client.js','utf8'),/updateComparisonGoal\(plan,name.slice\(5\),readNumber\(target.value\)\)/)})
test('Comparison goal save uses the existing service, recovers one lost success and refuses stale/foreign/viewer saves with other scopes unchanged',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://investment.test',hash=s=>createHash('sha256').update(s).digest('hex')
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(u),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  for(const u of ['alice','bob'])await req(u,'/api/plan','PUT',{plan:base(),revision:0})
  const house=(await(await req('alice','/api/budgets','POST',{name:'בדיקת השקעות'})).json()).id;await req('alice','/api/plan?budget='+house,'PUT',{plan:base(),revision:0});const invite=await(await req('alice','/api/budgets/'+house+'/invites','POST',{email:'bob@example.test',role:'viewer'})).json();await req('bob','/api/budgets/accept','POST',{token:invite.token})
  let puts=0,lost=true,user='alice';const fetcher=async(path,opt={})=>{if(opt.method==='PUT'){puts++;const r=await req(user,path,'PUT',JSON.parse(opt.body));if(lost){lost=false;return Response.json({error:'lost'},{status:503})}return r}return req(user,path)}
  const snapshot=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,plan=prepareComparisonGoals(snapshot.plan,{...initialComparisonGoals(snapshot.plan),income:'123.45'}),input={budgetId:'personal',base:snapshot,plan};await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain);const saved=await savePreparedPlan(input,fetcher);assert.equal(saved.recovered,true);assert.equal(puts,1);assert.equal(saved.value.plan.goals.income,123.45);assert.deepEqual(saved.value.plan.months,snapshot.plan.months)
  await assert.rejects(savePreparedPlan({...input,plan:prepareComparisonGoals(snapshot.plan,{...initialComparisonGoals(snapshot.plan),income:'999'})},fetcher),SaveConflict);user='bob';await assert.rejects(savePreparedPlan(input,fetcher),AccessError)
  const viewer=(await loadBudgetSnapshot(house,new AbortController().signal,fetcher)).value;await assert.rejects(savePreparedPlan({budgetId:house,base:viewer,plan:prepareComparisonGoals(viewer.plan,{...initialComparisonGoals(viewer.plan),income:'1'})},fetcher),WritePermissionError);assert.equal(puts,1);assert.equal((await(await req('bob','/api/plan')).json()).revision,1);assert.equal((await(await req('alice','/api/plan?budget='+house)).json()).revision,1)
 }finally{db.close()}
})
