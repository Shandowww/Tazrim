import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {zero,clone,saveCashMonth,validatePlan,cashAccountForecast} from '../src/budget.js'
import {cashMonthlyFields,cashMonthlyEligibility,initialCashMonthlyDraft,cashMonthlyDraftFingerprint,prepareCashMonthlyReport} from '../frontend/src/app/cash-monthly-command.ts'
import {savePreparedPlan,SaveConflict,SaveUncertain,WritePermissionError} from '../frontend/src/app/plan-save.ts'
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
const month='2026-10',asOf=month
function base(){return{startMonth:'2026-01',opening:1000,buffer:100,horizon:24,defaults:zero(),months:{[month]:{values:{...zero(),salary:1500,card1:100,card2:200},actual:false,includesPlannedCard:false}},expenses:[],demo:false,setupCompleted:true,cashPlanning:{accounts:[{id:'a',label:'ראשון',buffer:10,opening:1000,openingMonth:'2026-01'},{id:'b',label:'שני',buffer:20,opening:2000,openingMonth:'2026-01'}],months:{[month]:{a:{values:{...zero(),salary:1000,card1:100},actual:true,includesPlannedCard:true,includesPlannedDirect:false,balance:1900},b:{values:{...zero(),salary:500,card2:200},actual:false,includesPlannedCard:false,includesPlannedDirect:false}}},cardAccounts:{card1:'a',card2:'b'},transfers:[]}}}
test('Per-account command exactly uses saveCashMonth and keeps the other account, unassigned amounts and source immutable',()=>{
 const p=base(),before=JSON.stringify(p),other=cashAccountForecast(p,'b'),draft=initialCashMonthlyDraft(p,'a',month);draft.values.salary='1,200.01';draft.values.card1='90.02';draft.balance='0'
 const actual=prepareCashMonthlyReport(p,'a',month,draft,asOf),record={...clone(p.cashPlanning.months[month].a),values:{...zero(),salary:1200.01,card1:90.02},balance:0}
 assert.deepEqual(actual,saveCashMonth(p,'a',month,record,asOf));assert.equal(actual.months[month].values.salary,1700.01);assert.equal(actual.months[month].values.card1,90.02);assert.equal(actual.months[month].actual,false);assert.deepEqual(actual.cashPlanning.months[month].b,p.cashPlanning.months[month].b);assert.deepEqual(cashAccountForecast(actual,'b'),other);assert.equal(JSON.stringify(p),before);assert.ok(validatePlan(actual))
})
test('Only explicitly assigned card fields are editable; current unmatched nonzero card amounts require reconciliation',()=>{
 const p=base();assert.ok(cashMonthlyFields(p,'a').some(([k])=>k==='card1'));assert.ok(!cashMonthlyFields(p,'a').some(([k])=>k==='card2'))
 const d=initialCashMonthlyDraft(p,'a',month);d.values.card2='2';assert.throws(()=>prepareCashMonthlyReport(p,'a',month,d,asOf))
 p.cashPlanning.months[month].a.values.card2=1;assert.match(cashMonthlyEligibility(p,'a',month),/שיוך/)
})
test('Unknown, zero and negative account balances remain explicit and existing balances cannot be erased',()=>{
 const p=base(),d=initialCashMonthlyDraft(p,'b',month);assert.equal(d.balance,'');const unknown=prepareCashMonthlyReport(p,'b',month,d,asOf);assert.equal(unknown.cashPlanning.months[month].b.balance,undefined)
 const known=prepareCashMonthlyReport(p,'b',month,{...d,balance:'0'},asOf),negative=prepareCashMonthlyReport(p,'b',month,{...d,balance:'-12.34'},asOf);assert.equal(known.cashPlanning.months[month].b.balance,0);assert.equal(negative.cashPlanning.months[month].b.balance,-12.34)
 assert.throws(()=>prepareCashMonthlyReport(p,'a',month,{...initialCashMonthlyDraft(p,'a',month),balance:''},asOf));assert.throws(()=>prepareCashMonthlyReport(p,'b',month,{...d,balance:'-'},asOf));assert.equal(cashMonthlyDraftFingerprint(d),cashMonthlyDraftFingerprint({...d,values:{...d.values,salary:'500.00'}}));assert.notEqual(cashMonthlyDraftFingerprint(d),cashMonthlyDraftFingerprint({...d,balance:'0'}))
})
test('Future actuals, malformed field sets, unknown accounts and inconsistent aggregate reconciliation are refused',()=>{
 const p=base(),d=initialCashMonthlyDraft(p,'a',month)
 for(const bad of [{...d,actual:'true'},{...d,extra:1},{...d,values:{salary:'1'}},{...d,balance:'1.001'},{...d,values:{...d.values,salary:'-1'}}])assert.throws(()=>prepareCashMonthlyReport(p,'a',month,bad,asOf))
 assert.throws(()=>prepareCashMonthlyReport(p,'unknown',month,d,asOf));assert.throws(()=>prepareCashMonthlyReport(p,'a',month,d,'bad'));assert.throws(()=>prepareCashMonthlyReport(p,'a','2026-11',{...d,actual:true},asOf))
 p.months[month].values.salary=1;assert.throws(()=>prepareCashMonthlyReport(p,'a',month,{...d,values:{...d.values,salary:'0'}},asOf),/הסיכום/)
})
test('Both source-backed accounts and aggregate anchors remain in the existing editor without mutation',()=>{
 for(const change of [p=>p.bankImport={accounts:[],entries:[],batches:[]},p=>p.months[month].cashReport={balance:10,net:0},p=>p.months[month].bankCoverage={complete:true,accountId:'a',from:'2026-10-01',to:'2026-10-31',date:'2026-10-31'},p=>p.cashPlanning.months[month].a.bankImported=true]){
  const p=base();change(p);const before=JSON.stringify(p);assert.ok(cashMonthlyEligibility(p,'a',month));assert.throws(()=>prepareCashMonthlyReport(p,'a',month,initialCashMonthlyDraft(p,'a',month),asOf));assert.equal(JSON.stringify(p),before)
 }
})
test('Manual account report saves/reloads with scope and lost-receipt protection on the reconciled API',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://cash-monthly.test',hash=s=>createHash('sha256').update(s).digest('hex')
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(u),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  for(const u of ['alice','bob'])assert.equal((await req(u,'/api/plan','PUT',{plan:base(),revision:0})).status,200)
  let calls=0,lost=true;const fetcher=async(path,opt={})=>{if(opt.method==='PUT'){calls++;const r=await req('alice',path,'PUT',JSON.parse(opt.body));if(lost){lost=false;return Response.json({error:'lost'},{status:503})}return r}return req('alice',path)}
  const snapshot=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,draft=initialCashMonthlyDraft(snapshot.plan,'a',month);draft.values.salary='1111.01';const plan=prepareCashMonthlyReport(snapshot.plan,'a',month,draft,asOf),input={budgetId:'personal',base:snapshot,plan}
  await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain);const saved=await savePreparedPlan(input,fetcher);assert.equal(saved.recovered,true);assert.equal(saved.value.revision,2);assert.equal(calls,1);assert.equal((await(await req('bob','/api/plan')).json()).revision,1);assert.equal((await(await req('alice','/api/plan')).json()).plan.cashPlanning.months[month].a.values.salary,1111.01)
  const freshDraft={...draft,values:{...draft.values,salary:'2222'}};await assert.rejects(savePreparedPlan({...input,plan:prepareCashMonthlyReport(snapshot.plan,'a',month,freshDraft,asOf)},fetcher),SaveConflict);assert.equal(calls,1)
 }finally{db.close()}
})
