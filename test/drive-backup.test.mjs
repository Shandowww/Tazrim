import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {createDriveBackup,backupCutoffDay} from '../server/drive-backup.mjs';
const origin='https://budget.test',user={id:'admin',email:'admin@example.test'},scope='https://www.googleapis.com/auth/drive.appdata';
function setup(){const dir=mkdtempSync(join(tmpdir(),'budgit-drive-')),db=new DatabaseSync(':memory:');writeFileSync(join(dir,'public.pem'),'public test');db.exec("CREATE TABLE plans(user_id TEXT PRIMARY KEY,data TEXT);INSERT INTO plans VALUES('alice','initial');");let state,nonce,fail=false,uploaded=null,uploads=0,clock=100000000,snapshotHook=()=>{},coverage=[];const oauth={generateCodeVerifierAsync:async()=>({codeVerifier:'verifier',codeChallenge:'challenge'}),generateAuthUrl:o=>{state=o.state;nonce=o.nonce;assert.deepEqual(o.scope,['openid','email',scope]);assert.equal(o.access_type,'offline');return 'https://accounts.google.com/o/oauth2/v2/auth?state='+state;},getToken:async()=>({tokens:{id_token:'identity',refresh_token:'test-secret-never-plaintext',scope}}),verifyIdToken:async()=>({getPayload:()=>({email:user.email,email_verified:true,nonce})}),setCredentials(c){assert.equal(c.refresh_token,'test-secret-never-plaintext');},async request(o){if(fail)throw Error('remote error including tokens that must not be stored');if(o.method==='POST'){uploads++;uploaded=o.data;return{data:{id:'file'}};}return{data:readFileSync(join(dir,'archive.backup'))};}};
 const config={db,origin,clientId:'id',clientSecret:'secret',admins:new Set([user.email]),keyFile:join(dir,'token-key'),publicKeyFile:join(dir,'public.pem'),directory:dir,oauthFactory:()=>oauth,now:()=>clock,snapshot:async()=>{snapshotHook();const file=join(dir,'archive.backup'),bytes=Buffer.from('encrypted archive test');writeFileSync(file,bytes);return{file,sha256:createHash('sha256').update(bytes).digest('hex'),reportCoverage:coverage};}};const service=createDriveBackup(config);
 return{db,service,restart:()=>createDriveBackup(config),dir,oauth,uploads:()=>uploads,setTime:value=>clock=Date.parse(value),afterSnapshot:fn=>snapshotHook=fn,setCoverage:value=>coverage=value,change:()=>db.prepare("UPDATE plans SET data=? WHERE user_id='alice'").run(String(Math.random())),recover:()=>fail=false,fail:()=>fail=true,uploaded:()=>uploaded,advance:()=>clock+=86400001,async connect(){const start=await service.begin(user);assert.equal(start.status,303);return service.callback(new Request(origin+'/auth/google/callback?state='+state+'&code=approved',{headers:{cookie:'__Host-mf_drive='+state}}),user);},close(){db.close();rmSync(dir,{recursive:true,force:true});}};}
test('Drive consent is separate, administrator-only, state-bound and stores only encrypted refresh credentials',async()=>{const t=setup();try{assert.equal((await t.service.begin({id:'other',email:'other@example.test'})).status,403);assert.equal((await t.service.callback(new Request(origin+'/auth/google/callback?state=dbk.forged'),user)).status,403);assert.equal((await t.connect()).status,303);const row=t.db.prepare('SELECT * FROM drive_backup_connections').get();assert.ok(!row.credentials.includes('test-secret'));assert.equal(row.enabled,0);assert.equal(t.service.status(user).lastSuccess,null);}finally{t.close();}});
test('Backup success requires verified round-trip download; scheduling is explicit and failures remain visible',async()=>{const t=setup();try{await t.connect();const post=body=>t.service.handle(new Request(origin+'/api/admin/backup',{method:'POST',body:JSON.stringify(body)}),user);let r=await post({action:'run'});assert.equal(r.status,200);assert.ok((await r.json()).lastSuccess);assert.ok(t.uploaded().includes(Buffer.from('appDataFolder')));assert.ok(t.uploaded().includes(Buffer.from('encrypted archive test')));assert.equal(t.service.status(user).enabled,false);await post({action:'schedule',enabled:true,mode:'daily'});assert.equal(t.service.status(user).enabled,true);t.advance();t.fail();await t.service.tick();assert.match(t.service.status(user).error,/נכשל/);assert.ok(!t.service.status(user).error.includes('tokens'));await post({action:'disconnect'});assert.equal(t.service.status(user).connected,false);assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM drive_backup_connections').get().n,0);}finally{t.close();}});

test('Cancelled or mismatched consent cannot install credentials and non-admin archive retrieval is denied',async()=>{
 const t=setup();try{t.oauth.verifyIdToken=async()=>({getPayload:()=>({email:'wrong@example.test',email_verified:true,nonce:'wrong'})});const response=await t.connect();assert.match(response.headers.get('Location'),/failed/);assert.equal(t.service.status(user).connected,false);assert.equal((await t.service.files(new Request(origin+'/api/admin/backup/files'),{id:'other',email:'other@example.test'})).status,403);}finally{t.close();}
});
const post=(t,body)=>t.service.handle(new Request(origin+'/api/admin/backup',{method:'POST',body:JSON.stringify(body)}),user);
test('Changed-data backups wait until 23:59 Israel, run once, skip quiet days and ignore backup bookkeeping',async()=>{
 const t=setup();try{
  t.setTime('2026-06-01T09:00:00Z');await t.connect();await post(t,{action:'run'});assert.equal(t.uploads(),1);assert.equal(t.service.status(user).pendingChanges,false);
  await post(t,{action:'schedule',enabled:true,mode:'changes-nightly'});t.change();assert.equal(t.service.status(user).pendingChanges,true);
  t.setTime('2026-06-01T20:58:59Z');await t.service.tick();assert.equal(t.uploads(),1);
  t.setTime('2026-06-01T20:59:00Z');await t.service.tick();assert.equal(t.uploads(),2);assert.equal(t.service.status(user).pendingChanges,false);
  await t.service.tick();assert.equal(t.uploads(),2);t.setTime('2026-06-02T20:59:00Z');await t.service.tick();assert.equal(t.uploads(),2);
  t.db.prepare('UPDATE plans SET data=data').run();assert.equal(t.service.status(user).pendingChanges,false);
  t.db.prepare("INSERT INTO plans VALUES('bob','new account')").run();assert.equal(t.service.status(user).pendingChanges,true);
  t.setTime('2026-06-03T20:59:00Z');await t.service.tick();assert.equal(t.uploads(),3);
 }finally{t.close();}
});
test('A missed cutoff is caught up after restart; failed uploads retry without losing dirty data',async()=>{
 const t=setup();try{
  t.setTime('2026-01-05T10:00:00Z');await t.connect();await post(t,{action:'run'});await post(t,{action:'schedule',enabled:true,mode:'changes-nightly'});t.change();
  t.service=t.restart();t.setTime('2026-01-06T06:00:00Z');t.fail();await t.service.tick();assert.equal(t.service.status(user).pendingChanges,true);assert.ok(t.service.status(user).error);assert.equal(t.db.prepare('SELECT last_scheduled_day AS day FROM drive_backup_connections').get().day,'2026-01-04');
  t.recover();t.setTime('2026-01-06T06:14:59Z');await t.service.tick();assert.equal(t.uploads(),1);t.setTime('2026-01-06T06:15:00Z');await t.service.tick();assert.equal(t.uploads(),2);assert.equal(t.service.status(user).pendingChanges,false);assert.equal(t.db.prepare('SELECT last_scheduled_day AS day FROM drive_backup_connections').get().day,'2026-01-05');
 }finally{t.close();}
});
test('Changes during an in-flight backup remain pending for the next night; manual backups cover prior changes',async()=>{
 const t=setup();try{
  t.setTime('2026-06-01T09:00:00Z');await t.connect();await post(t,{action:'run'});await post(t,{action:'schedule',enabled:true,mode:'changes-nightly'});t.change();
  t.afterSnapshot(()=>t.change());t.setTime('2026-06-01T20:59:00Z');await t.service.tick();assert.equal(t.service.status(user).pendingChanges,true);assert.equal(t.uploads(),2);await t.service.tick();assert.equal(t.uploads(),2);
  t.afterSnapshot(()=>{});t.setTime('2026-06-02T20:58:00Z');await post(t,{action:'run'});assert.equal(t.service.status(user).pendingChanges,false);t.setTime('2026-06-02T20:59:00Z');await t.service.tick();assert.equal(t.uploads(),3);
 }finally{t.close();}
});
test('Civil cutoff follows Jerusalem winter/summer time and month/year boundaries',()=>{
 for(const [time,day]of [['2026-01-01T21:58:59Z','2025-12-31'],['2026-01-01T21:59:00Z','2026-01-01'],['2026-01-01T22:00:00Z','2026-01-01'],['2026-06-01T20:58:59Z','2026-05-31'],['2026-06-01T20:59:00Z','2026-06-01'],['2026-06-01T21:00:00Z','2026-06-01'],['2026-10-24T20:59:00Z','2026-10-24'],['2026-10-25T21:59:00Z','2026-10-25']])assert.equal(backupCutoffDay(Date.parse(time)),day,time);
});
test('Rolled-back writes do not trigger backups; late-created Wallet tables are tracked without counting login/backup activity',async()=>{
 const t=setup();try{
  await t.connect();await post(t,{action:'run'});t.db.exec('BEGIN');t.change();t.db.exec('ROLLBACK');assert.equal(t.service.status(user).pendingChanges,false);
  t.db.exec('CREATE TABLE wallet_events(id TEXT PRIMARY KEY,state TEXT);CREATE TABLE auth_sessions(id TEXT);');t.service.trackTables();t.db.prepare("INSERT INTO auth_sessions VALUES('session')").run();assert.equal(t.service.status(user).pendingChanges,false);
  t.db.prepare("INSERT INTO wallet_events VALUES('event','pending')").run();assert.equal(t.service.status(user).pendingChanges,true);await post(t,{action:'run'});t.db.prepare("UPDATE wallet_events SET state='pending'").run();assert.equal(t.service.status(user).pendingChanges,false);t.db.prepare("UPDATE wallet_events SET state='included'").run();assert.equal(t.service.status(user).pendingChanges,true);
 }finally{t.close();}
});

test('Backup failures return actionable safe guidance without saving provider secrets or a false success',async()=>{
 for(const [failure,expected]of [
  [{response:{status:403,data:{error:{errors:[{reason:'accessNotConfigured'}]}}}},/Google Drive API/],
  [{response:{status:400,data:{error:'invalid_grant',error_description:'secret-token'}}},/פגה או בוטלה/],
  [{response:{status:403,data:{error:{errors:[{reason:'storageQuotaExceeded'}]}}}},/מספיק מקום/]
 ]){
  const t=setup();try{
   await t.connect();t.oauth.request=async()=>{throw Object.assign(Error('secret-token'),failure);};
   const response=await post(t,{action:'run'}),body=await response.json();
   assert.equal(response.status,503);assert.match(body.error,expected);assert.equal(body.error,t.service.status(user).error);
   assert.ok(!body.error.includes('secret-token'));assert.equal(t.service.status(user).lastSuccess,null);assert.equal(t.service.status(user).running,false);
  }finally{t.close();}
 }
});
test('Report coverage records only the immutable snapshot after verified cloud delivery, never a newer live revision',async()=>{const t=setup();try{await t.connect();const coverage={id:'report',scope:'personal:alice',sourceHash:'a'.repeat(64),revision:2};t.setCoverage([coverage]);t.afterSnapshot(()=>{t.db.exec('CREATE TABLE IF NOT EXISTS report_sources(id TEXT,revision INTEGER)');t.db.exec("INSERT INTO report_sources VALUES('report',3)");});await post(t,{action:'run'});const recorded=t.db.prepare('SELECT * FROM report_backup_coverage').get();assert.equal(recorded.revision,2);assert.equal(t.db.prepare('SELECT revision FROM report_sources').get().revision,3);t.setCoverage([{...coverage,revision:3}]);t.fail();await post(t,{action:'run'});assert.equal(t.db.prepare('SELECT revision FROM report_backup_coverage').get().revision,2);}finally{t.close();}});
