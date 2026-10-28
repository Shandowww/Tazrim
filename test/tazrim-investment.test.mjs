import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {zero,clone,cents,forecast,investmentHistoryFor,investmentDepositsFor,updateInvestmentGoal,validatePlan} from '../src/budget.js'
import {investmentProjection} from '../src/investment-model.js'
import {initialInvestmentDraft,prepareInvestmentProjection,prepareInvestmentGoal} from '../frontend/src/app/investment-command.ts'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {loadBudgetSnapshot,AccessError} from '../frontend/src/app/budget-api.ts'
import {savePreparedPlan,SaveConflict,SaveUncertain,WritePermissionError} from '../frontend/src/app/plan-save.ts'
const base=()=>({startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:zero(),months:Object.fromEntries([['2026-01',true,10.01,20.02],['2026-03',true,30.01,0],['2026-05',true,0,40.01],['2026-09',false,999,999],['2026-10',true,20,30],['2026-11',true,1000,1000]].map(([m,actual,personalInvest,sharedInvest])=>[m,{values:{...zero(),personalInvest,sharedInvest},actual,includesPlannedCard:false}])),expenses:[],demo:false,goals:{saving:10,invest:0,spending:20,income:30}}),draft={...initialInvestmentDraft(),monthly:'100.01',years:'2',annualReturn:'5',annualIncrease:'1.5'}
test('Investment inputs preserve frozen original actual-only history and accumulated-deposit semantics across gaps and future reports',()=>{
 const plan=base(),before=clone(plan),ctx=vm.createContext({plan,cents,todayMonth:()=> '2026-10'})
 vm.runInContext(`function investmentHistory(){const months=Object.keys(plan.months).filter(m=>m<=todayMonth()&&plan.months[m].actual).sort().slice(-3);return{months,average:months.length?months.reduce((n,m)=>n+cents(plan.months[m].values.personalInvest)+cents(plan.months[m].values.sharedInvest),0)/months.length/100:0};}function investmentDeposits(){return Object.entries(plan.months).filter(([m,r])=>m<=todayMonth()&&r.actual).reduce((n,[m,r])=>n+cents(r.values.personalInvest)+cents(r.values.sharedInvest),0)/100;} history=investmentHistory();deposits=investmentDeposits();`,ctx)
 assert.deepEqual(investmentHistoryFor(plan,'2026-10'),JSON.parse(JSON.stringify(ctx.history)));assert.deepEqual(investmentHistoryFor(plan,'2026-10').months,['2026-03','2026-05','2026-10']);assert.equal(investmentDepositsFor(plan,'2026-10'),ctx.deposits);assert.equal(ctx.deposits,150.05)
 const actual=prepareInvestmentProjection(plan,draft,'2026-10'),expected=investmentProjection({initial:150.05,monthly:100.01,years:2,annualReturn:5,annualIncrease:1.5});assert.deepEqual(actual,expected);assert.deepEqual(plan,before);assert.deepEqual(investmentHistoryFor({...plan,months:{}},'2026-10'),{months:[],average:0});assert.equal(investmentDepositsFor({...plan,months:{}},'2026-10'),0)
})
test('Investment goal update equals the original explicit action and leaves reported financial values, other goals and forecasts untouched',()=>{
 const plan=base(),before=clone(plan),ctx=vm.createContext({plan,clone,investmentUI:{monthly:100.01}});vm.runInContext('next=clone(plan);next.goals={saving:0,invest:0,spending:0,income:0,...next.goals,invest:investmentUI.monthly}',ctx)
 const next=prepareInvestmentGoal(plan,draft,'2026-10',true);assert.deepEqual(next,JSON.parse(JSON.stringify(ctx.next)));assert.deepEqual(next,updateInvestmentGoal(plan,100.01));assert.deepEqual(next.months,plan.months);assert.deepEqual(next.defaults,plan.defaults);assert.deepEqual(forecast(next),forecast(plan));assert.deepEqual(plan,before);assert.ok(validatePlan(next));assert.equal(prepareInvestmentGoal(plan,{...draft,monthly:'0'},'2026-10',true).goals.invest,0)
 const source=readFileSync(new URL('../src/investment.js',import.meta.url),'utf8');assert.match(source,/investmentHistoryFor\(plan,todayMonth\(\)\)/);assert.match(source,/investmentDepositsFor\(plan,todayMonth\(\)\)/);assert.match(source,/updateInvestmentGoal\(plan,investmentUI.monthly\)/)
})
test('Native investment assumptions retain original input ranges, negative-return losses, blank-initial fallback and explicit goal acknowledgment',()=>{
 const plan=base();for(const bad of [{...draft,monthly:''},{...draft,monthly:'1.001'},{...draft,initial:'-1'},{...draft,years:'0'},{...draft,years:'1.5'},{...draft,years:'51'},{...draft,annualReturn:'-10.5'},{...draft,annualReturn:'20.5'},{...draft,annualReturn:'0.1'},{...draft,annualIncrease:'20.5'},{...draft,annualIncrease:''},{...draft,years:'Infinity'},{...draft,accountId:'foreign'}])assert.throws(()=>prepareInvestmentProjection(plan,bad,'2026-10'))
 assert.throws(()=>prepareInvestmentGoal(plan,draft,'2026-10',false));assert.throws(()=>prepareInvestmentProjection(plan,draft,'2026-13'));const loss=prepareInvestmentProjection(plan,{...draft,initial:'1000',monthly:'0',annualReturn:'-10',annualIncrease:'0'},'2026-10');assert.ok(loss.growth<0);assert.ok(Math.abs(loss.balance-810)<.00001);assert.equal(prepareInvestmentProjection(plan,{...draft,initial:'0',monthly:'0'},'2026-10').balance,0);assert.throws(()=>updateInvestmentGoal(plan,NaN))
})
test('Explicit investment goal save uses the existing service, recovers one lost success and refuses stale/foreign/viewer saves with other scopes unchanged',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://investment.test',hash=s=>createHash('sha256').update(s).digest('hex')
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(u),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  for(const u of ['alice','bob'])await req(u,'/api/plan','PUT',{plan:base(),revision:0})
  const house=(await(await req('alice','/api/budgets','POST',{name:'בדיקת השקעות'})).json()).id;await req('alice','/api/plan?budget='+house,'PUT',{plan:base(),revision:0});const invite=await(await req('alice','/api/budgets/'+house+'/invites','POST',{email:'bob@example.test',role:'viewer'})).json();await req('bob','/api/budgets/accept','POST',{token:invite.token})
  let puts=0,lost=true,user='alice';const fetcher=async(path,opt={})=>{if(opt.method==='PUT'){puts++;const r=await req(user,path,'PUT',JSON.parse(opt.body));if(lost){lost=false;return Response.json({error:'lost'},{status:503})}return r}return req(user,path)}
  const snapshot=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,plan=prepareInvestmentGoal(snapshot.plan,draft,'2026-10',true),input={budgetId:'personal',base:snapshot,plan};await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain);const saved=await savePreparedPlan(input,fetcher);assert.equal(saved.recovered,true);assert.equal(puts,1);assert.equal(saved.value.plan.goals.invest,100.01);assert.deepEqual(saved.value.plan.months,snapshot.plan.months)
  await assert.rejects(savePreparedPlan({...input,plan:prepareInvestmentGoal(snapshot.plan,{...draft,monthly:'200'},'2026-10',true)},fetcher),SaveConflict);user='bob';await assert.rejects(savePreparedPlan(input,fetcher),AccessError)
  const viewer=(await loadBudgetSnapshot(house,new AbortController().signal,fetcher)).value;await assert.rejects(savePreparedPlan({budgetId:house,base:viewer,plan:prepareInvestmentGoal(viewer.plan,draft,'2026-10',true)},fetcher),WritePermissionError);assert.equal(puts,1);assert.equal((await(await req('bob','/api/plan')).json()).revision,1);assert.equal((await(await req('alice','/api/plan?budget='+house)).json()).revision,1)
 }finally{db.close()}
})
