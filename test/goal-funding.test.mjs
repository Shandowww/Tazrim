import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as budget from '../src/budget.js';
import {summarizeBudgetSpace} from '../src/space-overview-model.js';

function fixture(){return{startMonth:'2026-10',opening:5100,buffer:0,horizon:12,defaults:budget.zero(),months:{},expenses:[],demo:false,
 cashPlanning:{accounts:[{id:'a',label:'חשבון ראשון',opening:100,buffer:0},{id:'b',label:'חשבון שני',opening:5000,buffer:0}],months:{},cardAccounts:{card1:'a',card2:'b'},transfers:[]},
 savingsGoals:{balance:500.25,snapshotMonth:'2026-10',items:[{id:'goal',name:'חופשה',icon:'plane',target:2000,allocated:125.15,monthly:50}],deposits:{}}};}
const moneyState=p=>{const s=budget.savingsBalances(p,'2026-10');return{balance:s.balance,free:s.free,goals:s.items.map(g=>({id:g.id,current:g.current,target:g.target,monthly:g.monthly}))};};
test('Funding links are opt-in, preserve all money, and do not duplicate a goal funded by two accounts',()=>{
 const p=fixture(),before=JSON.stringify(p);assert.ok(budget.validatePlan(p));assert.deepEqual(budget.savingsFundingAccounts(p,p.savingsGoals.items[0]),[]);
 const linked=budget.setSavingsGoalFunding(p,'goal',['a','b']);assert.ok(budget.validatePlan(linked));
 assert.deepEqual(budget.forecast(linked),budget.forecast(p));assert.deepEqual(moneyState(linked),moneyState(p));assert.deepEqual(budget.achievements(linked,'2026-10','2026-10'),budget.achievements(p,'2026-10','2026-10'));
 for(const id of ['a','b'])assert.deepEqual(budget.cashAccountForecast(linked,id),budget.cashAccountForecast(p,id));
 assert.equal(linked.savingsGoals.items.length,1);assert.equal(JSON.stringify(p),before);
 const summary=summarizeBudgetSpace(linked,'tal','personal',1,'2026-10-26');assert.equal(summary.savings.goals.length,1);assert.equal(summary.savings.goals[0].currentCents,12515);assert.equal(summary.savings.goals[0].fundingAccounts.length,2);
 assert.deepEqual(budget.setSavingsGoalFunding(linked,'goal',[]),p);
});
test('Funding references use stable IDs, reject unknown and duplicate accounts, and stay inside the current budget',()=>{
 const p=fixture();for(const links of [['private-spouse'],['a','a'],['budget:other:a'],[null],[{}],null,'a',Array(11).fill('a')]){
  assert.throws(()=>budget.setSavingsGoalFunding(p,'goal',links));const invalid=budget.clone(p);invalid.savingsGoals.items[0].fundingAccountIds=links;assert.equal(budget.validatePlan(invalid),false);
 }
 assert.throws(()=>budget.setSavingsGoalFunding(p,'missing',['a']));
 const linked=budget.setSavingsGoalFunding(p,'goal',['a']);linked.cashPlanning.accounts[0].label='שם חדש';assert.equal(budget.savingsFundingAccounts(linked,linked.savingsGoals.items[0])[0].label,'שם חדש');
 const other=fixture();other.cashPlanning.accounts[0].label='חשבון מקומי אחר';const separate=budget.setSavingsGoalFunding(other,'goal',['a']);
 const x=summarizeBudgetSpace(linked,'tal','personal',1,'2026-10-26').savings.goals[0],y=summarizeBudgetSpace(separate,'tal','house',1,'2026-10-26').savings.goals[0];
 assert.notEqual(x.key,y.key);assert.notEqual(x.fundingAccounts[0].key,y.fundingAccounts[0].key);assert.equal(y.fundingAccounts[0].name,'חשבון מקומי אחר');
 const roundTrip=JSON.parse(JSON.stringify(linked));assert.ok(budget.validatePlan(roundTrip));assert.deepEqual(roundTrip.savingsGoals,linked.savingsGoals);
});
test('Removing a referenced bank is rejected until the user unlinks it, without altering savings amounts',()=>{
 const linked=budget.setSavingsGoalFunding(fixture(),'goal',['a']),removed=budget.clone(linked);removed.cashPlanning.accounts=removed.cashPlanning.accounts.filter(a=>a.id!=='a');delete removed.cashPlanning.cardAccounts.card1;
 assert.equal(budget.validatePlan(removed),false);delete removed.savingsGoals.items[0].fundingAccountIds;assert.equal(budget.validatePlan(removed),true);assert.deepEqual(moneyState(removed),moneyState(linked));
});
test('Calculator cannot use another space or a rich sibling account to cover the selected payer',()=>{
 const p=fixture(),purchase={id:'trial',name:'רכישה',amount:200,fees:0,firstMonth:'2026-10',payments:1,source:'card',cashAccountId:'a',cardId:'card1',kind:'expense'};
 const result=budget.previewScenario(p,[purchase]);assert.equal(result.accounts.find(a=>a.account.id==='a').rows[0].balance,-100);assert.equal(result.accounts.find(a=>a.account.id==='b').rows[0].balance,5000);
 assert.equal(budget.cashScenarioSafe(result.plan,['trial'],'2026-10'),false);
 assert.throws(()=>budget.previewScenario(p,[{...purchase,cashAccountId:'spouse-private'}]));assert.throws(()=>budget.previewScenario(p,[{...purchase,cardId:'card2'}]));
 assert.deepEqual(budget.cashCardsForAccount(p,'a').map(c=>c.id),['card1']);
});

function client(){
 const c=vm.createContext({...budget,plan:fixture(),activeBudget:'personal',demoPreview:false,loaded:true,loading:false,saving:false,crypto,app:{addEventListener(){}},window:{addEventListener(){}},document:{getElementById:()=>null},todayMonth:()=> '2026-10',esc:String,notify(){},render(){},budgetMeta:()=>({role:'owner'}),mutate(next){c.plan=next;c.dirty=true;return true;}});
 vm.runInContext(readFileSync('src/savings.js','utf8'),c);return{c,run:s=>vm.runInContext(s,c)};
}
test('Funding UI lists only local bank labels and leaves legacy goals unassigned',()=>{
 const {c}=client();const fields=c.savingsFundingFields(c.plan.savingsGoals.items[0]);assert.match(fields,/חשבון ראשון/);assert.match(fields,/חשבון שני/);assert.doesNotMatch(fields,/checked/);assert.match(c.savingsFundingView(c.plan.savingsGoals.items[0]),/ללא שיוך/);
 c.budgetMeta=()=>({role:'viewer'});assert.doesNotMatch(c.savingsFundingView(c.plan.savingsGoals.items[0]),/<form/);
});
test('Funding form rejects a changed space and saves multiple checked IDs without financial changes',()=>{
 const {c}=client(),before=JSON.stringify(c.plan),form={dataset:{sgForm:'funding'},elements:{fundingScope:{value:'other'},id:{value:'goal'}},querySelectorAll:()=>[{value:'a'},{value:'b'}]};
 assert.equal(c.savingsSubmit(form),true);assert.equal(JSON.stringify(c.plan),before);
 form.elements.fundingScope.value='personal';c.savingsSubmit(form);assert.deepEqual(Array.from(c.plan.savingsGoals.items[0].fundingAccountIds),['a','b']);assert.equal(c.dirty,true);assert.deepEqual(moneyState(c.plan),moneyState(JSON.parse(before)));
});
