import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {guidedFixture} from './helpers/guided-report-fixture.mjs'
import {installReportReaderWorker} from './helpers/duplicate-completion-fixture.mjs'
import {updateReportLifecycle} from '../frontend/src/app/report-lifecycle-api.ts'
import {loadReportGroup} from '../frontend/src/app/report-group-loader.ts'
import {saveStoredReportGroupDraft,commitStoredReportGroup} from '../frontend/src/app/report-review-api.ts'
import {reportInboxDraftForWrite} from '../src/report-inbox-controller.js'
import {buildReportInbox} from '../src/report-inbox-controller.js'
import {openReport} from '../server/report-crypto.mjs'
import * as classifier from '../tools/bank-csv/classifier.mjs'
import * as activityAPI from '../tools/bank-csv/cal-activity.mjs'
import XLSX from '../tools/bank-csv/vendor/xlsx-mini.cjs'

function conflictingBank(){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['הפועלים'],['מספר חשבון 123456'],['תאריך','תיאור','אסמכתא','חובה','זכות','יתרה'],['10/11/2026','כרטיסי אשראי','8547994',9911.72,'',3112.73],['10/11/2026','כרטיסי אשראי','8547994',110,'',13024.45]]),'תנועות');return Buffer.from(XLSX.write(book,{type:'array',bookType:'xlsx'}));}
function declaration(f,group){return{actionId:randomUUID(),confirm:true,sources:group.sources.map(source=>({id:source.id,sourceHash:source.sourceHash,revision:source.revision,reviewRevision:source.reviewRevision??0}))};}
async function finish(f,base,group,extra,fetcher=f.fetcher){return updateReportLifecycle('personal',base,group.sources[0],'declare-duplicate',extra,fetcher);}

test('An unresolved bank report can be explicitly closed as duplicate with unchanged financial records and retained original',async()=>{
 const f=await guidedFixture({sourceName:'shared-jan-nov-2026.xlsx',sourceBytes:conflictingBank()});
 try{const {base,group}=await f.load();await buildReportInbox(base.plan,group.ui,{month:'2026-11',today:'2026-11-07',classifier,activityAPI});assert.ok(group.ui.issues>0);assert.ok(group.ui.items[0].matchReviews.some(row=>!row.canMatch));const before=f.financial(),original=f.sourceRow(),command=declaration(f,group),result=await finish(f,base,group,command);
  assert.equal(result.lifecycle,'digested');assert.equal(result.completionKind,'declared-duplicate');assert.equal(result.removalAt,null);assert.equal(f.financial(),before);assert.deepEqual(f.sourceRow(),original);assert.equal((await f.load()).group.resultOnly,true);
  const stored=f.db.prepare('SELECT * FROM report_lifecycle WHERE source_id=?').get(f.id),data=JSON.parse(openReport(f.key,stored.data,'report-lifecycle|personal:alice|'+f.id));assert.equal(data.actorId,'alice');assert.equal(data.completion.actionId,command.actionId);
  f.advance(31*86400000);await f.app.tickReportAutomation();assert.ok(f.sourceRow().source_bytes>0);assert.equal((await f.lifecycle()).lifecycle,'digested');assert.equal(f.financial(),before);
 }finally{f.db.close();}
});

test('Lost explicit-duplicate success retries exactly once and reopening restores the saved review',async()=>{
 const f=await guidedFixture(),restore=installReportReaderWorker();
 try{const {base,group}=await f.load(),before=f.financial(),command=declaration(f,group);let fail=true;const fetcher=async(path,init)=>{const response=await f.fetcher(path,init);if(fail&&init?.body&&JSON.parse(init.body).action==='declare-duplicate'){fail=false;throw Error('lost success');}return response;};await assert.rejects(finish(f,base,group,command,fetcher));const first=await f.lifecycle();f.advance(1000);assert.equal((await finish(f,base,group,command)).completedAt,first.completedAt);
  const reopened=await loadReportGroup('personal',base,[f.id],new AbortController().signal,f.fetcher,true);assert.equal(reopened.resultOnly,false);assert.deepEqual(reopened.ui.items[0].decisions,group.ui.items[0].decisions);assert.equal((await f.lifecycle()).lifecycle,'partial');assert.equal(f.financial(),before);
 }finally{restore();f.db.close();}
});

test('Explicit duplicate refuses missing consent, stale revisions, foreign reports and already-imported reports',async()=>{
 const f=await guidedFixture();
 try{const {base,group}=await f.load(),before=f.financial(),command=declaration(f,group);
  for(const bad of [{...command,confirm:false},{...command,sources:[{...command.sources[0],sourceHash:'a'.repeat(64)}]},{...command,sources:[{...command.sources[0],reviewRevision:99}]},{...command,sources:[command.sources[0],{...command.sources[0],id:randomUUID()}]}])await assert.rejects(finish(f,base,group,bad));
  await assert.rejects(finish(f,{...base,revision:base.revision+1},group,command));
  const foreign=await f.req('bob','/api/report-lifecycle?budget=personal&id='+f.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'declare-duplicate',sourceHash:group.sources[0].sourceHash,revision:group.sources[0].revision,budgetRevision:base.revision,...command})});assert.equal(foreign.status,404);assert.equal((await f.lifecycle()).lifecycle,'new');assert.equal(f.financial(),before);
  await f.progress();await f.commit();const current=await f.load();await assert.rejects(finish(f,current.base,{sources:[{...group.sources[0],revision:f.sourceRow().revision}]},declaration(f,{sources:[{...group.sources[0],revision:f.sourceRow().revision}]})));
 }finally{f.db.close();}
});

test('Declaring a group is atomic; reopening one report does not reopen its siblings',async()=>{
 const {duplicateCompletionFixture}=await import('./helpers/duplicate-completion-fixture.mjs'),restore=installReportReaderWorker();let fixture;
 try{fixture=await duplicateCompletionFixture({count:2});const {c:f,base,group,ids}=fixture,before=f.financial(),command=declaration(f,group);
  const bad=structuredClone(command);bad.sources[1].reviewRevision=999;await assert.rejects(finish(f,base,group,bad));assert.ok(f.db.prepare('SELECT completed_at FROM report_lifecycle WHERE source_id IN (?,?)').all(...ids).every(row=>row.completed_at===null));
  await finish(f,base,group,command);for(const id of ids)assert.equal((await(await f.req('alice','/api/report-lifecycle?budget=personal&id='+id)).json()).lifecycle,'digested');
  await updateReportLifecycle('personal',base,group.sources[0],'reopen',{},f.fetcher);assert.equal((await(await f.req('alice','/api/report-lifecycle?budget=personal&id='+ids[1])).json()).lifecycle,'digested');assert.equal(f.financial(),before);
 }finally{fixture?.c.db.close();restore();}
});

test('Shared viewer and downgraded editor cannot declare duplicates; current editor can close without financial changes',async()=>{
 const f=await guidedFixture();
 try{
  const budget=await(await f.post('/api/budgets',{name:'Shared duplicate test'})).json();assert.ok(budget.id);
  const {base}=await f.load();const seeded=await f.req('alice','/api/plan?budget='+budget.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:base.plan,revision:0})});assert.equal(seeded.status,200);
  f.db.prepare('INSERT INTO budget_members VALUES(?,?,?)').run(budget.id,'bob','bob@example.test');f.db.prepare('INSERT INTO budget_member_roles VALUES(?,?,?)').run(budget.id,'bob','viewer');
  const uploaded=await f.req('alice','/api/reports?budget='+budget.id,{method:'PUT',headers:{'Content-Type':'application/octet-stream','x-report-name':'shared.pdf'},body:f.bytes});assert.equal(uploaded.status,201);
  const row=f.db.prepare('SELECT * FROM report_sources WHERE scope=?').get('budget:'+budget.id);assert.ok(row);
  const plan=await(await f.req('bob','/api/plan?budget='+budget.id)).json(),member={id:row.id,sourceHash:row.source_hash,revision:row.revision,reviewRevision:0};
  const payload={action:'declare-duplicate',actionId:randomUUID(),confirm:true,sources:[member],sourceHash:row.source_hash,revision:row.revision,budgetRevision:plan.revision};
  const request=()=>f.req('bob','/api/report-lifecycle?budget='+budget.id+'&id='+row.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const before=f.financial();assert.equal((await request()).status,403);
  f.db.prepare("UPDATE budget_member_roles SET role='editor' WHERE budget_id=? AND user_id='bob'").run(budget.id);
  f.db.prepare("UPDATE budget_member_roles SET role='viewer' WHERE budget_id=? AND user_id='bob'").run(budget.id);assert.equal((await request()).status,403);
  f.db.prepare("UPDATE budget_member_roles SET role='editor' WHERE budget_id=? AND user_id='bob'").run(budget.id);const result=await request();assert.equal(result.status,200);assert.equal((await result.json()).lifecycle,'digested');assert.equal(f.financial(),before);
 }finally{f.db.close();}
});


test('A review open on another device cannot save or import after duplicate closure',async()=>{
 const f=await guidedFixture();
 try{await f.progress();const {base,group}=await f.load();await buildReportInbox(base.plan,group.ui,{month:'2026-11',today:'2026-11-07',classifier,activityAPI});assert.ok(group.ui.build);const draft=reportInboxDraftForWrite(group.ui,group.ui.items,'stale-before-duplicate'),before=f.financial();await finish(f,base,group,declaration(f,group));
  await assert.rejects(saveStoredReportGroupDraft('personal',base,group.sources,draft,'ready',f.fetcher));
  await assert.rejects(commitStoredReportGroup('personal',base,group.sources,draft,group.ui.build,randomUUID(),f.fetcher));assert.equal(f.financial(),before);assert.equal((await f.lifecycle()).lifecycle,'digested');
 }finally{f.db.close();}
});
