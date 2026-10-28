import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {createDemoPlan,clone,monthlyValues,updateSavingSchedule,savingsBalances} from '../src/budget.js'
import {initialSavingsScheduleDraft,prepareSavingsSchedule} from '../frontend/src/app/savings-schedule-command.ts'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts'
import {savePreparedPlan,SaveConflict,SaveUncertain} from '../frontend/src/app/plan-save.ts'
const fixture=()=>createDemoPlan('2026-10')
test('Native schedule adapter matches original form handler including blank fields, zero and changed month placeholders',()=>{
 const p=updateSavingSchedule(fixture(),'2027-01',{personalSaving:321.09,sharedSaving:654.32}),before=clone(p),d={from:'2027-02',personalSaving:'',sharedSaving:'0'},next=prepareSavingsSchedule(p,d)
 let captured;const s=readFileSync('src/savings.js','utf8'),start=s.indexOf('function savingScheduleSubmit('),end=s.indexOf('function savingScheduleDateChanged(',start),data={'schedule-from':d.from,'schedule-personalSaving':d.personalSaving,'schedule-sharedSaving':d.sharedSaving},current=monthlyValues(p,d.from)
 const form={elements:{namedItem:key=>({dataset:{current:current[key.replace('schedule-','')]}})},querySelector:()=>({})}
 const ctx=vm.createContext({savingScheduleDraft:{scope:'personal'},saving:false,activeBudget:'personal',plan:p,budgetFormData:()=>Object.entries(data),readNumber:Number,updateSavingSchedule,mutate:v=>{captured=v;return false},savingScheduleClose:()=>{},demoPreview:false})
 vm.runInContext(s.slice(start,end),ctx);ctx.savingScheduleSubmit(form);assert.deepEqual(captured,next);assert.equal(monthlyValues(next,'2027-03').personalSaving,321.09);assert.equal(monthlyValues(next,'2027-03').sharedSaving,0);assert.deepEqual(p,before)
 assert.deepEqual(initialSavingsScheduleDraft(p,'2026-01'),{from:p.startMonth,personalSaving:'',sharedSaving:''})
})
test('Schedule correction preserves actuals, assets, source histories and earlier plans while replacing later estimates',()=>{
 const p=updateSavingSchedule(fixture(),'2027-01',{personalSaving:999,sharedSaving:888}),before=clone(p),next=prepareSavingsSchedule(p,{from:'2026-11',personalSaving:'100.01',sharedSaving:'200.02'})
 assert.deepEqual(next.months['2026-10'],p.months['2026-10']);assert.deepEqual(next.defaults,p.defaults);assert.deepEqual(next.savingsGoals,p.savingsGoals);assert.deepEqual(savingsBalances(next,'2026-10'),savingsBalances(p,'2026-10'));assert.equal(next.savingSchedules.some(r=>r.from==='2027-01'),false);assert.equal(monthlyValues(next,'2027-02').personalSaving,100.01);assert.deepEqual(p,before)
 for(const bad of [{from:'',personalSaving:'1',sharedSaving:'2'},{from:'2026-13',personalSaving:'1',sharedSaving:'2'},{from:'2026-01',personalSaving:'1',sharedSaving:'2'},{from:'2026-11',personalSaving:'-1',sharedSaving:'2'},{from:'2026-11',personalSaving:'1.001',sharedSaving:'2'},{from:'2026-11',personalSaving:'1',sharedSaving:'2',cashAccountId:'foreign'}])assert.throws(()=>prepareSavingsSchedule(p,bad))
})
test('Schedule save uses original API with lost-response recovery, no duplicate write, actor isolation and stale refusal',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://schedule.test',hash=s=>createHash('sha256').update(s).digest('hex')
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(u),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  for(const u of ['alice','bob'])await req(u,'/api/plan','PUT',{plan:fixture(),revision:0})
  let puts=0,lost=true;const fetcher=async(path,opt={})=>{if(opt.method==='PUT'){puts++;const r=await req('alice',path,'PUT',JSON.parse(opt.body));if(lost){lost=false;return Response.json({error:'lost'},{status:503})}return r}return req('alice',path)}
  const base=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,plan=prepareSavingsSchedule(base.plan,{from:'2026-11',personalSaving:'100.01',sharedSaving:'50.02'}),input={budgetId:'personal',base,plan};await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain);const result=await savePreparedPlan(input,fetcher);assert.equal(result.recovered,true);assert.equal(puts,1);assert.equal(result.value.revision,base.revision+1);assert.deepEqual(result.value.plan.savingsGoals,base.plan.savingsGoals);assert.equal((await(await req('bob','/api/plan')).json()).revision,1)
  await assert.rejects(savePreparedPlan({...input,plan:prepareSavingsSchedule(base.plan,{from:'2026-11',personalSaving:'200',sharedSaving:'50'})},fetcher),SaveConflict);assert.equal(puts,1)
 }finally{db.close()}
})
