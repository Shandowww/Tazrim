import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {zero,validatePlan} from '../src/budget.js';
import {summarizeBudgetSpace,overviewGoalSelection} from '../src/space-overview-model.js';

function fixture(){
 const p={startMonth:'2026-01',opening:0,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,
  cashPlanning:{accounts:[{id:'a',label:'אותו שם',buffer:0,opening:0},{id:'b',label:'חשבון נוסף',buffer:0}],months:{},cardAccounts:{},transfers:[]},
  savingsGoals:{balance:500,snapshotMonth:'2026-01',items:[{id:'same',name:'אותה מטרה',icon:'plane',target:1000,allocated:123.45,monthly:999,fundingAccountIds:['a','b']},{id:'free',name:'ללא שיוך',icon:'trophy',target:500,allocated:25.01,monthly:0}],deposits:{}}};
 assert.ok(validatePlan(p));
 const entries=new Map(['personal','house'].map(id=>[id,{meta:{id,name:id==='personal'?'אישי':'משותף',role:id==='personal'?'owner':'viewer'},status:'ready',summary:summarizeBudgetSpace(p,'tal',id,1,'2026-10-26')}]));
 return {p,entries};
}
test('All goals stay separate by source despite identical names/IDs and multiple funding links',()=>{
 const {p,entries}=fixture(),before=JSON.stringify(p),s=overviewGoalSelection(entries);
 assert.equal(s.rows.length,4);assert.equal(new Set(s.rows.map(r=>r.goal.key)).size,4);
 assert.equal(s.accounts.length,4);assert.equal(new Set(s.accounts.map(a=>a.key)).size,4);
 assert.equal(s.rows[0].goal.currentCents,12345);assert.equal(s.rows[0].goal.targetCents,100000);
 assert.equal(s.rows[0].snapshotMonth,'2026-01');assert.equal(s.rows[0].throughMonth,'2026-01');
 assert.equal(JSON.stringify(p),before);assert.equal(s.total,undefined);
});
test('Space and funding filters use exact scoped keys, preserving one row per goal',()=>{
 const {entries}=fixture(),key=entries.get('personal').summary.accounts[0].key;
 assert.equal(overviewGoalSelection(entries,'all',key).rows.length,1);
 assert.deepEqual(overviewGoalSelection(entries,'all',key).rows.map(r=>r.meta.id),['personal']);
 assert.equal(overviewGoalSelection(entries,'house',key).rows.length,0);
 assert.equal(overviewGoalSelection(entries,'house').rows.length,2);
 assert.equal(overviewGoalSelection(entries,'all','unassigned').rows.length,2);
 assert.equal(overviewGoalSelection(entries,'house','unassigned').rows.length,1);
 assert.equal(overviewGoalSelection(entries,'missing').rows.length,0);
 assert.equal(overviewGoalSelection(entries,'all','unknown').rows.length,0);
});
test('Locked/empty/error spaces expose no filter values; stale and refreshing summaries keep explicit status',()=>{
 for(const status of ['locked','empty','error']){
  const {entries}=fixture();entries.get('house').status=status;
  const s=overviewGoalSelection(entries);assert.equal(s.spaces.length,2);assert.equal(s.rows.length,2);assert.equal(s.accounts.length,2);
 }
 for(const status of ['stale','loading']){
  const {entries}=fixture();entries.get('house').status=status;
  const s=overviewGoalSelection(entries,'house');assert.equal(s.rows.length,2);assert.ok(s.rows.every(r=>r.status===status));
 }
 const {entries}=fixture();entries.get('house').summary=null;assert.equal(overviewGoalSelection(entries,'house').rows.length,0);
 entries.delete('house');assert.equal(overviewGoalSelection(entries).spaces.length,1);assert.equal(overviewGoalSelection(entries).rows.length,2);
});
test('Goal browser escapes labels, marks stale/viewer scope and reports savings dates without adding forecast money',()=>{
 const {entries}=fixture();entries.get('house').status='stale';entries.get('house').meta.name='<img src=x>';
 entries.get('house').summary.savings.goals[0].name='<script>bad</script>';
 const c=vm.createContext({window:{addEventListener(){}},overviewGoalSelection,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),money:n=>String(n),monthLabel:s=>s});
 vm.runInContext(readFileSync('src/space-overview-client.js','utf8'),c);
 const html=c.spaceOverviewGoalsView({entries,goalSpace:'house',goalFunding:''});
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img/);
 assert.match(html,/צפייה בלבד/);assert.match(html,/נתונים מהטעינה הקודמת/);assert.match(html,/2026-01/);
 assert.match(html,/123.45/);assert.doesNotMatch(html,/999/);assert.equal((html.match(/data-overview="goal"/g)||[]).length,2);
});
