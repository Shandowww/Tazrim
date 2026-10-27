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
const cheque=(id,account,extra={})=>({id,name:'צ׳ק '+id,category:'דיור',method:'checks',amount:23.45,month:'2027-03',date:'2027-03-17',number:'00123',status:'pending',accounting:'additional',cashAccountId:account,...extra});
function fixture(){const p=base();p.opening=300;p.cashPlanning={accounts:[{id:'a',label:'נבחר',opening:100,buffer:0,defaults:zero()},{id:'b',label:'פרטי',opening:200,buffer:0,defaults:zero()}],months:{},cardAccounts:{},transfers:[]};p.details=[cheque('pending','a'),cheque('included','a',{accounting:'included',status:'cleared'}),cheque('cancelled','a',{status:'cancelled'}),cheque('cleared','a',{status:'cleared'}),cheque('private','b',{name:'private description',amount:17.89})];assert.ok(validatePlan(p));return p;}
const opts={user:'tal',sourceId:'personal',targetId:'house',accountId:'a'};
test('Manual cheques preserve exact identity, accounting, status and full dated horizon without duplicated charges',()=>{
 const p=fixture(),q=base(),original=JSON.stringify([p,q]),r=prepareManualAccountMigration(p,q,opts);assert.equal(r.eligible,true);assert.equal(JSON.stringify([p,q]),original);assert.deepEqual(r.targetAfter.details,p.details.slice(0,4));assert.deepEqual(r.sourceAfter.details,[p.details[4]]);assert.equal(r.manifest.cheques.length,4);assert.equal(r.manifest.cheques[0].amountCents,2345);assert.notEqual(r.manifest.cheques[0].sourceRef,r.manifest.cheques[0].targetRef);
 assert.equal(cashAccountForecast(p,'a').length,15);assert.equal(cashAccountForecast(r.targetAfter,'a').length,15);const before=forecast(p),from=forecast(r.sourceAfter,undefined,before.length),to=forecast(r.targetAfter,undefined,before.length);assert.equal(before.length,15);assert.equal(to[14].planned,46.90);assert.equal(from[14].planned,17.89);
 for(let i=0;i<before.length;i++)for(const k of ['income','spending','saving','planned','net','balance','incomingTransfers','outgoingTransfers'])assert.equal(Math.round((from[i][k]+to[i][k])*100),Math.round(before[i][k]*100));
 for(const [id,after]of [['a',r.targetAfter],['b',r.sourceAfter]])assert.deepEqual(cashAccountForecast(after,id,[],15).map(({net,balance})=>({net,balance})),cashAccountForecast(p,id,[],15).map(({net,balance})=>({net,balance})));
});
test('Account forecasts cover complete cheque and loan horizons without an explicit caller horizon',()=>{
 const p=fixture();p.loans=[{id:'long-loan',name:'הלוואה',monthly:1.23,from:'2026-01',months:26,cashAccountId:'a'}];const r=prepareManualAccountMigration(p,base(),opts);assert.equal(r.eligible,true);assert.equal(cashAccountForecast(p,'a').length,26);assert.equal(cashAccountForecast(r.targetAfter,'a').length,26);assert.equal(cashAccountForecast(p,'a')[14].planned,46.90);assert.equal(cashAccountForecast(p,'a')[25].spending,1.23);
});
test('Unassigned, imported, linked, card or unreviewed detail metadata and populated target details are refused',()=>{
 for(const change of [p=>delete p.details[0].cashAccountId,p=>p.details[0].method='variable',p=>p.details[0].statement={key:'private'},p=>p.details[0].cardId='card1',p=>p.details[0].source='bank',p=>p.details[0].note='private']){const p=fixture();change(p);assert.equal(prepareManualAccountMigration(p,base(),opts).eligible,false);}
 const q=base();q.details=[cheque('existing',undefined)];delete q.details[0].cashAccountId;assert.ok(validatePlan(q));assert.equal(prepareManualAccountMigration(fixture(),q,opts).eligible,false);
 const p=fixture();p.cashPlanning.accounts=p.cashPlanning.accounts.slice(0,1);p.opening=100;p.details=p.details.slice(0,4);delete p.details[0].cashAccountId;assert.equal(prepareManualAccountMigration(p,base(),opts).eligible,false);
});
test('Exact cheque disclosure escapes private descriptions and preserves numbers, dates and payment distinctions',()=>{
 const r=prepareManualAccountMigration(fixture(),base(),opts);r.manifest.cheques[0].name='<img src=x>';r.manifest.cheques[0].number='<script>';const c=vm.createContext({esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),money:n=>String(n)});vm.runInContext(readFileSync('src/space-migration-execution-client.js','utf8'),c);const html=c.migrationChequesView(r.manifest);assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('private description'));for(const value of ['2027-03-17','00123','ממתין','נפרע','בוטל','כלול בסכום','נוסף לסכום','אינו מאשר פירעון'])assert.ok(html.includes(value),value);
});
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
test('Atomic server apply and undo move dependencies and projections together; a modified schedule or concurrent review cannot overwrite later work',async()=>{
 const {db,DB}=openDatabase(':memory:'),origin='https://migration-items.test',key=randomBytes(32);try{
 db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run('tal','tal','tal@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update('session').digest('hex'),'tal',Date.now()+60000);
 const app=createApp({db,DB,origin,allowedEmails:['tal@example.test'],reportOptions:{key,recoveryPublicKey:pair.publicKey}}),req=(path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session=session','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 const p=fixture();assert.equal((await req('/api/plan','PUT',{plan:p,revision:0})).status,200);const id=(await(await req('/api/budgets','POST',{name:'יעד'})).json()).id;await req('/api/plan?budget='+id,'PUT',{plan:base(),revision:0});
 const input={accountId:'tal',source:'personal',target:id,bankAccount:'a',sourceRevision:1,targetRevision:1},prep=await(await req('/api/space-migrations?'+new URLSearchParams(input))).json();assert.equal(prep.eligible,true);assert.equal(prep.manifest.cheques.length,4);
 const body={...input,reviewToken:prep.reviewToken,confirmedPrivacy:true,confirmedMove:true,action:'apply',operation:crypto.randomUUID()};assert.equal((await req('/api/space-migrations','POST',body)).status,200);
 let to=await(await req('/api/plan?budget='+id)).json(),from=await(await req('/api/plan')).json();assert.deepEqual(to.plan.details,p.details.slice(0,4));assert.deepEqual(from.plan.details,[p.details[4]]);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM financial_transactions WHERE scope=? AND source='manual-detail'").get('budget:'+id).n,4);
 assert.equal((await req('/api/space-migrations','POST',{accountId:'tal',action:'undo',operation:body.operation,sourceRevision:2,targetRevision:2,confirmedUndo:true})).status,200);assert.deepEqual((await(await req('/api/plan')).json()).plan,p);
 const input2={...input,sourceRevision:3,targetRevision:3},prep2=await(await req('/api/space-migrations?'+new URLSearchParams(input2))).json(),changed=clone(p);changed.details[0].amount=44.44;await req('/api/plan','PUT',{plan:changed,revision:3});
 assert.equal((await req('/api/space-migrations','POST',{...body,...input2,operation:crypto.randomUUID(),reviewToken:prep2.reviewToken})).status,409);assert.equal((await(await req('/api/plan')).json()).plan.details[0].amount,44.44);assert.equal((await(await req('/api/plan?budget='+id)).json()).plan.details?.length??0,0);
 }finally{db.close();}
});
