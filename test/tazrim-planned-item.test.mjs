import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {zero,clone,forecast,validatePlan,cashAccountForecast} from '../src/budget.js'
import {initialPlannedItemDraft,preparePlannedItem,plannedItemSchedule,plannedItemDraftFingerprint} from '../frontend/src/app/planned-item-command.ts'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts'
import {savePreparedPlan,SaveConflict,SaveUncertain,WritePermissionError} from '../frontend/src/app/plan-save.ts'
const base=()=>({startMonth:'2026-01',opening:1000,buffer:100,horizon:24,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true})
const draft=p=>({...initialPlannedItemDraft(p,'','2026-10'),name:'רכישה',amount:'100.01',fees:'0.02',payments:'3'})
test('Planned create matches the original submit transition and allocates all fee cents to its installment schedule',()=>{
 const p=base(),before=JSON.stringify(p),d=draft(p),next=preparePlannedItem(p,'stable-item',d,true),item=next.expenses[0]
 const source=readFileSync('src/client.js','utf8'),a=source.indexOf("if(event.target.id==='item-form')"),start=source.indexOf('const next=clone(plan);',a),end=source.indexOf("if(mutate(next,",start)
 const context=vm.createContext({plan:p,draft:item,clone,captured:null});vm.runInContext(source.slice(start,end)+'captured=next;',context);assert.deepEqual(JSON.parse(JSON.stringify(context.captured)),next)
 assert.deepEqual(plannedItemSchedule(item).map(r=>r.amount),[33.34,33.34,33.35]);assert.equal(forecast(next).find(r=>r.month==='2026-10').net,-33.34);assert.equal(JSON.stringify(p),before);assert.ok(validatePlan(next))
})
test('Income is planned separately with no fee/card expense and does not change recorded monthly actuals',()=>{
 const p=base();p.months['2026-10']={values:{...zero(),salary:100},actual:true,includesPlannedCard:false}
 const next=preparePlannedItem(p,'income',{...draft(p),kind:'income',source:'card',fees:'55',cardId:'card1'},true)
 assert.equal(next.expenses[0].source,'direct');assert.equal(next.expenses[0].fees,0);assert.equal(next.expenses[0].cardId,undefined);assert.deepEqual(next.months,p.months);assert.equal(forecast(next).find(r=>r.month==='2026-10').net,133.33)
})
test('Account/card choices are explicit, other-account forecasts stay fixed, and changing to direct removes stale card assignment',()=>{
 const p=base();p.cashPlanning={accounts:[{id:'a',label:'A',buffer:0,opening:1000,openingMonth:'2026-01'},{id:'b',label:'B',buffer:0,opening:2000,openingMonth:'2026-01'}],months:{},cardAccounts:{card1:'a',card2:'b'},transfers:[]}
 assert.throws(()=>preparePlannedItem(p,'new',draft(p),true),/חשבון/)
 const next=preparePlannedItem(p,'new',{...draft(p),source:'card',cashAccountId:'a',cardId:'card1'},true)
 assert.deepEqual(cashAccountForecast(next,'b'),cashAccountForecast(p,'b'));assert.equal(cashAccountForecast(next,'a').find(r=>r.month==='2026-10').net,-33.34)
 assert.throws(()=>preparePlannedItem(p,'new',{...draft(p),source:'card',cashAccountId:'a',cardId:'card2'},true),/כרטיס/)
 const edited=preparePlannedItem(next,'new',{...initialPlannedItemDraft(next,'new','2026-10'),source:'direct'});assert.equal(edited.expenses[0].cardId,undefined);assert.equal(edited.expenses[0].cashAccountId,'a')
})
test('Editing retains metadata and inclusion rules without adding a duplicate planned charge',()=>{
 const p=preparePlannedItem(base(),'item',{...draft(base()),source:'card',cardId:'card1'},true);p.expenses[0].customMetadata={retained:true};p.months['2026-10']={values:{...zero(),card1:100},actual:true,includesPlannedCard:true}
 const next=preparePlannedItem(p,'item',{...initialPlannedItemDraft(p,'item','2026-10'),name:'מעודכן'})
 assert.equal(next.expenses.length,1);assert.deepEqual(next.expenses[0].customMetadata,{retained:true});assert.deepEqual(next.months,p.months);assert.equal(forecast(next).find(r=>r.month==='2026-10').net,-100)
 assert.equal(plannedItemDraftFingerprint(draft(base())),plannedItemDraftFingerprint({...draft(base()),name:' רכישה ',amount:'0100.01',payments:'03'}))
})
test('Out-of-range, duplicate, unknown, closed-card and malformed inputs are refused without mutating the plan',()=>{
 const p=base(),d=draft(p),before=JSON.stringify(p)
 for(const bad of [{...d,name:''},{...d,amount:'-1'},{...d,amount:'0'},{...d,payments:'61'},{...d,payments:'1.5'},{...d,firstMonth:'2036-01'},{...d,source:'unknown'},{...d,kind:'unknown'},{...d,extra:'x'},{...d,cashAccountId:'foreign'}])assert.throws(()=>preparePlannedItem(p,'item',bad,true))
 const next=preparePlannedItem(p,'item',d,true);assert.throws(()=>preparePlannedItem(next,'item',d,true));assert.throws(()=>preparePlannedItem(p,'missing',d));assert.equal(JSON.stringify(p),before)
 p.creditCards=[{id:'card1',name:'סגור',alias:'',removedFrom:'2026-09'}];assert.throws(()=>preparePlannedItem(p,'item',{...d,source:'card',cardId:'card1'},true))
})
test('Real planned-item API save retries safely and remains private to its actor',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://plans.test',hash=s=>createHash('sha256').update(s).digest('hex')
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(u),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  for(const u of ['alice','bob'])await req(u,'/api/plan','PUT',{plan:base(),revision:0})
  let puts=0,lost=true;const fetcher=async(path,opt={})=>{if(opt.method==='PUT'){puts++;const r=await req('alice',path,'PUT',JSON.parse(opt.body));if(lost){lost=false;return Response.json({error:'lost'},{status:503})}return r}return req('alice',path)}
  const snapshot=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,plan=preparePlannedItem(snapshot.plan,'stable',draft(snapshot.plan),true),input={budgetId:'personal',base:snapshot,plan};await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain);const saved=await savePreparedPlan(input,fetcher);assert.equal(saved.recovered,true);assert.equal(puts,1);assert.equal(saved.value.plan.expenses.length,1);assert.equal((await(await req('bob','/api/plan')).json()).plan.expenses.length,0)
  await assert.rejects(savePreparedPlan({...input,plan:preparePlannedItem(snapshot.plan,'different',draft(snapshot.plan),true)},fetcher),SaveConflict);assert.equal(puts,1)
 }finally{db.close()}
})
