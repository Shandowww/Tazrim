import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {zero,clone,validatePlan,forecast} from '../src/budget.js'
import {cardDateValid,cardDiscountReminderOn,cardMetadataValid} from '../src/card-metadata.js'
import {initialCardDraft,prepareCardConfig} from '../frontend/src/app/card-command.ts'
import {actionIssues,actionIssueVisible,validActionTarget} from '../src/action-center-model.js'
import {reportActionDestination} from '../frontend/src/app/action-center-api.ts'
import {savedCardProvider,savedCardIssuer,savedCardNetwork} from '../frontend/src/app/budget-adapter.js'
import {openDatabase} from '../server/database.mjs'
import {createApp} from '../server/app.mjs'
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts'
import {savePreparedPlan,SaveUncertain,SaveConflict} from '../frontend/src/app/plan-save.ts'
const base=()=>({startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:{...zero(),card1:100},months:{'2026-10':{actual:true,includesPlannedCard:false,values:{...zero(),card1:75}}},expenses:[],demo:false,creditCards:[{id:'card1',name:'כרטיס אישי',alias:'0394',provider:'cal',billingDay:15}]})
const draft=p=>({...initialCardDraft(p,'card1'),issuer:'cal',club:'hot',network:'mastercard',discountEndsOn:'2026-12-31',feeAfterDiscount:'19.90',issuerPhone:'03-1234567'})
test('Optional metadata round-trips, clears deliberately and preserves every existing financial field and forecast',()=>{
 const p=base(),before=clone(p),next=prepareCardConfig(p,'card1',draft(p));assert.ok(validatePlan(next));assert.equal(next.creditCards[0].feeAfterDiscount,19.9);assert.equal(savedCardIssuer(next,next.creditCards[0]),'cal');assert.equal(savedCardNetwork(next,next.creditCards[0]),'mastercard')
 for(const key of ['defaults','months','expenses'])assert.deepEqual(next[key],p[key]);assert.deepEqual(forecast(next),forecast(p));assert.deepEqual(p,before)
 assert.deepEqual(prepareCardConfig(next,'card1',initialCardDraft(next,'card1')),next)
 const changed=prepareCardConfig(next,'card1',{...initialCardDraft(next,'card1'),issuer:'max'});assert.equal(savedCardProvider(changed,changed.creditCards[0]),'max');assert.equal(changed.creditCards[0].provider,'cal')
 const cleared=prepareCardConfig(next,'card1',{...initialCardDraft(next,'card1'),issuer:'',club:'',network:'',discountEndsOn:'',feeAfterDiscount:'',issuerPhone:''});assert.deepEqual(cleared,p)
 const free=prepareCardConfig(p,'card1',{...draft(p),feeAfterDiscount:'0'});assert.equal(free.creditCards[0].feeAfterDiscount,0)
})
test('Malformed optional data is refused by commands and the shared server/import validator',()=>{
 const p=base(),d=draft(p)
 for(const change of [{issuer:'other'},{club:'other'},{network:'unknown'},{discountEndsOn:'2026-02-29'},{discountEndsOn:'2026-04-31'},{feeAfterDiscount:'-1'},{feeAfterDiscount:'19.999'},{feeAfterDiscount:'1e3'},{feeAfterDiscount:'100001'},{issuerPhone:'javascript:alert(1)'},{issuerPhone:'123'.repeat(20)}])assert.throws(()=>prepareCardConfig(p,'card1',{...d,...change}))
 for(const change of [{issuer:3},{club:[]},{discountEndsOn:'2026-02-30'},{feeAfterDiscount:NaN},{feeAfterDiscount:-1},{feeAfterDiscount:1.001},{issuerPhone:'<script>'}]){const bad=clone(p);Object.assign(bad.creditCards[0],change);assert.equal(validatePlan(bad),false)}
 assert.ok(cardMetadataValid({}));assert.ok(cardMetadataValid({issuerPhone:'*3333'}));assert.equal(cardDateValid('2024-02-29'),true)
})
test('Reminder starts one calendar month before expiry, clamps month ends and stays actionable until renewed',()=>{
 for(const [end,expected]of [['2026-03-31','2026-02-28'],['2024-03-31','2024-02-29'],['2026-01-31','2025-12-31'],['2026-12-15','2026-11-15']])assert.equal(cardDiscountReminderOn(end),expected)
 const p=prepareCardConfig(base(),'card1',draft(base())),facts=day=>actionIssues(p,{scope:'alice/personal',asOf:day.slice(0,7),day})
 assert.equal(facts('2026-11-29').length,0);const issue=facts('2026-11-30')[0];assert.equal(issue.code,'card.discount-ending');assert.match(issue.effect,/19\.90/);assert.ok(validActionTarget(issue.target));assert.match(reportActionDestination('?budget=family&year=2026&month=9',issue).href,/^\/card-setup\/card1\?.*budget=family/)
 assert.match(facts('2027-01-01')[0].title,/הסתיימה/)
 const preferences={[issue.key]:{evidence:issue.evidence,until:200}};assert.equal(actionIssueVisible(issue,preferences,199),false);assert.equal(actionIssueVisible(issue,preferences,200),true)
 p.creditCards[0].discountEndsOn='2027-01-31';assert.equal(facts('2026-12-30').length,0);const renewed=facts('2026-12-31')[0];assert.notEqual(renewed.evidence,issue.evidence);assert.equal(actionIssueVisible(renewed,preferences,100),true)
 p.creditCards[0].removedFrom='2026-12';assert.equal(facts('2026-12-31').length,0)
 assert.equal(actionIssues(p,{scope:'alice/personal',asOf:'2026-12',day:'2026-12-31',locked:true}).some(i=>i.code==='card.discount-ending'),false)
 assert.equal(validActionTarget({screen:'card',target:'../../other'}),false)
})
test('Card fee reminder and snooze identity are private to each actor/budget and missing optional fields create no tasks',()=>{
 const p=base();assert.equal(actionIssues(p,{asOf:'2026-11',day:'2026-11-10'}).length,0)
 Object.assign(p.creditCards[0],{discountEndsOn:'2026-12-01'})
 const issue=scope=>actionIssues(p,{scope,asOf:'2026-11',day:'2026-11-10'})[0],a=issue('alice/personal'),b=issue('bob/personal'),shared=issue('alice/family')
 assert.notEqual(a.key,b.key);assert.notEqual(a.key,shared.key);assert.equal(actionIssueVisible(b,{[a.key]:{evidence:a.evidence,until:200}},100),true)
})
test('Real guarded metadata save recovers a lost result once and refuses stale revisions and shared viewer writes',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://card-metadata.test',hash=s=>createHash('sha256').update(s).digest('hex')
 try{
  for(const u of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(u,u,u+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(u),u,Date.now()+3600000)}
  const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test']}),req=(u,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+u,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))
  for(const u of ['alice','bob'])await req(u,'/api/plan','PUT',{plan:base(),revision:0})
  let lost=true,puts=0;const fetcher=async(path,opt={})=>{if(opt.method==='PUT'){puts++;const r=await req('alice',path,'PUT',JSON.parse(opt.body));if(lost){lost=false;return Response.json({error:'lost'},{status:503})}return r}return req('alice',path)}
  const initial=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,input={budgetId:'personal',base:initial,plan:prepareCardConfig(initial.plan,'card1',draft(initial.plan))}
  await assert.rejects(savePreparedPlan(input,fetcher),SaveUncertain);const saved=await savePreparedPlan(input,fetcher);assert.equal(saved.recovered,true);assert.equal(puts,1);assert.equal(saved.value.revision,2);assert.deepEqual(saved.value.plan.months,initial.plan.months);assert.equal(saved.value.plan.creditCards[0].feeAfterDiscount,19.9)
  await assert.rejects(savePreparedPlan({...input,plan:prepareCardConfig(initial.plan,'card1',{...draft(initial.plan),feeAfterDiscount:'10'})},fetcher),SaveConflict)
  assert.equal((await(await req('bob','/api/plan')).json()).revision,1)
  const house=(await(await req('alice','/api/budgets','POST',{name:'בדיקה משותפת'})).json()).id;await req('alice','/api/plan?budget='+house,'PUT',{plan:base(),revision:0});const invite=await(await req('alice','/api/budgets/'+house+'/invites','POST',{email:'bob@example.test',role:'viewer'})).json();await req('bob','/api/budgets/accept','POST',{token:invite.token})
  assert.equal((await req('bob','/api/plan?budget='+house,'PUT',{plan:input.plan,revision:1})).status,403)
 }finally{db.close()}
})
