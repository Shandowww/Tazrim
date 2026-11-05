import test from 'node:test'
import assert from 'node:assert/strict'
import {scenarioComparison} from '../frontend/src/app/scenario-comparison-model.js'
import {initialPlannedItemDraft,preparePlannedItem} from '../frontend/src/app/planned-item-command.ts'
import {clone,demoPlan} from '../src/budget.js'
test('Scenario comparison uses the chosen account baseline with exact cents and refuses a foreign account',()=>{
 const a={id:'a',label:'א'},b={id:'b',label:'ב'},preview={accounts:[{account:a,rows:[{month:'2026-11',balance:99.99,issues:[]}]},{account:b,rows:[{month:'2026-11',balance:250,issues:[]}]}],baseAccounts:[{account:a,rows:[{month:'2026-11',balance:100.01,issues:[]}]},{account:b,rows:[{month:'2026-11',balance:250,issues:[]}]}],rows:[{month:'2026-11',balance:349.99}],base:[{month:'2026-11',balance:350.01}]},before=JSON.stringify(preview)
 assert.deepEqual(scenarioComparison(preview,'a','2026-11'),[{month:'2026-11',before:100.01,after:99.99,change:-0.02,issues:[]}]);assert.equal(scenarioComparison(preview,'b','2026-11')[0].change,0)
 assert.equal(scenarioComparison(preview,null,'2026-11')[0].change,-0.02);assert.throws(()=>scenarioComparison(preview,'foreign','2026-11'));assert.equal(JSON.stringify(preview),before)
})
test('Missing baseline or account issues never become a known balance or zero',()=>{
 const a={id:'a'},preview={accounts:[{account:a,rows:[{month:'2026-10',balance:123,issues:[]},{month:'2026-11',balance:123,issues:['חסר שיוך']},{month:'2026-12',balance:null,issues:[]}]}],baseAccounts:[{account:a,rows:[{month:'2026-10',balance:200,issues:[]},{month:'2026-11',balance:200,issues:[]}]}]}
 const rows=scenarioComparison(preview,'a','2026-11');assert.equal(rows.length,2);assert.equal(rows[0].before,200);assert.equal(rows[0].after,null);assert.equal(rows[0].change,null);assert.equal(rows[1].before,null);assert.equal(rows[1].after,null)
})
test('Income entry hint preselects only new planning drafts and retains original validation and saved item types',()=>{
 const p=clone(demoPlan),before=JSON.stringify(p),draft=initialPlannedItemDraft(p,'','2026-12','income')
 assert.equal(draft.kind,'income');assert.equal(draft.source,'direct');assert.equal(draft.payments,'1');assert.equal(draft.fees,'0')
 const next=preparePlannedItem(p,'income-event',{...draft,name:'הכנסה לדוגמה',amount:'123.45'},true);assert.equal(next.expenses.at(-1).kind,'income');assert.equal(next.expenses.at(-1).amount,123.45)
 assert.equal(initialPlannedItemDraft(p,p.expenses[0].id,'2026-12','income').kind,'expense');assert.equal(initialPlannedItemDraft(p,'','2026-12','invalid').kind,'expense');assert.equal(JSON.stringify(p),before)
})
