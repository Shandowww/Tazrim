import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,generateKeyPairSync} from 'node:crypto';
import {zero,validatePlan,clone} from '../src/budget.js';
import {bankIdentity,applyBankImport} from '../src/bank-import-model.js';
import {reviewAccountMigration} from '../src/space-migration-model.js';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {createVault} from '../src/vault.js';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const base=()=>({startMonth:'2026-01',opening:10000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true});
async function sourcePlan(){
 const p=base();p.cashPlanning={accounts:[{id:'a',label:'חשבון לבדיקה',opening:10000,buffer:0},{id:'b',label:'חשבון אחר',opening:2000,buffer:0}],months:{},cardAccounts:{card1:'a'},transfers:[]};
 const rs=await Promise.all([{line:1,date:'2026-02-20',reference:'one',amountCents:123456,description:'משכורת סינתטית',beneficiary:'מוטב לבדיקה',details:'',purpose:'',currency:'ILS',valid:true,balanceCents:null},{line:2,date:'2026-02-21',reference:'two',amountCents:-300025,description:'העברה סינתטית',beneficiary:'משק בית',details:'',purpose:'',currency:'ILS',valid:true,balanceCents:823431}].map(r=>bankIdentity(r,'a')));
 return applyBankImport(p,rs,{id:'synthetic-report',accountId:'a',label:'חשבון לבדיקה',fileName:'synthetic.csv',from:'2026-02-01',to:'2026-02-28',asOf:'2026-10',coverageConfirmed:true,monthsConfirmed:true,modes:{'2026-02':'full'},choices:{1:{field:'salary',reviewed:true},2:{field:'outgoingTransfers',reviewed:true}},rules:[]});
}
const opts={user:'tal',sourceId:'personal',targetId:'house',accountId:'a',sourceRevision:1,targetRevision:2};
test('Review maps stable account/card/source dependencies and exact signed cents without generating or changing a budget',async()=>{
 const p=await sourcePlan(),q=base(),before=JSON.stringify([p,q]),r=reviewAccountMigration(p,q,opts);assert.ok(validatePlan(p));assert.ok(validatePlan(q));
 assert.equal(r.applyAvailable,false);assert.equal(r.financialChange,false);assert.equal(r.plan,undefined);assert.equal(JSON.stringify([p,q]),before);
 assert.equal(r.groups.find(g=>g.kind==='bank-movement').count,2);assert.equal(r.groups.find(g=>g.kind==='card').count,1);assert.equal(r.groups.find(g=>g.kind==='account').examples[0].ref,JSON.stringify(['personal:tal','account','a']));
 const month=r.months[0];assert.equal(month.month,'2026-02');assert.equal(month.actual,true);assert.equal(month.balanceCents,823431);
 const outgoing=month.fields.find(f=>f.field==='outgoingTransfers');assert.equal(outgoing.selectedCents,300025);assert.equal(outgoing.sourceRemainderCents,0);assert.equal(outgoing.targetHypotheticalCents,300025);
 assert.equal(r.privacy.originalDocuments,'stay-private');assert.equal(r.privacy.history,'stay-private');assert.equal(r.privacy.connections,'stay-at-source');
 assert.ok(r.issues.some(i=>i.code==='atomic-move-pending'));assert.ok(r.issues.some(i=>i.code==='private-snapshots'));
});
test('Identical names do not merge identities; collisions, duplicate movements and negative residuals are explicit',async()=>{
 const p=await sourcePlan(),q=clone(p);q.cashPlanning.accounts[1].label=p.cashPlanning.accounts[0].label;
 const r=reviewAccountMigration(p,q,opts);assert.ok(r.collisions.some(c=>c.kind==='account'&&c.id==='a'));assert.notEqual(r.collisions[0].sourceRef,r.collisions[0].targetRef);
 assert.ok(r.issues.some(i=>i.code==='duplicate-source'&&i.count===2));assert.equal(r.groups.find(g=>g.kind==='account').count,1);
 p.months['2026-02'].values.salary=0;const residual=reviewAccountMigration(p,base(),opts);assert.ok(residual.issues.some(i=>i.code==='aggregate-remainder'));assert.equal(residual.months[0].fields.find(f=>f.field==='salary').sourceRemainderCents,-123456);
 assert.throws(()=>reviewAccountMigration(p,q,{...opts,sourceId:'house'}),/שני/);assert.throws(()=>reviewAccountMigration(p,q,{...opts,accountId:'unknown'}),/המקור/);
});
test('Combined savings are never allocated by funding labels; ambiguous plans, cross-account transfers and unknown sections block review',async()=>{
 const p=await sourcePlan();p.savingsGoals={balance:400,snapshotMonth:'2026-01',items:[{id:'goal',name:'משותף בשם בלבד',icon:'plane',target:1000,allocated:123.45,monthly:0,fundingAccountIds:['a','b']}],deposits:{}};
 p.expenses=[{id:'unknown',name:'טרם שויך',amount:10,fees:0,firstMonth:'2026-02',payments:1,source:'direct',kind:'expense'}];p.cashPlanning.transfers=[{id:'move',from:'a',to:'b',month:'2026-02',amount:50,status:'planned'}];
 p.goals={saving:200,invest:100,spending:5000,income:10000};const before=JSON.stringify(p),r=reviewAccountMigration(p,base(),opts);assert.equal(r.groups.find(g=>g.kind==='goal').count,1);assert.equal(r.retention.allSavingsGoals,1);assert.equal(r.groups.find(g=>g.kind==='expense').count,0);
 for(const code of ['combined-savings','unassigned-items','cross-account-transfer'])assert.ok(r.issues.some(i=>i.code===code),code);
 assert.equal(JSON.stringify(p),before);assert.equal(r.savingsAllocated,undefined);
});
test('Absent account readings remain unknown and examples are bounded without dropping dependency counts',async()=>{
 const p=await sourcePlan();delete p.cashPlanning.accounts[1].opening;const r=reviewAccountMigration(p,base(),{...opts,accountId:'b'});assert.equal(r.account.openingCents,null);assert.equal(r.months.length,0);
 const all=await sourcePlan();all.expenses=Array.from({length:8},(_,i)=>({id:'e'+i,name:'בדיקה '+i,amount:10,fees:0,firstMonth:'2026-02',payments:1,source:'direct',kind:'expense',cashAccountId:'a'}));const many=reviewAccountMigration(all,base(),opts);assert.equal(many.groups.find(g=>g.kind==='expense').count,8);assert.equal(many.groups.find(g=>g.kind==='expense').examples.length,5);
});
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
async function harness(){
 const {db,DB}=openDatabase(':memory:'),origin='https://migration.test';
 for(const id of ['tal','viewer','third']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(id,id,id+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(id).digest('hex'),id,Date.now()+60000);}
 const app=createApp({db,DB,origin,allowedEmails:['tal','viewer','third'].map(id=>id+'@example.test'),reportOptions:{key:randomBytes(32),recoveryPublicKey:pair.publicKey}});
 const req=(user,path,method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 const p=await sourcePlan();await req('tal','/api/plan','PUT',{plan:p,revision:0});const target=(await(await req('tal','/api/budgets','POST',{name:'יעד בדיקה'})).json()).id;await req('tal','/api/plan?budget='+target,'PUT',{plan:base(),revision:0});
 const invite=await(await req('tal','/api/budgets/'+target+'/invites','POST',{email:'viewer@example.test',role:'viewer'})).json();await req('viewer','/api/budgets/accept','POST',{token:invite.token});await req('viewer','/api/plan','PUT',{plan:p,revision:0});
 const path='/api/space-migration-review?source=personal&target='+target,review=path+'&account=a&sourceRevision=1&targetRevision=1';return{db,req,path,review,p,target};
}
test('Authorized read-only HTTP review identifies source scope and target audience without changing any database rows',async()=>{
 const h=await harness();try{
 const snapshot=()=>h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,h.db.prepare('SELECT * FROM "'+name+'"').all()]);const before=snapshot();
 const list=await(await h.req('tal',h.path)).json();assert.equal(list.accountId,'tal');assert.equal(list.accounts.length,2);assert.equal(list.audience.targetMembers,2);assert.equal(list.review,undefined);
 const response=await h.req('tal',h.review);assert.equal(response.status,200);const data=await response.json();assert.equal(data.review.sourceScope,'personal:tal');assert.equal(data.review.applyAvailable,false);assert.equal(data.external.ownPrivateMatches,0);
 assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(snapshot(),before);
 for(const method of ['POST','PUT','DELETE'])assert.equal((await h.req('tal',h.review,method,{confirmed:true})).status,405);
 assert.deepEqual(snapshot(),before);
 }finally{h.db.close();}
});
test('Viewer, guessed personal scope, third party, stale revisions and missing accounts fail closed',async()=>{
 const h=await harness();try{
 assert.equal((await h.req('viewer',h.path)).status,403);assert.equal((await h.req('third',h.path)).status,404);
 assert.equal((await h.req('tal',h.path.replace('source=personal','source=personal:viewer'))).status,400);
 assert.equal((await h.req('tal',h.review.replace('sourceRevision=1','sourceRevision=0'))).status,409);
 assert.equal((await h.req('tal',h.review.replace('targetRevision=1','targetRevision=99'))).status,409);
 assert.equal((await h.req('tal',h.path+'&account=a')).status,409);assert.equal((await h.req('tal',h.review.replace('account=a','account=unknown'))).status,400);
 assert.equal((await h.req('nobody',h.path)).status,401);
 await h.req('tal','/api/budgets/'+h.target+'/members/viewer','PATCH',{role:'editor'});assert.equal((await h.req('viewer',h.review)).status,200);
 await h.req('tal','/api/budgets/'+h.target+'/members/viewer','DELETE');const revoked=await h.req('viewer',h.review);assert.equal(revoked.status,404);assert.equal((await revoked.json()).review,undefined);
 }finally{h.db.close();}
});
test('Encrypted and uninitialized migration routes explicitly block without weakening encryption or creating records',async()=>{
 const h=await harness();try{
 const empty=(await(await h.req('tal','/api/budgets','POST',{name:'ריק'})).json()).id;assert.equal((await h.req('tal','/api/space-migration-review?source=personal&target='+empty)).status,400);
 const vault=await createVault(h.p,'synthetic migration password','personal:tal');await h.req('tal','/api/plan','PUT',{plan:vault.envelope,revision:1});
 const before=h.db.prepare('SELECT data,revision FROM plans WHERE user_id=?').get('tal'),blocked=await h.req('tal',h.path);assert.equal(blocked.status,409);assert.equal((await blocked.json()).code,'encrypted-migration-unavailable');assert.deepEqual(h.db.prepare('SELECT data,revision FROM plans WHERE user_id=?').get('tal'),before);
 assert.equal((await h.req('viewer','/api/space-migration-review?source=personal&target='+empty)).status,404);
 }finally{h.db.close();}
});
function clientHarness(){
 const state={user:'tal',source:'personal',target:'house',account:'a',data:{sourceRevision:1,targetRevision:2},metas:[],busy:false,controller:null};let clears=0,reloads=0;
 const c=vm.createContext({AbortController,URLSearchParams,state,accountId:'tal',window:{addEventListener(){}},document:{getElementById:()=>null},render(){},spaceRequireReload(){reloads++;}});
 vm.runInContext(readFileSync('src/migration-controller.js','utf8').replaceAll(/^export /gm,'')+'\n'+readFileSync('src/space-migration-client.js','utf8'),c);vm.runInContext('spaceMigrationReview=state',c);c.renderSpaceMigrationReview=()=>{};c.clearSpaceMigrationReview=()=>{state.data=null;c.runClear=true;vm.runInContext('spaceMigrationReview=null',c);clears++;};return{c,state,clears:()=>clears,reloads:()=>reloads};
}
test('Client uses GET review with exact source revisions and removes old financial display on any failure or identity change',async()=>{
 for(const mode of ['normal','offline','conflict','identity','revoked']){
  const h=clientHarness(),calls=[];h.c.spaceOverviewJSON=async(url)=>{calls.push(url);if(url==='/api/budgets')return{accountId:mode==='identity'?'other':'tal',budgets:[{id:'personal',role:'owner'},{id:'house',role:'owner'}]};if(mode==='offline'||mode==='conflict'||mode==='revoked')throw Object.assign(Error('test'),{status:mode==='conflict'?409:mode==='revoked'?404:503});return{accountId:'tal',sourceRevision:1,targetRevision:2,accounts:[],review:{applyAvailable:false}};};
  await h.c.loadSpaceMigrationReview();if(mode!=='identity')assert.equal(h.state.busy,false);if(mode==='normal'){assert.ok(h.state.data);assert.match(calls[1],/sourceRevision=1/);assert.match(calls[1],/targetRevision=2/);}else assert.equal(h.state.data,null);
  if(mode==='identity'){assert.equal(h.clears(),1);assert.equal(h.reloads(),1);}
 }
});
test('Closed client discards a late review and clearing releases financial data',async()=>{
 const h=clientHarness();let resolve;h.c.spaceOverviewJSON=()=>new Promise(r=>resolve=r);const pending=h.c.loadSpaceMigrationReview();h.c.clearSpaceMigrationReview();resolve({accountId:'tal',budgets:[]});await pending;assert.equal(h.state.data,null);
});

test('Legacy aggregate-only values stay unassigned and source/target names/descriptions are escaped in review HTML',async()=>{
 const p=await sourcePlan();p.months['2026-03']={values:{...zero(),salary:999},actual:true,includesPlannedCard:false};
 p.cashPlanning.accounts[0].label='<img src=x onerror=bad>';p.bankImport.entries[0].source.description='<script>private</script>';
 const review=reviewAccountMigration(p,base(),opts);assert.ok(review.issues.some(i=>i.code==='unassigned-totals'));assert.equal(review.months.some(m=>m.month==='2026-03'),false);
 const c=vm.createContext({window:{addEventListener(){}},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),money:n=>String(n)});vm.runInContext(readFileSync('src/migration-controller.js','utf8').replaceAll(/^export /gm,'')+'\n'+readFileSync('src/space-migration-client.js','utf8'),c);
 const html=c.migrationReviewResults({review,external:{originalReports:1,reportDrafts:1,historyEntries:1,ownPrivateMatches:0,ownImportConnections:0,ownWalletConnections:0,ownGmailConnections:0},audience:{targetPrivate:false,targetMembers:2}});
 assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/data-migration="apply"/);
});
