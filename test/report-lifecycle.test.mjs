import test from 'node:test';
import assert from 'node:assert/strict';
import {REPORT_RETENTION_MS,reportLifecycleState,reportResumeStep,validReportReview} from '../src/report-lifecycle-model.js';
import {openReport,verifyStoredReports} from '../server/report-crypto.mjs';
import {guidedFixture,hash} from './helpers/guided-report-fixture.mjs';

test('Lifecycle and resume distinguish preparation, user review, deferral and stale financial context',()=>{
 assert.equal(reportLifecycleState().lifecycle,'new');assert.equal(reportLifecycleState({reviewed:true}).lifecycle,'partial');assert.equal(reportLifecycleState({complete:true,completedAt:100}).removalAt,100+REPORT_RETENTION_MS);assert.equal(reportLifecycleState({complete:true,deferred:true,completedAt:100}).lifecycle,'partial');
 const review={version:1,step:'categories',done:['account','figures'],categories:'unset',budgetRevision:2};assert.equal(validReportReview(review),true);assert.equal(reportResumeStep(review,{budgetRevision:2}).step,'categories');assert.equal(reportResumeStep(review,{budgetRevision:3}).step,'account');assert.equal(reportResumeStep(review,{hasExceptions:false}).steps.includes('exceptions'),false);
});
test('User review is resumable Partial; only explicit original financial Finish becomes Digested',async()=>{
 const c=await guidedFixture();try{
  const before=c.financial();assert.equal((await c.lifecycle()).lifecycle,'new');await c.progress();const partial=await c.lifecycle();assert.equal(partial.lifecycle,'partial');assert.equal(partial.review.step,'summary');assert.equal(c.financial(),before);
  await c.commit();const completed=await c.lifecycle();assert.equal(completed.lifecycle,'digested');assert.equal(completed.completedAt,c.now());assert.equal(completed.removalAt,c.now()+REPORT_RETENTION_MS);
  c.advance(1000);assert.equal((await c.lifecycle()).completedAt,completed.completedAt);await c.receive();assert.equal((await c.lifecycle()).completedAt,completed.completedAt);
 }finally{c.db.close()}
});
test('At 30 elapsed days originals and staging disappear, while finances/history and truthful connection tombstones remain',async()=>{
 const c=await guidedFixture();try{
  await c.progress();await c.commit();const finances=c.financial(),at=c.now(),revision=c.sourceRow().revision;
  c.setTime(at+REPORT_RETENTION_MS-1);assert.equal((await c.req('alice','/api/reports?budget=personal&id='+c.id+'&source=1')).status,200);
  c.advance(1);assert.equal((await c.req('alice','/api/reports?budget=personal&id='+c.id+'&source=1')).status,410);assert.equal(c.financial(),finances);
  for(const id of [c.id,c.privateId]){const row=c.db.prepare('SELECT * FROM report_sources WHERE id=?').get(id);assert.equal(row.source_bytes,0);assert.equal(row.draft,null);assert.equal(openReport(c.key,row.source,row.scope+'|'+id+'|source').length,0);assert.equal(row.original_removed_at,c.now());}
  assert.equal(c.sourceRow().revision,revision);verifyStoredReports(c.db,c.key);
  const inbox=await(await c.req('alice','/api/report-intake')).json();assert.equal(inbox.reports.length,0);
  const receipt=(await(await c.catalog()).json()).receipts[hash(c.bytes)];assert.equal(receipt.stored,false);assert.equal(receipt.originalRemoved,true);assert.equal(receipt.completionAcknowledged,true);assert.equal(receipt.cleanupEligible,false);assert.equal(receipt.connectionId,c.connectionId);
  const again=await(await c.receive()).json();assert.equal(again.stored,false);assert.equal(again.receiptId,c.privateId);assert.equal(c.db.prepare('SELECT COUNT(*) n FROM report_sources').get().n,2);assert.equal(c.financial(),finances);
 }finally{c.db.close()}
});
test('Deferred categorization never expires; explicit uncategorized resolution starts a fresh notice period without financial replay',async()=>{
 const c=await guidedFixture();try{
  await c.progress('later');await c.commit();assert.equal((await c.lifecycle()).lifecycle,'partial');assert.equal((await c.lifecycle()).completedAt,null);
  c.advance(REPORT_RETENTION_MS*2);assert.equal((await c.req('alice','/api/reports?budget=personal&id='+c.id+'&source=1')).status,200);const finances=c.financial();
  const request={action:'resolve-categories',budgetRevision:2,sourceHash:hash(c.bytes),revision:c.sourceRow().revision};assert.equal((await c.post('/api/report-lifecycle?budget=personal&id='+c.id,request)).status,409);
  assert.equal((await c.post('/api/report-lifecycle?budget=personal&id='+c.id,{...request,confirmUncategorized:true})).status,200);assert.equal((await c.lifecycle()).completedAt,c.now());assert.equal(c.financial(),finances);
 }finally{c.db.close()}
});
test('Failed retention rolls back every byte copy and retries at the same deadline',async()=>{
 const c=await guidedFixture();try{
  await c.progress();await c.commit();const completed=(await c.lifecycle()).completedAt,finances=c.financial();c.advance(REPORT_RETENTION_MS);
  c.db.exec(`CREATE TRIGGER fail_retention BEFORE UPDATE OF source ON report_sources WHEN NEW.scope LIKE 'incoming:%' BEGIN SELECT RAISE(ABORT,'synthetic cleanup failure'); END`);
  assert.equal((await c.req('alice','/api/reports?budget=personal&id='+c.id+'&source=1')).status,200);assert.ok(c.sourceRow().source_bytes>0);assert.equal(c.db.prepare('SELECT source_bytes FROM report_sources WHERE id=?').get(c.privateId).source_bytes,c.bytes.length);assert.equal((await c.lifecycle()).completedAt,completed);
  c.db.exec('DROP TRIGGER fail_retention');c.advance(60000);await c.app.tickReportAutomation();assert.equal(c.sourceRow().source_bytes,0);assert.equal(c.financial(),finances);await c.app.tickReportAutomation();assert.equal(c.financial(),finances);
 }finally{c.db.close()}
});

test('Committed re-review stores a separate revision-guarded draft and cancels removal without rewriting history',async()=>{
 const c=await guidedFixture();try{
  await c.progress();await c.commit();const before=c.financial(),historical=Buffer.from(c.sourceRow().draft);
  const source=await(await c.req('alice','/api/reports?budget=personal&id='+c.id)).json(),draft=structuredClone(source.draft);
  draft.items[0].storedCommitted=true;draft.items[0].storedRevision=source.revision;draft.guided={...draft.guided,budgetRevision:2,step:'categories'};
  const input={action:'save-review',sourceHash:source.sourceHash,revision:source.revision,budgetRevision:2,reviewRevision:source.reviewRevision,draft};
  const path='/api/report-lifecycle?budget=personal&id='+c.id;
  assert.equal((await c.post(path,{...input,budgetRevision:1})).status,409);assert.equal((await c.post(path,input,'bob')).status,404);
  const saved=await(await c.post(path,input)).json();assert.equal(saved.lifecycle,'partial');assert.equal(saved.completedAt,null);
  assert.deepEqual(Buffer.from(c.sourceRow().draft),historical);assert.equal(c.financial(),before);
  assert.equal((await c.post(path,input)).status,200,'lost successful save is idempotent');
  const changed=structuredClone(draft);changed.guided.step='figures';assert.equal((await c.post(path,{...input,draft:changed})).status,409,'stale tab cannot overwrite');
  c.advance(REPORT_RETENTION_MS*2);assert.equal((await c.req('alice','/api/reports?budget=personal&id='+c.id+'&source=1')).status,200);
  const loaded=await(await c.req('alice','/api/reports?budget=personal&id='+c.id)).json();assert.deepEqual(loaded.activeDraft,draft);assert.equal(c.financial(),before);
 }finally{c.db.close()}
});

test('Missing legacy timestamps earn a fresh notice period; receipt loss cancels completion',async()=>{
 const c=await guidedFixture();try{
  await c.progress();await c.commit();c.db.prepare('DELETE FROM report_lifecycle').run();c.advance(REPORT_RETENTION_MS*3);
  assert.equal((await c.lifecycle()).lifecycle,'partial');await c.app.tickReportAutomation();
  // The retained original includes explicit resolved review, but no old timestamp is reused.
  const pending=await c.lifecycle();assert.equal(pending.completedAt,c.now());
  assert.equal((await c.post('/api/report-lifecycle?budget=personal&id='+c.id,{action:'resolve-categories',budgetRevision:2,sourceHash:hash(c.bytes),revision:c.sourceRow().revision,confirmUncategorized:true})).status,200);
  assert.equal((await c.lifecycle()).completedAt,c.now());
  const row=c.db.prepare('SELECT data FROM plans WHERE user_id=?').get('alice'),plan=JSON.parse(row.data);plan.reportInbox.receipts=[];c.db.prepare('UPDATE plans SET data=? WHERE user_id=?').run(JSON.stringify(plan),'alice');
  assert.equal((await c.lifecycle()).completedAt,null);c.advance(REPORT_RETENTION_MS);assert.equal((await c.req('alice','/api/reports?budget=personal&id='+c.id+'&source=1')).status,200);
 }finally{c.db.close()}
});

test('An incomplete group reference blocks all-copy removal with an actionable reason',async()=>{
 const c=await guidedFixture();try{
  await c.progress();await c.commit();const other=await(await c.req('alice','/api/reports?budget=personal',{method:'PUT',headers:{'x-report-name':'pending.csv'},body:'pending synthetic'})).json();
  const {sealReport}=await import('../server/report-crypto.mjs');c.db.prepare('UPDATE report_sources SET draft=? WHERE id=?').run(sealReport(c.key,Buffer.from(JSON.stringify({version:1,items:[{storedId:c.id}]})),'personal:alice|'+other.receiptId+'|draft'),other.receiptId);
  const before=c.financial();c.advance(REPORT_RETENTION_MS);await c.app.tickReportAutomation();assert.ok(c.sourceRow().source_bytes>0);assert.match((await c.lifecycle()).retentionReason,/קבוצת/);assert.equal(c.financial(),before);
 }finally{c.db.close()}
});

test('A freshly parsed whole-file duplicate finishes without a second financial write',async()=>{
 const c=await guidedFixture();try{
  const prepared=(await c.load()).group.ui;await c.progress();await c.commit();const before=c.financial(),bytes=Buffer.concat([c.bytes,Buffer.from('\n% second encoding\n')]);
  const receipt=await(await c.req('alice','/api/reports?budget=personal',{method:'PUT',headers:{'x-report-name':'duplicate.pdf'},body:bytes})).json();
  const {reportInboxDraft}=await import('../src/report-inbox-controller.js'),{saveStoredReportGroupDraft}=await import('../frontend/src/app/report-review-api.ts'),{loadBudgetSnapshot}=await import('../frontend/src/app/budget-api.ts');
  const source={id:receipt.receiptId,name:'duplicate.pdf',sourceHash:hash(bytes),revision:1,state:'received',draft:null};prepared.groupId=crypto.randomUUID();Object.assign(prepared.items[0],{id:source.id,storedId:source.id,storedRevision:2,hash:source.sourceHash,name:source.name});prepared.guided={version:1,step:'summary',done:['account','figures','categories'],categories:'resolved',budgetRevision:2};
  const base=(await loadBudgetSnapshot('personal',new AbortController().signal,c.fetcher)).value,saved=await saveStoredReportGroupDraft('personal',base,[source],reportInboxDraft(prepared,'duplicate-test'),'ready',c.fetcher);
  const response=await c.post('/api/report-lifecycle?budget=personal&id='+source.id,{action:'complete-duplicate',budgetRevision:2,revision:saved[0].revision,sourceHash:source.sourceHash});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.lifecycle,'digested');assert.equal(result.completionKind,'duplicate');assert.equal(c.financial(),before);
 }finally{c.db.close()}
});

test('Encrypted restore merges authenticated newer tombstones without changing recovered finances',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{DatabaseSync}=await import('node:sqlite');
 const {encryptedDatabaseBackup,restoreBackupToNewFile}=await import('../server/backup-crypto.mjs'),{pair}=await import('./helpers/guided-report-fixture.mjs');
 const directory=await mkdtemp(join(tmpdir(),'budgit-retention-restore-')),c=await guidedFixture();let restored;
 try{
  await c.progress();await c.commit();const original=join(directory,'before.sqlite');c.db.prepare('VACUUM INTO ?').run(original);
  const publicKeyFile=join(directory,'public.pem'),privateKeyFile=join(directory,'private.pem');await writeFile(publicKeyFile,pair.publicKey);await writeFile(privateKeyFile,pair.privateKey,{mode:0o600});
  const archive=await encryptedDatabaseBackup({source:original,publicKeyFile,directory});c.advance(REPORT_RETENTION_MS);await c.app.tickReportAutomation();const trusted=join(directory,'trusted.sqlite');c.db.prepare('VACUUM INTO ?').run(trusted);
  const output=join(directory,'restored.sqlite');await restoreBackupToNewFile({backup:archive.file,privateKeyFile,output,trustedRetentionDatabase:trusted});restored=new DatabaseSync(output);
  for(const id of [c.id,c.privateId]){const row=restored.prepare('SELECT * FROM report_sources WHERE id=?').get(id);assert.equal(row.source_bytes,0);assert.equal(row.original_removed_at,c.now());assert.equal(row.draft,null);}
  assert.deepEqual(restored.prepare('SELECT * FROM plans ORDER BY user_id').all(),c.db.prepare('SELECT * FROM plans ORDER BY user_id').all());assert.deepEqual(restored.prepare('SELECT * FROM report_commits ORDER BY scope,action_id').all(),c.db.prepare('SELECT * FROM report_commits ORDER BY scope,action_id').all());verifyStoredReports(restored,c.key);
 }finally{restored?.close();c.db.close();await rm(directory,{recursive:true,force:true});}
});

test('Bank original expiry preserves the normalized last-import undo operation',async()=>{
 const c=await guidedFixture({sourceName:'bank.csv',sourceBytes:Buffer.from('תאריך,תיאור,סכום,יתרה\n28/02/2026,משכורת,100.01,1100.01')});try{
  await c.progress();await c.commit();assert.equal((await c.lifecycle()).lifecycle,'digested');const {undoBankImport}=await import('../src/bank-import-model.js'),current=JSON.parse(c.db.prepare('SELECT data FROM plans WHERE user_id=?').get('alice').data),batch=current.bankImport.batches.at(-1).id,expected=undoBankImport(current,batch);
  c.advance(REPORT_RETENTION_MS);await c.app.tickReportAutomation();assert.equal(c.sourceRow().source_bytes,0);assert.deepEqual(undoBankImport(JSON.parse(c.db.prepare('SELECT data FROM plans WHERE user_id=?').get('alice').data),batch),expected);
 }finally{c.db.close()}
});

test('Activity originals expire only when every cycle has a current derived receipt',async()=>{
 const {activityFixture}=await import('../tools/bank-csv/cal-activity-fixture.mjs'),XLSX=(await import('../tools/bank-csv/vendor/xlsx-mini.cjs')).default;
 const fixture=activityFixture();fixture.rows[0].cells[0]=fixture.rows[0].cells[0].replace('1111','1234');
 // Keep just the two fully known October entries and their exact whole-sheet total.
 fixture.rows.splice(4,3);fixture.rows[4].cells[2]='90';
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(fixture.rows.map(r=>r.cells)),'פעילות');
 const c=await guidedFixture({sourceName:'activity.xlsx',sourceBytes:Buffer.from(XLSX.write(workbook,{type:'array',bookType:'xlsx'})),activityCycle:'2026-10-15',activityTotal:'90'});try{
  await c.progress();await c.commit();const state=await c.lifecycle();assert.equal(state.lifecycle,'digested',JSON.stringify(state));const before=c.financial();c.advance(REPORT_RETENTION_MS);await c.app.tickReportAutomation();assert.equal(c.sourceRow().source_bytes,0);assert.equal(c.financial(),before);
 }finally{c.db.close()}
});

test('Stage 2 cross-format resend of an expired whole duplicate reuses its tombstone without resurrecting work',async()=>{
 const c=await guidedFixture({reportAutomationEnabled:true});try{
  await c.progress();await c.commit();c.advance(REPORT_RETENTION_MS);await c.app.tickReportAutomation();const before=c.financial();
  const policy=await c.post('/api/report-automation',{action:'policy',budget:'personal',enabled:true,revision:0,confirmReadAndPrepare:true});assert.equal(policy.status,200,await policy.clone().text());
  const duplicate=Buffer.concat([c.bytes,Buffer.from('\n% equivalent delivery encoding\n')]),response=await c.receive(duplicate,'equivalent.pdf'),receipt=await response.json();assert.equal(response.status,201,JSON.stringify(receipt));assert.equal(receipt.originalRemoved,true,JSON.stringify(receipt));assert.equal(receipt.stored,false);assert.equal(receipt.cleanupEligible,false);assert.equal(c.financial(),before);
  assert.equal((await(await c.req('alice','/api/report-intake')).json()).reports.length,0);assert.equal((await(await c.req('alice','/api/report-automation')).json()).jobs.length,0);
  const catalog=await c.app(new Request(c.origin+'/api/imports/incoming?catalog=2',{headers:{authorization:'Bearer '+c.secret}}));const listed=await catalog.json();assert.equal(listed.version,2);assert.equal(listed.connectionId,c.connectionId);assert.equal(listed.receipts[hash(duplicate)].completionAcknowledged,true);
 }finally{c.db.close()}
});

test('Storage-copy permission is independent of completion and becomes false after server retention removes originals',async()=>{
 const c=await guidedFixture();try{
  const proof=()=>c.app(new Request(c.origin+'/api/imports/incoming?verifyStorage=1&receipt='+c.privateId+'&hash='+hash(c.bytes),{headers:{authorization:'Bearer '+c.secret}}));
  const pending=await(await proof()).json();assert.equal(pending.deviceCopyRemovable,true);assert.equal(pending.cleanupEligible,false);assert.equal(pending.fullImportComplete,false);
  await c.progress('later');await c.commit();assert.equal((await c.lifecycle()).lifecycle,'partial');assert.equal((await(await proof()).json()).deviceCopyRemovable,true);
  const state=await c.lifecycle();
  await c.post('/api/report-lifecycle?budget=personal&id='+c.id,{action:'resolve-categories',budgetRevision:2,sourceHash:hash(c.bytes),revision:c.sourceRow().revision,confirmUncategorized:true});
  assert.equal((await c.lifecycle()).lifecycle,'digested');const before=c.financial();
  c.advance(REPORT_RETENTION_MS);const removed=await(await proof()).json();
  assert.equal(removed.stored,false);assert.equal(removed.originalRemoved,true);assert.equal(removed.deviceCleanupVersion,1);assert.equal(removed.storageVerified,false);assert.equal(removed.deviceCopyRemovable,false);assert.equal(c.financial(),before);
 }finally{c.db.close()}
});
