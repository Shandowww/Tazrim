import { useLocation, useParams } from 'react-router-dom'
import Link from './link'
import { BankSummaryRow, CardSummaryRow } from '../tazrim/components/accounts/account-cards'
import { CardWallet, CardHeroTotal, BankHeroBalance, CardStackTotal } from '../tazrim/components/cards/card-wallet'
import { legacyBudgetHref } from './navigation-query'
import { buildNavSections } from '../tazrim/lib/nav/state'
import { usePeriodHref } from '../tazrim/components/layout/period-context'
import { demoAccounts } from './demo-fixture'
import { budgetAccountOverview } from './budget-adapter'
import type { useBudget } from './use-budget'

function currentPeriod(search: string) {
  const query = new URLSearchParams(search)
  const now = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const currentYear = now.find(part => part.type === 'year')?.value || '2026'
  const currentMonth = now.find(part => part.type === 'month')?.value || '01'
  const year = /^20\d{2}$/.test(query.get('year') || '') ? query.get('year')! : currentYear
  const month = /^(?:[1-9]|1[0-2]|0[1-9])$/.test(query.get('month') || '') ? String(Number(query.get('month'))).padStart(2, '0') : ''
  return { year, month, asOf: `${currentYear}-${currentMonth}` }
}

export function AccountsPage({ kind, fixture, budget }: { kind: 'banks' | 'cards'; fixture: boolean; budget: ReturnType<typeof useBudget> }) {
  const { search } = useLocation()
  const { id } = useParams()
  const periodHref = usePeriodHref()
  const editorHref = legacyBudgetHref(search)
  const title = kind === 'banks' ? 'בנקים' : 'כרטיסי אשראי'
  if (!fixture && budget.status === 'loading') return <section className="surface rounded-xl p-6" role="status">טוען נתונים…</section>
  if (!fixture && budget.status === 'error') return <section className="surface rounded-xl p-6" role="alert">{budget.message} <a href={editorHref} className="text-primary underline">פתיחת הממשק הקיים</a></section>
  if (!fixture && budget.status === 'ready' && !budget.value.plan) return <section className="surface rounded-xl p-6">עדיין אין תקציב שמור. <a href={editorHref} className="text-primary underline">הגדרת תקציב</a></section>
  if (!fixture && budget.status === 'ready' && budget.value.plan?.format === 'monthly-flow-encrypted-v1') return <section className="surface rounded-xl p-6">התקציב מוצפן. <a href={editorHref} className="text-primary underline">פתיחה מאובטחת בממשק הקיים</a></section>

  let overview: ReturnType<typeof budgetAccountOverview>
  try {
    overview = fixture ? {
      banks: demoAccounts.filter(account => account.kind === 'BANK').map((account, index) => ({ ...account, income: index ? 7900 : 10500, expense: index ? 4080 : 6840, reportedMonths: 1, balance: { value: index ? 22500 : 12800, date: '2026-10-25' } })),
      cards: demoAccounts.filter(account => account.kind === 'CREDIT_CARD').map(account => ({ ...account, total: 4280, reportedMonths: 1 })),
    } : budgetAccountOverview(budget.status === 'ready' ? budget.value.plan : null, currentPeriod(search))
  } catch {
    return <section className="surface rounded-xl p-6" role="alert">לא ניתן להציג את נתוני החשבונות. <a href={editorHref} className="text-primary underline">פתיחת הממשק הקיים</a></section>
  }
  const navigation = buildNavSections(fixture ? demoAccounts : [...overview.banks, ...overview.cards])
  const accountRows = kind === 'banks' ? overview.banks : overview.cards
  const selected = id ? accountRows.find(account => account.id === id) : null
  if (id && !selected) return <section className="surface rounded-xl p-6" role="alert">החשבון אינו זמין במרחב הזה. <Link href={periodHref(`/${kind}`)} className="text-primary underline">חזרה לרשימה</Link></section>
  const navRows = kind === 'banks' ? navigation.banks : navigation.cards

  const walletCards = accountRows.map(account => ({ id: account.id, path: navRows.find(row => row.id === account.id)!.href,
    provider: account.provider, name: account.displayName, lastFour: account.cardLastFour, network: account.cardNetwork,
    color: navRows.find(row => row.id === account.id)!.color, colorChoice: account.color, archived: false }))
  return <CardWallet key={kind + budget.budgetId} kind={kind} cards={walletCards}>
    <div className="wallet-shell__head">
    <div className="flex items-center justify-between gap-3">
      <div>
        {id && <Link href={periodHref(`/${kind}`)} className="mb-2 inline-block text-sm text-primary underline">חזרה אל {title}</Link>}
        <h1 className="text-2xl font-semibold tracking-tight">{selected?.displayName || title}</h1>
        {fixture && <p className="text-sm text-muted-foreground">נתוני דוגמה בלבד</p>}
      </div>
    </div>
    </div>
    {selected && kind === 'banks' && 'balance' in selected && <BankHeroBalance accountId={selected.id} latest={selected.balance ? { balance: selected.balance.value, date: selected.balance.date } : undefined} trend={[]} />}
    {selected && kind === 'cards' && 'total' in selected && selected.total !== null && <CardHeroTotal accountId={selected.id} value={selected.total} label="חיובים מדווחים בתקופה" />}
    {!selected && kind === 'cards' && overview.cards.length > 0 && overview.cards.every(card => card.total !== null) && <CardStackTotal value={overview.cards.reduce((sum, card) => Math.round((sum + (card.total ?? 0)) * 100) / 100, 0)} />}
    <div className="wallet-shell__beside space-y-5">
    {accountRows.length === 0 ? <section className="surface rounded-xl p-6">
      <p className="font-medium">{kind === 'banks' ? 'עדיין לא הוגדרו חשבונות בנק בתקציב הזה.' : 'עדיין לא הוגדרו כרטיסי אשראי בתקציב הזה.'}</p>
      <a href={editorHref} className="mt-3 inline-block text-primary underline">הגדרה בממשק הקיים</a>
    </section> : <section className="surface overflow-hidden rounded-xl">
      <ul className="divide-y divide-border">
        {accountRows.filter(account => !id || account.id === id).map(account => {
          const nav = navRows.find(row => row.id === account.id)!
          return kind === 'banks' && 'expense' in account ? <BankSummaryRow key={account.id} href={periodHref(nav.href)} name={account.displayName} provider={account.provider} color={nav.color} colorChoice={account.color} expense={account.expense} balance={account.balance?.value} />
            : 'total' in account ? <CardSummaryRow key={account.id} href={periodHref(nav.href)} name={account.displayName} provider={account.provider} network={account.cardNetwork} lastFour={account.cardLastFour} color={nav.color} colorChoice={account.color} total={account.total} /> : null
        })}
      </ul>
    </section>}
    {selected && <p className="text-sm text-muted-foreground">{kind === 'banks' && 'balance' in selected && selected.balance ? `יתרה מדווחת לתאריך ${selected.balance.date} · ` : ''}הסכומים מוצגים לתקופה שנבחרה בכותרת.</p>}
    </div>
    <section className="wallet-shell__rest surface rounded-xl p-5 text-sm text-muted-foreground">{fixture ? 'נתוני דוגמה בלבד. אין עריכה או שמירה של נתונים בדוגמה.' : <>תצוגה לקריאה בלבד. <a href={editorHref} className="text-primary underline">עריכה ופרטים נוספים בממשק הקיים</a></>}</section>
  </CardWallet>
}
