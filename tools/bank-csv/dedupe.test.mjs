import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDuplicates,acceptReviewed,readLedger} from './dedupe.mjs';
import {classify,monthlyProposal} from './classifier.mjs';
const scope='test-personal',empty=()=>({format:'bank-import-registry',version:1,scope,entries:[]});
const row=(line,reference='001',extra={})=>({line,reference,date:'2026-10-12',description:'משכורת',amountCents:10000,valid:true,inPeriod:true,currency:'ILS',...extra});
test('Overlapping imports skip reviewed reference/date identities, keeping different references and dates',()=>{
 const first=[row(1)],review=classify(first,{overrides:{1:{destination:'salary',confirmed:true}}});
 const accepted=acceptReviewed(empty(),first,review,scope);assert.equal(accepted.added,1);
 const next=inspectDuplicates([row(5),row(6,'002'),row(7,'001',{date:'2026-11-12'})],accepted.ledger,scope);
 assert.equal(next.duplicate,1);assert.equal(next.records[1].duplicateState,null);assert.equal(next.records[2].duplicateState,null);
 const classified=classify(next.records,{overrides:{5:{destination:'salary',confirmed:true},6:{destination:'salary',confirmed:true},7:{destination:'salary',confirmed:true}}});
 assert.equal(monthlyProposal(next.records,classified).included,2);
 assert.equal(inspectDuplicates([row(1)],accepted.ledger,'other-account').duplicate,0);
});
test('Repeated rows in one file are skipped, while conflicting amounts block both candidates',()=>{
 assert.equal(inspectDuplicates([row(1),row(2)],empty(),scope).duplicate,1);
 const conflict=inspectDuplicates([row(1),row(2,'001',{amountCents:9000})],empty(),scope);assert.equal(conflict.conflict,2);
 assert.equal(monthlyProposal(conflict.records,classify(conflict.records)).included,0);
});
test('Unreviewed and reference-free transactions are not silently registered; registry is scoped and validated',()=>{
 const records=[row(1),row(2,'')];assert.equal(acceptReviewed(empty(),records,classify(records),scope).added,0);
 const review=classify(records,{overrides:{2:{destination:'salary',confirmed:true}}});assert.equal(acceptReviewed(empty(),records,review,scope).missingReference,1);
 assert.throws(()=>readLedger({...empty(),scope:'other'},scope));assert.throws(()=>readLedger({...empty(),entries:[{key:'x',payload:'x'},{key:'x',payload:'x'}]},scope));
 assert.deepEqual(readLedger(empty(),scope),empty());
});
