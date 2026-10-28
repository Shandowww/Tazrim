import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {zero,clone,saveMonthReport,setReportedCashBalance,planSavingTransfer,completeSavingTransfer,applySavingsTransfer,previewSavingsTransfer,savingsBalances,forecast} from '../src/budget.js'
import {prepareSavingsTransferAction,savingsTransferPreview} from '../frontend/src/app/savings-transfer-command.ts'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts'
import {savePreparedPlan,SaveConflict,SaveUncertain} from '../frontend/src/app/plan-save.ts'
const asOf='2026-10',base=()=>saveMonthReport(setReportedCashBalance({startMonth:asOf,opening:50000,buffer:5000,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,savingsGoals:{balance:1000,snapshotMonth:asOf,items:[{id:'a',name:'ראשונה',icon:'house',target:1000,allocated:400,monthly:20},{id:'b',name:'שנייה',icon:'plane',target:500,allocated:200,monthly:10}],deposits:{}}},asOf,50000),asOf,true,asOf),draft=(d={})=>({top:'a',bottom:'b',position:0,personal:'',shared:'',confirmed:false,alreadyReported:false,...d})
test('Original goal transfer preview/apply preserve total assets and choose the same direction and signed cents',()=>{
 const p=base(),before=clone(p)
 for(const position of [-1000,-333,333,1000]){const d=draft({position}),preview=savingsTransferPreview(p,d,asOf),next=prepareSavingsTransferAction(p,'allocation','editor',d,asOf);assert.deepEqual(preview,previewSavingsTransfer(p,'a','b',position,asOf));assert.deepEqual(next,applySavingsTransfer(p,'a','b',position,asOf));assert.equal(savingsBalances(next,asOf).balance,1000);assert.deepEqual(forecast(next),forecast(p))}
 const free=draft({bottom:'',position:500}),next=prepareSavingsTransferAction(p,'allocation','editor',free,asOf);assert.equal(savingsBalances(next,asOf).items.find(g=>g.id==='a').current,200);assert.equal(savingsBalances(next,asOf).free,600);assert.deepEqual(p,before)
 assert.throws(()=>prepareSavingsTransferAction(p,'allocation','id',draft(),asOf));assert.throws(()=>savingsTransferPreview(p,draft({bottom:'a',position:1}),asOf));assert.throws(()=>savingsTransferPreview(p,draft({position:1001}),asOf))
})
test('Extra saving planning and completion use existing commands and only confirmed bank execution posts savings once',()=>{
 const p=base(),d=draft({personal:'20000.01',shared:'10.02'}),pending=prepareSavingsTransferAction(p,'new','request',d,asOf);assert.deepEqual(pending,planSavingTransfer(p,'request',asOf,20000.01,10.02,asOf));assert.equal(savingsBalances(pending,asOf).balance,1000)
 const done=prepareSavingsTransferAction(pending,'complete','request',draft({confirmed:true}),asOf);assert.deepEqual(done,completeSavingTransfer(pending,'request',asOf));assert.equal(savingsBalances(done,asOf).balance,21010.03);assert.equal(done.savingTransfers[0].status,'completed');assert.throws(()=>prepareSavingsTransferAction(done,'complete','request',draft({confirmed:true}),asOf));assert.throws(()=>prepareSavingsTransferAction(pending,'complete','request',draft(),asOf));assert.throws(()=>prepareSavingsTransferAction(pending,'new','request',d,asOf));assert.throws(()=>prepareSavingsTransferAction(p,'new','too-much',draft({personal:'50000'}),asOf))
})
test('Already reported deposits reconcile rather than add; original pending cancellation changes only its status',()=>{
 let p=planSavingTransfer(base(),'request',asOf,100,20,asOf);p.months[asOf].values.personalSaving=100;p.months[asOf].values.sharedSaving=20;p=saveMonthReport(p,asOf,true,asOf);p=saveMonthReport(setReportedCashBalance(p,asOf,49880),asOf,true,asOf)
 const done=prepareSavingsTransferAction(p,'complete','request',draft({confirmed:true,alreadyReported:true}),asOf);assert.equal(done.months[asOf].values.personalSaving,100);assert.equal(done.months[asOf].values.sharedSaving,20);assert.deepEqual(done,completeSavingTransfer(p,'request',asOf,true))
 const cancelled=prepareSavingsTransferAction(p,'cancel','request',draft({confirmed:true}),asOf),src=readFileSync('src/home.js','utf8'),start=src.indexOf("next=clone(plan);next.savingTransfers.find"),end=src.indexOf('}',start),ctx=vm.createContext({clone,plan:p,id:'request',next:null});vm.runInContext(src.slice(start,end),ctx);assert.deepEqual(cancelled,JSON.parse(JSON.stringify(ctx.next)));assert.deepEqual(cancelled.months,p.months);assert.deepEqual(cancelled.savingsGoals,p.savingsGoals);assert.throws(()=>prepareSavingsTransferAction(p,'complete','foreign',draft({confirmed:true}),asOf))
 const unavailable=base();delete unavailable.months[asOf].cashReport;assert.throws(()=>prepareSavingsTransferAction(unavailable,'new','r',draft({personal:'100'}),asOf));assert.throws(()=>prepareSavingsTransferAction(p,'cancel','request',{...draft({confirmed:true}),cashAccountId:'foreign'},asOf))
})
test('Pending requests recover lost saving responses through the original service without replay, mixing users or stale overwrite',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://transfers.test',hash=s=>createHash('sha256').update(s).digest('hex')
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(u),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  for(const u of ['alice','bob'])await req(u,'/api/plan','PUT',{plan:base(),revision:0})
  let puts=0,lost=true;const fetcher=async(path,opt={})=>{if(opt.method==='PUT'){puts++;const r=await req('alice',path,'PUT',JSON.parse(opt.body));if(lost){lost=false;return Response.json({error:'lost'},{status:503})}return r}return req('alice',path)}
  const snapshot=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,plan=prepareSavingsTransferAction(snapshot.plan,'new','stable-request',draft({personal:'100.01',shared:'50.02'}),asOf),input={budgetId:'personal',base:snapshot,plan};await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain);const saved=await savePreparedPlan(input,fetcher);assert.equal(saved.recovered,true);assert.equal(puts,1);assert.equal(saved.value.plan.savingTransfers.length,1);assert.equal(savingsBalances(saved.value.plan,asOf).balance,1000);assert.equal((await(await req('bob','/api/plan')).json()).revision,1);await assert.rejects(savePreparedPlan({...input,plan:prepareSavingsTransferAction(snapshot.plan,'new','other',draft({personal:'1'}),asOf)},fetcher),SaveConflict);assert.equal(puts,1)
 }finally{db.close()}
})
