import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, demoPlan, zero, validatePlan } from '../src/budget.js'
import { budgetAccountOverview, budgetDashboard, budgetNavigation, summarizeBankBalances } from '../frontend/src/app/budget-adapter.js'
import { withViewQuery, legacyBudgetHref, scrollRouteSearch } from '../frontend/src/app/navigation-query.js'
test('Wallet card switches share the account-page scroll position, never another period, space, filter or route',()=>{
 const selected='?walletCard=card1&year=2026&month=10&budget=family'
 assert.equal(scrollRouteSearch('/accounts',selected),scrollRouteSearch('/accounts','?budget=family&month=10&year=2026&walletCard=card2'))
 for(const query of ['?budget=other&year=2026&month=10','?budget=family&year=2026&month=11','?budget=family&year=2025&month=10','?budget=family&year=2026&month=10&account=other'])assert.notEqual(scrollRouteSearch('/accounts',selected),scrollRouteSearch('/accounts',query))
 assert.match(scrollRouteSearch('/categories',selected),/walletCard=card1/)
})

test('React summary keeps consumption, card breakdown and full net distinct', () => {
  const plan = clone(demoPlan)
  plan.expenses = []
  plan.months = {
    '2026-10': {
      actual: true,
      includesPlannedCard: true,
      values: { ...zero(), salary: 5000, variable: 1000, card1: 500, personalSaving: 300, incomingTransfers: 100, outgoingTransfers: 200 },
    },
  }
  const before = JSON.stringify(plan)
  const view = budgetDashboard(plan, { year: '2026', month: '10', asOf: '2026-10' })
  assert.equal(view.cards.bankIncome, 5000)
  assert.equal(view.cards.bankExpense, 1500)
  assert.equal(view.cards.ccTotal, 500)
  assert.equal(view.cards.netValue, 3100)
  assert.equal(view.cards.outflowValue, 2000)
  assert.equal(JSON.stringify(plan), before)
})

test('React navigation only lists real configured bank accounts', () => {
  const plan = clone(demoPlan)
  assert.equal(budgetNavigation(plan).filter(account => account.kind === 'BANK').length, 0)
  plan.cashPlanning = { accounts: [{ id: 'checking', label: 'עו״ש אישי', buffer: 0 }], months: {}, cardAccounts: {}, transfers: [] }
  const banks = budgetNavigation(plan).filter(account => account.kind === 'BANK')
  assert.deepEqual(banks.map(account => [account.id, account.displayName]), [['checking', 'עו״ש אישי']])
})

test('React chart adapter keeps an unreported month distinct from reported zero', () => {
  const plan = clone(demoPlan)
  plan.expenses = []
  plan.months = {
    '2026-10': { actual: true, values: zero() },
  }
  const view = budgetDashboard(plan, { year: '2026', month: '', asOf: '2026-10' })
  assert.equal(view.bankSummary[9].income, null)
  assert.equal(view.bankSummary[9].expense, null)
  assert.equal(view.bankSummary[10].income, 0)
  assert.equal(view.bankSummary[10].expense, 0)
  assert.equal(view.cards.bankIncome, 0)
  assert.equal(view.reportedMonths, 1)
})

test('account rows show only each bank’s actual values and an actual dated balance', () => {
  const plan = clone(demoPlan)
  plan.months = {}
  plan.expenses = []
  plan.cashPlanning = {
    accounts: [{ id: 'a', label: 'חשבון א', bankName: 'לאומי', buffer: 0 }, { id: 'b', label: 'חשבון ב', bankName: 'דיסקונט', buffer: 0 }],
    months: { '2026-10': {
      a: { actual: true, includesPlannedCard: true, includesPlannedDirect: false, values: { ...zero(), salary: 1000, variable: 200, card1: 100 }, balance: 500, date: '2026-10-25' },
      b: { actual: false, includesPlannedCard: false, includesPlannedDirect: false, values: { ...zero(), salary: 9000 }, balance: 8000, date: '2026-10-25' },
    } },
    cardAccounts: { card1: 'a' }, transfers: [],
  }
  const result = budgetAccountOverview(plan, { year: '2026', month: '10', asOf: '2026-10' })
  assert.deepEqual(result.banks.map(bank => [bank.id, bank.income, bank.expense, bank.balance?.value ?? null]), [
    ['a', 1000, 300, 500], ['b', null, null, null],
  ])
  assert.equal(result.cards.find(card => card.id === 'card1').total, 100)
  assert.equal(result.cards.find(card => card.id === 'card2').total, null)
})

test('React navigation keeps the selected budget and period across account pages', () => {
  assert.equal(withViewQuery('/banks/a', '?budget=shared&year=2026&month=10'), '/banks/a?year=2026&month=10&budget=shared')
  assert.equal(withViewQuery('/cards?budget=other', '?budget=shared&year=2026'), '/cards?budget=other&year=2026')
})

test('Existing-editor bridges explicitly retain personal/shared identity and discard unrelated navigation parameters', () => {
  assert.equal(legacyBudgetHref(''), '/?budget=personal')
  assert.equal(legacyBudgetHref('?budget=house','reports','invalid-route-id'), '/?budget=house&mf-view=reports')
  assert.equal(legacyBudgetHref('?budget=house&year=2026&month=10'), '/?budget=house&year=2026&month=10')
  assert.equal(legacyBudgetHref('?budget=a%26b&demo=1'), '/?budget=a%26b')
  assert.equal(withViewQuery('/cards/card1', '?budget=house&year=2026&month=10&demo=1', true), '/cards/card1?year=2026&month=10&budget=house&demo=1')
  assert.equal(withViewQuery('/cards/card1', '?demo=1', false), '/cards/card1')
})

test('Card faces reuse only an explicit four-digit alias, never infer card numbers from arbitrary names', () => {
  const plan = clone(demoPlan)
  plan.creditCards = [{ id: 'card1', name: 'כרטיס 9876', alias: '1234' }, { id: 'card2', name: 'כרטיס 5555', alias: 'הכרטיס שלי' }]
  const before = JSON.stringify(plan)
  assert.deepEqual(budgetNavigation(plan).filter(account => account.kind === 'CREDIT_CARD').map(account => account.cardLastFour), ['1234', null])
  assert.equal(JSON.stringify(plan), before)
})


test('Bank wallet totals preserve cents and negative balances, distinguish missing readings from zero and disclose report dates',()=>{
 const rows=[{id:'a',balance:{value:100.10,date:'2026-10-21'}},{id:'b',balance:{value:-50.03,date:'2026-10-25'}}],before=JSON.stringify(rows)
 assert.deepEqual(summarizeBankBalances(rows),{value:50.07,reported:2,total:2,from:'2026-10-21',to:'2026-10-25'})
 assert.deepEqual(summarizeBankBalances([{balance:{value:0,date:'2026-10-25'}},{balance:null}]),{value:0,reported:1,total:2,from:'2026-10-25',to:'2026-10-25'})
 assert.equal(summarizeBankBalances([{balance:null}]).value,null);assert.equal(summarizeBankBalances([]).value,null);assert.equal(JSON.stringify(rows),before)
})

test('Bank wallet summary uses only actual scoped readings in the selected period, excluding estimates and future balances',()=>{
 const plan=clone(demoPlan);plan.startMonth='2026-01';plan.expenses=[];plan.cashPlanning={accounts:[{id:'a',label:'A',buffer:0},{id:'b',label:'B',buffer:0}],months:{'2026-09':{a:{actual:true,values:zero(),includesPlannedCard:false,includesPlannedDirect:false,balance:999,date:'2026-09-30'}},'2026-10':{a:{actual:true,values:zero(),includesPlannedCard:false,includesPlannedDirect:false,balance:100.10,date:'2026-10-21'},b:{actual:false,values:zero(),includesPlannedCard:false,includesPlannedDirect:false,balance:5000,date:'2026-10-22'}},'2026-11':{a:{actual:true,values:zero(),includesPlannedCard:false,includesPlannedDirect:false,balance:888,date:'2026-11-01'}}},cardAccounts:{},transfers:[]}
 assert.ok(validatePlan(plan));const before=JSON.stringify(plan),period={year:'2026',month:'10',asOf:'2026-10'}
 assert.deepEqual(summarizeBankBalances(budgetAccountOverview(plan,period).banks),{value:100.10,reported:1,total:2,from:'2026-10-21',to:'2026-10-21'})
 const other=clone(plan);other.cashPlanning.months['2026-10'].a.balance=0;assert.equal(summarizeBankBalances(budgetAccountOverview(other,period).banks).value,0)
 assert.equal(summarizeBankBalances(budgetAccountOverview(plan,{...period,month:'12'}).banks).value,null);assert.equal(JSON.stringify(plan),before)
})
