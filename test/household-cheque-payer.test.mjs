import {createHash} from 'node:crypto'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts'
import {savePreparedPlan,SaveUncertain} from '../frontend/src/app/plan-save.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {zero,clone,forecast,cashAccountForecast,assignCashPayers} from '../src/budget.js'
import {initialDetailDraft,prepareDetailSave} from '../frontend/src/app/detail-management-command.ts'
import {needsChequePayer,prepareDetailWithPayer} from '../frontend/src/app/detail-payer-command.ts'
const base=()=>({startMonth:'2026-01',opening:2000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,cashPlanning:{accounts:[{id:'a',label:'א',buffer:0,opening:1000},{id:'b',label:'ב',buffer:0,opening:1000}],months:{},cardAccounts:{},transfers:[]}})
const draft=p=>({...initialDetailDraft(p,'','2026-10'),name:'צ׳ק',amount:'100.01',date:'2026-10-15'})
test('New cheque payer is exactly the original save followed by original assignment, with one cash outflow',()=>{
 const p=base(),d=draft(p),before=clone(p),expected=assignCashPayers(prepareDetailSave(p,'check',d,true),{details:{check:'b'}}),next=prepareDetailWithPayer(p,'check',d,true,'b')
 assert.deepEqual(next,expected);assert.deepEqual(p,before);assert.equal(cashAccountForecast(next,'a').find(r=>r.month==='2026-10').balance,1000);assert.equal(cashAccountForecast(next,'b').find(r=>r.month==='2026-10').balance,899.99);assert.equal(forecast(next).find(r=>r.month==='2026-10').balance,1899.99)
})
test('Missing/foreign payer and attempts to reassign an existing or included cheque are refused',()=>{
 const p=base(),d=draft(p);assert.ok(needsChequePayer(p,d,true));assert.throws(()=>prepareDetailWithPayer(p,'c',d,true));assert.throws(()=>prepareDetailWithPayer(p,'c',d,true,'foreign'))
 const saved=prepareDetailWithPayer(p,'c',d,true,'a');assert.throws(()=>prepareDetailWithPayer(saved,'c',d,false,'b'))
 assert.throws(()=>prepareDetailWithPayer(p,'c',{...d,accounting:'included'},true,'a'))
})
test('Legacy no-payer and included-detail flows retain the exact original command output',()=>{
 const p=base(),included={...draft(p),accounting:'included'};assert.deepEqual(prepareDetailWithPayer(p,'c',included,true),prepareDetailSave(p,'c',included,true))
 p.cashPlanning.accounts.pop();assert.equal(needsChequePayer(p,draft(p),true),false);assert.deepEqual(prepareDetailWithPayer(p,'c',draft(p),true),prepareDetailSave(p,'c',draft(p),true))
})

test('Cheque and payer recover a lost receipt in one atomic save while another actor stays unchanged',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://cheque-payer.test',hash=s=>createHash('sha256').update(s).digest('hex')
 try{
  for(const user of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user,user,user+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(user),user,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),request=(user,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  for(const user of ['alice','bob'])assert.equal((await request(user,'/api/plan','PUT',{plan:base(),revision:0})).status,200)
  let writes=0,lost=true
  const fetcher=async(path,options={})=>{if(options.method==='PUT'){writes++;const response=await request('alice',path,'PUT',JSON.parse(options.body));if(lost){lost=false;return Response.json({error:'lost'},{status:503})}return response}return request('alice',path)}
  const snapshot=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,prepared=prepareDetailWithPayer(snapshot.plan,'atomic-cheque',draft(snapshot.plan),true,'b'),input={budgetId:'personal',base:snapshot,plan:prepared}
  await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain)
  const saved=await savePreparedPlan(input,fetcher);assert.equal(saved.recovered,true);assert.equal(writes,1);assert.equal(saved.value.plan.details.length,1);assert.equal(saved.value.plan.details[0].cashAccountId,'b');assert.equal((await(await request('bob','/api/plan')).json()).revision,1)
 }finally{db.close()}
})
