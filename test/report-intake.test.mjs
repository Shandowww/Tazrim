import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,generateKeyPairSync,randomUUID} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {zero} from '../src/budget.js';
const origin='https://incoming.test',digest=v=>createHash('sha256').update(v).digest('hex');
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const plan=()=>({startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,cashPlanning:{accounts:[{id:'bank-a',label:'חשבון בדיקה',buffer:0}],months:{},cardAccounts:{},transfers:[]}});
async function setup(){
 const {db,DB}=openDatabase(':memory:');
 for(const user of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user,user,user+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(digest(user),user,Date.now()+3600000)}
 const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test'],reportOptions:{key:randomBytes(32),recoveryPublicKey:pair.publicKey}});
 const call=(user,path,body,method=body?'POST':'GET',headers={})=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+user,'x-budget-account-id':user,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}));
 for(const user of ['alice','bob'])assert.equal((await call(user,'/api/plan',{plan:plan(),revision:0},'PUT')).status,200);
 const connect=async(user='alice')=>{assert.equal((await call(user,'/api/report-intake',{action:'consent',confirmServerRead:true})).status,200);const secret=randomBytes(32).toString('base64url'),id=randomUUID();assert.equal((await call(user,'/api/report-intake',{action:'connect',id,secret,label:'iPhone'})).status,201);return {id,secret}};
 const receive=(secret,body='מספר חשבון 123456\nתאריך,תיאור,סכום,יתרה\n01/05/2026,בדיקה,-10,990',extra='')=>app(new Request(origin+'/api/imports/incoming?name='+encodeURIComponent('דוח & %.csv')+extra,{method:'POST',headers:{Authorization:'Bearer '+secret},body}));
 return {db,app,call,connect,receive};
}
test('Private intake stores only original bytes; parsing, routing and budgets stay untouched until exact-file approval',async()=>{
 const c=await setup();try{
 const connection=await c.connect(),before=c.db.prepare('SELECT user_id,data,revision FROM plans ORDER BY user_id').all(),uploaded=await c.receive(connection.secret);assert.equal(uploaded.status,201);const receipt=await uploaded.json();assert.equal(receipt.processingState,'awaiting_verification');
 assert.deepEqual(c.db.prepare('SELECT user_id,data,revision FROM plans ORDER BY user_id').all(),before);
 assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_intake_approvals').get().n,0);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_commits').get().n,0);
 const raw=c.db.prepare('SELECT * FROM report_sources').get();assert.equal(raw.scope,'incoming:alice');assert.equal(raw.draft,null);assert.equal(raw.kind,null);assert.ok(!Buffer.from(raw.source).includes('123456'));assert.ok(!Buffer.from(raw.metadata).includes('דוח'));
 const parse='/api/report-intake?id='+receipt.receiptId+'&purpose=parse';assert.equal((await c.call('alice',parse)).status,409);assert.equal((await c.call('bob',parse)).status,404);assert.equal((await c.call('alice',parse.replace('parse','original'))).status,200);
 assert.equal((await c.call('alice','/api/report-intake',{action:'approve',id:receipt.receiptId,sourceHash:'a'.repeat(64),revision:1,confirm:true})).status,409);
 const approval={action:'approve',id:receipt.receiptId,sourceHash:receipt.sourceHash,revision:1,confirm:true};assert.equal((await c.call('alice','/api/report-intake',approval)).status,200);assert.equal((await c.call('alice','/api/report-intake',approval)).status,200);assert.equal((await c.call('alice',parse)).status,200);
 assert.deepEqual(c.db.prepare('SELECT user_id,data,revision FROM plans ORDER BY user_id').all(),before);
 const alice=await(await c.call('alice','/api/report-intake')).json(),bob=await(await c.call('bob','/api/report-intake')).json();assert.equal(alice.reports.length,1);assert.equal(bob.reports.length,0);assert.equal(alice.reports[0].verificationState,'verified');
 }finally{c.db.close()}
});
test('Receipt tokens see only their own deliveries; duplicates, revocation and actor binding are enforced',async()=>{
 const c=await setup();try{
 const a=await c.connect(),other=await c.connect(),b=await c.connect('bob'),r=await(await c.receive(a.secret)).json();assert.equal((await(await c.receive(a.secret)).json()).receiptId,r.receiptId);
 const get=secret=>c.app(new Request(origin+'/api/imports/incoming?receipt='+r.receiptId,{headers:{Authorization:'Bearer '+secret}}));assert.equal((await get(a.secret)).status,200);assert.equal((await get(other.secret)).status,404);assert.equal((await get(b.secret)).status,404);
 assert.equal((await c.call('alice','/api/report-intake',null,'GET',{'x-budget-account-id':'bob'})).status,403);
 assert.equal((await c.call('alice','/api/report-intake',{action:'revoke',id:a.id})).status,200);assert.equal((await c.receive(a.secret)).status,401);assert.equal((await get(a.secret)).status,401);
 const connections=(await(await c.call('alice','/api/report-intake')).json()).connections;assert.ok(connections.find(v=>v.id===a.id).last_success);assert.ok(!JSON.stringify(connections).includes(a.secret));
 }finally{c.db.close()}
});
test('Routing reuses the existing report store atomically and recovers a retry without another source or financial save',async()=>{
 const c=await setup();try{
 const connection=await c.connect(),r=await(await c.receive(connection.secret)).json(),route={action:'route',id:r.receiptId,sourceHash:r.sourceHash,revision:1,confirm:true,budget:'personal',budgetRevision:1,kind:'bank',target:'bank-a',identityKey:digest('bank:hapoalim:123456'),remember:true,bindingRevision:0};
 assert.equal((await c.call('alice','/api/report-intake',route)).status,409);
 await c.call('alice','/api/report-intake',{action:'approve',id:r.receiptId,sourceHash:r.sourceHash,revision:1,confirm:true});const before=c.db.prepare('SELECT * FROM plans ORDER BY user_id').all();
 const response=await c.call('alice','/api/report-intake',route);assert.equal(response.status,200,await response.clone().text());const result=await response.json();assert.equal((await(await c.call('alice','/api/report-intake',route)).json()).recovered,true);
 assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources').get().n,2);assert.equal(c.db.prepare('SELECT revision FROM report_intake_bindings').get().revision,1);assert.deepEqual(c.db.prepare('SELECT * FROM plans ORDER BY user_id').all(),before);
 const target=await(await c.call('alice','/api/reports?id='+result.reportId)).json();assert.equal(target.state,'received');assert.equal(target.draft,null);assert.equal(target.sourceHash,r.sourceHash);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_commits').get().n,0);
 assert.equal((await c.call('alice','/api/report-intake',{...route,target:'missing'})).status,409);
 }finally{c.db.close()}
});
test('A viewer cannot route into a shared budget and routing failure rolls back the target copy and binding',async()=>{
 const c=await setup();try{
 const house=(await(await c.call('alice','/api/budgets',{name:'משותף'})).json()).id;await c.call('alice','/api/plan?budget='+house,{plan:plan(),revision:0},'PUT');const invite=await(await c.call('alice','/api/budgets/'+house+'/invites',{email:'bob@example.test',role:'viewer'})).json();await c.call('bob','/api/budgets/accept',{token:invite.token});
 const connection=await c.connect('bob'),r=await(await c.receive(connection.secret)).json();await c.call('bob','/api/report-intake',{action:'approve',id:r.receiptId,sourceHash:r.sourceHash,revision:1,confirm:true});const route={action:'route',id:r.receiptId,sourceHash:r.sourceHash,revision:1,confirm:true,budget:house,budgetRevision:1,kind:'bank',target:'bank-a',identityKey:digest('bank:1'),remember:true,bindingRevision:0};assert.equal((await c.call('bob','/api/report-intake',route)).status,403);
 c.db.exec("CREATE TRIGGER reject_intake_route BEFORE UPDATE OF report_id ON report_intake_approvals BEGIN SELECT RAISE(ABORT,'fault'); END");assert.equal((await c.call('bob','/api/report-intake',{...route,budget:'personal'})).status,503);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources').get().n,1);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_intake_bindings').get().n,0);
 }finally{c.db.close()}
});

test('A failed connection receipt rolls back its source and success marker, then retries exactly once',async()=>{
 const c=await setup();try{
  const connection=await c.connect(),before=c.db.prepare('SELECT * FROM plans ORDER BY user_id').all();
  c.db.exec("CREATE TRIGGER reject_incoming_receipt BEFORE INSERT ON report_intake_submissions BEGIN SELECT RAISE(ABORT,'receipt fault'); END");
  assert.equal((await c.receive(connection.secret)).status,503);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources').get().n,0);
  const failed=c.db.prepare('SELECT last_success,last_error FROM report_intake_connections WHERE id=?').get(connection.id);
  assert.equal(failed.last_success,null);assert.ok(failed.last_error);
  c.db.exec('DROP TRIGGER reject_incoming_receipt');
  const retry=await c.receive(connection.secret);assert.equal(retry.status,201);
  const receipt=await retry.json();assert.equal((await(await c.receive(connection.secret)).json()).receiptId,receipt.receiptId);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources').get().n,1);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_intake_submissions').get().n,1);
  assert.deepEqual(c.db.prepare('SELECT * FROM plans ORDER BY user_id').all(),before);
 }finally{c.db.close()}
});
test('A full destination leaves the approved incoming original and remembered associations unchanged',async()=>{
 const c=await setup();try{
  const connection=await c.connect(),r=await(await c.receive(connection.secret)).json();
  await c.call('alice','/api/report-intake',{action:'approve',id:r.receiptId,sourceHash:r.sourceHash,revision:1,confirm:true});
  // Quota is enforced by the existing report store, including during routing.
  c.db.exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<500) INSERT INTO report_sources(id,scope,source_hash,source,metadata,source_bytes,created_at) SELECT 'quota-'||x,'personal:alice',printf('%064d',x),r.source,r.metadata,r.source_bytes,r.created_at FROM n CROSS JOIN report_sources r WHERE r.scope='incoming:alice'");
  const route={action:'route',id:r.receiptId,sourceHash:r.sourceHash,revision:1,confirm:true,budget:'personal',budgetRevision:1,kind:'bank',target:'bank-a',identityKey:digest('bank:quota'),remember:true,bindingRevision:0};
  const before=c.db.prepare('SELECT * FROM plans ORDER BY user_id').all();
  assert.equal((await c.call('alice','/api/report-intake',route)).status,413);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources').get().n,501);
  assert.equal(c.db.prepare('SELECT report_id FROM report_intake_approvals').get().report_id,null);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_intake_bindings').get().n,0);
  assert.equal((await c.call('alice','/api/report-intake?id='+r.receiptId+'&purpose=original')).status,200);
  assert.deepEqual(c.db.prepare('SELECT * FROM plans ORDER BY user_id').all(),before);
 }finally{c.db.close()}
});

test('Explicit private cleanup invalidates only its receipts and approval, preserves the routed source and recovers a lost response',async()=>{
 const c=await setup();try{
  const connection=await c.connect(),other=await c.connect('bob'),r=await(await c.receive(connection.secret)).json();
  const ref={id:r.receiptId,sourceHash:r.sourceHash,revision:1};
  await c.call('alice','/api/report-intake',{...ref,action:'approve',confirm:true});
  const routed=await(await c.call('alice','/api/report-intake',{...ref,action:'route',confirm:true,budget:'personal',budgetRevision:1,kind:'bank',target:'bank-a',identityKey:digest('bank:cleanup'),remember:true,bindingRevision:0})).json();
  const financial=c.db.prepare('SELECT * FROM plans ORDER BY user_id').all(),binding=c.db.prepare('SELECT * FROM report_intake_bindings').all(),target=c.db.prepare('SELECT * FROM report_sources WHERE id=?').get(routed.reportId);
  assert.equal((await c.call('alice','/api/report-intake',{...ref,action:'delete',confirm:false})).status,400);
  assert.equal((await c.call('alice','/api/report-intake',{...ref,action:'delete',confirm:true,revision:2})).status,409);
  // Deleting an absent/foreign identifier is opaque and never touches its owner.
  assert.equal((await c.call('bob','/api/report-intake',{...ref,action:'delete',confirm:true})).status,200);
  assert.ok(c.db.prepare('SELECT 1 FROM report_sources WHERE id=?').get(ref.id));
  const deletion={...ref,action:'delete',confirm:true};
  c.db.exec("CREATE TRIGGER reject_private_delete BEFORE DELETE ON report_sources WHEN OLD.scope='incoming:alice' BEGIN SELECT RAISE(ABORT,'cleanup fault'); END");
  assert.equal((await c.call('alice','/api/report-intake',deletion)).status,503);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_intake_submissions').get().n,1);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_intake_approvals').get().n,1);
  c.db.exec('DROP TRIGGER reject_private_delete');
  assert.equal((await c.call('alice','/api/report-intake',deletion)).status,200);
  assert.equal((await(await c.call('alice','/api/report-intake',deletion)).json()).recovered,true);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_intake_submissions').get().n,0);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_intake_approvals').get().n,0);
  assert.deepEqual(c.db.prepare('SELECT * FROM report_sources WHERE id=?').get(routed.reportId),target);
  assert.deepEqual(c.db.prepare('SELECT * FROM report_intake_bindings').all(),binding);
  assert.deepEqual(c.db.prepare('SELECT * FROM plans ORDER BY user_id').all(),financial);
  const headers={authorization:'Bearer '+connection.secret};
  assert.equal((await c.app(new Request(origin+'/api/imports/incoming?receipt='+ref.id,{headers}))).status,404);
  assert.deepEqual((await(await c.app(new Request(origin+'/api/imports/incoming?catalog=1',{headers}))).json()).receipts,{});
  const again=await(await c.receive(connection.secret)).json();assert.notEqual(again.receiptId,ref.id);assert.equal(again.processingState,'awaiting_verification');
  assert.equal((await c.call('alice','/api/report-intake?id='+again.receiptId+'&purpose=parse')).status,409);
 }finally{c.db.close()}
});

test('An upload revoked or switched during its streaming body cannot persist a source or receipt',async()=>{
 for(const change of ['connection','actor']){const c=await setup();try{
  const connection=await c.connect();let sink;
  const body=new ReadableStream({start(controller){sink=controller}});
  const pending=c.app(new Request(origin+'/api/imports/incoming?name=stream.csv',{method:'POST',headers:{authorization:'Bearer '+connection.secret},duplex:'half',body}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(c.db.prepare('SELECT last_attempt FROM report_intake_connections WHERE id=?').get(connection.id).last_attempt);
  if(change==='connection')await c.call('alice','/api/report-intake',{action:'revoke',id:connection.id});
  else c.db.prepare('UPDATE auth_users SET email=? WHERE id=?').run('changed@example.test','alice');
  sink.enqueue(new TextEncoder().encode('date,amount\n01/01/2026,1'));sink.close();
  assert.equal((await pending).status,change==='connection'?401:403);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources').get().n,0);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_intake_submissions').get().n,0);
 }finally{c.db.close()}}
});

test('Routing refuses a stale destination or binding witness and recovers an already successful route after a later budget save',async()=>{
 const c=await setup();try{
  const connection=await c.connect(),r=await(await c.receive(connection.secret)).json(),ref={id:r.receiptId,sourceHash:r.sourceHash,revision:1};
  await c.call('alice','/api/report-intake',{...ref,action:'approve',confirm:true});
  const route={...ref,action:'route',confirm:true,budget:'personal',budgetRevision:1,kind:'bank',target:'bank-a',identityKey:digest('bank:stale'),remember:true,bindingRevision:0};
  await c.call('alice','/api/plan',{plan:{...plan(),buffer:50},revision:1},'PUT');
  assert.equal((await c.call('alice','/api/report-intake',route)).status,409);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources').get().n,1);
  route.budgetRevision=2;assert.equal((await c.call('alice','/api/report-intake',route)).status,200);
  await c.call('alice','/api/plan',{plan:{...plan(),buffer:75},revision:2},'PUT');
  assert.equal((await(await c.call('alice','/api/report-intake',route)).json()).recovered,true);
  const next=await(await c.receive(connection.secret,'another synthetic bank report')).json(),ref2={id:next.receiptId,sourceHash:next.sourceHash,revision:1};
  await c.call('alice','/api/report-intake',{...ref2,action:'approve',confirm:true});
  assert.equal((await c.call('alice','/api/report-intake',{...route,...ref2,budgetRevision:3,automatic:true,remember:false,bindingRevision:0})).status,409);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources').get().n,3);
  assert.equal((await c.call('alice','/api/report-intake',{...route,...ref2,budgetRevision:3,automatic:true,remember:false,bindingRevision:1})).status,200);
 }finally{c.db.close()}
});

test('Local cleanup requires a durable full original-workflow group, current receipts, exact connection/hash and retained sources',async()=>{
 const {readReportContent}=await import('../frontend/src/app/report-reader.ts');
 const {buildReportInbox,reportInboxDraftForWrite}=await import('../src/report-inbox-controller.js');
 const classifier=await import('../tools/bank-csv/classifier.mjs');
 for(const count of [1,2]){
  const c=await setup();try{
   const connection=await c.connect(),other=await c.connect(),items=[],incoming=[],targets=[];
   const check=async(secret=connection.secret,query='')=>{const response=await c.app(new Request(origin+'/api/imports/incoming?receipt='+incoming[0].receiptId+query,{headers:{authorization:'Bearer '+secret}}));return {status:response.status,body:await response.json()}};
   for(let i=0;i<count;i++){
    const bytes='הפועלים\nמספר חשבון 123456\nתאריך,תיאור,סכום,יתרה\n01/0'+(5+i)+'/2026,משכורת,100,1100';
    const r=await(await c.receive(connection.secret,bytes)).json();incoming.push(r);
    await c.call('alice','/api/report-intake',{action:'approve',id:r.receiptId,sourceHash:r.sourceHash,revision:1,confirm:true});
    const route=await(await c.call('alice','/api/report-intake',{action:'route',id:r.receiptId,sourceHash:r.sourceHash,revision:1,confirm:true,budget:'personal',budgetRevision:1,kind:'bank',target:'bank-a',identityKey:'',remember:false})).json();
    assert.ok(route.reportId,JSON.stringify(route));targets.push(route.reportId);
    const parsed=await readReportContent('bank.csv',new TextEncoder().encode(bytes),new AbortController().signal);
    items.push({...parsed,id:randomUUID(),name:'bank.csv',target:'bank-a',payer:'',decisions:{},directIncluded:{},monthDecisions:{},bankOptions:{scope:'complete'},storedId:route.reportId,storedRevision:1,skip:false});
   }
   assert.equal((await check()).body.cleanupEligible,false);
   const base=await(await c.call('alice','/api/plan')).json(),ui={items,categoryChoices:new Map(),bankChoices:new Map(),newAccounts:[],newCards:[],duplicates:0};
   await buildReportInbox(base.plan,ui,{month:'2026-10',today:'2026-11-06',classifier,activityAPI:null});assert.equal(ui.issues,0,ui.error);assert.ok(ui.build);
   const reports=targets.map(id=>({id,revision:1,state:'ready'})),draft=reportInboxDraftForWrite(ui,items,'cleanup-test');
   assert.equal((await c.call('alice','/api/reports',{action:'draft-batch',reports,draft})).status,200);
   assert.equal((await check()).body.cleanupEligible,false);
   const body={action:'commit',actionId:randomUUID(),revision:base.revision,plan:ui.build,reports:targets.map(id=>({id,revision:2}))};
   c.db.exec("CREATE TRIGGER reject_cleanup_commit BEFORE INSERT ON report_commits BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
   assert.equal((await c.call('alice','/api/reports',body)).status,503);assert.equal((await check()).body.cleanupEligible,false);
   c.db.exec('DROP TRIGGER reject_cleanup_commit');
   const saved=await c.call('alice','/api/reports',body);assert.equal(saved.status,200,await saved.clone().text());
   const receipt=(await check()).body;assert.equal(receipt.cleanupEligible,true);assert.equal(receipt.fullImportComplete,true);assert.equal(receipt.budgetState,'committed');assert.equal(receipt.connectionId,connection.id);
   assert.equal((await c.call('alice','/api/reports',body)).status,200);assert.equal((await check()).body.cleanupEligible,true);
   assert.equal((await check(other.secret)).status,404);assert.equal((await check(connection.secret,'&hash='+'f'.repeat(64))).status,404);
   const sources=c.db.prepare('SELECT id,source FROM report_sources ORDER BY id').all();assert.equal(sources.length,count*2);
   // A sibling reopened or pending invalidates the entire group's completion.
   c.db.prepare("UPDATE report_sources SET state='needs_review' WHERE id=?").run(targets.at(-1));assert.equal((await check()).body.cleanupEligible,false);
   c.db.prepare("UPDATE report_sources SET state='committed' WHERE id=?").run(targets.at(-1));assert.equal((await check()).body.cleanupEligible,true);
   const current=await(await c.call('alice','/api/plan')).json();current.plan.reportInbox.receipts=[];
   assert.equal((await c.call('alice','/api/plan',{plan:current.plan,revision:current.revision},'PUT')).status,200);assert.equal((await check()).body.cleanupEligible,false);
   assert.deepEqual(c.db.prepare('SELECT id,source FROM report_sources ORDER BY id').all(),sources);
   await c.call('alice','/api/report-intake',{action:'revoke',id:connection.id});assert.equal((await check()).status,401);
  }finally{c.db.close()}
 }
});

test('Day-0 device cleanup proves stored bytes before parsing without financial completion',async()=>{
 const c=await setup();try{
  const connection=await c.connect(),bytes='unrecognized synthetic CSV retained for manual review',before=c.db.prepare('SELECT * FROM plans ORDER BY user_id').all();
  const posted=await(await c.receive(connection.secret,bytes)).json();
  assert.equal(posted.deviceCleanupVersion,1);assert.equal(posted.storageVerified,false);assert.equal(posted.deviceCopyRemovable,false);assert.equal(posted.cleanupEligible,false);
  const url='/api/imports/incoming?receipt='+posted.receiptId+'&hash='+posted.sourceHash;
  const read=(secret=connection.secret,suffix='&verifyStorage=1')=>c.app(new Request(origin+url+suffix,{headers:{authorization:'Bearer '+secret}}));
  const normal=await(await read(connection.secret,'')).json();assert.equal(normal.storageVerified,false);
  const checked=await read();assert.equal(checked.status,200);assert.match(checked.headers.get('cache-control'),/no-store/);
  const proof=await checked.json();assert.equal(proof.deviceCopyRemovable,true);assert.equal(proof.storageVerified,true);assert.equal(proof.originalRemoved,false);assert.equal(proof.connectionId,connection.id);assert.equal(proof.sourceHash,digest(bytes));assert.ok(proof.storageVerifiedAt);
  assert.equal(proof.processingState,'awaiting_verification');assert.equal(proof.cleanupEligible,false);assert.equal(proof.fullImportComplete,false);assert.equal(proof.budgetState,'not-committed');
  const catalog=await(await c.app(new Request(origin+'/api/imports/incoming?catalog=2',{headers:{authorization:'Bearer '+connection.secret}}))).json();assert.equal(catalog.receipts[posted.sourceHash].deviceCopyRemovable,false);
  const original=await c.call('alice','/api/report-intake?id='+posted.receiptId+'&purpose=original');assert.equal(await original.text(),bytes);
  assert.equal((await c.call('alice','/api/report-intake?id='+posted.receiptId+'&purpose=parse')).status,409);
  assert.deepEqual(c.db.prepare('SELECT * FROM plans ORDER BY user_id').all(),before);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_intake_approvals').get().n,0);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_commits').get().n,0);assert.equal(c.db.prepare('SELECT draft FROM report_sources').get().draft,null);
  const other=await c.connect();assert.equal((await read(other.secret)).status,404);
  const bob=await c.connect('bob');assert.equal((await read(bob.secret)).status,404);
  assert.equal((await c.app(new Request(origin+'/api/imports/incoming?verifyStorage=1&receipt='+posted.receiptId,{headers:{authorization:'Bearer '+connection.secret}}))).status,400);
  assert.equal((await c.app(new Request(origin+url.replace(posted.sourceHash,'0'.repeat(64))+'&verifyStorage=1',{headers:{authorization:'Bearer '+connection.secret}}))).status,404);
  // An authenticated envelope that fails read-back cannot authorize deletion.
  const stored=c.db.prepare('SELECT source,source_bytes FROM report_sources WHERE id=?').get(posted.receiptId);
  c.db.prepare('UPDATE report_sources SET source_bytes=source_bytes+1 WHERE id=?').run(posted.receiptId);assert.equal((await read()).status,503);
  c.db.prepare('UPDATE report_sources SET source_bytes=? ,source=? WHERE id=?').run(stored.source_bytes,Buffer.from('corrupted encrypted bytes'),posted.receiptId);assert.equal((await read()).status,503);
  c.db.prepare('UPDATE report_sources SET source=? WHERE id=?').run(stored.source,posted.receiptId);
  await c.call('alice','/api/report-intake',{action:'delete',id:posted.receiptId,sourceHash:posted.sourceHash,revision:1,confirm:true});assert.equal((await read()).status,404);
  await c.call('alice','/api/report-intake',{action:'revoke',id:connection.id});assert.equal((await read()).status,401);
 }finally{c.db.close()}
});
