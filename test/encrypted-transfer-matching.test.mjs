import * as matchCommands from '../src/transfer-match-commands.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomBytes,generateKeyPairSync,createHash} from 'node:crypto';
import {zero,validatePlan} from '../src/budget.js';
import {bankIdentity,applyBankImport} from '../src/bank-import-model.js';
import {createVault,isVault,unlockVault,decryptVault,saveVault} from '../src/vault.js';
import {deriveTransferMatchKeys,transferMatchToken,sealTransferMatch,openTransferMatch} from '../src/transfer-match-crypto.js';
import {transferLegs,transferBrowserSelection,transferPairValid,transferRefsEqual} from '../src/transfer-matching-model.js';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
const day='2026-10-26',time=Date.parse(day+'T10:00:00Z');
async function plan(out=true){
 const p={startMonth:'2026-01',opening:10000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true};
 const r=await bankIdentity({line:1,date:'2026-10-18',reference:'encrypted-transfer-fixture',amountCents:out?-300025:300025,description:'תיאור פרטי לבדיקת הצפנה',beneficiary:'מוטב סינתטי',details:'',purpose:'',currency:'ILS',valid:true,balanceCents:null},'a');
 return applyBankImport(p,[r],{id:'report',accountId:'a',label:'חשבון בדיקה',fileName:'test.csv',from:'2026-10-01',to:'2026-10-20',asOf:'2026-10',coverageConfirmed:true,monthsConfirmed:true,modes:{'2026-10':'partial'},choices:{1:{field:out?'outgoingTransfers':'incomingTransfers',reviewed:true}},rules:[]});
}
async function fixtures(both=false,budget='house'){
 const p=await plan(),q=await plan(false),a=await createVault(p,'synthetic matching password','personal:tal'),b=both?await createVault(q,'second synthetic password',budget):null;
 const keys=new Map([['personal',await deriveTransferMatchKeys(a.rawKey,a.envelope)]]);if(b)keys.set(budget,await deriveTransferMatchKeys(b.rawKey,b.envelope));
 const out=transferLegs(p,'tal','personal',1,day)[0],incoming=transferLegs(q,'tal',budget,1,day)[0],sources=[];
 for(const l of [out,incoming]){const k=keys.get(l.ref.budget);sources.push({budget:l.ref.budget,revision:1,token:await transferMatchToken('tal',l.ref,k),...(k?{keyId:k.keyId,context:k.context}:{})});}
 const sealed=await sealTransferMatch('tal',sources,out.ref,incoming.ref,keys);
 return {p,q,a,b,keys,out,incoming,sources,sealed,budget};
}
test('Mixed and dual-vault matches encrypt all references, require the relevant keys and keep derived keys nonextractable',async()=>{
 for(const both of [false,true]){
  const f=await fixtures(both),opened=await openTransferMatch('tal',f.sealed,f.keys);assert.deepEqual(opened,{out:f.out.ref,in:f.incoming.ref});
  const wire=JSON.stringify(f.sealed);for(const secret of [f.out.ref.key,f.out.ref.fingerprint,f.incoming.ref.key,f.incoming.ref.fingerprint,'תיאור פרטי',f.a.recoveryKey])assert.equal(wire.includes(secret),false);
  await assert.rejects(openTransferMatch('other-user',f.sealed,f.keys));await assert.rejects(openTransferMatch('tal',f.sealed,new Map()));
  if(both){const partial=new Map(f.keys);partial.delete('house');await assert.rejects(openTransferMatch('tal',f.sealed,partial));}
  await assert.rejects(crypto.subtle.exportKey('raw',f.keys.get('personal').encryption));await assert.rejects(crypto.subtle.exportKey('raw',f.keys.get('personal').tag));
  f.a.rawKey.fill(0);f.b?.rawKey.fill(0);
 }
});
test('User, record, scope, revision, key context, source token and ciphertext tampering cannot authenticate a match',async()=>{
 const f=await fixtures(true);
 for(const mutate of [m=>m.id=crypto.randomUUID(),m=>m.sources[0].revision++,m=>m.sources[0].budget='guessed',m=>m.sources[0].context='other-context',m=>m.sources[0].token='f'.repeat(64),m=>m.box.data=(m.box.data[0]==='A'?'B':'A')+m.box.data.slice(1)]){
  const m=structuredClone(f.sealed);mutate(m);await assert.rejects(openTransferMatch('tal',m,f.keys));
 }
 assert.equal(await transferMatchToken('tal',f.out.ref,f.keys.get('personal')),await transferMatchToken('tal',{...f.out.ref,revision:99},f.keys.get('personal')));
 assert.notEqual(await transferMatchToken('tal',f.out.ref,f.keys.get('personal')),await transferMatchToken('linoy',f.out.ref,f.keys.get('personal')));
 assert.deepEqual(await decryptVault(f.a.envelope,f.a.key),f.p);
});
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
async function serverFixture(both=false){
 const {db,DB}=openDatabase(':memory:'),origin='https://encrypted-matches.test';
 for(const id of ['tal','viewer']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(id,id,id+'@example.test',time);db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(id).digest('hex'),id,time+60000);}
 const app=createApp({db,DB,origin,allowedEmails:['tal@example.test','viewer@example.test'],now:()=>time,reportOptions:{key:randomBytes(32),recoveryPublicKey:pair.publicKey}});
 const req=(user,path='/api/transfer-matches',method='GET',body)=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 const budget=(await(await req('tal','/api/budgets','POST',{name:'בית'})).json()).id,f=await fixtures(both,budget);
 await req('tal','/api/plan','PUT',{plan:f.a.envelope,revision:0});await req('tal','/api/plan?budget='+budget,'PUT',{plan:both?f.b.envelope:f.q,revision:0});
 const body={accountId:'tal',revision:0,confirmed:true,sealed:f.sealed};return{db,req,body,...f};
}
test('The server stores only sealed references, checks current source envelopes, deduplicates tokens and never mutates budgets',async()=>{
 const h=await serverFixture(true);try{
 const before=h.db.prepare('SELECT data,revision FROM plans UNION ALL SELECT data,revision FROM budgets').all();
 const response=await h.req('tal',undefined,'POST',h.body);assert.equal(response.status,201);const saved=await response.json();assert.equal(saved.items[0].status,'sealed');assert.equal(saved.items[0].out,undefined);
 assert.deepEqual(await openTransferMatch('tal',saved.items[0].sealed,h.keys),{out:h.out.ref,in:h.incoming.ref});
 const duplicate=await sealTransferMatch('tal',h.sources,h.out.ref,h.incoming.ref,h.keys);assert.equal((await h.req('tal',undefined,'POST',{...h.body,revision:1,sealed:duplicate})).status,409);
 assert.deepEqual((await(await h.req('viewer')).json()).items,[]);assert.deepEqual(h.db.prepare('SELECT data,revision FROM plans UNION ALL SELECT data,revision FROM budgets').all(),before);
 assert.equal((await h.req('tal',undefined,'POST',{...h.body,revision:1,out:h.out.ref})).status,400);
 for(const bad of [{...h.sealed,sources:[null,null]},{...h.sealed,sources:[h.sources[0],h.sources[0]]},{...h.sealed,box:{...h.sealed.box,iv:'A'.repeat(14)+'=='}},{...h.sealed,box:{...h.sealed.box,data:h.sealed.box.data+'!'}}])assert.equal((await h.req('tal',undefined,'POST',{...h.body,revision:1,sealed:bad})).status,400);
 const changed=await saveVault(h.a.envelope,h.a.key,h.p);await h.req('tal','/api/plan','PUT',{plan:changed,revision:1});
 assert.deepEqual((await(await h.req('tal')).json()).items,[{id:h.sealed.id,status:'unavailable'}]);
 assert.equal((await h.req('tal',undefined,'DELETE',{accountId:'tal',revision:1,id:h.sealed.id})).status,200);
 }finally{h.db.close();}
});
test('Mixed matches validate the plaintext leg and redact ciphertext when access, context or revisions change',async()=>{
 const h=await serverFixture(false);try{
 const bad=structuredClone(h.body);bad.sealed.sources.find(s=>!s.keyId).token='f'.repeat(64);assert.equal((await h.req('tal',undefined,'POST',bad)).status,409);
 assert.equal((await h.req('tal',undefined,'POST',h.body)).status,201);
 h.db.prepare('UPDATE plans SET data=? WHERE user_id=?').run(JSON.stringify({...h.a.envelope,context:'wrong-context'}),'tal');
 const list=await(await h.req('tal')).json();assert.deepEqual(list.items,[{id:h.sealed.id,status:'unavailable'}]);assert.equal(JSON.stringify(list).includes(h.budget),false);
 }finally{h.db.close();}
});
async function clientFixture(){
 const f=await fixtures(true),matching=(vault,legs)=>({envelope:vault.envelope,revision:1,key:vault.key,keys:f.keys.get(legs[0].ref.budget),legs,status:'ready'});
 const entries=new Map([['personal',{meta:{name:'פרטי'},status:'locked',summary:null,matching:matching(f.a,[f.out])}],['house',{meta:{name:'בית'},status:'locked',summary:null,matching:matching(f.b,[f.incoming])}]]);
 const state={user:'tal',asOf:day,entries,privateMatches:{revision:1,items:[{id:f.sealed.id,status:'sealed',sealed:f.sealed}]},controller:new AbortController()};
 const c=vm.createContext({...matchCommands,spaceOverview:state,accountId:'tal',transferBrowserSelection,transferPairValid,transferRefsEqual,transferMatchToken,deriveTransferMatchKeys,openTransferMatch,sealTransferMatch,transferLegs,validatePlan,isVault,unlockVault,decryptVault,spaceOverviewRender(){},clearSpaceOverview(){c.spaceOverview=null;},spaceRequireReload(){},render(){}});
 vm.runInContext(readFileSync('src/space-transfer-vaults-client.js','utf8'),c);vm.runInContext(readFileSync('src/space-transfers-client.js','utf8'),c);return{...f,c,state};
}
test('Only unlocked, freshly verified sources turn a sealed server record into a current client match',async()=>{
 const h=await clientFixture();await h.c.hydrateSpaceSealedMatches(h.state);assert.equal(h.state.privateMatches.items[0].status,'current');assert.equal(transferBrowserSelection(h.state.entries,h.state.privateMatches.items).legs.length,0);
 h.state.entries.get('house').matching.status='locked';await h.c.hydrateSpaceSealedMatches(h.state);assert.equal(h.state.privateMatches.items[0].status,'locked');assert.equal(h.state.privateMatches.items[0].out,undefined);assert.equal(transferBrowserSelection(h.state.entries,h.state.privateMatches.items).blocked,true);
 h.state.entries.get('house').matching.status='ready';h.state.entries.get('house').matching.legs[0]={...h.incoming,cents:300024};await h.c.hydrateSpaceSealedMatches(h.state);assert.equal(h.state.privateMatches.items[0].status,'unavailable');assert.equal(h.state.privateMatches.items[0].sealed,undefined);
});
test('Temporary unlock rechecks identity/source, clears entered/raw secrets, stays isolated and ignores a closed view',async()=>{
 const h=await clientFixture(),entry=h.state.entries.get('house');entry.matching.status='locked';entry.matching.key=null;entry.matching.keys=null;entry.matching.legs=[];
 let raw;h.c.unlockVault=async(...args)=>{const r=await unlockVault(...args);raw=r.rawKey;return r;};h.c.spaceOverviewJSON=async url=>{assert.equal(url,'/api/plan?budget=house');return{accountId:'tal',revision:1,plan:h.b.envelope};};
 const form={dataset:{matchUnlock:'house'},elements:{secret:{value:'second synthetic password'},recovery:{checked:false}}};const before=JSON.stringify(h.b.envelope);
 await h.c.unlockSpaceTransferVault(form);assert.equal(form.elements.secret.value,'');assert.equal(raw.every(n=>n===0),true);assert.equal(entry.matching.status,'ready');assert.equal(JSON.stringify(h.b.envelope),before);assert.equal(h.c.activeBudget,undefined);
 const closed=await clientFixture();let resolve;closed.c.spaceOverviewJSON=()=>new Promise(r=>resolve=r);const pending=closed.c.unlockSpaceTransferVault({dataset:{matchUnlock:'house'},elements:{secret:{value:'second synthetic password'},recovery:{checked:false}}});closed.c.spaceOverview=null;resolve({accountId:'tal',revision:1,plan:closed.b.envelope});await pending;assert.equal(closed.c.spaceOverview,null);
});
test('Encrypted match submission contains ciphertext/tokens only and validates the returned record locally',async()=>{
 const h=await clientFixture();h.state.privateMatches={revision:0,items:[]};h.state.transferOut=h.out.key;h.state.transferIn=h.incoming.key;let sent;
 h.c.spaceOverviewJSON=async(url,signal,options)=>{sent=JSON.parse(options.body);assert.equal(sent.out,undefined);assert.equal(sent.in,undefined);assert.equal(sent.accountId,'tal');return{accountId:'tal',revision:1,items:[{id:sent.sealed.id,status:'sealed',sealed:sent.sealed}]};};
 await h.c.saveSpaceTransferMatch('transfer-save');assert.ok(sent.sealed);assert.equal(JSON.stringify(sent).includes(h.out.ref.key),false);assert.equal(h.state.privateMatches.items[0].status,'current');assert.equal(h.state.privateMatchSaving,false);
});

test('Closing the overview synchronously releases temporary keys, transfer snippets and decrypted match refs',async()=>{
 const f=await clientFixture(),matching=f.state.entries.get('house').matching;
 const c=vm.createContext({...matchCommands,state:f.state,window:{addEventListener(){}},document:{getElementById:()=>null}});
 vm.runInContext(readFileSync('src/space-overview-client.js','utf8'),c);vm.runInContext('spaceOverview=state;clearSpaceOverview()',c);
 assert.equal(matching.key,null);assert.equal(matching.keys,null);assert.equal(matching.legs.length,0);assert.equal(f.state.entries.size,0);assert.equal(f.state.privateMatches,null);
});
