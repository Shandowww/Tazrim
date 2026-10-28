import * as matchCommands from '../src/transfer-match-commands.js';
import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync,cpSync,mkdtempSync,symlinkSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,randomBytes,createHash} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {verifyStoredReports} from '../server/report-crypto.mjs';
import {zero,validatePlan} from '../src/budget.js';
import {bankIdentity,applyBankImport} from '../src/bank-import-model.js';
import {transferLegs,transferPairValid,transferBrowserSelection} from '../src/transfer-matching-model.js';
import {createVault} from '../src/vault.js';
const day='2026-10-26',time=Date.parse(day+'T10:00:00Z'),origin='https://matches.test';
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
async function plan(out=true,amount=300025,date='2026-10-18'){
 const p={startMonth:'2026-01',opening:10000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false};
 const row=await bankIdentity({line:1,date,reference:'r-'+date,amountCents:out?-amount:amount,description:'העברה',beneficiary:'יעד בדיקה',purpose:'',details:'',currency:'ILS',valid:true,balanceCents:null},'a');
 const month=date.slice(0,7),next=applyBankImport(p,[row],{id:'report',accountId:'a',label:'חשבון בדיקה',fileName:'test.csv',from:month+'-01',to:month+'-31',asOf:'2026-10',coverageConfirmed:true,monthsConfirmed:true,modes:{[month]:'partial'},choices:{1:{field:out?'outgoingTransfers':'incomingTransfers',reviewed:true}},rules:[]});assert.ok(validatePlan(next));return next;
}
async function harness(){
 const {db,DB}=openDatabase(':memory:'),key=randomBytes(32);
 const users=['tal','linoy','third'];for(const id of users){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(id,id,id+'@example.test',time);db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(id).digest('hex'),id,time+60000);}
 const app=createApp({db,DB,origin,now:()=>time,allowedEmails:users.map(u=>u+'@example.test'),reportOptions:{key,recoveryPublicKey:pair.publicKey}});
 const req=(user,path='/api/transfer-matches',method='GET',body,headers={})=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+user,'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}));
 const outPlan=await plan(),inPlan=await plan(false);
 await req('tal','/api/plan','PUT',{plan:outPlan,revision:0});await req('linoy','/api/plan','PUT',{plan:outPlan,revision:0});
 const shared=(await(await req('tal','/api/budgets','POST',{name:'בית'})).json()).id;
 await req('tal','/api/plan?budget='+shared,'PUT',{plan:inPlan,revision:0});
 const invite=await(await req('tal','/api/budgets/'+shared+'/invites','POST',{email:'linoy@example.test',role:'viewer'})).json();await req('linoy','/api/budgets/accept','POST',{token:invite.token});
 const input=(user='tal')=>({accountId:user,confirmed:true,revision:0,out:transferLegs(outPlan,user,'personal',1,day)[0].ref,in:transferLegs(inPlan,user,shared,1,day)[0].ref});
 return {db,key,req,input,shared,outPlan,inPlan};
}
test('Transfer candidates require observed source, exact cents, separate space, direction, date and unchanged source refs',async()=>{
 const out=await plan(),inc=await plan(false),o=transferLegs(out,'tal','personal',1,day)[0],i=transferLegs(inc,'tal','shared',1,day)[0];
 assert.equal(o.cents,-300025);assert.equal(o.partial,true);assert.ok(transferPairValid(o,i));assert.equal(transferPairValid(o,{...i,cents:300024}),false);assert.equal(transferPairValid(o,{...i,ref:o.ref}),false);
 assert.equal(transferLegs(out,'tal','personal',1,'2026-10-01').length,0);
 const entries=new Map([['personal',{status:'ready',meta:{name:'פרטי'},summary:{transfers:[o]}}],['shared',{status:'ready',meta:{name:'בית'},summary:{transfers:[i]}}]]),match={id:'m',status:'current',out:o.ref,in:i.ref};
 assert.equal(transferBrowserSelection(entries,[match]).matches[0].status,'current');assert.equal(transferBrowserSelection(entries,[match]).legs.length,0);
 for(const status of ['stale','loading','locked','error']){entries.get('shared').status=status;assert.equal(transferBrowserSelection(entries,[match]).matches[0].status,'unavailable');}
 entries.get('shared').status='ready';entries.get('shared').summary.transferMatchingLocked=true;assert.equal(transferBrowserSelection(entries,[match]).matches[0].status,'unavailable');
 entries.get('shared').summary.transferMatchingLocked=false;entries.get('shared').summary.transfers[0]={...i,ref:{...i.ref,revision:2}};assert.equal(transferBrowserSelection(entries,[match]).matches[0].status,'unavailable');
});
test('Matches are private to each identity, encrypted at rest, revision checked and leave both budgets byte-identical',async()=>{
 const h=await harness();try{
 const before=h.db.prepare('SELECT data,revision FROM plans UNION ALL SELECT data,revision FROM budgets').all();
 const created=await h.req('tal',undefined,'POST',h.input());assert.equal(created.status,201);const saved=await created.json();assert.equal(saved.accountId,'tal');assert.equal(saved.revision,1);assert.equal(saved.items[0].status,'current');
 assert.deepEqual((await(await h.req('linoy')).json()).items,[]);assert.deepEqual((await(await h.req('third')).json()).items,[]);
 assert.equal((await h.req('linoy',undefined,'POST',h.input('linoy'))).status,201); // A shared viewer can keep their own private match.
 const row=h.db.prepare('SELECT * FROM private_transfer_matches WHERE user_id=?').get('tal');assert.equal(Buffer.from(row.data).includes(Buffer.from(h.shared)),false);assert.equal(verifyStoredReports(h.db,h.key),0);
 assert.deepEqual(h.db.prepare('SELECT data,revision FROM plans UNION ALL SELECT data,revision FROM budgets').all(),before);
 assert.equal((await h.req('tal',undefined,'POST',h.input())).status,409);
 assert.equal((await h.req('tal',undefined,'POST',{...h.input(),revision:1})).status,409);
 assert.equal((await h.req('third',undefined,'DELETE',{accountId:'third',id:row.id,revision:0})).status,404);
 assert.equal((await h.req('tal',undefined,'DELETE',{accountId:'tal',id:row.id,revision:1})).status,200);assert.equal((await(await h.req('tal')).json()).revision,2);
 }finally{h.db.close();}
});
test('Every create/read validates source access, classifications and source versions; revocation reveals no private refs',async()=>{
 const h=await harness();try{
 const forged=h.input();forged.out.budget='personal:linoy';assert.equal((await h.req('tal',undefined,'POST',forged)).status,400);
 const unknown=h.input();unknown.in.key='f'.repeat(64);assert.equal((await h.req('tal',undefined,'POST',unknown)).status,409);
 assert.equal((await h.req('third',undefined,'POST',h.input())).status,409);
 const created=await(await h.req('linoy',undefined,'POST',h.input('linoy'))).json();assert.equal(created.items.length,1);
 await h.req('tal','/api/budgets/'+h.shared+'/members/linoy','DELETE');
 const denied=await(await h.req('linoy')).json();assert.deepEqual(denied.items,[{id:created.items[0].id,status:'unavailable'}]);assert.equal(JSON.stringify(denied).includes(h.shared),false);
 assert.equal((await h.req('linoy',undefined,'POST',{...h.input('linoy'),revision:1})).status,404);
 assert.equal((await h.req('linoy',undefined,'DELETE',{accountId:'linoy',id:created.items[0].id,revision:1})).status,200);
 assert.equal((await h.req('tal',undefined,'POST',h.input())).status,201);
 await h.req('tal','/api/plan','PUT',{plan:h.outPlan,revision:1});const stale=await(await h.req('tal')).json();assert.equal(stale.items[0].status,'unavailable');assert.equal(stale.items[0].out,undefined);
 assert.equal((await h.req('tal',undefined,'POST',{...h.input(),revision:1})).status,409);
 }finally{h.db.close();}
});
test('Mismatched amounts, no confirmation, encrypted budgets, forged cookies and foreign origins cannot create matches',async()=>{
 const h=await harness();try{
 assert.equal((await h.req('tal',undefined,'POST',{...h.input(),confirmed:false})).status,400);
 assert.equal((await h.req('linoy',undefined,'POST',h.input())).status,409); // Same source hashes in another user's personal space never authorize a switched-session save.
 const different=await plan(false,300024);await h.req('tal','/api/plan?budget='+h.shared,'PUT',{plan:different,revision:1});const bad=h.input();bad.in=transferLegs(different,'tal',h.shared,2,day)[0].ref;assert.equal((await h.req('tal',undefined,'POST',bad)).status,400);
 const vault=await createVault(h.inPlan,'synthetic vault password',h.shared);h.db.prepare('UPDATE budgets SET data=?,revision=3 WHERE id=?').run(JSON.stringify(vault.envelope),h.shared);
 const encrypted=h.input();encrypted.in.revision=3;assert.equal((await h.req('tal',undefined,'POST',encrypted)).status,409);
 assert.equal((await h.req('unknown')).status,401);assert.equal((await h.req('tal',undefined,'POST',h.input(),{origin:'https://other.test'})).status,403);
 assert.equal(h.db.prepare('SELECT COUNT(*) n FROM private_transfer_matches').get().n,0);
 }finally{h.db.close();}
});
test('Recovery verification rejects corrupted match ciphertext and swapping private owners',async()=>{
 const h=await harness();try{
 await h.req('tal',undefined,'POST',h.input());const row=h.db.prepare('SELECT * FROM private_transfer_matches').get();
 const data=Buffer.from(row.data);data[15]^=1;h.db.prepare('UPDATE private_transfer_matches SET data=?').run(data);assert.throws(()=>verifyStoredReports(h.db,h.key));
 h.db.prepare('UPDATE private_transfer_matches SET data=?,user_id=?').run(row.data,'linoy');assert.throws(()=>verifyStoredReports(h.db,h.key));
 }finally{h.db.close();}
});

test('The shipped server imports successfully with only Docker runtime directories and no source checkout',()=>{
 const folder=mkdtempSync(join(tmpdir(),'budgit-runtime-'));
 try{
  cpSync('server',join(folder,'server'),{recursive:true});cpSync('dist',join(folder,'dist'),{recursive:true});
  writeFileSync(join(folder,'package.json'),' {"type":"module"}');symlinkSync(resolve('node_modules'),join(folder,'node_modules'),'dir');
  const result=spawnSync(process.execPath,['--input-type=module','-e',"await import('./server/app.mjs')"],{cwd:folder,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

async function clientHarness(){
 const out=transferLegs(await plan(),'tal','personal',1,day)[0],incoming=transferLegs(await plan(false),'tal','shared',1,day)[0];
 const state={entries:new Map([['personal',{status:'ready',meta:{name:'פרטי'},summary:{transfers:[out]}}],['shared',{status:'ready',meta:{name:'בית'},summary:{transfers:[incoming]}}]]),privateMatches:{revision:0,items:[]},controller:new AbortController(),transferOut:out.key,transferIn:incoming.key,user:'tal'};
 let draws=0,reloads=0;
 const c=vm.createContext({...matchCommands,spaceOverview:state,accountId:'tal',transferBrowserSelection,transferPairValid,spaceOverviewRender(){draws++;},spaceRequireReload(){reloads++;},render(){},clearSpaceOverview(){c.spaceOverview=null;}});
 vm.runInContext(readFileSync('src/space-transfer-vaults-client.js','utf8'),c);
 vm.runInContext(readFileSync('src/space-transfers-client.js','utf8'),c);
 return {c,state,out,incoming,draws:()=>draws,reloads:()=>reloads};
}
test('Private match client sends only reviewed refs and confirms actual API success without modifying budget summaries',async()=>{
 const h=await clientHarness(),before=JSON.stringify([...h.state.entries]),calls=[];
 h.c.spaceOverviewJSON=async(url,signal,options)=>{calls.push({url,options});return{accountId:'tal',revision:1,items:[{id:'match',status:'current',out:h.out.ref,in:h.incoming.ref}]};};
 await h.c.saveSpaceTransferMatch('transfer-save');assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/transfer-matches');assert.deepEqual(JSON.parse(calls[0].options.body),{accountId:'tal',confirmed:true,revision:0,out:h.out.ref,in:h.incoming.ref});
 assert.equal(h.state.privateMatches.revision,1);assert.equal(h.state.transferOut,'');assert.match(h.state.transferNotice,/נשמרה/);assert.equal(JSON.stringify([...h.state.entries]),before);
});
test('Uncertain or conflicting match save disables retries until refresh; authentication loss clears the view',async()=>{
 for(const status of [409,503,401,403,404]){
  const h=await clientHarness();let calls=0;h.c.spaceOverviewJSON=async()=>{calls++;throw Object.assign(Error('synthetic'),{status});};
  await h.c.saveSpaceTransferMatch('transfer-save');
  if([401,403,404].includes(status)){assert.equal(h.c.spaceOverview,null);assert.equal(h.reloads(),1);}
  else{assert.equal(h.state.privateMatchSaving,false);assert.equal(h.state.privateMatches,null);assert.match(h.state.transferError,/רעננו/);await h.c.saveSpaceTransferMatch('transfer-save');assert.equal(calls,1);assert.equal(h.state.transferNotice,'');}
 }
});
test('Late match responses cannot repopulate a closed view or a changed identity',async()=>{
 const h=await clientHarness();let resolve;h.c.spaceOverviewJSON=()=>new Promise(r=>resolve=r);
 const saving=h.c.saveSpaceTransferMatch('transfer-save');await new Promise(r=>setImmediate(r));h.c.spaceOverview=null;resolve({accountId:'tal',revision:1,items:[]});await saving;assert.equal(h.state.privateMatches.revision,0);
 const changed=await clientHarness();changed.c.spaceOverviewJSON=async()=>({accountId:'other',revision:1,items:[]});await changed.c.saveSpaceTransferMatch('transfer-save');assert.equal(changed.c.spaceOverview,null);assert.equal(changed.reloads(),1);
});
