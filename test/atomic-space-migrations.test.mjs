import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createVault} from '../src/vault.js';
import assert from 'node:assert/strict';
import {createHash,randomBytes,generateKeyPairSync} from 'node:crypto';
import {zero,clone,validatePlan,forecast,cashAccountForecast} from '../src/budget.js';
import {prepareManualAccountMigration} from '../src/manual-account-migration.js';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {createSpaceMigrations} from '../server/space-migrations.mjs';
import {openReport,verifyStoredReports} from '../server/report-crypto.mjs';
const base=()=>({startMonth:'2026-01',opening:0,buffer:100,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true});
function fixture(){
 const p=base();p.opening=1000.25;p.defaults.salary=100;p.cashPlanning={accounts:[{id:'a',label:'חשבון לבדיקה',opening:300.10,buffer:25,defaults:{...zero(),salary:75}},{id:'b',label:'שני',opening:700.15,buffer:50,defaults:{...zero(),salary:25}}],months:{'2026-02':{a:{values:{...zero(),salary:123.45,outgoingTransfers:10.01},actual:true,includesPlannedCard:false,includesPlannedDirect:false,balance:413.54,date:'2026-02-28'},b:{values:{...zero(),salary:30},actual:true,includesPlannedCard:false,includesPlannedDirect:false}}},cardAccounts:{},transfers:[]};
 p.months['2026-02']={values:{...zero(),salary:153.45,outgoingTransfers:10.01},actual:true,includesPlannedCard:false,includesPlannedDirect:false};assert.ok(validatePlan(p));return p;
}
const opts={user:'tal',sourceId:'personal',targetId:'house',accountId:'a'};
test('Restricted manual-account preparation preserves cents, recurring estimates, observed balances and every combined forecast period',()=>{
 const p=fixture(),q=base(),before=JSON.stringify([p,q]),r=prepareManualAccountMigration(p,q,opts);assert.equal(r.eligible,true);assert.ok(validatePlan(r.sourceAfter));assert.ok(validatePlan(r.targetAfter));assert.equal(JSON.stringify([p,q]),before);
 assert.equal(r.sourceAfter.opening,700.15);assert.equal(r.targetAfter.opening,300.1);assert.equal(r.sourceAfter.cashPlanning.accounts.length,1);assert.equal(r.targetAfter.cashPlanning.accounts[0].id,'a');assert.equal(r.sourceAfter.defaults.salary,25);assert.equal(r.targetAfter.defaults.salary,75);
 assert.deepEqual(cashAccountForecast(r.targetAfter,'a').map(({balance,net})=>({balance,net})),cashAccountForecast(p,'a').map(({balance,net})=>({balance,net})));
 for(let i=0;i<12;i++)for(const key of ['net','income','spending','balance','outgoingTransfers'])assert.equal(Math.round((forecast(r.sourceAfter)[i][key]+forecast(r.targetAfter)[i][key])*100),Math.round(forecast(p)[i][key]*100));
 for(const row of r.manifest.comparisons)for(const f of row.flows){assert.equal(f.beforeCents,f.sourceAfterCents+f.targetAfterCents);assert.equal(f.targetBeforeCents,0);}
 assert.equal(r.manifest.account.sourceRef,JSON.stringify(['personal:tal','account','a']));assert.equal(r.manifest.account.targetRef,JSON.stringify(['budget:house','account','a']));
});
test('All unsupported, ambiguous or nonempty cases are blocked without modifying either plan',()=>{
 for(const change of [p=>p.bankImport={accounts:[],batches:[],entries:[]},p=>p.cashPlanning.cardAccounts.card1='a',p=>p.cashPlanning.accounts[0].opening=undefined,p=>p.defaults.salary++,p=>p.months['2026-02'].values.salary++,p=>delete p.cashPlanning.months['2026-02'].a,p=>p.cashPlanning.months['2026-02'].a.actual=false,p=>p.cashPlanning.accounts[0].defaults.personalSaving=1]){
  const p=fixture();change(p);const before=JSON.stringify(p);assert.equal(prepareManualAccountMigration(p,base(),opts).eligible,false);assert.equal(JSON.stringify(p),before);
 }
 const nonempty=base();nonempty.opening=1;assert.equal(prepareManualAccountMigration(fixture(),nonempty,opts).eligible,false);
 const otherPeriod=base();otherPeriod.horizon=24;assert.equal(prepareManualAccountMigration(fixture(),otherPeriod,opts).eligible,false);
});
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
async function harness(){
 const {db,DB}=openDatabase(':memory:'),key=randomBytes(32),origin='https://atomic.test';
 for(const id of ['tal','viewer','third']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(id,id,id+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(id).digest('hex'),id,Date.now()+60000);}
 const app=createApp({db,DB,origin,allowedEmails:['tal','viewer','third'].map(id=>id+'@example.test'),reportOptions:{key,recoveryPublicKey:pair.publicKey}});
 const req=(user,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 await req('tal','/api/plan','PUT',{plan:fixture(),revision:0});const target=(await(await req('tal','/api/budgets','POST',{name:'יעד'})).json()).id;await req('tal','/api/plan?budget='+target,'PUT',{plan:base(),revision:0});
 const input={accountId:'tal',source:'personal',target,bankAccount:'a',sourceRevision:1,targetRevision:1};
 const prepared=await(await req('tal','/api/space-migrations?'+new URLSearchParams(input))).json();
 const body={...input,reviewToken:prepared.reviewToken,confirmedPrivacy:true,confirmedMove:true,action:'apply',operation:crypto.randomUUID()};
 return{db,key,req,input,body,target,prepared,app,origin};
}
const tables=db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,db.prepare('SELECT * FROM "'+name+'"').all()]);
test('Atomic HTTP move updates both budgets/projections, keeps private snapshots out of target history, and retry/undo are idempotent',async()=>{
 const h=await harness();try{
 assert.equal(h.prepared.eligible,true);const before=h.db.prepare('SELECT data FROM plans WHERE user_id=?').get('tal').data,targetBefore=h.db.prepare('SELECT data FROM budgets WHERE id=?').get(h.target).data;
 const applied=await h.req('tal','/api/space-migrations','POST',h.body);assert.equal(applied.status,200);const receipt=await applied.json();assert.equal(receipt.status,'applied');assert.equal(receipt.canUndo,true);
 assert.equal((await(await h.req('tal','/api/plan')).json()).revision,2);assert.equal((await(await h.req('tal','/api/plan?budget='+h.target)).json()).plan.cashPlanning.accounts[0].id,'a');
 const projection=h.db.prepare('SELECT revision FROM financial_scopes WHERE scope=?').get('budget:'+h.target);assert.equal(projection.revision,2);
 const privateData=h.db.prepare('SELECT * FROM private_space_migrations').get();assert.equal(Buffer.from(privateData.data).includes(Buffer.from('personal')),false);assert.equal(verifyStoredReports(h.db,h.key),0);
 const journal=h.db.prepare('SELECT * FROM plan_history WHERE scope=? AND revision=2').get('budget:'+h.target);assert.equal(journal.data,null);assert.equal(journal.fields,'["account-migration"]');assert.equal((await h.req('tal','/api/plan-history?budget='+h.target,'POST',{action:'undo',id:journal.id,revision:2})).status,409);
 const snapshot=tables(h.db);assert.equal((await(await h.req('tal','/api/space-migrations','POST',h.body)).json()).replayed,true);assert.deepEqual(tables(h.db),snapshot);assert.equal((await(await h.req('tal','/api/space-migrations','POST',Object.fromEntries(Object.entries(h.body).reverse()))).json()).replayed,true);
 assert.equal((await h.req('tal','/api/space-migrations','POST',{...h.body,bankAccount:'b'})).status,409);
 const undo={action:'undo',operation:h.body.operation,accountId:'tal',sourceRevision:2,targetRevision:2,confirmedUndo:true};assert.equal((await(await h.req('tal','/api/space-migrations','POST',undo)).json()).status,'undone');
 assert.equal(h.db.prepare('SELECT data FROM plans WHERE user_id=?').get('tal').data,before);assert.equal(h.db.prepare('SELECT data FROM budgets WHERE id=?').get(h.target).data,targetBefore);
 assert.equal((await(await h.req('tal','/api/space-migrations','POST',undo)).json()).replayed,true);assert.equal((await(await h.req('tal','/api/space-migrations','POST',h.body)).json()).status,'undone');
 }finally{h.db.close();}
});
test('Failure at every mutation boundary rolls both budgets, projections, history and operation journal back',async()=>{
 for(const point of ['after-source','after-target','after-projections','after-journal']){
  const h=await harness();try{
   const service=createSpaceMigrations(h.db,{isAllowed:()=>true,secret:()=>h.key,fault:p=>{if(p===point)throw Error('synthetic rollback');}}),snapshot=tables(h.db);
   const response=await service(new Request('https://atomic.test/api/space-migrations',{method:'POST',body:JSON.stringify(h.body)}),{id:'tal',email:'tal@example.test'});assert.equal(response.status,500);assert.deepEqual(tables(h.db),snapshot,point);
  }finally{h.db.close();}
 }
 for(const point of ['undo-after-source','undo-after-projections','undo-after-journal']){
  const h=await harness();try{await h.req('tal','/api/space-migrations','POST',h.body);const snapshot=tables(h.db),service=createSpaceMigrations(h.db,{isAllowed:()=>true,secret:()=>h.key,fault:p=>{if(p===point)throw Error('synthetic rollback');}});
   assert.equal((await service(new Request('https://atomic.test/api/space-migrations',{method:'POST',body:JSON.stringify({accountId:'tal',action:'undo',operation:h.body.operation,sourceRevision:2,targetRevision:2,confirmedUndo:true})}),{id:'tal',email:'tal@example.test'})).status,500);assert.deepEqual(tables(h.db),snapshot,point);
  }finally{h.db.close();}
 }
});
test('Revision, privacy-audience, confirmation, authorization and post-move changes prevent stale apply or undo',async()=>{
 const h=await harness();try{
 assert.equal((await h.req('tal','/api/space-migrations','POST',{...h.body,confirmedPrivacy:false})).status,400);assert.equal((await h.req('third','/api/space-migrations','POST',h.body)).status,400);
 const invite=await(await h.req('tal','/api/budgets/'+h.target+'/invites','POST',{email:'viewer@example.test',role:'viewer'})).json();await h.req('viewer','/api/budgets/accept','POST',{token:invite.token});
 assert.equal((await h.req('tal','/api/space-migrations','POST',h.body)).status,409);assert.equal((await h.req('viewer','/api/space-migrations?'+new URLSearchParams({...h.input,accountId:'viewer'}))).status,403);
 const refreshed=await(await h.req('tal','/api/space-migrations?'+new URLSearchParams(h.input))).json();h.body.reviewToken=refreshed.reviewToken;assert.equal((await h.req('tal','/api/space-migrations','POST',h.body)).status,200);
 const target=(await(await h.req('tal','/api/plan?budget='+h.target)).json()).plan;target.buffer=999;await h.req('tal','/api/plan?budget='+h.target,'PUT',{plan:target,revision:2});const snapshot=tables(h.db);
 assert.equal((await h.req('tal','/api/space-migrations','POST',{accountId:'tal',action:'undo',operation:h.body.operation,confirmedUndo:true,sourceRevision:2,targetRevision:3})).status,409);assert.deepEqual(tables(h.db),snapshot);
 assert.equal((await h.req('third','/api/space-migrations?operation='+h.body.operation)).status,404);
 }finally{h.db.close();}
});
test('Moving the final account leaves an empty source, with no invented monthly reports or stale defaults',()=>{
 const p=fixture();p.cashPlanning.accounts=p.cashPlanning.accounts.filter(a=>a.id==='a');delete p.cashPlanning.months['2026-02'].b;p.opening=300.1;p.defaults.salary=75;p.months['2026-02'].values.salary=123.45;
 const r=prepareManualAccountMigration(p,base(),opts);assert.equal(r.eligible,true);assert.equal(r.sourceAfter.opening,0);assert.equal(r.sourceAfter.defaults.salary,0);assert.deepEqual(r.sourceAfter.months,{});assert.deepEqual(r.sourceAfter.cashPlanning.months,{});assert.equal(r.sourceAfter.cashPlanning.accounts.length,0);
});
test('External intake blocks preparation and newly received documents block undo without deleting data',async()=>{
 const h=await harness();try{
 const upload=()=>h.app(new Request(h.origin+'/api/reports?budget=personal',{method:'PUT',headers:{origin:h.origin,cookie:'__Host-mf_session=tal','x-report-name':'synthetic.csv'},body:'synthetic migration intake only'}));
 assert.equal((await upload()).status,201);const blocked=await(await h.req('tal','/api/space-migrations?'+new URLSearchParams(h.input))).json();assert.equal(blocked.eligible,false);assert.ok(blocked.reasons.some(r=>r.code==='external-records'));
 h.db.prepare('DELETE FROM report_sources').run();const prepared=await(await h.req('tal','/api/space-migrations?'+new URLSearchParams(h.input))).json();h.body.reviewToken=prepared.reviewToken;
 assert.equal((await h.req('tal','/api/space-migrations','POST',h.body)).status,200);assert.equal((await upload()).status,201);const before=tables(h.db);
 assert.equal((await h.req('tal','/api/space-migrations','POST',{action:'undo',operation:h.body.operation,accountId:'tal',sourceRevision:2,targetRevision:2,confirmedUndo:true})).status,409);assert.deepEqual(tables(h.db),before);
 }finally{h.db.close();}
});
test('Encrypted snapshots cannot be migrated or downgraded, and recovery detects private migration journal tampering',async()=>{
 const h=await harness();try{
 const vault=await createVault(fixture(),'synthetic migration vault','personal:tal');assert.equal((await h.req('tal','/api/plan','PUT',{plan:vault.envelope,revision:1})).status,200);
 assert.equal((await h.req('tal','/api/space-migrations?'+new URLSearchParams({...h.input,sourceRevision:2}))).status,409);assert.equal((await h.req('tal','/api/space-migrations','POST',h.body)).status,409);
 assert.equal(h.db.prepare('SELECT COUNT(*) n FROM private_space_migrations').get().n,0);
 }finally{h.db.close();}
 const other=await harness();try{await other.req('tal','/api/space-migrations','POST',other.body);const row=other.db.prepare('SELECT * FROM private_space_migrations').get();const corrupt=Buffer.from(row.data);corrupt[15]^=1;other.db.prepare('UPDATE private_space_migrations SET data=?').run(corrupt);assert.throws(()=>verifyStoredReports(other.db,other.key));
 }finally{other.db.close();}
});
function clientHarness(){
 const state={user:'tal',source:'personal',target:'house',account:'a',data:{sourceRevision:1,targetRevision:1,review:{}},execution:{eligible:true,reviewToken:'a'.repeat(64)},consentPrivacy:true,consentMove:true,controller:new AbortController()},finished=[];
 const c=vm.createContext({state,spaceMigrationReview:state,accountId:'tal',crypto,canSwitchBudget:()=>true,renderSpaceMigrationReview(){},clearSpaceMigrationReview(){c.spaceMigrationReview=null;},spaceRequireReload(){c.denied=true;},render(){}});
 vm.runInContext(readFileSync('src/migration-controller.js','utf8').replaceAll(/^export /gm,'')+'\n'+readFileSync('src/space-migration-execution-client.js','utf8')+'\n'+readFileSync('src/space-migration-client.js','utf8').slice(readFileSync('src/space-migration-client.js','utf8').indexOf('function migrationControllerPorts')),c);c.migrationExecutionFinished=async(s,status)=>finished.push(status);return{c,state,finished};
}
test('Client requires both consents and sends a single atomic operation without budget payloads or budget PUTs',async()=>{
 const h=clientHarness(),calls=[];h.c.spaceOverviewJSON=async(url,signal,options)=>{calls.push({url,body:JSON.parse(options.body)});return{accountId:'tal',status:'applied'};};
 h.state.consentPrivacy=false;await h.c.sendMigrationExecution('apply');assert.equal(calls.length,0);h.state.consentPrivacy=true;h.state.consentMove=false;await h.c.sendMigrationExecution('apply');assert.equal(calls.length,0);h.state.consentMove=true;
 await h.c.sendMigrationExecution('apply');assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/space-migrations');assert.equal(calls[0].body.plan,undefined);assert.equal(calls[0].body.reviewToken,'a'.repeat(64));assert.deepEqual(h.finished,['applied']);
});
test('Uncertain operation keeps its identifier and blocks another write; lost authentication clears the private display',async()=>{
 const h=clientHarness();let calls=0;h.c.spaceOverviewJSON=async()=>{calls++;throw Error('lost response');};await h.c.sendMigrationExecution('apply');assert.ok(h.state.pendingOperation);assert.equal(h.state.execution,null);await h.c.sendMigrationExecution('apply');assert.equal(calls,1);
 h.c.spaceOverviewJSON=async url=>{assert.ok(url.includes(h.state.pendingOperation));return{accountId:'tal',status:'applied'};};await h.c.checkMigrationExecution();assert.deepEqual(h.finished,['applied']);
 const denied=clientHarness();denied.c.spaceOverviewJSON=async()=>{throw Object.assign(Error('denied'),{status:401});};await denied.c.sendMigrationExecution('apply');assert.equal(denied.c.spaceMigrationReview,null);assert.equal(denied.c.denied,true);
});
