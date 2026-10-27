import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {zero,clone,setLoan,forecast,scheduledLoans,validatePlan} from '../src/budget.js'
import {initialLoanDraft,prepareLoan,prepareLoanRemoval,loanDraftFingerprint} from '../frontend/src/app/loan-command.ts'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts'
import {savePreparedPlan,SaveUncertain} from '../frontend/src/app/plan-save.ts'
function base(){return{startMonth:'2026-01',opening:1000,buffer:0,horizon:24,defaults:zero(),months:{'2026-09':{values:{...zero(),loanRepayment:50},actual:true,includesPlannedCard:false},'2026-10':{values:zero(),actual:false,includesPlannedCard:false},'2027-01':{values:zero(),actual:false,includesPlannedCard:false}},expenses:[],demo:false,cashPlanning:{accounts:[{id:'a',label:'A',buffer:0,opening:1000,openingMonth:'2026-01'},{id:'b',label:'B',buffer:0,opening:1000,openingMonth:'2026-01'}],months:{},cardAccounts:{},transfers:[]}}}
const draft=p=>({...initialLoanDraft(p,'','2026-10'),name:'הלוואה',monthly:'12.34',months:'3',cashAccountId:'a'})
test('Loan command reuses setLoan; estimates stop after the final month and actual reports remain fixed',()=>{
 const p=base(),before=JSON.stringify(p),next=prepareLoan(p,'loan',draft(p),true)
 assert.deepEqual(next,setLoan(p,{id:'loan',name:'הלוואה',monthly:12.34,months:3,from:'2026-10',cashAccountId:'a'}));assert.equal(scheduledLoans(next,'2026-12'),12.34);assert.equal(scheduledLoans(next,'2027-01'),0);assert.equal(next.months['2026-10'].values.loanRepayment,12.34);assert.equal(next.months['2027-01'].values.loanRepayment,0);assert.deepEqual(next.months['2026-09'],p.months['2026-09']);assert.equal(JSON.stringify(p),before);assert.ok(validatePlan(next))
})
test('Editing retains metadata and other loans; normalized input does not invent dirty state',()=>{
 const p=prepareLoan(base(),'one',draft(base()),true);p.loans[0].note={retain:true};const other={id:'two',name:'שנייה',monthly:20,months:2,from:'2026-11',cashAccountId:'b'};p.loans.push(other)
 const d={...initialLoanDraft(p,'one','2026-10'),monthly:'15.25'},next=prepareLoan(p,'one',d)
 assert.deepEqual(next.loans.find(l=>l.id==='two'),other);assert.deepEqual(next.loans.find(l=>l.id==='one').note,{retain:true});assert.equal(scheduledLoans(next,'2026-11'),35.25);assert.equal(loanDraftFingerprint(d),loanDraftFingerprint({...d,name:' הלוואה ',monthly:'015.25',months:'003'}))
})
test('Invalid periods, amounts, names, payer identities, collisions and malformed loan fields are refused',()=>{
 const p=base(),d=draft(p),before=JSON.stringify(p)
 for(const bad of [{...d,monthly:'0'},{...d,monthly:'-1'},{...d,monthly:'1.001'},{...d,months:'121'},{...d,months:'1.5'},{...d,from:'2025-12'},{...d,from:'2035-12',months:'3'},{...d,name:''},{...d,cashAccountId:'foreign'},{...d,cashAccountId:''},{...d,extra:'x'}])assert.throws(()=>prepareLoan(p,'id',bad,true))
 const next=prepareLoan(p,'id',d,true);assert.throws(()=>prepareLoan(next,'id',d,true));assert.throws(()=>prepareLoan(p,'missing',d));assert.equal(JSON.stringify(p),before)
})
test('Loan removal updates only estimates while retaining actuals and other financial records',()=>{
 const p=prepareLoan(base(),'one',draft(base()),true),actual=clone(p.months['2026-09']),next=prepareLoanRemoval(p,'one')
 assert.deepEqual(next.loans,[]);assert.deepEqual(next.months['2026-09'],actual);assert.equal(next.months['2026-10'].values.loanRepayment,0);assert.deepEqual(next.cashPlanning,p.cashPlanning);assert.deepEqual(next.expenses,p.expenses);assert.throws(()=>prepareLoanRemoval(p,'missing'));assert.equal(p.loans.length,1)
})
test('Real API loan creation and removal recover lost receipts without duplicate records or revisions',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://loans.test',hash=s=>createHash('sha256').update(s).digest('hex')
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(u),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  for(const u of ['alice','bob'])await req(u,'/api/plan','PUT',{plan:base(),revision:0})
  let lost=true,puts=0;const fetcher=async(path,opt={})=>{if(opt.method==='PUT'){puts++;const r=await req('alice',path,'PUT',JSON.parse(opt.body));if(lost){lost=false;return Response.json({error:'lost'},{status:503})}return r}return req('alice',path)}
  const snapshot=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,input={budgetId:'personal',base:snapshot,plan:prepareLoan(snapshot.plan,'stable',draft(snapshot.plan),true)};await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain);const created=await savePreparedPlan(input,fetcher);assert.equal(created.recovered,true);assert.equal(puts,1);assert.equal(created.value.plan.loans.length,1)
  lost=true;const removal={budgetId:'personal',base:created.value,plan:prepareLoanRemoval(created.value.plan,'stable')};await assert.rejects(savePreparedPlan(removal,fetcher),SaveUncertain);const removed=await savePreparedPlan(removal,fetcher);assert.equal(removed.recovered,true);assert.equal(puts,2);assert.equal(removed.value.revision,3);assert.deepEqual(removed.value.plan.loans,[]);assert.equal((await(await req('bob','/api/plan')).json()).revision,1);assert.deepEqual(removed.value.plan.months['2026-09'],snapshot.plan.months['2026-09'])
 }finally{db.close()}
})
