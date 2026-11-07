import test from 'node:test';
import assert from 'node:assert/strict';
import {clone,zero,validatePlan} from '../src/budget.js';
import {prepareCardStatement,applyCardStatement} from '../src/card-statement-model.js';
import {applyReportInbox} from '../src/report-inbox-model.js';
import {buildReportInbox} from '../src/report-inbox-controller.js';
import * as classifier from '../tools/bank-csv/classifier.mjs';
const base=()=>({startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true,creditCards:[{id:'card1',name:'בדיקה',alias:'1234',provider:'cal'}],cashPlanning:{accounts:[{id:'a',label:'חשבון',buffer:0}],months:{},cardAccounts:{card1:'a'},transfers:[]}});
const entry=(changes={})=>({date:'2026-10-01',merchant:'חנות בדיקה (סניף)',amountCents:10000,originalCents:30000,notes:'תשלום 1 מתוך 3',...changes});
const report=entries=>({issuer:'cal',dueDate:'2026-10-15',amount:entries.reduce((n,e)=>n+e.amountCents,0)/100,entries});
async function savedReport(entries){const p=base(),r=report(entries),statement=await prepareCardStatement(p,r,'card1');return applyReportInbox(p,[],[{cardId:'card1',dueDate:r.dueDate,amount:r.amount,accountId:'a',statement,choices:{},deferCategories:true}],[{hash:'a'.repeat(64),kind:'card',target:'card1',reference:r.dueDate}],[],'2026-11-07')}
function uiFor(r){return {blank:false,startMonth:'2026-01',groupId:crypto.randomUUID(),duplicates:0,items:[{id:crypto.randomUUID(),name:'new.pdf',size:100,kind:'card',provider:'cal',target:'card1',payer:'a',report:r,hash:'b'.repeat(64),decisions:{},directIncluded:{},monthDecisions:{},bankOptions:{scope:'complete'},skip:false}],newAccounts:[],newCards:[],categoryChoices:new Map(),bankChoices:new Map(),merchantRules:[]}}
const build=(p,ui)=>buildReportInbox(p,ui,{month:'2026-11',today:'2026-11-07',classifier});
test('PDF/Excel formatting and extra payment notes reuse existing IDs/categories and classify a whole repeated statement as duplicate',async()=>{
 const p=await savedReport([entry(),entry({date:'2026-10-02',merchant:'מ.תחבורה - רב-פס',amountCents:-1000,originalCents:-1000,notes:''})]);p.details[0].category='מזון';const before=clone(p),r=report([entry({merchant:'חנות בדיקה ) סניף (',notes:'תשלום 1 מ 3 -'}),entry({date:'2026-10-02',merchant:'מ . תחבורה - רב - פס',amountCents:-1000,originalCents:-1000,notes:'מזהה כרטיס Apple Pay'})]),preview=await prepareCardStatement(p,r,'card1');
 assert.equal(preview.rows.filter(row=>row.existing).length,2);assert.deepEqual(preview.rows.map(row=>row.id),p.details.map(row=>row.id));assert.equal(preview.rows[0].category,'מזון');assert.deepEqual(applyCardStatement(p,preview,{}, {deferCategories:true}).details,p.details);
 const ui=uiFor(r);await build(p,ui);assert.equal(ui.issues,0);assert.equal(ui.items[0].already,true);assert.match(ui.items[0].reason,/דוח כפול/);assert.equal(ui.readyRows,0);assert.deepEqual(ui.build.details,p.details);assert.deepEqual(p,before);
});
test('Repeated same-day same-amount purchases preserve multiplicity, exact matches reserve their rows, and only excess occurrences are new',async()=>{
 const p=await savedReport([entry(),entry()]),r=report([entry({notes:'תשלום 1 מ 3 -'}),entry({notes:'תשלום 1 מ 3 -'}),entry({notes:'תשלום 1 מ 3 -'})]),preview=await prepareCardStatement(p,r,'card1');assert.equal(preview.rows.filter(row=>row.existing).length,2);assert.equal(preview.rows.filter(row=>!row.existing).length,1);assert.equal(new Set(preview.rows.map(row=>row.id)).size,3);
 const mixed=await prepareCardStatement(p,report([entry({notes:'תשלום 1 מ 3 -'}),entry()]),'card1');assert.equal(mixed.rows.filter(row=>row.existing).length,2);assert.equal(new Set(mixed.rows.map(row=>row.id)).size,2);
 const ui=uiFor(r);await build(p,ui);assert.equal(ui.issues,0);assert.equal(ui.items[0].already,false);assert.equal(ui.readyRows,1);assert.equal(ui.build.details.length,3);
});
test('Known legacy Cal foreign originals match only exact separate foreign evidence and preserve saved financial records',async()=>{
 const p=await savedReport([entry({merchant:'FOREIGN SHOP',amountCents:35000,originalCents:10000,notes:''})]),incoming=entry({merchant:'FOREIGN SHOP',amountCents:35000,originalCents:35000,notes:'הומר לש"ח',originalCurrency:'EUR',foreignCents:10000}),preview=await prepareCardStatement(p,report([incoming]),'card1');assert.ok(preview.rows[0].existing);assert.deepEqual(preview.rows[0].existing,p.details[0]);
 await assert.rejects(prepareCardStatement(p,report([{...incoming,foreignCents:10001}]),'card1'),e=>!!e.statementConflict);
});
test('Changed amounts, installment numbers, foreign currencies, missing rows and ambiguous evidence still require review',async()=>{
 const original=entry(),p=await savedReport([original]);
 for(const changed of [{...original,amountCents:10001},{...original,originalCents:30001},{...original,notes:'תשלום 2 מ 3 -'},{...original,date:'2026-10-02'},{...original,merchant:'בית עסק אחר'}])await assert.rejects(prepareCardStatement(p,report([changed]),'card1'),e=>!!e.statementConflict);
 const foreign=await savedReport([entry({originalCurrency:'EUR',foreignCents:10000})]);await assert.rejects(prepareCardStatement(foreign,report([entry({notes:original.notes,originalCurrency:'USD',foreignCents:10000})]),'card1'),e=>!!e.statementConflict);
 const repeated=await savedReport([original,original]);await assert.rejects(prepareCardStatement(repeated,report([entry({notes:'תשלום 1 מ 3 -'})]),'card1'),e=>e.statementConflict.savedOnly.length===1);
 const referenced=await savedReport([entry({notes:'אסמכתה 123456'})]);await assert.rejects(prepareCardStatement(referenced,report([entry({notes:'אסמכתה 654321'})]),'card1'),e=>!!e.statementConflict);
 assert.equal(validatePlan(p),true);
});
