import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {zero,clone,creditCards,assignCashPayers,validatePlan,cashAccountList} from '../src/budget.js'
import {prepareCardPayer} from '../frontend/src/app/card-command.ts'
import {saveBillingReport} from '../src/card-billing-model.js'
const base=()=>({startMonth:'2026-01',opening:0,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,cashPlanning:{accounts:[{id:'a',label:'ראשון',buffer:0},{id:'b',label:'שני',buffer:0}],months:{},cardAccounts:{card1:'a'},transfers:[]}})
test('Shared payer transition preserves original cash-settings form assignments and blank-card semantics',()=>{
 const p=base();p.expenses=[{id:'item',name:'פריט',amount:10,fees:0,firstMonth:'2026-10',payments:1,source:'card',kind:'expense',cardId:'card1',cashAccountId:'a'}];const before=clone(p),links={cards:{card1:'b'},items:{item:'b'}},next=assignCashPayers(p,links)
 const v={'cash-card-card1':'b','cash-item-item':'b'},ctx=vm.createContext({next:clone(p),v,creditCards});
 // Frozen original cashSubmit assignment block: the extraction must retain this transition.
 vm.runInContext("for(const c of creditCards(next)){const key='cash-card-'+c.id;if(!Object.hasOwn(v,key))continue;const id=v[key];if(id)next.cashPlanning.cardAccounts[c.id]=id;else delete next.cashPlanning.cardAccounts[c.id];}for(const [prefix,items]of [['item',next.expenses],['loan',next.loans??[]],['detail',next.details??[]],['saving',next.savingTransfers??[]]])for(const item of items){const id=v['cash-'+prefix+'-'+item.id];if(id)item.cashAccountId=id;}",ctx)
 assert.deepEqual(next,JSON.parse(JSON.stringify(ctx.next)));assert.deepEqual(p,before);assert.throws(()=>prepareCardPayer(p,'card1','b'));assert.equal(prepareCardPayer(p,'card1','').cashPlanning.cardAccounts.card1,undefined);assert.deepEqual(prepareCardPayer(p,'card1','').expenses,p.expenses)
})
test('Native payer changes retain source records and reject incompatible reports, foreign accounts and unknown cards',()=>{
 const p=base(),next=prepareCardPayer(p,'card1','b');assert.equal(next.cashPlanning.cardAccounts.card1,'b');assert.deepEqual(next.months,p.months);assert.deepEqual(next.defaults,p.defaults);assert.deepEqual(next.cashPlanning.accounts,p.cashPlanning.accounts);assert.ok(validatePlan(next));assert.throws(()=>prepareCardPayer(p,'card1','foreign'));assert.throws(()=>prepareCardPayer(p,'unknown','a'));assert.throws(()=>prepareCardPayer(p,'card1',null));const imported=saveBillingReport(p,{cardId:'card1',dueDate:'2026-10-15',accountId:'a',amount:10,source:'file'},'2026-10-01'),before=clone(imported);assert.throws(()=>prepareCardPayer(imported,'card1','b'));assert.deepEqual(imported,before);assert.deepEqual(prepareCardPayer(imported,'card1','').cardBilling,imported.cardBilling);assert.equal(cashAccountList(next).length,2)
})

test('Shared original payer extraction ignores inherited keys for valid historical item IDs unless that exact assignment was provided',()=>{
 const p=base();p.expenses=['constructor','toString','__proto__'].map(id=>({id,name:'פריט ישן',amount:10,fees:0,firstMonth:'2026-10',payments:1,source:'direct',kind:'expense'}));p.loans=[{id:'constructor',name:'הלוואה',monthly:1,from:'2026-10',months:2}];p.details=[{id:'__proto__',name:'פירוט',category:'אחר',amount:1,method:'variable',month:'2026-10',date:'2026-10-01',number:'',status:'cleared',accounting:'included'}];p.savingTransfers=[{id:'toString',month:'2026-10',personal:1,shared:0,status:'pending'}];assert.ok(validatePlan(p));const before=clone(p),next=assignCashPayers(p,{cards:{card1:'b'},items:{},loans:{},details:{},savings:{}});for(const key of ['expenses','loans','details','savingTransfers'])assert.deepEqual(next[key],p[key]);assert.equal(next.cashPlanning.cardAccounts.card1,'b');assert.deepEqual(p,before)
 const explicit=assignCashPayers(p,{cards:{},items:Object.fromEntries([['__proto__','a']])});assert.equal(explicit.expenses.find(row=>row.id==='__proto__').cashAccountId,'a');assert.equal(explicit.expenses.find(row=>row.id==='constructor').cashAccountId,undefined)
})
