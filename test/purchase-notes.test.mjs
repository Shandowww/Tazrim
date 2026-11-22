import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {purchaseNoteColumns,parsePurchaseNoteSheet,purchaseNoteMatches,purchaseNoteSource} from '../src/purchase-notes-model.js';
import {verifyStoredReports} from '../server/report-crypto.mjs';
import {purchaseNotesFixture,sampleNotes,sampleSheetId} from './helpers/purchase-notes-fixture.mjs';
import {changePurchaseNotes,loadPurchaseNotes} from '../frontend/src/app/purchase-notes-api.ts';
import {createDriveBackup} from '../server/drive-backup.mjs';

test('purchase notes validate date, signed cents, immutable IDs and untrusted sheet rows',()=>{
 const notes=parsePurchaseNoteSheet([purchaseNoteColumns,...sampleNotes()]);assert.equal(notes[0].amountCents,24900);
 const numeric=sampleNotes()[0];numeric[1]=46303;assert.equal(parsePurchaseNoteSheet([purchaseNoteColumns,numeric])[0].date,'2026-10-08');
 for(const [column,value]of [[0,''],[1,'2026-02-31'],[2,''],[3,0],[3,'=1+2'],[3,1.234],[4,'USD'],[5,''],[7,'1234567890123456']]){const row=sampleNotes()[0];row[column]=value;assert.throws(()=>parsePurchaseNoteSheet([purchaseNoteColumns,row]),/שורה 2/);}
 assert.throws(()=>parsePurchaseNoteSheet([purchaseNoteColumns,...sampleNotes(),sampleNotes()[0]]),/ייחודי/);
 assert.throws(()=>parsePurchaseNoteSheet([]));assert.throws(()=>parsePurchaseNoteSheet([['id','amount']]));
 assert.equal(purchaseNoteSource('https://docs.google.com/spreadsheets/d/'+sampleSheetId+'/edit?authuser=alice@example.test').spreadsheetId,sampleSheetId);
 for(const url of ['https://evil.test/spreadsheets/d/'+sampleSheetId,'https://docs.google.com.evil.test/spreadsheets/d/'+sampleSheetId,'file:///private','http://localhost'])assert.throws(()=>purchaseNoteSource(url));
});
test('suggestions preserve exact signed amounts, date/card/currency boundaries and installment semantics',()=>{
 const notes=parsePurchaseNoteSheet([purchaseNoteColumns,...sampleNotes()]).map(note=>({...note,done:false,present:true})),tx={kind:'card',date:'2026-10-08',merchant:'K.S.P',amountCents:24900,paymentCard:'1234'};
 assert.equal(purchaseNoteMatches(notes,tx)[0].merchantMatches,true);
 assert.equal(purchaseNoteMatches(notes,{...tx,date:'2026-11-08'}).length,0);
 assert.equal(purchaseNoteMatches(notes,{...tx,paymentCard:'0394'}).length,0);
 assert.equal(purchaseNoteMatches(notes,{...tx,amountCents:24901}).length,0);
 assert.equal(purchaseNoteMatches(notes,{...tx,amountCents:-24900}).length,0);
 assert.equal(purchaseNoteMatches(notes,{...tx,kind:'bank',amountCents:-24900}).length,1);
 assert.equal(purchaseNoteMatches(notes,{...tx,currency:'USD'}).length,0);
 assert.equal(purchaseNoteMatches(notes,{...tx,amountCents:8300,originalCents:24900,installment:{current:1,total:3}}).length,1);
 assert.equal(purchaseNoteMatches(notes,{...tx,amountCents:8300,originalCents:24900,notes:'תשלום 1 מתוך 3'}).length,1);
 assert.equal(purchaseNoteMatches(notes,{...tx,amountCents:-8300,originalCents:24900,notes:'תשלום 1 מ-3'}).length,0);
 assert.equal(purchaseNoteMatches(notes,{...tx,originalCurrency:'USD',installment:{current:1,total:3}}).length,0);
 assert.equal(purchaseNoteMatches(notes.map(note=>({...note,done:true})),tx).length,0);
 assert.equal(purchaseNoteMatches(notes.map(note=>({...note,present:false})),tx).length,0);
 assert.equal(purchaseNoteMatches(notes,{...tx,merchant:'Unrelated shop'})[0].merchantMatches,false);
});
test('private Sheets OAuth uses the existing callback, readonly scope, PKCE and encrypted account-bound credentials',async()=>{
 const f=purchaseNotesFixture();try{
  assert.equal((await f.configure()).status,200);assert.equal((await f.begin()).status,303);
  assert.deepEqual(f.state.auth.scope,['openid','email','https://www.googleapis.com/auth/spreadsheets.readonly']);assert.equal(f.state.auth.code_challenge_method,'S256');
  assert.equal((await f.callback()).headers.get('location'),'/next/settings/purchase-notes?sheets=connected');
  assert.equal((await f.callback()).status,400);
  const value=await f.snapshot();assert.equal(value.connected,true);assert.equal(value.revision,2);assert.equal(value.source.tab,'Purchases');
  const ciphertext=f.db.prepare('SELECT data FROM purchase_note_connections').get().data;assert.ok(!Buffer.from(ciphertext).includes('synthetic-private-refresh-token'));assert.ok(!JSON.stringify(value).includes('refresh_token'));
  assert.equal((await f.req('alice','/auth/purchase-notes?accountId=bob&revision=2')).status,403);
 }finally{f.db.close();}
});
for(const mode of ['nonceMismatch','scopeMissing','identityEmail'])test('OAuth refuses '+mode+' without replacing credentials',async()=>{
 const f=purchaseNotesFixture();try{await f.configure();await f.begin();f.state[mode]=mode==='identityEmail'?'bob@example.test':true;assert.match((await f.callback()).headers.get('location'),/failed$/);assert.equal((await f.snapshot()).connected,false);}finally{f.db.close();}
});
test('repeat reads, corrections and removed rows retain notes without changing any financial records',async()=>{
 const f=purchaseNotesFixture();try{
  await f.seed();const before=f.financial();await f.connect();assert.equal((await f.command({action:'sync'})).status,200);
  let value=await f.snapshot();assert.equal(value.notes.length,3);const note=value.notes.find(note=>note.id==='purchase-note-0001'),key=note.key;
  await f.command({action:'sync'});assert.equal((await f.snapshot()).notes.length,3);assert.equal((await f.snapshot()).notes.find(note=>note.key===key).revision,1);
  await f.command({action:'note-state',key,noteRevision:1,done:true});assert.equal((await f.snapshot()).notes.find(note=>note.key===key).done,true);
  f.state.values[1][5]='מקלדת במתנה';await f.command({action:'sync'});value=await f.snapshot();assert.equal(value.notes.find(note=>note.key===key).done,false);assert.equal(value.notes.find(note=>note.key===key).purpose,'מקלדת במתנה');
  f.state.values=f.state.values.filter((row,index)=>index!==2);await f.command({action:'sync'});value=await f.snapshot();assert.equal(value.notes.length,3);assert.equal(value.notes.filter(note=>note.present).length,2);
  const previous=JSON.stringify(value.notes);f.state.values[1][3]='invalid';assert.equal((await f.command({action:'sync'})).status,422);value=await f.snapshot();assert.equal(JSON.stringify(value.notes),previous);assert.match(value.error,/שורה 2/);
  assert.equal(f.financial(),before);assert.equal(verifyStoredReports(f.db,f.key),0);assert.ok(f.calls.every(call=>call.method==='GET'&&new URL(call.url).origin==='https://sheets.googleapis.com'));
 }finally{f.db.close();}
});
test('actor binding, CSRF, CAS, retry recovery and source-change confirmation protect independent users',async()=>{
 const f=purchaseNotesFixture();try{
  await f.connect();const base=await f.snapshot(),body={action:'sync',accountId:'alice',requireAccountId:true,expectedRevision:base.revision,operationId:randomUUID()};
  assert.equal((await f.post(body)).status,200);assert.equal((await f.post(body)).status,200);assert.equal(f.calls.length,1);
  assert.equal((await f.post({...body,action:'disconnect'})).status,409);
  assert.equal((await f.get('bob')).status,200);assert.equal((await f.snapshot('bob')).notes.length,0);
  const key=(await f.snapshot()).notes[0].key;assert.equal((await f.command({action:'note-state',key,noteRevision:1,done:true},'bob')).status,409);
  assert.equal((await f.post({...body,operationId:randomUUID()},'bob')).status,403);
  assert.equal((await f.req(null,'/api/purchase-notes?accountId=alice')).status,401);
  assert.equal((await f.req('alice','/api/purchase-notes?accountId=alice',{method:'POST',headers:{origin:'https://evil.test'},body:JSON.stringify(body)})).status,403);
  assert.equal((await f.post({...body,operationId:randomUUID()})).status,409);
  assert.equal((await f.command({action:'configure',url:'another_sample_sheet_12345678901234567890',tab:'Purchases'})).status,409);
  assert.equal((await f.command({action:'configure',url:'another_sample_sheet_12345678901234567890',tab:'Purchases',confirmChange:true})).status,200);
  assert.equal((await f.snapshot()).lastSuccess,null);assert.equal((await f.snapshot()).notes.length,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM purchase_note_records').get().n,3);
 }finally{f.db.close();}
});
test('in-flight source changes and revocation cannot apply a stale provider response',async()=>{
 for(const revoke of [false,true]){const f=purchaseNotesFixture();try{await f.connect();f.state.requestHook=async()=>{f.state.requestHook=null;if(revoke)f.db.prepare('DELETE FROM auth_access WHERE email=?').run('alice@example.test');else await f.command({action:'disconnect'});};assert.equal((await f.command({action:'sync'})).status,revoke?403:409);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM purchase_note_records').get().n,0);}finally{f.db.close();}}
});
test('provider failure preserves usable notes and an uncertain successful read is recovered without a second request',async()=>{
 const f=purchaseNotesFixture();try{
  await f.seed();await f.connect();const before=f.financial(),actor=(await(await f.req('alice','/api/plan')).json());let drop=true;
  const fetcher=async(path,init)=>{const response=await f.req('alice',path,init);if(init?.method==='POST'&&drop&&response.ok){drop=false;throw Error('Lost successful response');}return response;};
  const first=await loadPurchaseNotes(actor,new AbortController().signal,fetcher),attempt={command:{action:'sync'},revision:first.revision,operationId:randomUUID()},saved=await changePurchaseNotes(actor,attempt,new AbortController().signal,fetcher);assert.equal(saved.notes.length,3);assert.equal(f.calls.length,1);
  await changePurchaseNotes(actor,attempt,new AbortController().signal,fetcher);assert.equal(f.calls.length,1);
  f.state.providerError={response:{status:403,data:{error:{message:'private provider details'}}}};assert.equal((await f.command({action:'sync'})).status,503);const failed=await f.snapshot();assert.equal(failed.notes.length,3);assert.equal(failed.lastSuccess,saved.lastSuccess);assert.ok(!failed.error.includes('private provider details'));
  await f.command({action:'disconnect'});assert.equal((await f.snapshot()).connected,false);assert.equal((await f.snapshot()).notes.length,3);assert.equal(f.financial(),before);
  const record=f.db.prepare('SELECT source_key,data FROM purchase_note_records LIMIT 1').get(),bad=Buffer.from(record.data);bad[20]^=1;f.db.prepare('UPDATE purchase_note_records SET data=? WHERE source_key=?').run(bad,record.source_key);assert.throws(()=>verifyStoredReports(f.db,f.key));
 }finally{f.db.close();}
});
test('a stale OAuth approval cannot replace a newer source selection',async()=>{
 const f=purchaseNotesFixture();try{await f.configure();await f.begin();await f.command({action:'configure',url:sampleSheetId,tab:'Other',confirmChange:true});assert.match((await f.callback()).headers.get('location'),/failed$/);assert.equal((await f.snapshot()).source.tab,'Other');assert.equal((await f.snapshot()).connected,false);}finally{f.db.close();}
});
test('unchanged sheet reads do not schedule another backup; new notes and note decisions do',async()=>{
 const f=purchaseNotesFixture();try{
  await f.connect();const backup=createDriveBackup({db:f.db,origin:f.origin,admins:new Set(),keyFile:'/unused-purchase-test-token-key',publicKeyFile:'/unused-purchase-test-public-key'});backup.trackTables();
  const version=()=>f.db.prepare('SELECT version FROM backup_data_state WHERE id=1').get().version;
  await f.command({action:'sync'});const after=version();assert.ok(after>0);await f.command({action:'sync'});assert.equal(version(),after);
  const note=(await f.snapshot()).notes[0];await f.command({action:'note-state',key:note.key,noteRevision:note.revision,done:true});assert.ok(version()>after);
 }finally{f.db.close();}
});
