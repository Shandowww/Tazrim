import test from 'node:test'
import assert from 'node:assert/strict'
import { clone, demoPlan, zero } from '../src/budget.js'
import { budgetAccountOverview, budgetDashboard, budgetNavigation } from '../frontend/src/app/budget-adapter.js'
import { withViewQuery, legacyBudgetHref } from '../frontend/src/app/navigation-query.js'

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
  assert.equal(legacyBudgetHref('?budget=house&year=2026&month=10'), '/?budget=house')
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
