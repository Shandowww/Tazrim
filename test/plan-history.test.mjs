import test from 'node:test';import assert from 'node:assert/strict';
import {createHash,randomBytes,generateKeyPairSync} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';import {createApp} from '../server/app.mjs';
import {createDemoPlan,clone} from '../src/budget.js';import {createVault,decryptVault} from '../src/vault.js';
import {recoverReportKey,verifyStoredReports} from '../server/report-crypto.mjs';
import {createPlanHistory} from '../server/plan-history.mjs';import worker from '../dist/server/index.js';
const origin='https://history.test',pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
function setup(){const {db,DB}=openDatabase(':memory:');for(const id of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(id,id,id+'@test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(createHash('sha256').update(id).digest('hex'),id,Date.now()+1000000);}
 const handle=createApp({db,DB,origin,allowedEmails:['alice@test','bob@test'],reportOptions:{key:randomBytes(32),recoveryPublicKey:pair.publicKey}});
 const req=(path='',body,user='alice',method=body?'POST':'GET')=>handle(new Request(origin+(path||'/api/plan-history'),{method,headers:{origin,cookie:'__Host-mf_session='+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 const put=(plan,revision,budget='personal',user='alice')=>req('/api/plan?budget='+budget,{plan,revision},user,'PUT');return{db,DB,handle,req,put};}
test('journal atomically records actor and encrypted before/after; undo is latest-only, revision protected and creates a new version',async()=>{const c=setup();try{
 const p=createDemoPlan('2026-10');p.demo=false;assert.equal((await c.put(p,0)).status,200);const next=clone(p);next.buffer=12345;assert.equal((await c.put(next,1)).status,200);
 const body=await (await c.req()).json(),entry=body.entries[0];assert.equal(entry.actor,'alice@test');assert.deepEqual(entry.fields,['buffer']);assert.equal(entry.canUndo,true);
 const stored=c.db.prepare('SELECT data FROM plan_history WHERE id=?').get(entry.id);assert.ok(!Buffer.from(stored.data).includes('12345'));const values=await (await c.req('/api/plan-history?id='+entry.id)).json();assert.equal(values.before.buffer,p.buffer);assert.equal(values.after.buffer,12345);
 assert.equal((await c.req('',{action:'undo',id:entry.id,revision:1})).status,409);assert.equal((await c.req('',{action:'undo',id:entry.id,revision:2})).status,200);assert.equal(JSON.parse(c.db.prepare('SELECT data FROM plans').get().data).buffer,p.buffer);assert.equal(c.db.prepare('SELECT revision FROM plans').get().revision,3);
 assert.equal((await c.req('',{action:'undo',id:entry.id,revision:3})).status,409);assert.equal(c.db.prepare('SELECT kind FROM plan_history ORDER BY revision DESC LIMIT 1').get().kind,'undo');
 const key=recoverReportKey(c.db,pair.privateKey);assert.equal(verifyStoredReports(c.db,key),0);key.fill(0);
 }finally{c.db.close();}});
test('history denies other users, viewers and revoked members; failed saves leave no audit entry',async()=>{const c=setup();try{
 const made=await (await c.req('/api/budgets',{name:'Shared'})).json(),id=made.id,p=createDemoPlan('2026-10');assert.equal((await c.put(p,0,id)).status,200);p.buffer=42;assert.equal((await c.put(p,1,id)).status,200);
 const path='/api/plan-history?budget='+id,body=await(await c.req(path)).json(),entry=body.entries[0];assert.equal((await c.req(path+'&id='+entry.id,null,'bob')).status,404);
 c.db.prepare('INSERT INTO budget_members VALUES(?,?,?)').run(id,'bob','bob@test');c.db.prepare('INSERT INTO budget_member_roles VALUES(?,?,?)').run(id,'bob','viewer');assert.equal((await c.req(path,{action:'undo',id:entry.id,revision:2},'bob')).status,403);
 c.db.prepare('DELETE FROM budget_members WHERE user_id=?').run('bob');assert.equal((await c.req(path,null,'bob')).status,404);
 const n=c.db.prepare('SELECT COUNT(*) n FROM plan_history').get().n;assert.equal((await c.put(p,0,id)).status,409);assert.equal((await c.put({...p,buffer:-1},2,id)).status,400);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM plan_history').get().n,n);
 }finally{c.db.close();}});
test('vault undo preserves encryption and cannot expose earlier plaintext history',async()=>{const c=setup();try{
 const p=createDemoPlan('2026-10');await c.put(p,0);const second=clone(p);second.buffer=400;await c.put(second,1);const old=(await(await c.req()).json()).entries[0];const vault=await createVault(second,'a sufficiently long password','personal:alice');await c.put(vault.envelope,2);
 assert.equal((await c.req('/api/plan-history?id='+old.id)).status,409);const conversion=(await(await c.req()).json()).entries[0];assert.equal((await c.req('',{action:'undo',id:conversion.id,revision:3})).status,409);
 const {saveVault}=await import('../src/vault.js'),changed=clone(second);changed.buffer=99;await c.put(await saveVault(vault.envelope,vault.key,changed),3);const current=(await(await c.req()).json()).entries[0];assert.equal((await c.req('',{action:'undo',id:current.id,revision:4})).status,200);const restored=JSON.parse(c.db.prepare('SELECT data FROM plans').get().data);assert.equal((await decryptVault(restored,vault.key)).buffer,400);
 }finally{c.db.close();}});
test('history hook failure rolls financial save back; report receipt hook composes instead of replacing audit',async()=>{const c=setup();try{
 const p=createDemoPlan('2026-10');await c.put(p,0);c.db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON plan_history BEGIN SELECT RAISE(ABORT,'failure'); END");p.buffer=7;const response=await c.put(p,1);assert.equal(response.status,503);assert.equal(c.db.prepare('SELECT revision FROM plans').get().revision,1);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM plan_history').get().n,1);
 c.db.exec('DROP TRIGGER fail_history');let first=0,second=0;const storage=c.DB.withPlanWrite(()=>first++).withPlanWrite(()=>second++);await storage.prepare('UPDATE plans SET revision=revision+1 WHERE user_id=?').bind('alice').run();assert.equal(first,1);assert.equal(second,1);
 }finally{c.db.close();}});
test('journal capacity keeps actor metadata without deleting old snapshots or blocking budget saves',async()=>{const c=setup();try{
 const p=createDemoPlan('2026-10');await c.put(p,0);const previous=c.db.prepare('SELECT data FROM plan_history').get().data;
 const history=createPlanHistory(c.db,{isAllowed:()=>true,maxBytes:0}),storage=history.storage(c.DB,{id:'alice',email:'alice@test'});p.buffer=765;
 const response=await worker.fetch(new Request(origin+'/api/plan',{method:'PUT',headers:{origin,'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@test'},body:JSON.stringify({plan:p,revision:1})}),{DB:storage});assert.equal(response.status,200);
 const row=c.db.prepare('SELECT * FROM plan_history ORDER BY revision DESC LIMIT 1').get();assert.equal(row.unavailable,'capacity');assert.equal(row.data,null);assert.equal(row.actor_id,'alice');assert.deepEqual(c.db.prepare('SELECT data FROM plan_history WHERE revision=1').get().data,previous);
 }finally{c.db.close();}});
test('atomic report import records its actor and cannot be undone as a budget-only operation',async()=>{const c=setup();try{
 const upload=await c.handle(new Request(origin+'/api/reports?budget=personal',{method:'PUT',headers:{origin,cookie:'__Host-mf_session=alice','x-report-name':'test.csv'},body:'synthetic-source'})),receipt=await upload.json();assert.equal(upload.status,201);
 const ref={id:receipt.receiptId,revision:1,state:'ready'};assert.equal((await c.req('/api/reports?budget=personal',{action:'draft-batch',draft:{version:1},reports:[ref]})).status,200);
 const imported=createDemoPlan('2026-10');imported.reportInbox={version:1,bindings:[],receipts:[{hash:receipt.sourceHash,kind:'bank',target:'account',reference:'batch'}]};
 assert.equal((await c.req('/api/reports?budget=personal',{action:'commit',actionId:'history-import-id-12345',reports:[{id:ref.id,revision:2}],revision:0,plan:imported})).status,200);
 const entry=(await(await c.req()).json()).entries[0];assert.equal(entry.kind,'report-import');assert.equal(entry.actor,'alice@test');assert.equal(entry.canUndo,false);assert.equal((await c.req('',{action:'undo',id:entry.id,revision:1})).status,409);
 c.db.exec('DELETE FROM plan_history; DELETE FROM plans');
 // Exercise the same composed transaction used by the importer and a failing receipt hook.
 const p=createDemoPlan('2026-10'),history=createPlanHistory(c.db,{isAllowed:()=>true,secret:()=>randomBytes(32)}),storage=history.storage(c.DB.withPlanWrite(()=>{throw Error('receipt failed');}),{id:'alice',email:'alice@test'},'personal','report-import');
 const result=await worker.fetch(new Request(origin+'/api/plan',{method:'PUT',headers:{origin,'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@test'},body:JSON.stringify({plan:p,revision:0})}),{DB:storage});assert.equal(result.status,503);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM plan_history').get().n,0);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM plans').get().n,0);
 }finally{c.db.close();}});
