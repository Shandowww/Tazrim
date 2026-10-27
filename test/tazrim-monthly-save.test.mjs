import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {zero,clone} from '../src/budget.js'
import {loadBudgetSnapshot,AccessError} from '../frontend/src/app/budget-api.ts'
import {prepareCardConfig,initialCardDraft} from '../frontend/src/app/card-command.ts'
import {prepareManualAccount,initialAccountDraft} from '../frontend/src/app/account-command.ts'
import {savePreparedPlan} from '../frontend/src/app/plan-save.ts'
import {initialMonthlyDraft,saveMonthlyReport,SaveConflict,SaveUncertain,WritePermissionError} from '../frontend/src/app/monthly-report.ts'
const base=()=>({startMonth:'2026-01',opening:1000,buffer:100,horizon:24,defaults:{...zero(),salary:1000},months:{},expenses:[],demo:false,setupCompleted:true})
async function harness(){
 const {db,DB}=openDatabase(':memory:'),origin='https://monthly.test';for(const id of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(id,id,id+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(id).digest('hex'),id,Date.now()+60000)}
 const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(user,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));for(const user of ['alice','bob'])await req(user,'/api/plan','PUT',{plan:{...base(),profileName:user},revision:0})
 const calls=[];let user='alice',intercept=null
 const fetcher=async(path,options={})=>{calls.push({path,method:options.method||'GET',body:options.body});if(intercept){const response=await intercept(path,options);if(response)return response}return app(new Request(origin+path,{...options,headers:{...options.headers,origin,cookie:'__Host-mf_session='+user}}))}
 const snapshot=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,draft=initialMonthlyDraft(snapshot.plan,'2026-10');draft.values.salary='1234.56';draft.actual=true;calls.length=0
 return{db,req,fetcher,calls,input:{budgetId:'personal',base:snapshot,month:'2026-10',asOf:'2026-10',draft},setUser:u=>user=u,intercept:fn=>intercept=fn}
}
test('One explicit React monthly save persists exact data and revision through the real app and reloads without changing another user',async()=>{
 const h=await harness();try{const before=JSON.stringify(h.input),result=await saveMonthlyReport(h.input,h.fetcher),saved=await(await h.req('alice','/api/plan')).json();assert.equal(result.value.revision,2);assert.equal(result.recovered,false);assert.equal(saved.plan.months['2026-10'].values.salary,1234.56);assert.equal(saved.plan.months['2026-10'].actual,true);assert.equal((await(await h.req('bob','/api/plan')).json()).revision,1);assert.equal(JSON.stringify(h.input),before);const writes=h.calls.filter(r=>r.method==='PUT');assert.equal(writes.length,1);assert.equal(JSON.parse(writes[0].body).accountId,'alice');assert.equal(result.value.accountId,'alice')}finally{h.db.close()}
})
test('A concurrent update before or during PUT never silently overwrites and preserves the submitted draft',async()=>{
 const h=await harness();try{let once=true;h.intercept(async(path,options)=>{if(options.method==='PUT'&&once){once=false;const p=clone(h.input.base.plan);p.buffer=999;await h.req('alice',path,'PUT',{plan:p,revision:1,accountId:'alice'})}});await assert.rejects(saveMonthlyReport(h.input,h.fetcher),SaveConflict);assert.equal((await(await h.req('alice','/api/plan')).json()).plan.buffer,999);assert.equal(h.input.draft.values.salary,'1234.56');h.calls.length=0;await assert.rejects(saveMonthlyReport(h.input,h.fetcher),SaveConflict);assert.equal(h.calls.filter(r=>r.method==='PUT').length,0)}finally{h.db.close()}
})
test('An uncertain committed response recovers on an explicit retry without another PUT or duplicate revision',async()=>{
 const h=await harness();try{let once=true;h.intercept(async(path,options)=>{if(options.method==='PUT'&&once){once=false;await h.req('alice',path,'PUT',JSON.parse(options.body));return Response.json({error:'synthetic lost receipt'},{status:503})}});await assert.rejects(saveMonthlyReport(h.input,h.fetcher),SaveUncertain);assert.equal((await(await h.req('alice','/api/plan')).json()).revision,2);const result=await saveMonthlyReport(h.input,h.fetcher);assert.equal(result.recovered,true);assert.equal(result.value.revision,2);assert.equal(h.calls.filter(r=>r.method==='PUT').length,1)}finally{h.db.close()}
})
test('A session switch between preflight and PUT is refused by the account-bound API and clears the client identity',async()=>{
 const h=await harness();try{h.intercept(async(path,options)=>{if(options.method==='PUT')h.setUser('bob')});await assert.rejects(saveMonthlyReport(h.input,h.fetcher),AccessError);for(const user of ['alice','bob']){const read=await(await h.req(user,'/api/plan')).json();assert.equal(read.revision,1);assert.equal(read.plan.profileName,user);assert.equal(read.plan.months['2026-10'],undefined)}}finally{h.db.close()}
})
test('Legacy capabilities and a viewer downgrade block the React PUT before it is sent',async()=>{
 const h=await harness();try{h.intercept(async(path)=>{if(path.startsWith('/api/plan')){const value=await(await h.req('alice',path)).json();delete value.writeIdentityBound;return Response.json(value)}});await assert.rejects(saveMonthlyReport(h.input,h.fetcher),/עדיין לא תומך/);assert.equal(h.calls.filter(r=>r.method==='PUT').length,0)
 h.intercept(null);const target=(await(await h.req('alice','/api/budgets','POST',{name:'בית'})).json()).id;await h.req('alice','/api/plan?budget='+target,'PUT',{plan:base(),revision:0});const invite=await(await h.req('alice','/api/budgets/'+target+'/invites','POST',{email:'bob@example.test',role:'viewer'})).json();await h.req('bob','/api/budgets/accept','POST',{token:invite.token});h.setUser('bob');const snapshot=(await loadBudgetSnapshot(target,new AbortController().signal,h.fetcher)).value;h.calls.length=0;await assert.rejects(saveMonthlyReport({...h.input,budgetId:target,base:snapshot},h.fetcher),WritePermissionError);assert.equal(h.calls.filter(r=>r.method==='PUT').length,0)}finally{h.db.close()}
})

test('Manual account creation saves exact fields through the shared account-bound command and reloads only in the selected budget',async()=>{
 const h=await harness();try{const original=clone(h.input.base.plan),draft={...initialAccountDraft(original,'','2026-10'),label:'חשבון חדש',color:'blue',buffer:'50.01',opening:'-200.25',openingMonth:'2026-01'},plan=prepareManualAccount(original,'stable-account',draft,{create:true,asOf:'2026-10'})
 const result=await savePreparedPlan({budgetId:'personal',base:h.input.base,plan},h.fetcher),saved=await(await h.req('alice','/api/plan')).json();assert.equal(result.value.revision,2);assert.deepEqual(saved.plan,plan);assert.equal(saved.plan.cashPlanning.accounts[0].opening,-200.25);assert.equal(saved.plan.opening,original.opening);assert.equal((await(await h.req('bob','/api/plan')).json()).plan.cashPlanning,undefined);assert.equal(h.calls.filter(row=>row.method==='PUT').length,1)
 }finally{h.db.close()}
})
test('An uncertain account creation receipt is acknowledged on retry without creating another account or revision',async()=>{
 const h=await harness();try{const plan=prepareManualAccount(h.input.base.plan,'stable-account',{...initialAccountDraft(h.input.base.plan,'','2026-10'),label:'חדש'},{create:true,asOf:'2026-10'});let once=true
 h.intercept(async(path,options)=>{if(options.method==='PUT'&&once){once=false;await h.req('alice',path,'PUT',JSON.parse(options.body));return Response.json({error:'lost account receipt'},{status:503})}})
 const input={budgetId:'personal',base:h.input.base,plan};await assert.rejects(savePreparedPlan(input,h.fetcher),SaveUncertain);const result=await savePreparedPlan(input,h.fetcher);assert.equal(result.recovered,true);assert.equal(result.value.revision,2);assert.equal(result.value.plan.cashPlanning.accounts.length,1);assert.equal(h.calls.filter(row=>row.method==='PUT').length,1)
 }finally{h.db.close()}
})

test('Card configuration uses the guarded save API and exact retry acknowledgment without duplicating cards or changing another user',async()=>{
 const h=await harness();try{const plan=prepareCardConfig(h.input.base.plan,'card_api-new',{name:'כרטיס API',alias:'4321',billingDay:'05',payer:''},true),input={budgetId:'personal',base:h.input.base,plan};let once=true
 h.intercept(async(path,options)=>{if(options.method==='PUT'&&once){once=false;await h.req('alice',path,'PUT',JSON.parse(options.body));return Response.json({error:'lost card receipt'},{status:503})}})
 await assert.rejects(savePreparedPlan(input,h.fetcher),SaveUncertain);const saved=await savePreparedPlan(input,h.fetcher);assert.equal(saved.recovered,true);assert.equal(saved.value.revision,2);assert.equal(saved.value.plan.creditCards.filter(c=>c.id==='card_api-new').length,1);assert.equal(saved.value.plan.defaults['card_api-new'],0);assert.equal((await(await h.req('bob','/api/plan')).json()).revision,1);assert.equal(h.calls.filter(r=>r.method==='PUT').length,1)
 const draft={...initialCardDraft(saved.value.plan,'card_api-new'),name:'כרטיס שונה'},edit=prepareCardConfig(saved.value.plan,'card_api-new',draft);await savePreparedPlan({budgetId:'personal',base:saved.value,plan:edit},h.fetcher);const loaded=await(await h.req('alice','/api/plan')).json();assert.equal(loaded.revision,3);assert.equal(loaded.plan.creditCards.find(c=>c.id==='card_api-new').name,'כרטיס שונה');assert.deepEqual(loaded.plan.months,h.input.base.plan.months)
 }finally{h.db.close()}
})
