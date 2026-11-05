import { zero,createDemoPlan } from '../../../src/budget.js'
import type { AccountKind } from '../tazrim/lib/accounts/routes'

export interface DisplayAccount {
  id: string
  kind: AccountKind
  displayName: string
  cardLastFour: string | null
  provider: string
  cardNetwork: string | null
  color: string | null
}

/** Synthetic presentation fixture. Production code must never substitute this for account data. */
export const demoAccounts: DisplayAccount[] = [
  { id: 'sample-bank-1', kind: 'BANK', displayName: 'חשבון יומי', cardLastFour: null, provider: 'leumi', cardNetwork: null, color: 'blue' },
  { id: 'sample-bank-2', kind: 'BANK', displayName: 'חשבון משותף', cardLastFour: null, provider: 'other', cardNetwork: null, color: 'teal' },
  { id: 'sample-card-1', kind: 'CREDIT_CARD', displayName: 'כרטיס ראשי', cardLastFour: '4321', provider: 'max', cardNetwork: 'visa', color: 'blue' },
]

export const demoSummary = {
  bankIncome: 18400,
  bankExpense: 10920,
  ccTotal: 4280,
  averageExpense: 9450,
}

export const demoBankSummary = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, i < 8 ? { income: null, expense: null } : { income: 15000 + i * 250, expense: 8200 + i * 120 }]))
export const demoCardSummary = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, i < 8 ? null : 3300 + i * 70]))

/** Valid synthetic cleared/pending/refund records for read-only detail acceptance. */
export const demoDetailPlan = {
  startMonth: '2026-01', opening: 0, buffer: 0, horizon: 12, defaults: zero(), months: {}, expenses: [], demo: true,
  creditCards: [{ id: 'card1', name: 'כרטיס ראשי', alias: '4321' }],
  cashPlanning: { accounts: [{ id: 'sample-bank-1', label: 'חשבון יומי', buffer: 0 }], months: {}, cardAccounts: { card1: 'sample-bank-1' }, transfers: [] },
  details: [
    { id: 'cal-' + 'a'.repeat(64), name: 'סופר השכונה', amount: 101.01, category: 'מזון', method: 'card1', date: '2026-09-28', month: '2026-10', number: '', status: 'cleared', accounting: 'included', statement: { issuer: 'cal', dueDate: '2026-10-10', key: 'a'.repeat(64), originalCents: 10101, notes: 'רשומת דוגמה' } },
    { id: 'cal-' + 'b'.repeat(64), name: 'החזר מחנות', amount: -10.02, category: 'קניות', method: 'card1', date: '2026-10-03', month: '2026-10', number: '', status: 'cleared', accounting: 'included', statement: { issuer: 'cal', dueDate: '2026-10-10', key: 'b'.repeat(64), originalCents: -1002, notes: 'זיכוי לדוגמה' } },
    { id: 'demo-pending', name: 'צ׳ק ממתין', amount: 35, category: 'אחר', method: 'checks', date: '2026-10-04', month: '2026-10', number: '12', status: 'pending', accounting: 'additional', cashAccountId: 'sample-bank-1' },
  ],
}

/** Shared, read-only household fixture for the combined accounts and detail screens. */
export const demoHouseholdPlan={...demoDetailPlan,
 savingsGoals:createDemoPlan('2026-10').savingsGoals,
 loans:[{id:'demo-loan',name:'הלוואה לריהוט',monthly:350,from:'2026-05',months:24,cashAccountId:'sample-bank-1'}],
 creditCards:[{id:'card1',name:'הכרטיס היומיומי',alias:'4321',provider:'max'},{id:'card2',name:'קניות אונליין',alias:'8046',provider:'cal'},{id:'card_home',name:'מנויים לבית',alias:'1158',provider:'isracard'}],
 cashPlanning:{accounts:[{id:'sample-bank-1',label:'החשבון היומי',bankName:'hapoalim',buffer:0},{id:'sample-bank-2',label:'החשבון הנוסף',bankName:'one-zero',buffer:0}],cardAccounts:{card1:'sample-bank-1',card2:'sample-bank-1',card_home:'sample-bank-2'},transfers:[],months:Object.fromEntries(Array.from({length:6},(_,i)=>{const month='2026-'+String(i+5).padStart(2,'0');return [month,{'sample-bank-1':{actual:true,includesPlannedCard:true,includesPlannedDirect:false,values:{...zero(),salary:10000,variable:2000,card1:90.99,card2:600,card_home:0},balance:7200+i*100,date:month+'-28'},'sample-bank-2':{actual:true,includesPlannedCard:true,includesPlannedDirect:false,values:{...zero(),salary:5000,variable:500,card1:0,card2:0,card_home:250},balance:3000+i*50,date:month+'-28'}}]}))},
 months:Object.fromEntries(Array.from({length:6},(_,i)=>['2026-'+String(i+5).padStart(2,'0'),{actual:true,includesPlannedCard:true,values:{...zero(),salary:15000,variable:2500,card1:90.99,card2:600,card_home:250}}]))
}
