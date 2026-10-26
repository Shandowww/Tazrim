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
