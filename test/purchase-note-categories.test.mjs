import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {guidedFixture} from './helpers/guided-report-fixture.mjs';
import {calTextFixture,calPDFFixture,glyphs} from '../tools/bank-csv/cal-pdf-fixture.mjs';
import {buildReportInbox,inboxCardRowCategoryKey,reportInboxDraftForWrite} from '../src/report-inbox-controller.js';
import {statementMerchant} from '../src/card-statement-model.js';
import {optionalCategoryCounts,reportClassificationRows} from '../frontend/src/app/report-classification-model.ts';
import {saveStoredReportGroupDraft,commitStoredReportGroup} from '../frontend/src/app/report-review-api.ts';
import * as classifier from '../tools/bank-csv/classifier.mjs';

test('a purchase-note category stays on one transaction through original group draft, resume and one financial commit',async()=>{
 const pages=calTextFixture(),second=pages[1],y=746;second.items=second.items.filter(item=>!(item.transform[5]===y&&item.transform[4]>=450&&item.transform[4]<498));second.items.push(...glyphs('עסק לדוגמה',498,y,true));
 const f=await guidedFixture({sourceBytes:calPDFFixture(pages)});
 try{
  const before=f.financial(),{base,group}=await f.load();await buildReportInbox(base.plan,group.ui,{month:'2026-11',today:'2026-11-07',classifier,activityAPI:null});
  assert.equal(group.ui.cardGroups.length,1);assert.equal(group.ui.cardGroups[0].rows.length,2);
  const [first,other]=group.ui.items[0].preview.rows,rowKey=inboxCardRowCategoryKey(first);
  group.ui.categoryChoices.set(statementMerchant(first.entry.merchant),'קניות');group.ui.categoryChoices.set(rowKey,'מזון');group.ui.guided={version:1,step:'summary',done:['account','figures','categories'],categories:'resolved',budgetRevision:base.revision};
  await buildReportInbox(base.plan,group.ui,{month:'2026-11',today:'2026-11-07',classifier,activityAPI:null});
  assert.equal(group.ui.build.details.find(row=>row.id===first.id).category,'מזון');assert.equal(group.ui.build.details.find(row=>row.id===other.id).category,'קניות');assert.equal(optionalCategoryCounts(group.ui).missing,0);
  const shown=reportClassificationRows(group.ui)[0].rows;assert.equal(shown[0].current,'מזון');assert.match(shown[0].status,/שבחרת/);assert.equal(shown[1].current,'קניות');
  const draft=reportInboxDraftForWrite(group.ui,group.ui.items,'purchase-notes-test');await saveStoredReportGroupDraft('personal',base,group.sources,draft,'ready',f.fetcher);assert.equal(f.financial(),before);
  const resumed=await f.load();assert.equal(resumed.group.ui.categoryChoices.get(rowKey),'מזון');await buildReportInbox(resumed.base.plan,resumed.group.ui,{month:'2026-11',today:'2026-11-07',classifier,activityAPI:null});
  const savedDraft=reportInboxDraftForWrite(resumed.group.ui,resumed.group.ui.items,'purchase-notes-test'),actionId=randomUUID();let drop=true;
  const fetcher=async(path,init)=>{const response=await f.fetcher(path,init);if(init?.method==='POST'&&String(init.body).includes('"action":"commit"')&&response.ok&&drop){drop=false;throw Error('Lost success');}return response;};
  try{await commitStoredReportGroup('personal',resumed.base,resumed.group.sources,savedDraft,resumed.group.ui.build,actionId,fetcher);}catch{}
  await commitStoredReportGroup('personal',resumed.base,resumed.group.sources,savedDraft,resumed.group.ui.build,actionId,fetcher);
  const saved=await(await f.req('alice','/api/plan')).json();assert.equal(saved.revision,base.revision+1);assert.equal(saved.plan.details.find(row=>row.id===first.id).category,'מזון');assert.equal(saved.plan.details.find(row=>row.id===other.id).category,'קניות');assert.equal(saved.plan.details.reduce((sum,row)=>sum+Math.round(row.amount*100),0),5000);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM report_commits').get().n,1);
 }finally{f.db.close();}
});
test('the rollback capability guard rejects a saved row-category import without financial mutation',async()=>{
 const f=await guidedFixture({rowCategoriesSupported:false});
 try{
  const before=f.financial(),{base,group}=await f.load();await buildReportInbox(base.plan,group.ui,{month:'2026-11',today:'2026-11-07',classifier,activityAPI:null});
  group.ui.categoryChoices.set(inboxCardRowCategoryKey(group.ui.items[0].preview.rows[0]),'מזון');group.ui.guided={version:1,step:'summary',done:['account','figures','categories'],categories:'resolved',budgetRevision:base.revision};await buildReportInbox(base.plan,group.ui,{month:'2026-11',today:'2026-11-07',classifier,activityAPI:null});
  const draft=reportInboxDraftForWrite(group.ui,group.ui.items,'rollback-guard-test');
  await assert.rejects(()=>commitStoredReportGroup('personal',base,group.sources,draft,group.ui.build,randomUUID(),f.fetcher),/נדרשת גרסת Budgit/);
  assert.equal(f.financial(),before);assert.equal(f.sourceRow().state,'ready');
 }finally{f.db.close();}
});
