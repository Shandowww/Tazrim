import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { budgetFields, cashAccountList } from '../../../src/budget.js'
import { budgetDetailView } from './detail-adapter'
import Link from './link'
import { MoneyAmount } from './money-amount'
import { ReportEndDate } from './report-end-date'

export type OverviewMetric = 'income' | 'expense' | 'cards'

type BreakdownRow = { id: string; label: string; source: string; amount: number; path: string }
type BankEntry = {
  key: string
  cents: number
  month: string
  accountId: string
  field: string
  source?: { description?: string; date?: string }
}
type CardPurchase = { id: string; method: string; name: string; date: string; cents: number }
type MonthlyCard = { id: string; name: string; amount: number | null; kind: string }
type ReportEnd = { id: string; label: string; reportThrough: string | null }

const cardSources: Record<string, string> = {
  updated: 'דיווח חיוב הכרטיס',
  bank: 'חיוב שנקלט בבנק',
  reported: 'סכום חודשי מדווח',
}

const explanations = {
  income: 'הסכום כולל הכנסות והעברות נכנסות לפי הדיווח החודשי.',
  expense: 'הסכום מבוסס על סעיפי ההוצאה בדיווח החודשי ויכול לכלול חיובי כרטיסים.',
  cards: 'הסכום מבוסס על דיווחי הכרטיסים, חיובים שנקלטו בבנק וסכומים חודשיים מדווחים.',
}

function bankRows(plan: any, month: string, tone: 'income' | 'expense') {
  const fields = new Map<string, { label: string; kind: string }>(
    budgetFields(plan).map(([id, label, kind]: string[]) => [id, { label, kind }]),
  )
  const entries: BankEntry[] = plan.bankImport?.entries ?? []
  return entries.flatMap(entry => {
    const field = fields.get(entry.field)
    if (entry.month !== month || !field) return []
    const included = tone === 'income'
      ? field.kind === 'income' || entry.field === 'incomingTransfers'
      : field.kind === 'expense'
    if (!included) return []
    return [{
      id: entry.key,
      label: entry.source?.description || field.label,
      source: [field.label, entry.source?.date].filter(Boolean).join(' · '),
      amount: (tone === 'income' ? entry.cents : -entry.cents) / 100,
      path: '/accounts/' + encodeURIComponent(entry.accountId) + '/activity',
    }]
  })
}

function LeadingRows({ rows, href }: { rows: BreakdownRow[]; href: (path: string) => string }) {
  const leading = [...rows].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5)
  if (!leading.length) return <p className="my-2 text-sm text-muted-foreground">אין פירוט שמור לחודש הזה.</p>
  return <ul>{leading.map(row => <li className="flex items-start justify-between gap-3 border-b py-2" key={row.id}>
    <div className="min-w-0 break-words">
      <Link className="inline-flex min-h-11 items-center text-primary underline" href={href(row.path)}><bdi>{row.label}</bdi></Link>
      <small className="block text-muted-foreground"><bdi>{row.source}</bdi></small>
    </div>
    <div className="shrink-0 pt-3"><MoneyAmount value={row.amount}/></div>
  </li>)}</ul>
}

function BreakdownDetails({ tone, month, asOf, partial, cards, bankReportEnds, plan, href }: {
  tone: OverviewMetric; month: string; asOf: string; partial: boolean; cards: MonthlyCard[]
  bankReportEnds: ReportEnd[]; plan: any; href: (path: string) => string
}) {
  if (tone === 'cards') {
    const reported = cards.filter(card => card.amount !== null && !!cardSources[card.kind])
    const cardNames = new Map(cards.map(card => [card.id, card.name]))
    const period = { year: month.slice(0, 4), month: month.slice(5), asOf }
    const rows: CardPurchase[] = budgetDetailView(plan, period).rows
    const purchases: BreakdownRow[] = rows.flatMap(row => {
      const name = cardNames.get(row.method)
      return name ? [{
        id: row.id,
        label: row.name,
        source: name + ' · ' + row.date,
        amount: row.cents / 100,
        path: '/categories?card=' + encodeURIComponent(row.method),
      }] : []
    })
    return <>
      {reported.length > 0 && <ul>{reported.map(card => <li className="flex items-center justify-between gap-3 border-b py-2" key={card.id}>
        <div className="min-w-0 break-words"><Link className="inline-flex min-h-11 items-center text-primary underline" href={href('/cards/' + encodeURIComponent(card.id))}><bdi>{card.name}</bdi></Link>
          <small className="block text-muted-foreground">{cardSources[card.kind]}</small>
        </div>
        <MoneyAmount value={card.amount}/>
      </li>)}</ul>}
      {cards.some(card => card.amount === null || !cardSources[card.kind]) && <p className="mt-2 text-sm">חסר דיווח לחלק מהכרטיסים.</p>}
      <h3 className="mt-4 font-semibold">רכישות וזיכויים בפירוט השמור</h3>
      <p className="text-sm text-muted-foreground">הפירוט מוצג בנפרד מסכום החיוב.</p>
      <LeadingRows rows={purchases} href={href}/>
      <Link className="mt-2 inline-flex min-h-11 items-center text-primary underline" href={href('/cards')}>לכל כרטיסי האשראי</Link>
    </>
  }

  const accounts = cashAccountList(plan)
  return <>
    {partial && <div className="my-3 rounded-lg bg-muted p-3 text-sm">
      <p>הדיווח הבנקאי לחודש זה חלקי.</p>
      {bankReportEnds.map(account => account.reportThrough && <p key={account.id}><bdi>{account.label}</bdi> · <ReportEndDate date={account.reportThrough}/></p>)}
    </div>}
    <h3 className="mt-4 font-semibold">תנועות בולטות שנקלטו מהבנק</h3>
    <LeadingRows rows={bankRows(plan, month, tone)} href={href}/>
    <div className="mt-2 flex flex-wrap gap-x-4">
      {accounts.length ? accounts.map(account => <Link key={account.id} className="inline-flex min-h-11 items-center text-primary underline" href={href('/accounts/' + encodeURIComponent(account.id) + '/activity')}>כל תנועות הבנק · <bdi>{account.label}</bdi></Link>)
        : <Link className="inline-flex min-h-11 items-center text-primary underline" href={href('/incoming')}>לדיווחים שנקלטו</Link>}
    </div>
  </>
}

export function OverviewBreakdown({ title, value, tone, month, asOf, partial, cards, bankReportEnds, plan, href, children }: {
  title: string; value: number | null; tone: OverviewMetric; month: string; asOf: string; partial: boolean
  cards: MonthlyCard[]; bankReportEnds: ReportEnd[]; plan: any; href: (path: string) => string; children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const action = useId()

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger type="button" className="home-metric overview-breakdown-trigger text-start" data-tone={tone} aria-describedby={action}>
      {children}<span className="sr-only" id={action}>פתיחת פירוט</span>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40"/>
      <Dialog.Content dir="rtl" className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] max-w-md overflow-auto rounded-t-2xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-card-foreground shadow-xl md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:rounded-2xl">
        <header className="flex items-center justify-between">
          <Dialog.Title className="text-lg font-semibold">{title} · <bdi>{month}</bdi></Dialog.Title>
          <Dialog.Close className="grid size-11 place-items-center rounded-full focus-visible:ring-2" aria-label="סגירת הפירוט"><X size={18} aria-hidden/></Dialog.Close>
        </header>
        <strong className="text-2xl"><MoneyAmount value={value}/></strong>
        <Dialog.Description className="my-2 text-sm">{explanations[tone]}</Dialog.Description>
        {open && <BreakdownDetails {...{ tone, month, asOf, partial, cards, bankReportEnds, plan, href }}/>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
