import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicateCompletionFixture,installReportReaderWorker} from './helpers/duplicate-completion-fixture.mjs';
import {wholeDuplicateReview,prepareDuplicateCompletion,finishDuplicateCompletion} from '../frontend/src/app/report-duplicate-completion.ts';
import {loadStoredReport} from '../frontend/src/app/report-review-api.ts';
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts';
import {loadReportGroup} from '../frontend/src/app/report-group-loader.ts';
import {buildReportInbox} from '../src/report-inbox-controller.js';
import {openReport} from '../server/report-crypto.mjs';
import {bankDuplicateProof,bankDuplicateProofCurrent} from '../server/bank-duplicate-proof.mjs';
import * as classifier from '../tools/bank-csv/classifier.mjs';
import * as activityAPI from '../tools/bank-csv/cal-activity.mjs';

for(const bank of [false,true])test('Duplicate '+(bank?'bank XLSX':'card PDF')+' can finish from unresolved/deferred review without a financial write',async()=>{
 const restore=installReportReaderWorker();let fixture;
 try{fixture=await duplicateCompletionFixture({bank});const {c,base,group}=fixture,before=c.financial();assert.equal(wholeDuplicateReview(group.ui),true);group.ui.guided={version:1,step:'categories',done:['account','figures'],categories:'later',budgetRevision:base.revision};const command=prepareDuplicateCompletion(group.sources,group.ui,base),completed=await finishDuplicateCompletion('personal',base,command,c.fetcher);assert.ok(completed.every(source=>source.lifecycle==='digested'&&source.completionKind==='duplicate'));assert.equal(c.financial(),before);assert.equal((await(await c.req('alice','/api/report-intake')).json()).reports.find(report=>report.route?.reportId===completed[0].id).lifecycle,'digested');}
 finally{fixture?.c.db.close();restore()}
});

test('Exact-receipt bank source is reparsed for completion instead of remaining a skipped Partial source',async()=>{
 const restore=installReportReaderWorker();let fixture;
 try{fixture=await duplicateCompletionFixture({bank:true,exact:true});const {c,base,group}=fixture,before=c.financial();assert.equal(group.ui.items[0].skip,false);assert.ok(group.ui.items[0].records.length);assert.equal(group.ui.items[0].target,'bank-a');assert.equal(wholeDuplicateReview(group.ui),true);const completed=await finishDuplicateCompletion('personal',base,prepareDuplicateCompletion(group.sources,group.ui,base),c.fetcher);assert.equal(completed[0].lifecycle,'digested');assert.equal(c.financial(),before)}finally{fixture?.c.db.close();restore()}
});

test('Continue on an already-imported Partial bank report reaches verified completion without replaying its import',async()=>{
 const restore=installReportReaderWorker();let fixture;
 try{fixture=await duplicateCompletionFixture({bank:true,committed:true});const {c,base,group}=fixture,before=c.financial();assert.equal(group.resultOnly,false);assert.equal(group.sources[0].state,'committed');assert.equal(group.sources[0].lifecycle,'partial');assert.equal(wholeDuplicateReview(group.ui),true);const command=prepareDuplicateCompletion(group.sources,group.ui,base),completed=await finishDuplicateCompletion('personal',base,command,c.fetcher);assert.equal(completed[0].lifecycle,'digested');assert.equal(completed[0].state,'committed');assert.equal(c.financial(),before)}finally{fixture?.c.db.close();restore()}
});

test('Legacy bank rows can prove a whole duplicate without a covering receipt, and the proof protects original retention',async()=>{
 const restore=installReportReaderWorker();let fixture;
 try{fixture=await duplicateCompletionFixture({bank:true});const {c,base:previous,ids}=fixture,plan=structuredClone(previous.plan);plan.reportInbox.receipts=[];assert.equal((await c.req('alice','/api/plan',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,revision:previous.revision})})).status,200);
  const base=(await loadBudgetSnapshot('personal',new AbortController().signal,c.fetcher)).value,group=await loadReportGroup('personal',base,ids,new AbortController().signal,c.fetcher,false,{kind:'bank',target:'bank-a'});await buildReportInbox(base.plan,group.ui,{month:'2026-11',today:'2026-11-08',classifier,activityAPI});assert.equal(wholeDuplicateReview(group.ui),true);const before=c.financial(),completed=await finishDuplicateCompletion('personal',base,prepareDuplicateCompletion(group.sources,group.ui,base),c.fetcher);assert.equal(completed[0].lifecycle,'digested');assert.equal(c.financial(),before);
  const lifecycle=c.db.prepare('SELECT * FROM report_lifecycle WHERE source_id=?').get(ids[0]),data=JSON.parse(openReport(c.key,lifecycle.data,'report-lifecycle|personal:alice|'+ids[0])),proof=data.completion.members[0].bankProof;assert.ok(proof);assert.equal(bankDuplicateProofCurrent(base.plan,proof),true);
  for(const change of [plan=>plan.bankImport.entries.pop(),plan=>{plan.bankImport.entries[0].cents++},plan=>{plan.bankImport.entries[0].field='otherIncome'},plan=>{plan.bankImport.entries[0].accountId='different'},plan=>plan.bankImport.batches.pop(),plan=>{plan.importMigrationGuards={movements:[{key:proof.keys[0],fingerprint:'a'.repeat(64)}],receipts:[]}}]){const changed=structuredClone(base.plan);change(changed);assert.equal(bankDuplicateProofCurrent(changed,proof),false)}
  for(const change of [plan=>{plan.bankImport.entries[0].cents++},plan=>{plan.bankImport.entries[0].month='2026-01'}]){const changed=structuredClone(base.plan);change(changed);assert.equal(bankDuplicateProof(changed,group.ui.items[0]),null)}
  c.advance(30*86400000);await c.app.tickReportAutomation();assert.equal(c.db.prepare('SELECT source_bytes FROM report_sources WHERE id=?').get(ids[0]).source_bytes,0);assert.equal(c.financial(),before);
 }finally{fixture?.c.db.close();restore()}
});

test('Removing recorded bank evidence reopens duplicate completion and prevents timed original deletion',async()=>{
 const restore=installReportReaderWorker();let fixture;
 try{fixture=await duplicateCompletionFixture({bank:true});const {c,base:previous,ids}=fixture,plan=structuredClone(previous.plan);plan.reportInbox.receipts=[];await c.req('alice','/api/plan',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,revision:previous.revision})});const base=(await loadBudgetSnapshot('personal',new AbortController().signal,c.fetcher)).value,group=await loadReportGroup('personal',base,ids,new AbortController().signal,c.fetcher,false,{kind:'bank',target:'bank-a'});await buildReportInbox(base.plan,group.ui,{month:'2026-11',today:'2026-11-08',classifier,activityAPI});await finishDuplicateCompletion('personal',base,prepareDuplicateCompletion(group.sources,group.ui,base),c.fetcher);
  const changed=structuredClone(base.plan);changed.bankImport.entries=[];assert.equal((await c.req('alice','/api/plan',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:changed,revision:base.revision})})).status,200);const state=await(await c.req('alice','/api/report-lifecycle?budget=personal&id='+ids[0])).json();assert.equal(state.lifecycle,'partial');assert.equal(state.completedAt,null);c.advance(30*86400000);await c.app.tickReportAutomation();assert.ok(c.db.prepare('SELECT source_bytes FROM report_sources WHERE id=?').get(ids[0]).source_bytes>0);
 }finally{fixture?.c.db.close();restore()}
});

for(const lost of ['progress','completion'])test('Lost duplicate '+lost+' response retries the saved result without financial writes or resetting its timer',async()=>{
 const restore=installReportReaderWorker();let fixture;
 try{fixture=await duplicateCompletionFixture();const {c,base,group}=fixture,before=c.financial(),command=prepareDuplicateCompletion(group.sources,group.ui,base);let lostOnce=false,progressPosts=0;
 const fetcher=async(path,init={})=>{let action;try{action=JSON.parse(init.body).action}catch{}if(action==='draft-batch')progressPosts++;const response=await c.fetcher(path,init);if(!lostOnce&&action===(lost==='progress'?'draft-batch':'complete-duplicate')){lostOnce=true;return Response.json({error:'synthetic lost response'},{status:503})}return response};
 await assert.rejects(finishDuplicateCompletion('personal',base,command,fetcher));const afterLost=await loadStoredReport('personal',base,command.sources[0].id,new AbortController().signal,c.fetcher);c.advance(1000);const completed=await finishDuplicateCompletion('personal',base,command,fetcher);assert.equal(completed[0].lifecycle,'digested');assert.equal(progressPosts,1);if(lost==='completion')assert.equal(completed[0].completedAt,afterLost.completedAt);assert.equal(c.financial(),before)}finally{fixture?.c.db.close();restore()}
});

test('A partly completed duplicate group resumes every unfinished member and preserves the completed member deadline',async()=>{
 const restore=installReportReaderWorker();let fixture;
 try{fixture=await duplicateCompletionFixture({count:2});const {c,base,group,ids}=fixture,before=c.financial(),command=prepareDuplicateCompletion(group.sources,group.ui,base);let fail=true;
 const fetcher=(path,init={})=>{let action;try{action=JSON.parse(init.body).action}catch{}if(fail&&action==='complete-duplicate'&&path.includes(ids[1]))return Promise.resolve(Response.json({error:'synthetic unavailable'},{status:503}));return c.fetcher(path,init)};
 await assert.rejects(finishDuplicateCompletion('personal',base,command,fetcher));const first=await loadStoredReport('personal',base,ids[0],new AbortController().signal,c.fetcher);assert.equal(first.lifecycle,'digested');c.advance(1000);fail=false;const completed=await finishDuplicateCompletion('personal',base,command,fetcher);assert.equal(completed.length,2);assert.ok(completed.every(source=>source.lifecycle==='digested'));assert.equal(completed[0].completedAt,first.completedAt);assert.equal(c.financial(),before)}finally{fixture?.c.db.close();restore()}
});

test('Duplicate completion refuses changed sources, stale financial revisions and unsupported partial-cycle evidence',async()=>{
 const restore=installReportReaderWorker();let fixture;
 try{fixture=await duplicateCompletionFixture();const {c,base,group}=fixture,command=prepareDuplicateCompletion(group.sources,group.ui,base);assert.equal(wholeDuplicateReview({...group.ui,items:[{...group.ui.items[0],activity:{}}]}),false);assert.equal(wholeDuplicateReview({...group.ui,items:[{...group.ui.items[0],sheets:[]}]}),false);assert.equal(wholeDuplicateReview({...group.ui,issues:1}),false);assert.equal(wholeDuplicateReview({...group.ui,items:[{...group.ui.items[0],skip:true}]}),false);
 const changed=structuredClone(command);changed.sources[0].sourceHash='f'.repeat(64);await assert.rejects(finishDuplicateCompletion('personal',base,changed,c.fetcher),/המקור השתנה/);
 await c.req('alice','/api/plan',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:{...base.plan,buffer:42},revision:base.revision})});const before=c.financial();await assert.rejects(finishDuplicateCompletion('personal',base,command,c.fetcher));assert.equal(c.financial(),before);assert.ok((await loadStoredReport('personal',base,command.sources[0].id,new AbortController().signal,c.fetcher)).lifecycle!=='digested');}
 finally{fixture?.c.db.close();restore()}
});
