import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,generateKeyPairSync,randomUUID} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {createDriveBackup} from '../server/drive-backup.mjs';
import {createVault} from '../src/vault.js';
import {zero} from '../src/budget.js';
import {calPDFFixture} from '../tools/bank-csv/cal-pdf-fixture.mjs';
import {loadReportGroup} from '../frontend/src/app/report-group-loader.ts';
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts';
import {buildReportInbox,reportInboxDraftForWrite} from '../src/report-inbox-controller.js';
import {commitStoredReportGroup} from '../frontend/src/app/report-review-api.ts';
import * as classifier from '../tools/bank-csv/classifier.mjs';
import * as activityAPI from '../tools/bank-csv/cal-activity.mjs';
import {statementMerchant} from '../src/card-statement-model.js';
const origin='https://automation.test',digest=v=>createHash('sha256').update(v).digest('hex'),pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const plan=()=>({startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true,creditCards:[{id:'card1',name:'כרטיס בדיקה',alias:'1234',provider:'cal'}],cashPlanning:{accounts:[{id:'bank-a',label:'חשבון בדיקה',bankName:'hapoalim',buffer:0}],months:{},cardAccounts:{card1:'bank-a'},transfers:[]}});
async function setup(options={}){
 const {db,DB}=openDatabase(':memory:');for(const user of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user,user,user+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(digest(user),user,Date.now()+3600000);}
 const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test'],reportOptions:{key:randomBytes(32),recoveryPublicKey:pair.publicKey},reportAutomationEnabled:true,...options});
 const call=(user,path,body,method=body?'POST':'GET',headers={})=>app(new Request(origin+path,{method,headers:{origin,cookie:'__Host-mf_session='+user,'x-budget-account-id':user,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}));
 for(const user of ['alice','bob']){assert.equal((await call(user,'/api/plan',{plan:plan(),revision:0},'PUT')).status,200);await call(user,'/api/report-intake',{action:'consent',confirmServerRead:true});}
 const connect=async()=>{const secret=randomBytes(32).toString('base64url');await call('alice','/api/report-intake',{action:'connect',id:randomUUID(),secret,label:'Synthetic'});return secret;};
 const receive=async(secret,bytes,name='report.csv')=>app(new Request(origin+'/api/imports/incoming?name='+encodeURIComponent(name),{method:'POST',headers:{authorization:'Bearer '+secret},body:bytes}));
 const enable=()=>call('alice','/api/report-automation',{action:'policy',budget:'personal',enabled:true,confirmReadAndPrepare:true,revision:0});
 const binding=(identity='bank:hapoalim:123456',kind='bank',target='bank-a')=>db.prepare('INSERT INTO report_intake_bindings VALUES(?,?,?,?,?,1)').run('alice',digest(identity),kind,'personal',target);
 const snapshot=async()=> (await call('alice','/api/report-automation')).json();
 const financial=()=>JSON.stringify(db.prepare('SELECT user_id,data,revision FROM plans ORDER BY user_id').all());
 const fetcher=(input,init)=>app(new Request(typeof input==='string'?origin+input:input,{...init,headers:{...Object.fromEntries(new Headers(init?.headers)),origin,cookie:'__Host-mf_session=alice'}}));
 return{db,app,call,connect,receive,enable,binding,snapshot,financial,fetcher};
}
const csv='הפועלים\nמספר חשבון 123456\nתאריך,תיאור,סכום,יתרה\n01/10/2026,משכורת,100,1100';
test('Changed-data backup tracking includes automation policies and encrypted proposals but ignores lease timestamps',async()=>{
 const c=await setup();try{
  createDriveBackup({db:c.db,origin,admins:new Set()});
  const version=()=>c.db.prepare('SELECT version FROM backup_data_state WHERE id=1').get().version;
  let before=version();assert.equal((await c.enable()).status,200);assert.ok(version()>before);
  c.binding();const secret=await c.connect();await c.receive(secret,csv);const j=(await c.snapshot()).jobs[0];assert.equal(j.status,'review');
  before=version();c.db.prepare('UPDATE report_automation_jobs SET updated_at=updated_at+1 WHERE intake_id=?').run(j.id);c.db.prepare('UPDATE report_automation_policies SET updated_at=updated_at+1').run();assert.equal(version(),before);
  assert.equal((await c.call('alice','/api/report-automation',{action:'reject',id:j.id,revision:j.revision})).status,200);assert.ok(version()>before);
  before=version();c.db.prepare('DELETE FROM report_automation_jobs WHERE intake_id=?').run(j.id);assert.ok(version()>before);
  before=version();c.db.prepare('DELETE FROM report_automation_policies').run();assert.ok(version()>before);
 }finally{c.db.close();}
});
test('Default Phase 1 cannot prepare or change a policy; enabled service still requires explicit user opt-in',async()=>{const c=await setup({reportAutomationEnabled:false});try{assert.equal((await(await c.call('alice','/api/report-automation')).json()).available,false);assert.equal((await c.enable()).status,409);const before=c.financial(),s=await c.connect();assert.equal((await c.receive(s,csv)).status,201);assert.equal(c.financial(),before);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_intake_approvals').get().n,0);}finally{c.db.close();}});
test('Opt-in prepares a durable encrypted original-controller draft and user approval uses the original atomic import',async()=>{const c=await setup();try{c.binding();const secret=await c.connect(),before=c.financial();assert.equal((await c.enable()).status,200);const receipt=await(await c.receive(secret,csv)).json(),snapshot=await c.snapshot(),j=snapshot.jobs[0];assert.equal(j.status,'review',JSON.stringify(j));assert.equal(c.financial(),before);assert.equal(j.summary.counts.new,1);assert.equal(j.shadow.eligible,false);assert.match(j.summary.warnings.join(" "),/אינו מכסה חודש מלא/);assert.equal(snapshot.automaticFinancialWrites,false);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_commits').get().n,0);assert.ok(!Buffer.from(c.db.prepare('SELECT data FROM report_automation_jobs').get().data).includes('משכורת'));
 const bob=await(await c.call('bob','/api/report-automation')).json();assert.equal(bob.jobs.length,0);assert.equal((await c.call('bob','/api/report-automation',{action:'reject',id:j.id,revision:j.revision})).status,409);
 const base=(await loadBudgetSnapshot('personal',new AbortController().signal,c.fetcher)).value,loaded=await loadReportGroup('personal',base,[j.reportId],new AbortController().signal,c.fetcher);await buildReportInbox(base.plan,loaded.ui,{month:'2026-11',today:'2026-11-06',classifier,activityAPI});assert.ok(loaded.ui.build);const draft=reportInboxDraftForWrite(loaded.ui,loaded.ui.items,j.parserVersion),result=await commitStoredReportGroup('personal',base,loaded.sources,draft,loaded.ui.build,randomUUID(),c.fetcher);assert.equal(result.value.revision,2);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_commits').get().n,1);assert.equal((await c.snapshot()).jobs[0].status,'imported');assert.equal((await c.snapshot()).jobs[0].reviewResult.comparison,'approved_unchanged');
 assert.equal((await c.receive(secret,csv)).status,201);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_commits').get().n,1);assert.equal(receipt.cleanupEligible,false);
 }finally{c.db.close();}});
test('Cal PDF preparation reconciles refunds/installments, persists two issuer notices and leaves finances untouched',async()=>{const c=await setup();try{c.binding('cal:1234','card','card1');await c.enable();const before=c.financial(),secret=await c.connect();assert.equal((await c.receive(secret,calPDFFixture(),'cal.pdf')).status,201);const j=(await c.snapshot()).jobs[0];assert.equal(j.status,'review',JSON.stringify(j));assert.equal(j.summary.cardTotal,50);assert.equal(j.summary.counts.new,2);const notices=await(await c.call('alice','/api/statement-notices?budget=personal')).json();assert.equal(notices.notices.length,2);assert.equal(c.financial(),before);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_commits').get().n,0);}finally{c.db.close();}});
test('User corrections use the original import and shadow comparison records the corrected result only after approval',async()=>{
 const c=await setup();try{
  c.binding('cal:1234','card','card1');await c.enable();const secret=await c.connect();await c.receive(secret,calPDFFixture(),'cal.pdf');const j=(await c.snapshot()).jobs[0],before=c.financial();
  const base=(await loadBudgetSnapshot('personal',new AbortController().signal,c.fetcher)).value,loaded=await loadReportGroup('personal',base,[j.reportId],new AbortController().signal,c.fetcher);
  loaded.ui.categoryChoices.set(statementMerchant(loaded.ui.items[0].report.entries[0].merchant),'מזון');
  await buildReportInbox(base.plan,loaded.ui,{month:'2026-11',today:'2026-11-07',classifier,activityAPI});assert.ok(loaded.ui.build);assert.equal(c.financial(),before);
  const draft=reportInboxDraftForWrite(loaded.ui,loaded.ui.items,j.parserVersion);
  const result=await commitStoredReportGroup('personal',base,loaded.sources,draft,loaded.ui.build,randomUUID(),c.fetcher);
  assert.equal(result.value.revision,2);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_commits').get().n,1);
  const reviewed=(await c.snapshot()).jobs[0];assert.equal(reviewed.status,'imported');assert.equal(reviewed.reviewResult.comparison,'corrected');assert.equal(reviewed.summary.cardTotal,50);
 }finally{c.db.close()}
});
test('Unknown identifiers stay visible, no arbitrary sole-account routing and no budget writes occur',async()=>{const c=await setup();try{await c.enable();const before=c.financial(),secret=await c.connect();await c.receive(secret,csv);const j=(await c.snapshot()).jobs[0];assert.equal(j.status,'attention');assert.match(j.message,/שיוך מזהה/);assert.equal(c.financial(),before);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources WHERE scope=?').get('personal:alice').n,0);assert.equal((await c.call('alice','/api/report-automation',{action:'reject',id:j.id,revision:j.revision})).status,200);await c.receive(secret,csv);assert.equal((await c.snapshot()).jobs[0].status,'rejected');}finally{c.db.close();}});
test('Policy pause during parsing prevents routing; stale policy writes and missing consent fail closed',async()=>{let release,started;const wait=new Promise(r=>started=r),c=await setup({automationOptions:{readSource:async()=>{started();return new Promise(r=>release=r);}}});try{c.binding();await c.enable();const secret=await c.connect(),pending=c.receive(secret,csv);await wait;assert.equal((await c.call('alice','/api/report-automation',{action:'policy',budget:'personal',enabled:false,revision:1})).status,200);release({parsed:{kind:'bank',provider:'hapoalim',identity:'bank:hapoalim:123456'},pages:[]});assert.equal((await pending).status,201);assert.equal((await c.snapshot()).jobs[0].status,'attention');assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources WHERE scope=?').get('personal:alice').n,0);assert.equal((await c.enable()).status,409);}finally{c.db.close();}});
test('Revision changes mark proposals stale; regeneration replaces only its own unchanged saved draft',async()=>{const c=await setup();try{c.binding();await c.enable();const secret=await c.connect();await c.receive(secret,csv);let j=(await c.snapshot()).jobs[0];const p=plan();p.buffer=10;assert.equal((await c.call('alice','/api/plan',{plan:p,revision:1},'PUT')).status,200);j=(await c.snapshot()).jobs[0];assert.equal(j.stale,true);assert.equal((await c.call('alice','/api/report-automation',{action:'prepare',id:j.id,revision:j.revision})).status,200);j=(await c.snapshot()).jobs[0];assert.equal(j.status,'review',JSON.stringify(j));assert.equal(j.budgetRevision,2);assert.equal(j.stale,false);const source=await(await c.call('alice','/api/reports?budget=personal&id='+j.reportId)).json();source.draft.categoryChoices=[['user choice','קניות']];await c.call('alice','/api/reports?budget=personal&id='+j.reportId,{action:'draft',revision:source.revision,draft:source.draft,state:'needs_review'});const changed=JSON.stringify(c.db.prepare('SELECT draft FROM report_sources WHERE id=?').get(j.reportId).draft);await c.call('alice','/api/report-automation',{action:'prepare',id:j.id,revision:j.revision});assert.equal((await c.snapshot()).jobs[0].status,'attention');assert.equal(JSON.stringify(c.db.prepare('SELECT draft FROM report_sources WHERE id=?').get(j.reportId).draft),changed);}finally{c.db.close();}});

test('Concurrent deliveries drain durable queued sources without replay, and interrupted leases can resume',async()=>{
 let release,started;const entered=new Promise(r=>started=r);let calls=0;
 const {readAutomaticSource}=await import('../server/report-automation.mjs');
 const c=await setup({automationOptions:{readSource:async(name,bytes)=>{calls++;if(calls===1){started();await new Promise(r=>release=r)}return readAutomaticSource(name,bytes)}}});
 try{c.binding();await c.enable();const secret=await c.connect(),before=c.financial(),first=c.receive(secret,csv);await entered;
  assert.equal((await c.receive(secret,csv.replace('100,1100','200,1200'))).status,201);
  assert.equal((await c.snapshot()).jobs.filter(j=>j.status==='queued').length,1);
  release();await first;assert.equal((await c.snapshot()).jobs.filter(j=>j.status==='review').length,2);assert.equal(calls,2);assert.equal(c.financial(),before);
  const j=(await c.snapshot()).jobs[0];c.db.prepare("UPDATE report_automation_jobs SET status='working',updated_at=? WHERE intake_id=?").run(Date.now()-31000,j.id);
  assert.equal((await c.call('alice','/api/report-automation',{action:'resume'})).status,200);
  const resumed=(await c.snapshot()).jobs.find(x=>x.id===j.id);assert.equal(resumed.status,'review');assert.equal(c.financial(),before);
 }finally{c.db.close()}
});
test('Existing server maintenance resumes interrupted preparation only while policy and actor remain authorized',async()=>{
 const c=await setup();try{
  c.binding();await c.enable();const secret=await c.connect(),before=c.financial();await c.receive(secret,csv);
  let j=(await c.snapshot()).jobs[0];
  c.db.prepare("UPDATE report_automation_jobs SET status='working',updated_at=0 WHERE intake_id=?").run(j.id);
  await c.call('alice','/api/report-automation',{action:'policy',budget:'personal',enabled:false,revision:1});
  await c.app.tickReportAutomation();assert.equal((await c.snapshot()).jobs[0].status,'working');
  await c.call('alice','/api/report-automation',{action:'policy',budget:'personal',enabled:true,revision:2,confirmReadAndPrepare:true});
  await c.app.tickReportAutomation();j=(await c.snapshot()).jobs[0];assert.equal(j.status,'review');
  c.db.prepare("UPDATE report_automation_jobs SET status='working',updated_at=0 WHERE intake_id=?").run(j.id);
  c.db.prepare('UPDATE auth_users SET email=? WHERE id=?').run('revoked@example.test','alice');
  await c.app.tickReportAutomation();assert.equal(c.db.prepare('SELECT status FROM report_automation_jobs WHERE intake_id=?').get(j.id).status,'working');
  assert.equal(c.financial(),before);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_commits').get().n,0);
 }finally{c.db.close()}
 const disabled=await setup({reportAutomationEnabled:false});try{await disabled.app.tickReportAutomation();assert.equal((await disabled.snapshot()).available,false)}finally{disabled.db.close()}
});
test('Only shared owners can opt in, and lost ownership during extraction prevents any destination write',async()=>{
 let release,entered;const started=new Promise(r=>entered=r),c=await setup({automationOptions:{readSource:async()=>{entered();return new Promise(r=>release=r)}}});
 try{
  const id=(await(await c.call('alice','/api/budgets',{name:'Synthetic shared'})).json()).id;
  assert.equal((await c.call('alice','/api/plan?budget='+id,{plan:plan(),revision:0},'PUT')).status,200);
  c.db.prepare('INSERT INTO budget_members VALUES(?,?,?)').run(id,'bob','bob@example.test');
  c.db.prepare('INSERT INTO budget_member_roles VALUES(?,?,?)').run(id,'bob','viewer');
  const input={action:'policy',budget:id,enabled:true,revision:0,confirmReadAndPrepare:true};
  assert.equal((await c.call('bob','/api/report-automation',input)).status,403);
  c.db.prepare("UPDATE budget_member_roles SET role='editor' WHERE budget_id=?").run(id);
  assert.equal((await c.call('bob','/api/report-automation',input)).status,403);
  assert.equal((await c.call('alice','/api/report-automation',input)).status,200);
  c.db.prepare('INSERT INTO report_intake_bindings VALUES(?,?,?,?,?,1)').run('alice',digest('bank:hapoalim:123456'),'bank',id,'bank-a');
  const secret=await c.connect(),financial=c.financial(),before=c.db.prepare('SELECT data,revision FROM budgets WHERE id=?').get(id),pending=c.receive(secret,csv);await started;
  c.db.prepare('INSERT INTO budget_members VALUES(?,?,?)').run(id,'alice','alice@example.test');c.db.prepare("UPDATE budgets SET owner_id='bob' WHERE id=?").run(id);
  release({parsed:{kind:'bank',provider:'hapoalim',identity:'bank:hapoalim:123456'},pages:[]});await pending;
  assert.equal((await c.snapshot()).jobs[0].status,'attention');assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources WHERE scope=?').get('budget:'+id).n,0);
  assert.deepEqual(c.db.prepare('SELECT data,revision FROM budgets WHERE id=?').get(id),before);assert.equal(c.financial(),financial);
 }finally{c.db.close()}
});
test('A budget encrypted after preparation hides old summaries and refuses automatic regeneration or policy enablement',async()=>{
 const c=await setup();try{
  c.binding();await c.enable();const secret=await c.connect();await c.receive(secret,csv);const j=(await c.snapshot()).jobs[0];assert.ok(j.summary);
  const vault=await createVault(plan(),'Synthetic-password-2026!','personal:alice');
  assert.equal((await c.call('alice','/api/plan',{plan:vault.envelope,revision:1},'PUT')).status,200);
  const financial=c.financial(),hidden=(await c.snapshot()).jobs[0];assert.equal(hidden.summary,undefined);assert.equal(hidden.reportId,undefined);assert.equal(hidden.targetLabel,undefined);
  await c.call('alice','/api/report-automation',{action:'prepare',id:j.id,revision:j.revision});
  assert.equal((await c.snapshot()).jobs[0].status,'attention');
  await c.call('alice','/api/report-automation',{action:'policy',budget:'personal',enabled:false,revision:1});
  assert.equal((await c.call('alice','/api/report-automation',{action:'policy',budget:'personal',enabled:true,revision:2,confirmReadAndPrepare:true})).status,409);
  assert.equal(c.financial(),financial);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_commits').get().n,0);
 }finally{c.db.close()}
});
test('Manual incoming uploads follow explicit opt-in and proposal rejection cannot contradict a committed source',async()=>{
 const c=await setup();try{c.binding();await c.enable();const before=c.financial();const response=await c.app(new Request(origin+'/api/report-intake',{method:'PUT',headers:{origin,cookie:'__Host-mf_session=alice','x-budget-account-id':'alice','x-report-name':'report.csv'},body:csv}));assert.equal(response.status,201);
 const j=(await c.snapshot()).jobs[0];assert.equal(j.status,'review');assert.equal(c.financial(),before);
 c.db.prepare("UPDATE report_sources SET state='committed' WHERE id=?").run(j.reportId);
 assert.equal((await c.call('alice','/api/report-automation',{action:'reject',id:j.id,revision:j.revision})).status,409);
 }finally{c.db.close()}
});
test('Actor revocation while parsing prevents routing, and malformed or mixed sources remain uncommitted',async()=>{
 let release,started;const entered=new Promise(r=>started=r),c=await setup({automationOptions:{readSource:async()=>{started();return new Promise(r=>release=r)}}});
 try{c.binding();await c.enable();const secret=await c.connect(),before=c.financial(),pending=c.receive(secret,csv);await entered;c.db.prepare('UPDATE auth_users SET email=? WHERE id=?').run('changed@example.test','alice');release({parsed:{kind:'bank',provider:'hapoalim',identity:'bank:hapoalim:123456'},pages:[]});await pending;assert.equal(c.financial(),before);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources WHERE scope=?').get('personal:alice').n,0);
 }finally{c.db.close()}
 const bad=await setup();try{await bad.enable();const before=bad.financial(),secret=await bad.connect();await bad.receive(secret,'not,a,report\nhello,world,1');assert.equal((await bad.snapshot()).jobs[0].status,'attention');assert.equal(bad.financial(),before)}finally{bad.db.close()}
});
