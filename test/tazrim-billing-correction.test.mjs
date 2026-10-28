import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {zero,clone,validatePlan,cashAccountForecast} from '../src/budget.js'
import {saveBillingReport,setCardNoTransactions,cardNoTransactionsConfirmed} from '../src/card-billing-model.js'
import {initialBillingDraft,prepareBillingCorrection,prepareCardNoActivity} from '../frontend/src/app/billing-command.ts'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts'
import {savePreparedPlan,SaveConflict,SaveUncertain} from '../frontend/src/app/plan-save.ts'
const base=()=>({startMonth:'2026-01',opening:0,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,creditCards:[{id:'card1',name:'ראשון',alias:'1234',billingDay:15},{id:'card2',name:'שני',alias:'5678',billingDay:15}],cashPlanning:{accounts:[{id:'a',label:'ראשון',opening:8000,buffer:0},{id:'b',label:'שני',opening:3000,buffer:0}],months:{},cardAccounts:{card1:'a',card2:'b'},transfers:[]}}),draft={amount:'123.45',accountId:'a',confirmed:true}
test('Manual total correction matches the original billing editor without changing details or another payer',()=>{
 const p=saveBillingReport(base(),{cardId:'card1',dueDate:'2026-10-15',accountId:'a',amount:100,source:'file'},'2026-10-10');p.details=[{id:'cal-'+'f'.repeat(64),number:'',statement:{issuer:'cal',dueDate:'2026-10-15',key:'f'.repeat(64),originalCents:10000},name:'חנות',amount:100,method:'card1',month:'2026-10',date:'2026-10-01',category:'קניות',status:'cleared',accounting:'included'}];const before=clone(p),next=prepareBillingCorrection(p,'card1','2026-10-15',draft,'2026-10-20')
 const s=readFileSync('src/card-billing-client.js','utf8'),start=s.indexOf('next=saveBillingReport(plan,'),end=s.indexOf(';',start)+1,ctx=vm.createContext({plan:p,id:'card1',dueDate:'2026-10-15',data:new Map([['accountId','a'],['amount','123.45']]),saveBillingReport,billingToday:()=> '2026-10-20',next:null});vm.runInContext(s.slice(start,end),ctx);assert.deepEqual(next,ctx.next);assert.equal(next.cardBilling.reports[0].source,'manual');assert.equal(next.cardBilling.reports[0].amount,123.45);assert.deepEqual(next.details,p.details);assert.deepEqual(next.cashPlanning,p.cashPlanning);assert.deepEqual(cashAccountForecast(next,'b'),cashAccountForecast(p,'b'));assert.deepEqual(p,before);assert.deepEqual(initialBillingDraft(p,'card1','2026-10-15'),{amount:'100',accountId:'a',confirmed:false})
})
test('Manual correction preserves original near/current date limits, explicit zero and wrong-payer guards',()=>{
 const p=base();for(const [date,asOf,ok] of [['2026-10-01','2026-10-28',true],['2026-11-02','2026-10-28',true],['2026-11-15','2026-10-28',false],['2026-09-15','2026-10-28',false],['bad','2026-10-28',false]]){const run=()=>prepareBillingCorrection(p,'card1',date,draft,asOf);if(ok)assert.ok(validatePlan(run()));else assert.throws(run)}
 assert.equal(prepareBillingCorrection(p,'card1','2026-10-15',{...draft,amount:'0'},'2026-10-28').cardBilling.reports[0].amount,0)
 for(const bad of [{...draft,accountId:'b'},{...draft,accountId:'foreign'},{...draft,amount:''},{...draft,amount:'1.001'},{...draft,confirmed:false},{...draft,source:'file'}])assert.throws(()=>prepareBillingCorrection(p,'card1','2026-10-15',bad,'2026-10-28'))
 assert.throws(()=>prepareBillingCorrection(p,'foreign','2026-10-15',draft,'2026-10-28'))
})
test('Lost manual-total receipts recover one update through existing service, preserve other users and refuse stale edits',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://billing.test',hash=s=>createHash('sha256').update(s).digest('hex')
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(u),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  for(const u of ['alice','bob'])await req(u,'/api/plan','PUT',{plan:base(),revision:0})
  let puts=0,lost=true;const fetcher=async(path,opt={})=>{if(opt.method==='PUT'){puts++;const r=await req('alice',path,'PUT',JSON.parse(opt.body));if(lost){lost=false;return Response.json({error:'lost'},{status:503})}return r}return req('alice',path)}
  const snapshot=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,plan=prepareBillingCorrection(snapshot.plan,'card1','2026-10-15',draft,'2026-10-28'),input={budgetId:'personal',base:snapshot,plan};await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain);const saved=await savePreparedPlan(input,fetcher);assert.equal(saved.recovered,true);assert.equal(puts,1);assert.equal(saved.value.plan.cardBilling.reports.length,1);assert.equal((await(await req('bob','/api/plan')).json()).revision,1);await assert.rejects(savePreparedPlan({...input,plan:prepareBillingCorrection(snapshot.plan,'card1','2026-10-15',{...draft,amount:'124'},'2026-10-28')},fetcher),SaveConflict);assert.equal(puts,1)
  const zeroInput={budgetId:'personal',base:saved.value,plan:prepareCardNoActivity(saved.value.plan,'card1','2026-09',true,'2026-10-28')};lost=true;await assert.rejects(savePreparedPlan(zeroInput,fetcher),SaveUncertain);const zeroSaved=await savePreparedPlan(zeroInput,fetcher);assert.equal(zeroSaved.recovered,true);assert.equal(puts,2);assert.equal(cardNoTransactionsConfirmed(zeroSaved.value.plan,'card1','2026-09'),true);assert.equal(zeroSaved.value.plan.cardBilling.reports.find(r=>r.dueDate==='2026-10-15').amount,123.45)
 }finally{db.close()}
})

test('Native no-activity declaration and undo call original model, retain manual-zero provenance and preserve money',()=>{const p=base(),before=clone(p),declared=prepareCardNoActivity(p,'card1','2026-09',true,'2026-10-28');assert.deepEqual(declared,setCardNoTransactions(p,'card1','2026-09',true,'2026-10-28'));assert.deepEqual(declared.months,p.months);assert.deepEqual(declared.defaults,p.defaults);assert.equal(cardNoTransactionsConfirmed(declared,'card1','2026-09'),true);const undone=prepareCardNoActivity(declared,'card1','2026-09',true,'2026-10-28');assert.deepEqual(undone,setCardNoTransactions(declared,'card1','2026-09',false,'2026-10-28'));assert.equal(cardNoTransactionsConfirmed(undone,'card1','2026-09'),false);assert.deepEqual(p,before)
 const manual=saveBillingReport(p,{cardId:'card1',accountId:'a',dueDate:'2026-09-15',amount:0,source:'manual'},'2026-09-10'),upgraded=prepareCardNoActivity(manual,'card1','2026-09',true,'2026-10-28'),restored=prepareCardNoActivity(upgraded,'card1','2026-09',true,'2026-10-28');assert.deepEqual(restored,manual)
})
test('Native no-activity confirmation refuses open months, missing acknowledgment, nonzero reports and uploaded zero statements',()=>{const p=base();assert.throws(()=>prepareCardNoActivity(p,'card1','2026-10',true,'2026-10-28'));assert.throws(()=>prepareCardNoActivity(p,'card1','2026-09',false,'2026-10-28'));for(const [source,amount]of [['file',0],['manual',10]]){const activity=saveBillingReport(p,{cardId:'card1',accountId:'a',dueDate:'2026-09-15',amount,source},'2026-09-10');assert.throws(()=>prepareCardNoActivity(activity,'card1','2026-09',true,'2026-10-28'))}})
