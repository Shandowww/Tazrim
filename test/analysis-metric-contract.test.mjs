import test from 'node:test';import assert from 'node:assert/strict';
import {createDemoPlan,analysisMetricSnapshot,analysisMetricSeries,clone,forecast,annotateExpenseDetail} from '../src/budget.js';
import {sample} from './helpers/analysis-fixture.mjs';

test('Metric series and drilldown share exact signed cents, source identities, dates, scope and revision',()=>{
 const p=sample(),before=clone(p),baseline=forecast(p);
 for(const metric of ['identified','detail','reported'])for(const dateBasis of metric==='reported'?['billing']:['billing','purchase']){
  const options={metric,dateBasis,asOf:'2026-10',scope:'budget:test',revision:17},series=analysisMetricSeries(p,{...options,endMonth:'2026-10',count:3});
  for(const row of series){const direct=analysisMetricSnapshot(p,{...options,startMonth:row.month,endMonth:row.month});assert.deepEqual(row.snapshot,direct);assert.equal(direct.scope,'budget:test');assert.equal(direct.revision,17);assert.equal(direct.currency,'ILS');assert.equal(direct.rows.reduce((sum,row)=>sum+row.cents,0),direct.valueCents??0);assert.ok(direct.rows.every(row=>row.sourceId));}
  assert.equal(series.at(-1).valueCents,null);
 }
 assert.deepEqual(p,before);assert.deepEqual(forecast(p),baseline);
 assert.equal(analysisMetricSnapshot(p,{metric:'identified',dateBasis:'purchase',startMonth:'2026-08',endMonth:'2026-08'}).valueCents,15000);
 assert.equal(analysisMetricSnapshot(p,{metric:'detail',startMonth:'2026-09',endMonth:'2026-09'}).valueCents,13000);
 assert.throws(()=>analysisMetricSnapshot(p,{metric:'reported',account:'unassigned',startMonth:'2026-09',endMonth:'2026-09'}));
 assert.throws(()=>analysisMetricSnapshot(p,{metric:'reported',dateBasis:'purchase',startMonth:'2026-09',endMonth:'2026-09'}));
});
test('Common category/account/method filtering preserves split provenance and empty evidence remains a gap',()=>{
 const p=annotateExpenseDetail(sample(),'d',[{category:'מזון',cents:10000,person:'טל',event:''},{category:'קניות',cents:5000,person:'',event:''}]);
 for(const metric of ['identified','detail']){const row=analysisMetricSnapshot(p,{metric,startMonth:'2026-09',endMonth:'2026-09',method:'card1',category:'מזון'});assert.equal(row.valueCents,10000);assert.equal(row.rows[0].sourceId,'d');assert.equal(row.coverage.complete,false);const empty=analysisMetricSeries(p,{metric,endMonth:'2026-09',count:1,account:'no-such-account'});assert.equal(empty[0].valueCents,null);}
});

test('Change decomposition uses the same contract and reconciles refunds, categories and remainder',async()=>{
 const {metricSnapshotChange}=await import('../src/budget.js');const p=sample(),options={metric:'identified',startMonth:'2026-09',endMonth:'2026-09',scope:'a',revision:1};const current=analysisMetricSnapshot(p,options),previous=clone(current);previous.rows=previous.rows.map(row=>({...row,cents:row.cents-100}));previous.valueCents-=200;const result=metricSnapshotChange(previous,current);assert.equal(result.differenceCents,200);assert.equal(result.parts.reduce((sum,row)=>sum+row.differenceCents,0)+result.remainderCents,200);assert.equal(metricSnapshotChange({...previous,rows:[]},current).available,false);assert.throws(()=>metricSnapshotChange({...previous,revision:2},current));assert.throws(()=>metricSnapshotChange({...previous,filters:{account:'different'}},current));
});
