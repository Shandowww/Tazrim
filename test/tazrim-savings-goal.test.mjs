import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {zero,clone,savingsBalances,forecast,validatePlan} from '../src/budget.js'
import {initialSavingsGoalDraft,prepareSavingsGoal,savingsGoalDraftFingerprint} from '../frontend/src/app/savings-goal-command.ts'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts'
import {savePreparedPlan,SaveConflict,SaveUncertain} from '../frontend/src/app/plan-save.ts'
function base(){return{startMonth:'2026-01',opening:1000,buffer:0,horizon:24,defaults:{...zero(),personalSaving:100},months:{'2026-02':{values:{...zero(),personalSaving:100},actual:true,includesPlannedCard:false}},expenses:[],demo:false,cashPlanning:{accounts:[{id:'a',label:'A',buffer:0},{id:'b',label:'B',buffer:0}],months:{},cardAccounts:{},transfers:[]},savingsGoals:{balance:1000,snapshotMonth:'2026-01',items:[{id:'holiday',name:'חופשה',target:500,allocated:200,monthly:50,icon:'plane',fundingAccountIds:['a'],note:{retain:true}}],deposits:{'2026-02':{holiday:50}},poolDeposits:{'2026-02':100}}}}
const draft=p=>({...initialSavingsGoalDraft(p,''),name:'מטרה חדשה',target:'750.01',icon:'house',deadline:'2027-12-31',fundingAccountIds:['a','b']})
test('Goal creation matches the original goal submit transition without creating an allocation or deposit',()=>{
 const p=base(),d=draft(p),before=JSON.stringify(p),next=prepareSavingsGoal(p,'new-goal',d,true);assert.ok(validatePlan(p))
 const s=readFileSync('src/savings.js','utf8'),start=s.indexOf('let g=next.savingsGoals.items.find'),end=s.indexOf('savingsUI.id=id;savingsCommit(next);',start)+'savingsUI.id=id;savingsCommit(next);'.length
 let captured;const context=vm.createContext({next:clone(p),values:{...d,id:''},crypto:{randomUUID:()=> 'new-goal'},readNumber:Number,savingsReadFunding:()=>d.fundingAccountIds,form:{},savingsUI:{},savingsCommit:v=>{captured=v}});vm.runInContext(s.slice(start,end),context);assert.deepEqual(JSON.parse(JSON.stringify(captured)),next)
 const g=next.savingsGoals.items.find(g=>g.id==='new-goal');assert.equal(g.allocated,0);assert.equal(g.monthly,0);assert.equal(savingsBalances(next,'2026-10').balance,1100);assert.equal(savingsBalances(next,'2026-10').free,savingsBalances(p,'2026-10').free);assert.deepEqual(next.savingsGoals.deposits,p.savingsGoals.deposits);assert.equal(JSON.stringify(p),before)
})
test('Metadata and funding intent editing preserve financial histories, contribution amounts, assets and forecast',()=>{
 const p=base(),d={...initialSavingsGoalDraft(p,'holiday'),name:'מעודכן',target:'200.01',icon:'car',fundingAccountIds:['b']},next=prepareSavingsGoal(p,'holiday',d)
 assert.deepEqual(forecast(next),forecast(p));assert.deepEqual(next.months,p.months);assert.deepEqual(next.defaults,p.defaults);assert.equal(next.savingsGoals.balance,p.savingsGoals.balance);assert.deepEqual(next.savingsGoals.deposits,p.savingsGoals.deposits);assert.deepEqual(next.savingsGoals.poolDeposits,p.savingsGoals.poolDeposits);assert.equal(next.savingsGoals.items[0].allocated,200);assert.equal(next.savingsGoals.items[0].monthly,50);assert.deepEqual(next.savingsGoals.items[0].note,{retain:true});assert.equal(savingsBalances(next,'2026-10').items[0].current,250);assert.deepEqual(next.savingsGoals.items[0].fundingAccountIds,['b'])
})
test('Normalized draft identity ignores formatting and funding order but preserves target/intent differences',()=>{
 const p=base(),d=draft(p);assert.equal(savingsGoalDraftFingerprint(d),savingsGoalDraftFingerprint({...d,name:' מטרה חדשה ',target:'0750.01',fundingAccountIds:['b','a']}));assert.notEqual(savingsGoalDraftFingerprint(d),savingsGoalDraftFingerprint({...d,target:'751'}));assert.notEqual(savingsGoalDraftFingerprint(d),savingsGoalDraftFingerprint({...d,fundingAccountIds:[]}))
})
test('Unconfigured savings, unknown or duplicate identities, foreign funding, impossible dates and malformed values are refused',()=>{
 const p=base(),d=draft(p),before=JSON.stringify(p)
 for(const bad of [{...d,name:''},{...d,target:'0'},{...d,target:'-1'},{...d,target:'1.001'},{...d,deadline:'2026-02-30'},{...d,icon:'unknown'},{...d,fundingAccountIds:['foreign']},{...d,fundingAccountIds:['a','a']},{...d,allocated:'100'},{...d,fundingAccountIds:'a'}])assert.throws(()=>prepareSavingsGoal(p,'new',bad,true))
 assert.throws(()=>prepareSavingsGoal(p,'holiday',d,true));assert.throws(()=>prepareSavingsGoal(p,'missing',d));const unconfigured=clone(p);delete unconfigured.savingsGoals;assert.throws(()=>prepareSavingsGoal(unconfigured,'new',d,true));assert.equal(JSON.stringify(p),before)
})
test('Goal edits through the real API recover lost receipts without changing another actor or multiplying goal assets',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://goals.test',hash=s=>createHash('sha256').update(s).digest('hex')
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(u),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  for(const u of ['alice','bob'])await req(u,'/api/plan','PUT',{plan:base(),revision:0})
  let puts=0,lost=true;const fetcher=async(path,opt={})=>{if(opt.method==='PUT'){puts++;const r=await req('alice',path,'PUT',JSON.parse(opt.body));if(lost){lost=false;return Response.json({error:'lost'},{status:503})}return r}return req('alice',path)}
  const snapshot=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,plan=prepareSavingsGoal(snapshot.plan,'stable',draft(snapshot.plan),true),input={budgetId:'personal',base:snapshot,plan};await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain);const saved=await savePreparedPlan(input,fetcher);assert.equal(saved.recovered,true);assert.equal(puts,1);assert.equal(saved.value.plan.savingsGoals.items.filter(g=>g.id==='stable').length,1);assert.equal(savingsBalances(saved.value.plan,'2026-10').balance,1100);assert.equal((await(await req('bob','/api/plan')).json()).revision,1)
  await assert.rejects(savePreparedPlan({...input,plan:prepareSavingsGoal(snapshot.plan,'other',draft(snapshot.plan),true)},fetcher),SaveConflict);assert.equal(puts,1)
 }finally{db.close()}
})
test('Saving a goal pace changes its projection metadata only, without creating deposits or changing cash/contribution defaults',()=>{const p=base(),d={...initialSavingsGoalDraft(p,'holiday'),monthly:'150.01'},next=prepareSavingsGoal(p,'holiday',d);assert.equal(next.savingsGoals.items[0].monthly,150.01);assert.deepEqual(forecast(next),forecast(p));assert.deepEqual(next.defaults,p.defaults);assert.deepEqual(next.months,p.months);assert.deepEqual(next.savingsGoals.deposits,p.savingsGoals.deposits);assert.deepEqual(next.savingsGoals.poolDeposits,p.savingsGoals.poolDeposits);assert.equal(savingsBalances(next,'2026-10').balance,savingsBalances(p,'2026-10').balance);assert.notEqual(savingsGoalDraftFingerprint(d),savingsGoalDraftFingerprint({...d,monthly:'151'}));assert.throws(()=>prepareSavingsGoal(p,'holiday',{...d,monthly:'1.001'}))})
