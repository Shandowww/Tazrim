import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoPlan,withRegisteredCategory,categoryRegistryEntry,categoryRegistryValid,clone,validatePlan} from '../src/budget.js';
import {financialProjection} from '../server/financial-data.mjs';

test('adding a stable category identity preserves old budget labels and all financial amounts',()=>{
 const p=createDemoPlan('2026-10');p.details=[{id:'purchase',name:'קנייה',category:'קניות / כללי',method:'card1',amount:125.25,month:'2026-10',date:'2026-10-02',number:'',status:'cleared',accounting:'included'}];
 const before=clone(p),ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
 const next=withRegisteredCategory(p,'קניות / כללי',()=>ids.shift());
 assert.deepEqual(p,before);assert.equal(validatePlan(next),true);assert.equal(next.details[0].category,'קניות / כללי');
 const parent=categoryRegistryEntry(next,'קניות'),child=categoryRegistryEntry(next,'קניות / כללי');
 assert.equal(child.parentId,parent.id);assert.equal(financialProjection(next).transactions.find(row=>row.id==='purchase').category_id,child.id);
 assert.equal(financialProjection(next).transactions.find(row=>row.id==='purchase').amount_cents,-12525);
 assert.equal(withRegisteredCategory(next,'קניות / כללי'),next);
});

test('an old category label can remain an alias to the same identity after a later rename',()=>{
 const p=createDemoPlan('2026-10');p.details=[{id:'purchase',name:'קנייה',category:'קניות / כללי',method:'card1',amount:20,month:'2026-10',date:'2026-10-02',number:'',status:'cleared',accounting:'included'}];
 const registered=withRegisteredCategory(p,'קניות / כללי',(()=>{let n=0;return()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;})());
 const child=categoryRegistryEntry(registered,'קניות / כללי'),renamed=clone(registered);const entry=renamed.categoryRegistry.entries.find(row=>row.id===child.id);entry.label='קניות / בית';entry.aliases.push('קניות / כללי');
 assert.equal(categoryRegistryValid(renamed),true);assert.equal(categoryRegistryEntry(renamed,'קניות / כללי').id,child.id);
 const projection=financialProjection(renamed),transaction=projection.transactions.find(row=>row.id==='purchase');
 assert.equal(transaction.category_id,child.id);assert.equal(projection.entities.find(row=>row.kind==='category'&&row.id===child.id).label,'קניות / בית');
 const invalid=clone(renamed);invalid.categoryRegistry.entries[0].aliases.push('קניות / בית');assert.equal(categoryRegistryValid(invalid),false);
});

test('Reviewed category rename keeps identities and exact source labels while analytics follows aliases',async()=>{
 const {renameRegisteredCategory,analyticalExpenseDetails}=await import('../src/budget.js');
 const p=createDemoPlan('2026-10');p.demo=false;p.details=[{id:'d',name:'קנייה',category:'קניות / כללי',amount:50,method:'card1',month:'2026-09',date:'2026-09-01',number:'',status:'cleared',accounting:'included'}];
 const next=renameRegisteredCategory(p,'קניות / כללי','קניות / לבית');assert.equal(validatePlan(next),true);assert.equal(next.details[0].category,p.details[0].category);assert.equal(analyticalExpenseDetails(next)[0].category,'קניות / לבית');assert.equal(categoryRegistryEntry(next,'קניות / כללי').id,categoryRegistryEntry(next,'קניות / לבית').id);
 assert.throws(()=>renameRegisteredCategory(next,'קניות / לבית','מזון / לבית'));assert.equal(analyticalExpenseDetails(next)[0].amount,50);
});

test('Root rename, move, archive and merge keep source evidence and stable colours without hidden cap arithmetic',async()=>{
 const {renameRegisteredCategory,moveRegisteredCategory,archiveRegisteredCategory,mergeRegisteredCategories,analyticalExpenseDetails,categoryColor,categoryContains,forecast}=await import('../src/budget.js');
 const p=createDemoPlan('2026-10');p.demo=false;p.details=[{id:'d',name:'קנייה',category:'קניות / כללי',amount:50,method:'card1',month:'2026-09',date:'2026-09-01',number:'',status:'cleared',accounting:'included'}];const before=clone(p),baseline=forecast(p),originalColor=categoryColor('קניות / כללי',p);
 let next=renameRegisteredCategory(p,'קניות','צרכי הבית');assert.equal(categoryColor('צרכי הבית / כללי',next),originalColor);assert.ok(categoryContains('צרכי הבית','צרכי הבית / כללי'));
 const id=categoryRegistryEntry(next,'צרכי הבית / כללי').id;next=moveRegisteredCategory(next,'צרכי הבית / כללי','מזון');assert.equal(categoryRegistryEntry(next,'קניות / כללי').id,id);assert.equal(analyticalExpenseDetails(next)[0].category,'מזון / כללי');assert.equal(categoryColor('מזון / כללי',next),originalColor);
 next=archiveRegisteredCategory(next,'מזון / כללי',true,'2026-10-18');assert.equal(categoryRegistryEntry(next,'מזון / כללי').archivedAt,'2026-10-18');assert.equal(analyticalExpenseDetails(next)[0].amount,50);
 next=archiveRegisteredCategory(next,'מזון / כללי',false);assert.equal(categoryRegistryEntry(next,'מזון / כללי').archivedAt,undefined);
 next=mergeRegisteredCategories(next,'מזון / כללי','מזון / סופר ומכולת');assert.equal(analyticalExpenseDetails(next)[0].category,'מזון / סופר ומכולת');assert.equal(next.categoryRegistry.entries.find(row=>row.id===id).mergedInto,categoryRegistryEntry(next,'מזון / סופר ומכולת').id);assert.equal(validatePlan(next),true);assert.deepEqual(next.details,p.details);assert.deepEqual(forecast(next),baseline);assert.deepEqual(p,before);
 const cap=clone(p);cap.categoryGoals={'קניות / כללי':100,'מזון':200};assert.throws(()=>mergeRegisteredCategories(cap,'קניות / כללי','מזון'),/תקרות/);
 const bad=clone(next);bad.categoryRegistry.entries.find(row=>row.id===id).mergedInto=id;assert.equal(validatePlan(bad),false);
 const projection=financialProjection(next);assert.equal(projection.transactions.find(row=>row.id==='d').category_id,categoryRegistryEntry(next,'מזון / סופר ומכולת').id);
});

test('Saved old category labels keep filtering the same records after rename or merge',async()=>{const {renameRegisteredCategory,analysisMetricSnapshot,exploreExpenseDetails}=await import('../src/budget.js');const p=createDemoPlan('2026-10');p.demo=false;p.details=[{id:'d',name:'קנייה',category:'קניות / כללי',amount:50,method:'card1',month:'2026-09',date:'2026-09-01',number:'',status:'cleared',accounting:'included'}];const next=renameRegisteredCategory(p,'קניות','בית');for(const metric of ['identified','detail'])assert.equal(analysisMetricSnapshot(next,{metric,startMonth:'2026-09',endMonth:'2026-09',category:'קניות'}).valueCents,5000);assert.equal(exploreExpenseDetails(next,{endMonth:'2026-09',count:1,category:'קניות / כללי'}).netCents,5000);assert.equal(validatePlan(renameRegisteredCategory(next,'בית','קניות')),true);});
