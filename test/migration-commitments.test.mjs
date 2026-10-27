import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,generateKeyPairSync,randomBytes} from 'node:crypto';
import {zero,clone,validatePlan,forecast,cashAccountForecast} from '../src/budget.js';
import {prepareManualAccountMigration} from '../src/manual-account-migration.js';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
const base=()=>({startMonth:'2026-01',opening:0,buffer:100,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true});
const item=(id,account,extra={})=>({id,name:'פריט '+id,amount:100.01,fees:0.02,firstMonth:'2026-01',payments:3,source:'direct',kind:'expense',cashAccountId:account,...extra});
function fixture(){
 const p=base();p.opening=9000.25;p.defaults.salary=3000;p.cashPlanning={accounts:[{id:'a',label:'נבחר',opening:3000.10,buffer:0,defaults:{...zero(),salary:1000}},{id:'b',label:'נשאר',opening:6000.15,buffer:0,defaults:{...zero(),salary:2000}}],months:{'2026-01':{a:{values:{...zero(),salary:1000,variable:33.35,loanRepayment:22.21},actual:true,includesPlannedCard:false,includesPlannedDirect:true},b:{values:{...zero(),salary:2000,variable:15},actual:true,includesPlannedCard:false,includesPlannedDirect:true}}},cardAccounts:{},transfers:[]};
 p.months['2026-01']={values:{...zero(),salary:3000,variable:48.35,loanRepayment:22.21},actual:true,includesPlannedCard:false,includesPlannedDirect:true};
 p.expenses=[item('move','a'),item('stay','b',{amount:45,fees:0,payments:3}),item('gift','a',{amount:120.05,fees:0,kind:'income',firstMonth:'2026-03',payments:1}),item('late','a',{amount:129.99,fees:0.01,firstMonth:'2027-02',payments:3})];
 p.loans=[{id:'loan-a',name:'הלוואה נבחרת',monthly:22.21,from:'2026-01',months:26,cashAccountId:'a'},{id:'loan-b',name:'הלוואה נשארת',monthly:12.34,from:'2026-02',months:25,cashAccountId:'b'}];assert.ok(validatePlan(p));return p;
}
const opts={user:'tal',sourceId:'personal',targetId:'house',accountId:'a'};
test('Assigned commitments, scheduled income and loans retain identity/terms/payer while every other item stays byte-identical',()=>{
 const p=fixture(),q=base(),before=JSON.stringify([p,q]),r=prepareManualAccountMigration(p,q,opts);assert.equal(r.eligible,true);assert.equal(JSON.stringify([p,q]),before);
 assert.deepEqual(r.targetAfter.expenses,p.expenses.filter(e=>e.cashAccountId==='a'));assert.deepEqual(r.sourceAfter.expenses,p.expenses.filter(e=>e.cashAccountId==='b'));assert.deepEqual(r.targetAfter.loans,[p.loans[0]]);assert.deepEqual(r.sourceAfter.loans,[p.loans[1]]);
 assert.equal(r.manifest.commitments.length,3);assert.equal(r.manifest.loans.length,1);assert.equal(r.manifest.commitments[0].totalCents,10003);assert.equal(r.manifest.loans[0].monthlyCents,2221);
 assert.notEqual(r.manifest.loans[0].sourceRef,r.manifest.loans[0].targetRef);assert.equal(r.manifest.commitments.find(e=>e.id==='gift').kind,'income');
});
test('Full extended horizon conserves exact cents, installment remainder, loan schedules and both account projections without double charging actual months',()=>{
 const p=fixture(),r=prepareManualAccountMigration(p,base(),opts),before=forecast(p),length=before.length;assert.equal(length,26);assert.equal(r.manifest.comparisons.length,26);
 const from=forecast(r.sourceAfter,undefined,length),to=forecast(r.targetAfter,undefined,length);
 for(let i=0;i<length;i++)for(const key of ['income','spending','saving','planned','net','balance','incomingTransfers','outgoingTransfers'])assert.equal(Math.round((from[i][key]+to[i][key])*100),Math.round(before[i][key]*100),`${i}:${key}`);
 assert.equal(to[0].planned,0);assert.equal(to[1].planned,33.34);assert.equal(to[2].planned,-86.7);assert.equal(to[12].spending,55.56);assert.equal(forecast(r.targetAfter,undefined,27)[26].spending,33.35);assert.equal(Math.round((to[25].spending-forecast(r.targetAfter,undefined,27)[26].spending)*100),2221);
 for(const [id,after]of [['a',r.targetAfter],['b',r.sourceAfter]])assert.deepEqual(cashAccountForecast(after,id,[],length).map(({net,balance})=>({net,balance})),cashAccountForecast(p,id,[],length).map(({net,balance})=>({net,balance})));
 for(const row of r.manifest.comparisons)assert.equal(row.flows.find(f=>f.field==='planned').beforeCents,row.flows.find(f=>f.field==='planned').sourceAfterCents+row.flows.find(f=>f.field==='planned').targetAfterCents);
});
test('Single-account fallback, card-backed commitments, unknown item metadata and nonempty destinations are refused',()=>{
 for(const change of [p=>delete p.expenses[0].cashAccountId,p=>p.expenses[0].source='card',p=>p.expenses[0].cardId='card1',p=>p.expenses[0].privateNote='must not silently copy',p=>delete p.loans[0].cashAccountId,p=>p.loans[0].document='unreviewed']){
  const p=fixture();change(p);const before=JSON.stringify(p),r=prepareManualAccountMigration(p,base(),opts);assert.equal(r.eligible,false);assert.equal(JSON.stringify(p),before);
 }
 const q=base();q.expenses=[item('old','missing')];assert.equal(prepareManualAccountMigration(fixture(),q,opts).eligible,false);
 const single=fixture();single.cashPlanning.accounts=single.cashPlanning.accounts.slice(0,1);single.expenses=single.expenses.filter(e=>e.cashAccountId==='a');delete single.expenses[0].cashAccountId;single.loans=single.loans.slice(0,1);single.opening=3000.1;single.defaults.salary=1000;delete single.cashPlanning.months['2026-01'].b;single.months['2026-01'].values.salary=1000;single.months['2026-01'].values.variable=33.35;assert.equal(prepareManualAccountMigration(single,base(),opts).eligible,false);
});
test('Review names are escaped and scheduled payments remain explicitly separate from actual payment confirmation',()=>{
 const r=prepareManualAccountMigration(fixture(),base(),opts);r.manifest.commitments[0].name='<img src=x>';r.manifest.loans[0].name='<script>bad</script>';
 const c=vm.createContext({esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),money:n=>String(n)});vm.runInContext(readFileSync('src/space-migration-execution-client.js','utf8'),c);const html=c.migrationCommitmentsView(r.manifest);
 assert.doesNotMatch(html,/<img|<script>/);assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/אינה מאשרת שבוצע תשלום/);assert.match(html,/2027-02/);assert.match(html,/הכנסה מתוכננת/);
});
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
test('Atomic server apply and undo move dependencies and projections together; a modified schedule or concurrent review cannot overwrite later work',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://migration-items.test',key=randomBytes(32);try{
 db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run('tal','tal','tal@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update('session').digest('hex'),'tal',Date.now()+60000);
 const app=createApp({db,DB,origin,allowedEmails:['tal@example.test'],reportOptions:{key,recoveryPublicKey:pair.publicKey}}),req=(path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session=session','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 const p=fixture();assert.equal((await req('/api/plan','PUT',{plan:p,revision:0})).status,200);const id=(await(await req('/api/budgets','POST',{name:'יעד'})).json()).id;await req('/api/plan?budget='+id,'PUT',{plan:base(),revision:0});
 const input={accountId:'tal',source:'personal',target:id,bankAccount:'a',sourceRevision:1,targetRevision:1},prep=await(await req('/api/space-migrations?'+new URLSearchParams(input))).json();assert.equal(prep.eligible,true);assert.equal(prep.manifest.loans.length,1);
 const body={...input,reviewToken:prep.reviewToken,confirmedPrivacy:true,confirmedMove:true,action:'apply',operation:crypto.randomUUID()};assert.equal((await req('/api/space-migrations','POST',body)).status,200);
 let to=await(await req('/api/plan?budget='+id)).json(),from=await(await req('/api/plan')).json();assert.equal(to.plan.expenses.length,3);assert.equal(to.plan.loans.length,1);assert.equal(from.plan.expenses.length,1);assert.equal(from.plan.loans[0].id,'loan-b');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM financial_entities WHERE scope=? AND kind='loans'").get('budget:'+id).n,1);
 assert.equal((await req('/api/space-migrations','POST',{accountId:'tal',action:'undo',operation:body.operation,sourceRevision:2,targetRevision:2,confirmedUndo:true})).status,200);assert.deepEqual((await(await req('/api/plan')).json()).plan,p);
 const input2={...input,sourceRevision:3,targetRevision:3},prep2=await(await req('/api/space-migrations?'+new URLSearchParams(input2))).json(),changed=clone(p);changed.loans[0].monthly=44.44;await req('/api/plan','PUT',{plan:changed,revision:3});
 assert.equal((await req('/api/space-migrations','POST',{...body,...input2,operation:crypto.randomUUID(),reviewToken:prep2.reviewToken})).status,409);assert.equal((await(await req('/api/plan')).json()).plan.loans[0].monthly,44.44);assert.equal((await(await req('/api/plan?budget='+id)).json()).plan.expenses.length,0);
 }finally{db.close();}
});
