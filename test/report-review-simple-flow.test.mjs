import test from 'node:test'
import assert from 'node:assert/strict'
import {guidedFixture} from './helpers/guided-report-fixture.mjs'
import {installReportReaderWorker} from './helpers/duplicate-completion-fixture.mjs'
import {loadReportGroup} from '../frontend/src/app/report-group-loader.ts'
import {saveStoredReportGroupDraft} from '../frontend/src/app/report-review-api.ts'
import {loadIncomingInbox,deleteIncomingReport} from '../frontend/src/app/report-intake-api.ts'
import {buildReportInbox,reportInboxDraftForWrite} from '../src/report-inbox-controller.js'
import * as classifier from '../tools/bank-csv/classifier.mjs'
import * as activityAPI from '../tools/bank-csv/cal-activity.mjs'

test('Restart re-reads the original group, clears saved categories, and retains financial data',async()=>{
 const restoreWorker=installReportReaderWorker(),f=await guidedFixture()
 try{
  const before=f.financial(),{base,group}=await f.load(),groupId=group.ui.groupId
  await buildReportInbox(base.plan,group.ui,{month:'2026-11',today:'2026-11-07',classifier,activityAPI})
  const category=group.ui.cardGroups[0]?.key
  assert.ok(category)
  group.ui.categoryChoices.set(category,'מזון')
  await saveStoredReportGroupDraft('personal',base,group.sources,reportInboxDraftForWrite(group.ui,group.ui.items,'restart-test'),'ready',f.fetcher)
  const saved=await f.load()
  assert.equal(saved.group.ui.categoryChoices.get(category),'מזון')
  const reset=await loadReportGroup('personal',base,[f.id],new AbortController().signal,f.fetcher,false,{},true)
  assert.equal(reset.ui.groupId,groupId)
  assert.equal(reset.ui.categoryChoices.size,0)
  assert.equal(reset.ui.items[0].target,group.ui.items[0].target)
  await buildReportInbox(base.plan,reset.ui,{month:'2026-11',today:'2026-11-07',classifier,activityAPI})
  await saveStoredReportGroupDraft('personal',base,reset.sources,reportInboxDraftForWrite(reset.ui,reset.ui.items,'restart-test'),reset.ui.issues?'needs_review':'ready',f.fetcher)
  assert.equal((await f.load()).group.ui.categoryChoices.size,0)
  assert.equal(f.financial(),before)
 }finally{f.db.close();restoreWorker()}
})

test('Deleting an unfinished routed report removes both copies and can finish after an uncertain private deletion',async()=>{
 const f=await guidedFixture()
 try{
  const before=f.financial(),snapshot=await loadIncomingInbox('alice',new AbortController().signal,f.fetcher),report=snapshot.reports.find(row=>row.id===f.privateId)
  assert.ok(report?.route)
  assert.equal(report.applied,false)
  let failed=false
  const interrupted=(path,init)=>{
   if(!failed&&path.startsWith('/api/report-intake')&&init?.method==='POST'&&JSON.parse(init.body).action==='delete'){
    failed=true
    throw Error('Connection lost')
   }
   return f.fetcher(path,init)
  }
  await assert.rejects(deleteIncomingReport('alice',report,'personal',interrupted))
  assert.equal(f.sourceRow(),undefined)
  assert.ok((await loadIncomingInbox('alice',new AbortController().signal,f.fetcher)).reports.some(row=>row.id===report.id))
  await deleteIncomingReport('alice',report,'personal',f.fetcher)
  assert.ok(!(await loadIncomingInbox('alice',new AbortController().signal,f.fetcher)).reports.some(row=>row.id===report.id))
  assert.equal(f.financial(),before)
 }finally{f.db.close()}
})
