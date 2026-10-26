import test from 'node:test';import assert from 'node:assert/strict';
import {createDemoPlan,validatePlan,clone} from '../src/budget.js';
import {withSourceAllocation,withoutSourceAllocation,sourceAllocationState,sourceAllocationUsage,reviewBankConsumption,bankConsumptionRemainders} from '../src/reconciliation-model.js';
const sample=()=>{const p=createDemoPlan('2026-10');p.demo=false;p.expenses=[];p.details=[{id:'d',name:'הוצאה',amount:300,category:'מזון',method:'variable',month:'2026-09',date:'2026-09-10',number:'',status:'cleared',accounting:'included'}];p.bankImport={version:1,accounts:[{id:'a',label:'א',rules:[]}],batches:[{id:'b',file:'test.csv',accountId:'a',from:'2026-09-01',to:'2026-09-30',months:[]}],entries:[{key:'a'.repeat(64),fingerprint:'b'.repeat(64),cents:-50000,field:'variable',accountId:'a',month:'2026-09',batchId:'b',source:{date:'2026-09-15',description:'הוצאה',details:'',beneficiary:'',purpose:'',reference:'',currency:'ILS'}}]};return p;};
test('Partial allocation reserves exact cents without editing sources; explicit residual review is reversible',()=>{
 const p=sample(),before=clone(p),next=withSourceAllocation(p,{id:'group',bankParts:[{key:'a'.repeat(64),cents:30000}],detailParts:[{id:'d',cents:30000}]});
 assert.equal(validatePlan(next),true);assert.deepEqual(p,before);assert.deepEqual(next.details,p.details);assert.deepEqual(next.bankImport,p.bankImport);assert.equal(bankConsumptionRemainders(next)[0].remainingCents,20000);
 const reviewed=reviewBankConsumption(next,'a'.repeat(64),'purchase');assert.equal(bankConsumptionRemainders(reviewed)[0].decision,'purchase');assert.equal(sourceAllocationUsage(reviewed).detail.get('d'),30000);
 assert.equal(withoutSourceAllocation(reviewed,'group').sourceAllocations.length,0);
 assert.throws(()=>withSourceAllocation(next,{id:'second',bankParts:[{key:'a'.repeat(64),cents:100}],detailParts:[{id:'d',cents:100}]}),/הסכומים/);
 const edited=clone(reviewed);edited.details[0].amount=301;assert.equal(validatePlan(edited),true);assert.equal(sourceAllocationState(edited,edited.sourceAllocations[0]),'stale');assert.equal(bankConsumptionRemainders(edited)[0].decision,'stale');assert.throws(()=>reviewBankConsumption(edited,'a'.repeat(64),'purchase'));
});
test('Cross-month many-to-one sources are explicit and over-allocation, mixed signs or settlement are denied',()=>{
 const p=sample();p.bankImport.entries[0].cents=-10000;p.bankImport.entries.push({...clone(p.bankImport.entries[0]),key:'c'.repeat(64),cents:-20000,month:'2026-10',source:{...p.bankImport.entries[0].source,date:'2026-10-01'}});
 const next=withSourceAllocation(p,{id:'g',bankParts:[{key:'a'.repeat(64),cents:10000},{key:'c'.repeat(64),cents:20000}],detailParts:[{id:'d',cents:30000}]});assert.equal(validatePlan(next),true);assert.ok(bankConsumptionRemainders(next).every(row=>row.remainingCents===0));
 const settlement=clone(p);settlement.bankImport.entries[0].field='card1';assert.throws(()=>withSourceAllocation(settlement,{id:'x',bankParts:[{key:'a'.repeat(64),cents:10000}],detailParts:[{id:'d',cents:10000}]}));
 assert.throws(()=>withSourceAllocation(p,{id:'x',bankParts:[{key:'a'.repeat(64),cents:-10000}],detailParts:[{id:'d',cents:10000}]}));
 for(const value of [{},[null]]){const malformed=sample();malformed.sourceAllocations=value;assert.equal(validatePlan(malformed),false);}
});

test('Identified consumption counts partial/cross-month sources once and keeps unknowns and refunds separate',async()=>{
 const {consumptionSnapshot}=await import('../src/budget.js');const p=sample(),options={startMonth:'2026-09',endMonth:'2026-10',asOf:'2026-10'};
 assert.equal(consumptionSnapshot(p,options).valueCents,30000);assert.equal(consumptionSnapshot(p,options).coverage.unresolvedPurchasesCents,50000);
 const linked=withSourceAllocation(p,{id:'g',bankParts:[{key:'a'.repeat(64),cents:30000}],detailParts:[{id:'d',cents:30000}]});
 const reviewed=reviewBankConsumption(linked,'a'.repeat(64),'purchase');assert.equal(consumptionSnapshot(reviewed,options).valueCents,50000);
 reviewed.bankImport.entries.push({...clone(reviewed.bankImport.entries[0]),key:'c'.repeat(64),fingerprint:'d'.repeat(64),cents:10000});
 const refund=reviewBankConsumption(reviewed,'c'.repeat(64),'purchase'),view=consumptionSnapshot(refund,options);
 assert.equal(view.purchasesCents,50000);assert.equal(view.refundsCents,10000);assert.equal(view.valueCents,40000);assert.equal(view.rows.reduce((sum,row)=>sum+row.cents,0),view.valueCents);assert.equal(view.coverage.complete,false);
 const edited=clone(refund);edited.details[0].amount=301;assert.equal(consumptionSnapshot(edited,options).valueCents,20100);assert.equal(consumptionSnapshot(edited,options).coverage.unresolvedBankCount,1);
 // Cash settlement and savings are never eligible, even with forged review metadata.
 const settlement=sample();settlement.bankImport.entries[0].field='card1';assert.throws(()=>reviewBankConsumption(settlement,'a'.repeat(64),'purchase'));
});

test('A partial direct refund is matched by negative purchase sign without netting unrelated debits',async()=>{
 const {consumptionSnapshot}=await import('../src/budget.js');const p=sample();p.details[0]={...p.details[0],amount:-100,refund:true};p.bankImport.entries[0].cents=15000;
 assert.equal(validatePlan(p),true);
 const linked=withSourceAllocation(p,{id:'refund',bankParts:[{key:'a'.repeat(64),cents:-10000}],detailParts:[{id:'d',cents:-10000}]});
 const next=reviewBankConsumption(linked,'a'.repeat(64),'purchase'),result=consumptionSnapshot(next,{startMonth:'2026-09',endMonth:'2026-09'});
 assert.equal(result.valueCents,-15000);assert.equal(result.refundsCents,15000);assert.equal(validatePlan(next),true);
 const forged=clone(linked);forged.sourceAllocations[0].bankParts[0].cents=10000;forged.sourceAllocations[0].detailParts[0].cents=10000;assert.equal(validatePlan(forged),false);
});
