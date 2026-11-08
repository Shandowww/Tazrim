import { cashAccountList, cashSourceRecords, creditCards } from '../../../src/budget.js'
import { tazrimDisplaySnapshot } from '../../../src/tazrim-display-model.js'

/** Read-only bridge to Budgit's existing financial model. */
export function budgetNavigation(plan) {
  const banks = cashAccountList(plan).map(account => ({
    id: account.id, kind: 'BANK', displayName: account.label,
    cardLastFour: null, provider: savedBankProvider(account), cardNetwork: null,
    color: account.color || null,
  }))
  const cards = creditCards(plan).filter(card => !card.removedFrom).map(card => ({
    id: card.id, kind: 'CREDIT_CARD', displayName: card.name,
    cardLastFour: /^\d{4}$/.test(card.lastFour || '') ? card.lastFour : /^\d{4}$/.test(card.alias || '') ? card.alias : null, provider: savedCardProvider(plan,card),
    cardNetwork: savedCardNetwork(plan,card), color: card.color || null,
  }))
  return [...banks, ...cards]
}

export function budgetDashboard(plan, { year, month, asOf }) {
  const view = tazrimDisplaySnapshot(plan, { year, month, asOf })
  const bankSummary = Object.fromEntries(view.series.map(row => [Number(row.month.slice(-2)), { income: row.income, expense: row.spending }]))
  const cardSummary = Object.fromEntries(view.series.map(row => [Number(row.month.slice(-2)), row.cardTotal]))
  if (!view.hasReports) return { ...view, bankSummary, cardSummary, cards: { bankIncome: 0, bankExpense: 0, ccTotal: 0, averageExpense: 0, netValue: 0, outflowValue: 0 } }
  return {
    ...view,
    bankSummary,
    cardSummary,
    cards: {
      bankIncome: view.income ?? 0,
      bankExpense: view.spending ?? 0,
      ccTotal: view.cardTotal ?? 0,
      averageExpense: view.average ?? 0,
      netValue: view.net ?? 0,
      outflowValue: Math.max(0, (view.income ?? 0) + (view.incomingTransfers ?? 0) - (view.net ?? 0)),
    },
  }
}

/** Account rows use only reported values and balance readings from Budgit. */
export function budgetAccountOverview(plan, { year, month = '', asOf }) {
  const accounts = budgetNavigation(plan)
  const banks = accounts.filter(account => account.kind === 'BANK').map(account => {
    const view = tazrimDisplaySnapshot(plan, { year, month, asOf, accountId: account.id })
    const balances = Object.entries(cashSourceRecords(plan, account.id))
      .filter(([key, record]) => key.startsWith(`${year}-`) && (!month || key.endsWith(`-${month}`)) && key <= asOf && record.actual && record.balance !== undefined)
      .sort(([a], [b]) => b.localeCompare(a))
    const [balanceMonth, balanceRecord] = balances[0] || []
    return { ...account, income: view.income, expense: view.spending, reportedMonths: view.reportedMonths,
      balance: balanceRecord ? { value: balanceRecord.balance, date: balanceRecord.date || `${balanceMonth}-01` } : null }
  })
  const cards = accounts.filter(account => account.kind === 'CREDIT_CARD').map(account => {
    const view = tazrimDisplaySnapshot(plan, { year, month, asOf, cardId: account.id })
    return { ...account, total: view.cardTotal, reportedMonths: view.selected.filter(row => row.cards.some(card => card.id === account.id && card.amount !== null && card.kind !== 'estimate')).length }
  })
  return { banks, cards }
}

/** Sum only the already scoped/period-filtered reported balance readings, in cents. */
export function summarizeBankBalances(banks) {
  const reported=banks.filter(bank=>bank.balance&&Number.isFinite(bank.balance.value))
  const dates=reported.map(bank=>bank.balance.date).sort()
  return {value:reported.length?reported.reduce((sum,bank)=>sum+Math.round(bank.balance.value*100),0)/100:null,
    reported:reported.length,total:banks.length,from:dates[0]??null,to:dates.at(-1)??null}
}

/** Decorative issuer/program evidence only; never infers or changes a paying account. */
export function savedCardProvider(plan,card){
 if(card.provider)return card.provider
 const name=String(card.name??'').toLowerCase()
 const payer=cashAccountList(plan).find(account=>account.id===plan.cashPlanning?.cardAccounts?.[card.id])
 // ONE ZERO is the bank's card program, distinct from the report's processing issuer.
 if(/וואן\s*זירו|ואן\s*זירו|\bone[ -]?zero\b/.test(name)||payer&&/^(?:one[ -]?zero|(?:בנק\s+)?ו?ואן\s*זירו)$/i.test(savedBankProvider(payer).trim()))return 'one-zero'
 return savedCardIssuer(plan,card)
}

/** The processing issuer remains distinct from a bank-branded card program. */
export function savedCardIssuer(plan,card){
 const explicit=String(card.provider??'').trim()
 if(explicit&&!/^(?:one[ -]?zero|(?:בנק\s+)?ו?ואן\s*זירו)$/i.test(explicit))return explicit
 const name=String(card.name??'').toLowerCase()
 const issuers=new Set((plan.details??[]).filter(row=>row.method===card.id&&row.status!=='cancelled'&&['cal','isracard'].includes(row.statement?.issuer)).map(row=>row.statement.issuer))
 for(const [pattern,key]of [[/ישראכרט|\bisracard\b/,'isracard'],[/כאל|כ[״"']אל|\bcal\b/,'cal'],[/מקס|\bmax\b/,'max']])if(pattern.test(name))issuers.add(key)
 return issuers.size===1?[...issuers][0]:''
}

/** Decorative bank identity; explicit metadata wins and no stored account is edited. */
export function savedBankProvider(account){
 if(String(account.bankName??'').trim())return account.bankName
 const label=String(account.label??'').toLowerCase(),brands=[]
 for(const [pattern,key]of [[/בנק\s+הפועלים|(?:^|[\s–—-])ה?פועלים(?:$|[\s–—-])|\b(?:bank\s+)?hapoalim\b/,'hapoalim'],[/וואן\s*זירו|ואן\s*זירו|\bone[ -]?zero\b/,'one-zero'],[/לאומי|\bleumi\b/,'leumi'],[/דיסקונט|\bdiscount\b/,'discount'],[/מזרחי|\bmizrahi\b/,'mizrahi']])if(pattern.test(label))brands.push(key)
 return brands.length===1?brands[0]:''
}
/** ONE ZERO's Mastercard is the user's requested display default; saved networks win. */
export function savedCardNetwork(plan,card){
 if(card.network)return card.network
 if(/מאסטר\s*[כק]ארד|\bmaster\s*card\b/i.test(String(card.name??'')))return 'mastercard'
 const provider=String(savedCardProvider(plan,card)).trim().toLowerCase()
 return /^(?:one[ -]?zero|(?:בנק\s+)?ו?ואן\s*זירו)$/.test(provider)?'mastercard':null
}
