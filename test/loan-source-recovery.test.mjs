import test from 'node:test'
import assert from 'node:assert/strict'
import {clone,forecast,validatePlan,cashAccountForecast} from '../src/budget.js'
import {bankIdentity} from '../src/bank-import-model.js'
import {fixture,rows} from './helpers/loan-payment-fixture.mjs'
import {prepareLoanSourceRecovery} from '../frontend/src/app/loan-source-recovery.ts'
import {loanPaymentCandidates} from '../frontend/src/app/loan-payment-candidates.ts'
import {prepareLoanPaymentLink} from '../frontend/src/app/loan-payment-reassignment.ts'
async function legacy(){const {p,r}=await fixture();const source=clone(p.bankImport.entries[0].source);delete p.bankImport.entries[0].source;assert.ok(validatePlan(p));return{p,r,source}}
test('Legacy movements remain counted and exact source recovery only enriches existing identities before an explicit link',async()=>{
 const {p,r,source}=await legacy(),before=clone(p),view=loanPaymentCandidates(p,'loan','?year=2026&month=1');assert.equal(view.entries.length,0);assert.equal(view.missingSourceRows.length,1)
 const recovered=await prepareLoanSourceRecovery(p,'loan','?year=2026&month=1',{kind:'bank',records:r})
 assert.equal(recovered.restored,1);assert.equal(recovered.remaining,0);const expected=clone(source);delete expected.line;delete expected.parserVersion;assert.deepEqual(recovered.plan.bankImport.entries[0].source,expected);assert.equal(recovered.plan.bankImport.entries[0].source.line,undefined);assert.equal(recovered.plan.bankImport.entries.length,p.bankImport.entries.length)
 const stripped=clone(recovered.plan);delete stripped.bankImport.entries[0].source;assert.deepEqual(stripped,p);assert.deepEqual(forecast(recovered.plan),forecast(p));assert.deepEqual(cashAccountForecast(recovered.plan,'a'),cashAccountForecast(p,'a'));assert.deepEqual(p,before)
 assert.equal(loanPaymentCandidates(recovered.plan,'loan','?year=2026&month=1').entries.length,1)
 const linked=prepareLoanPaymentLink(recovered.plan,'loan',r[0].key,'',true);assert.ok(validatePlan(linked));assert.equal(linked.loans[0].repayments.keys.length,1);assert.deepEqual(forecast(linked),forecast(p))
})
test('Unknown identities, changed fingerprints/amounts, wrong periods and accounts cannot synthesize missing source',async()=>{
 const {p,r}=await legacy()
 for(const raw of [{...r[0],description:'שם אחר'},{...r[0],amountCents:-99999},{...r[0],date:'2026-02-15'},{...r[0],reference:'other'}])await assert.rejects(prepareLoanSourceRecovery(p,'loan','?year=2026&month=1',{kind:'bank',records:[raw]}),/לא נמצאה התאמה/)
 await assert.rejects(prepareLoanSourceRecovery(p,'loan','?year=2026&month=2',{kind:'bank',records:r}),/אין תנועות חסרות/)
 const foreign=clone(p);foreign.bankImport.entries[0].accountId='other';await assert.rejects(prepareLoanSourceRecovery(foreign,'loan','?year=2026&month=1',{kind:'bank',records:r}))
 for(const parsed of [{kind:'card',records:r},{kind:'bank',records:[{...r[0],valid:false}]},{kind:'bank',records:[{...r[0],currency:'USD'}]}])await assert.rejects(prepareLoanSourceRecovery(p,'loan','?year=2026&month=1',parsed))
})
test('Ambiguous duplicate identities and already complete sources are never overwritten',async()=>{
 const {p,r}=await legacy();await assert.rejects(prepareLoanSourceRecovery(p,'loan','?year=2026&month=1',{kind:'bank',records:[r[0],{...r[0],line:2}]}),/לא נמצאה התאמה/)
 const recovered=await prepareLoanSourceRecovery(p,'loan','?year=2026&month=1',{kind:'bank',records:r});const before=clone(recovered.plan)
 await assert.rejects(prepareLoanSourceRecovery(recovered.plan,'loan','?year=2026&month=1',{kind:'bank',records:[{...r[0],valueDate:'2026-01-16'}]}),/אין תנועות חסרות/);assert.deepEqual(recovered.plan,before)
})
test('Source-only recovery uses one guarded write after a lost receipt and refuses stale or viewer writes',async()=>{
 const {createHash}=await import('node:crypto'),{openDatabase}=await import('../server/database.mjs'),{createApp}=await import('../server/app.mjs'),{loadBudgetSnapshot}=await import('../frontend/src/app/budget-api.ts'),{savePreparedPlan,SaveUncertain,SaveConflict}=await import('../frontend/src/app/plan-save.ts'),{db,DB}=openDatabase(':memory:'),origin='https://loan-source.test'
 try{
  for(const user of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user,user,user+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(user).digest('hex'),user,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(user,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})),{p,r}=await legacy()
  for(const user of ['alice','bob'])assert.equal((await req(user,'/api/plan','PUT',{plan:p,revision:0})).status,200)
  let writes=0,lost=true;const fetcher=async(url,init={})=>{const parsed=new URL(url,origin),method=init.method??'GET',response=await req('alice',parsed.pathname+parsed.search,method,init.body?JSON.parse(init.body):undefined);if(method==='PUT'){writes++;if(lost){lost=false;return Response.json({},{status:503})}}return response}
  const snapshot=(await loadBudgetSnapshot('personal',undefined,fetcher)).value,prepared=(await prepareLoanSourceRecovery(snapshot.plan,'loan','?year=2026&month=1',{kind:'bank',records:r})).plan,input={budgetId:'personal',base:snapshot,plan:prepared}
  await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain);const saved=await savePreparedPlan(input,fetcher);assert.equal(saved.recovered,true);assert.equal(writes,1);assert.ok(saved.value.plan.bankImport.entries[0].source);assert.deepEqual(saved.value.plan.months,p.months);assert.deepEqual(forecast(saved.value.plan),forecast(p))
  const stale=clone(prepared);stale.loans[0].name='Stale';await assert.rejects(savePreparedPlan({...input,plan:stale},fetcher),SaveConflict);assert.equal(writes,1);assert.equal((await(await req('bob','/api/plan')).json()).revision,1)
  const house=(await(await req('alice','/api/budgets','POST',{name:'Synthetic'})).json()).id;assert.equal((await req('alice','/api/plan?budget='+house,'PUT',{plan:p,revision:0})).status,200)
  const invite=await(await req('alice','/api/budgets/'+house+'/invites','POST',{email:'bob@example.test',role:'viewer'})).json();await req('bob','/api/budgets/accept','POST',{token:invite.token})
  assert.equal((await req('bob','/api/plan?budget='+house,'PUT',{plan:prepared,revision:1,accountId:'bob',budgetId:house})).status,403);assert.equal((await(await req('alice','/api/plan?budget='+house)).json()).revision,1)
 }finally{db.close()}
})
