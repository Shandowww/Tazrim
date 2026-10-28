import {ExistingWorkflowLinks} from './app/existing-workflow-links'
import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { createBrowserRouter, RouterProvider, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Sidebar } from './tazrim/components/layout/sidebar'
import { BottomNav } from './tazrim/components/layout/bottom-nav'
import { NavSectionsProvider } from './tazrim/components/layout/nav-context'
import { DashboardSummaryCards } from './tazrim/components/dashboard/summary-cards'
import { PeriodPicker } from './tazrim/components/layout/period-picker'
import type { Period } from './tazrim/lib/period'
import { AppearanceContext } from './app/appearance'
import { buildNavSections } from './tazrim/lib/nav/state'
import { demoAccounts, demoSummary, demoBankSummary, demoCardSummary } from './app/demo-fixture'
import { budgetDashboard, budgetNavigation } from './app/budget-adapter'
import { legacyBudgetHref } from './app/navigation-query'
import { DraftGuardProvider, useDraftGuard } from './app/draft-guard'
import { installPullRefresh } from './app/pull-refresh'
import { useBudget, type BudgetResponse } from './app/use-budget'
import './tazrim/globals.css'
import './app.css'
import Link from './app/link'

const HelpPage = lazy(async () => ({ default: (await import('./app/help-page')).HelpPage }))
const ReportHistoryPage = lazy(async () => ({ default: (await import('./app/report-history-page')).ReportHistoryPage }))
const ReportGroupPage = lazy(async () => ({ default: (await import('./app/report-group-page')).ReportGroupPage }))
const ReportStatePage = lazy(async () => ({ default: (await import('./app/report-state-page')).ReportStatePage }))
const CardReportPage = lazy(async () => ({ default: (await import('./app/card-report-page')).CardReportPage }))
const ReportLibraryPage = lazy(async () => ({ default: (await import('./app/report-library-page')).ReportLibraryPage }))
const SpacesPage = lazy(async () => ({ default: (await import('./app/spaces-page')).SpacesPage }))
const SavingsBalancePage = lazy(async () => ({ default: (await import('./app/savings-balance-page')).SavingsBalancePage }))
const ScenarioPage = lazy(async () => ({ default: (await import('./app/scenario-page')).ScenarioPage }))
const RecurringPage = lazy(async () => ({ default: (await import('./app/recurring-page')).RecurringPage }))
const HistoryPage = lazy(async () => ({ default: (await import('./app/history-page')).HistoryPage }))
const CardPayerPage = lazy(async () => ({ default: (await import('./app/card-payer-page')).CardPayerPage }))
const BillingPage = lazy(async () => ({ default: (await import('./app/billing-page')).BillingPage }))
const CardStopPage = lazy(async () => ({ default: (await import('./app/card-stop-page')).CardStopPage }))
const CardPage = lazy(async () => ({ default: (await import('./app/card-page')).CardPage }))
const SavingsTransferPage = lazy(async () => ({ default: (await import('./app/savings-transfer-page')).SavingsTransferPage }))
const InvestmentPage = lazy(async () => ({ default: (await import('./app/investment-page')).InvestmentPage }))
const SavingsSchedulePage = lazy(async () => ({ default: (await import('./app/savings-schedule-page')).SavingsSchedulePage }))
const SavingsGoalsPage = lazy(async () => ({ default: (await import('./app/savings-goals-page')).SavingsGoalsPage }))
const LoansPage = lazy(async () => ({ default: (await import('./app/loans-page')).LoansPage }))
const PlannedItemsPage = lazy(async () => ({ default: (await import('./app/planned-items-page')).PlannedItemsPage }))
const CashMonthlyPage = lazy(async () => ({ default: (await import('./app/cash-monthly-page')).CashMonthlyPage }))
const CashFlowPage = lazy(async () => ({ default: (await import('./app/cash-flow-page')).CashFlowPage }))
const CashAssignmentsPage = lazy(async () => ({ default: (await import('./app/cash-assignments-page')).CashAssignmentsPage }))
const AccountPage = lazy(async () => ({ default: (await import('./app/account-page')).AccountPage }))
const MonthlyPage = lazy(async () => ({ default: (await import('./app/monthly-page')).MonthlyPage }))
const CategoryManagementPage = lazy(async () => ({ default: (await import('./app/category-management-page')).CategoryManagementPage }))
const CategoryLimitPage = lazy(async () => ({ default: (await import('./app/category-limit-page')).CategoryLimitPage }))
const DetailManagementPage = lazy(async () => ({ default: (await import('./app/detail-management-page')).DetailManagementPage }))
const DetailAnnotationPage = lazy(async () => ({ default: (await import('./app/detail-annotation-page')).DetailAnnotationPage }))
const ExpenseDetailsPage = lazy(async () => ({ default: (await import('./app/expense-details-page')).ExpenseDetailsPage }))
const AccountsPage = lazy(async () => ({ default: (await import('./app/accounts-page')).AccountsPage }))
const CombinedChart = lazy(async () => ({ default: (await import('./tazrim/components/dashboard/combined-chart')).CombinedChart }))
const CCMonthlyChart = lazy(async () => ({ default: (await import('./tazrim/components/dashboard/cc-monthly-chart')).CCMonthlyChart }))

function useFixtureMode() {
  const { search } = useLocation()
  return import.meta.env.DEV && new URLSearchParams(search).get('demo') === '1'
}

function Header({ budget }: { budget: ReturnType<typeof useBudget> }) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const guard = useDraftGuard()
  const params = new URLSearchParams(search)
  const year = /^20\d{2}$/.test(params.get('year') || '') ? Number(params.get('year')) : Number(jerusalemMonth().slice(0, 4))
  const month = /^(?:[1-9]|1[0-2]|0[1-9])$/.test(params.get('month') || '') ? Number(params.get('month')) : undefined
  function selectPeriod(next: Period) {
    if (next.year < 1900 || next.year > 2999) return
    const query = new URLSearchParams(search)
    query.set('year', String(next.year))
    if (next.month) query.set('month', String(next.month))
    else query.delete('month')
    navigate(pathname + `?${query}`)
  }
  function selectBudget(id: string) {
    const next = new URLSearchParams(search)
    if (id === 'personal') next.delete('budget')
    else next.set('budget', id)
    navigate(pathname + (next.size ? `?${next}` : ''))
  }
  return (
    <header className="sticky top-0 z-30 grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b bar-glass px-4 py-2.5">
      <div className="min-w-0 text-xs font-semibold text-muted-foreground">{budget.status === 'ready' ? <label className="flex min-w-0 items-center gap-2"><span className="sr-only">מרחב תקציב</span><select className="min-w-0 max-w-full truncate rounded-lg bg-transparent p-1" value={budget.budgetId} onChange={event => selectBudget(event.target.value)}>{budget.spaces.map(space => <option key={space.id} value={space.id}>{space.name}{space.role === 'viewer' ? ' · צפייה בלבד' : ''}</option>)}</select></label> : 'Budgit'}</div>
      <PeriodPicker key={budget.refreshError || budget.status} period={{ year, month }} onChange={selectPeriod} />
      <div className="flex items-center justify-end gap-2">
        <button type="button" className="rounded-lg p-2 text-muted-foreground disabled:opacity-50" aria-label="רענון נתונים" disabled={budget.refreshPending || budget.status === 'loading'} onClick={()=>guard.run(budget.refresh)}><RefreshCw className="h-5 w-5" /></button>
      </div>
    </header>
  )
}

function jerusalemMonth() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}`
}

function Dashboard({ fixture, budget }: { fixture: boolean; budget: ReturnType<typeof useBudget> }) {
  const { search: locationSearch } = useLocation()
  const editorHref = legacyBudgetHref(locationSearch)
  if (!fixture && budget.status === 'loading') return <section className="surface rounded-xl p-6" role="status">טוען נתונים…</section>
  if (!fixture && budget.status === 'error') return <section className="surface rounded-xl p-6" role="alert">{budget.message} <a className="text-primary underline" href={editorHref}>פתיחת הממשק הקיים</a></section>
  if (!fixture && budget.status === 'ready' && !budget.value.plan) return <section className="surface rounded-xl p-6">עדיין אין תקציב שמור. <a className="text-primary underline" href={editorHref}>הגדרת תקציב</a></section>
  if (!fixture && budget.status === 'ready' && budget.value.plan?.format === 'monthly-flow-encrypted-v1') return <section className="surface rounded-xl p-6">התקציב מוצפן. <a className="text-primary underline" href={editorHref}>פתיחה מאובטחת בממשק הקיים</a></section>
  if (!fixture && budget.status === 'ready') {
    const search = new URLSearchParams(window.location.search)
    const year = /^20\d{2}$/.test(search.get('year') || '') ? search.get('year')! : jerusalemMonth().slice(0, 4)
    const month = /^(?:[1-9]|1[0-2]|0[1-9])$/.test(search.get('month') || '') ? String(Number(search.get('month'))).padStart(2, '0') : ''
    let view: ReturnType<typeof budgetDashboard>
    try { view = budgetDashboard(budget.value.plan, { year, month, asOf: jerusalemMonth() }) }
    catch { return <section className="surface rounded-xl p-6" role="alert">לא ניתן להציג את נתוני התקציב. <a className="text-primary underline" href={editorHref}>פתיחת הממשק הקיים</a></section> }
    const accountCount = budgetNavigation(budget.value.plan).filter(account => account.kind === 'BANK').length
    return <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">סקירה כללית</h1>
      <p className="text-sm text-muted-foreground">{view.partial ? 'דיווח חלקי · ' : ''}{view.reportedMonths} חודשים מדווחים{budget.value.budget?.role === 'viewer' ? ' · צפייה בלבד' : ''} · <bdi dir="ltr">{budget.value.accountEmail}</bdi></p>
      {view.hasReports ? <>
        <DashboardSummaryCards {...view.cards} query={search.toString()} bankHint={accountCount ? `${accountCount} חשבונות` : 'ללא חשבון מוגדר'} cardHint="כרטיסי אשראי" monthHasData={view.reportedMonths > 0} />
        <Suspense fallback={<section className="surface h-52 animate-pulse rounded-xl p-4" role="status" aria-label="טוען תרשים" />}><CombinedChart bankSummary={view.bankSummary} maxSummary={view.cardSummary} cardsName="כרטיס" selectedMonth={month ? Number(month) : undefined} /></Suspense>
        <div className="grid gap-4 lg:grid-cols-2"><Suspense fallback={<section className="surface h-48 animate-pulse rounded-xl p-4" role="status" aria-label="טוען תרשים כרטיסים" />}><CCMonthlyChart data={view.cardSummary} selectedMonth={month ? Number(month) : undefined} /></Suspense></div>
      </> : <section className="surface rounded-xl p-6">אין נתוני אמת לתקופה זו. תחזיות וסכומי ברירת מחדל אינם מוצגים כדיווח.</section>}
      <section className="surface rounded-xl p-6 text-sm text-muted-foreground">תצוגה לקריאה בלבד. <a className="text-primary underline" href={editorHref}>עריכה בממשק הקיים</a></section>
    </div>
  }
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">סקירה כללית</h1>
      <DashboardSummaryCards {...demoSummary} query={new URLSearchParams(locationSearch).toString()} bankHint="2 חשבונות" cardHint="כרטיס ראשי" />
      <Suspense fallback={<section className="surface h-52 animate-pulse rounded-xl p-4" role="status" aria-label="טוען תרשים" />}><CombinedChart bankSummary={demoBankSummary} maxSummary={demoCardSummary} cardsName="כרטיס" /></Suspense>
      <div className="grid gap-4 lg:grid-cols-2"><Suspense fallback={<section className="surface h-48 animate-pulse rounded-xl p-4" role="status" aria-label="טוען תרשים כרטיסים" />}><CCMonthlyChart data={demoCardSummary} /></Suspense></div>
      <section className="surface rounded-xl p-6"><h2 className="font-semibold">דוגמת תצוגה</h2><p className="mt-2 text-sm text-muted-foreground">הסכומים בדוגמה בלבד. בתצוגת החשבון מוצגים נתוני הדיווח השמורים ב-Budgit.</p></section>
    </div>
  )
}

function PendingPage({ title }: { title: string }) {
  const fixture = useFixtureMode()
  return <div className="mx-auto max-w-7xl space-y-4"><h1 className="text-2xl font-semibold">{title}</h1><section className="surface rounded-xl p-6 text-muted-foreground">{fixture ? 'מסך פיתוח עם נתוני דוגמה. חיבור Budgit עדיין בעבודה.' : 'ממתין לחיבור לנתוני Budgit.'}</section></div>
}

function App() {
  const guard = useDraftGuard()
  const [pullHint, setPullHint] = useState('')
  const fixture = useFixtureMode()
  const { pathname, search } = useLocation()
  const budgetId = new URLSearchParams(search).get('budget') || 'personal'
  const budget = useBudget(budgetId, !fixture)
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('budgit-react-appearance') || 'system' } catch { return 'system' } })
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  useEffect(()=>installPullRefresh({document,window,refresh:()=>guard.run(budget.refresh),isBusy:()=>budget.refreshPending||budget.status==='loading'||guard.registry.getSnapshot().busy,onHint:setPullHint}),[guard,budget.refresh,budget.refreshPending,budget.status])
  const actualPlan: BudgetResponse['plan'] = budget.status === 'ready' ? budget.value.plan : null
  const sections = buildNavSections(fixture ? demoAccounts : actualPlan && actualPlan.format !== 'monthly-flow-encrypted-v1' ? budgetNavigation(actualPlan) : [])
  return (
    <AppearanceContext.Provider value={dark}><NavSectionsProvider sections={sections}>
      <div className="flex min-h-screen font-sans">
        <Sidebar initialCollapsed={false} initialClosed={[]} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header budget={budget} />
          <main className="flex-1 p-4 pb-[calc(5.75rem+max(0.75rem,env(safe-area-inset-bottom)))] md:p-6">
            <Suspense fallback={<section className="surface rounded-xl p-6" role="status">טוען מסך…</section>}>
            <Routes>
              <Route path="/" element={<Dashboard fixture={fixture} budget={budget} />} />
              <Route path="/banks" element={<AccountsPage kind="banks" fixture={fixture} budget={budget} />} />
              <Route path="/banks/:id" element={<AccountsPage kind="banks" fixture={fixture} budget={budget} />} />
              <Route path="/cards" element={<AccountsPage kind="cards" fixture={fixture} budget={budget} />} />
              <Route path="/cards/:id" element={<AccountsPage kind="cards" fixture={fixture} budget={budget} />} />
              <Route path="/card-setup" element={<CardPage key={budgetId + pathname + search} mode="list" fixture={fixture} budget={budget} />} />
              <Route path="/card-setup/new" element={<CardPage key={budgetId + pathname + search} mode="new" fixture={fixture} budget={budget} />} />
              <Route path="/card-setup/:id" element={<CardPage key={budgetId + pathname + search} mode="edit" fixture={fixture} budget={budget} />} />
              <Route path="/accounts/transfers" element={<CashFlowPage key={budgetId + pathname + search} mode="list" fixture={fixture} budget={budget} />} />
              <Route path="/accounts/transfers/new" element={<CashFlowPage key={budgetId + pathname + search} mode="new" fixture={fixture} budget={budget} />} />
              <Route path="/accounts/transfers/:id/remove" element={<CashFlowPage key={budgetId + pathname + search} mode="remove" fixture={fixture} budget={budget} />} />
              <Route path="/accounts/:id/assign-remainder" element={<CashFlowPage key={budgetId + pathname + search} mode="remainder" fixture={fixture} budget={budget} />} />
              <Route path="/accounts/assignments" element={<CashAssignmentsPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/accounts/new" element={<AccountPage key={budgetId + pathname + search} create fixture={fixture} budget={budget} />} />
              <Route path="/accounts/:id/edit" element={<AccountPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/accounts/:id/monthly/correction" element={<CashMonthlyPage key={budgetId + pathname + search} fixture={fixture} budget={budget} correction />} />
              <Route path="/accounts/:id/monthly" element={<CashMonthlyPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/monthly" element={<MonthlyPage key={budgetId + search} fixture={fixture} budget={budget} />} />
              <Route path="/upload/:id/delete" element={<ReportStatePage key={budgetId + pathname + search} remove fixture={fixture} budget={budget} />} />
              <Route path="/cards/:id/payer" element={<CardPayerPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/categories/manage" element={<CategoryManagementPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/categories/limits" element={<CategoryLimitPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/details/manage" element={<DetailManagementPage key={budgetId + pathname + search} mode="list" fixture={fixture} budget={budget} />} />
              <Route path="/details/new" element={<DetailManagementPage key={budgetId + pathname + search} mode="new" fixture={fixture} budget={budget} />} />
              <Route path="/details/:id/edit" element={<DetailManagementPage key={budgetId + pathname + search} mode="edit" fixture={fixture} budget={budget} />} />
              <Route path="/details/:id/delete" element={<DetailManagementPage key={budgetId + pathname + search} mode="delete" fixture={fixture} budget={budget} />} />
              <Route path="/details/:id/clear" element={<DetailManagementPage key={budgetId + pathname + search} mode="clear" fixture={fixture} budget={budget} />} />
              <Route path="/cards/:id/stop" element={<CardStopPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/cards/:id/no-activity" element={<BillingPage key={budgetId + pathname + search} noActivity fixture={fixture} budget={budget} />} />
              <Route path="/cards/:id/billing" element={<BillingPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/cards/:id/billing/:date" element={<BillingPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/savings/transfer" element={<SavingsTransferPage key={budgetId + pathname + search} mode="allocation" fixture={fixture} budget={budget} />} />
              <Route path="/savings/transfers" element={<SavingsTransferPage key={budgetId + pathname + search} mode="list" fixture={fixture} budget={budget} />} />
              <Route path="/savings/transfers/new" element={<SavingsTransferPage key={budgetId + pathname + search} mode="new" fixture={fixture} budget={budget} />} />
              <Route path="/savings/transfers/:id/complete" element={<SavingsTransferPage key={budgetId + pathname + search} mode="complete" fixture={fixture} budget={budget} />} />
              <Route path="/savings/transfers/:id/cancel" element={<SavingsTransferPage key={budgetId + pathname + search} mode="cancel" fixture={fixture} budget={budget} />} />
              <Route path="/investment" element={<InvestmentPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/savings/schedule" element={<SavingsSchedulePage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/savings/returns" element={<SavingsBalancePage key={budgetId + pathname + search} mode="returns" fixture={fixture} budget={budget} />} />
              <Route path="/savings/accounts" element={<SavingsBalancePage key={budgetId + pathname + search} mode="accounts" fixture={fixture} budget={budget} />} />
              <Route path="/savings/allocation" element={<SavingsBalancePage key={budgetId + pathname + search} mode="allocation" fixture={fixture} budget={budget} />} />
              <Route path="/savings/:id/deposit" element={<SavingsBalancePage key={budgetId + pathname + search} mode="deposit" fixture={fixture} budget={budget} />} />
              <Route path="/savings/:id/remove" element={<SavingsBalancePage key={budgetId + pathname + search} mode="remove" fixture={fixture} budget={budget} />} />
              <Route path="/savings" element={<SavingsGoalsPage key={budgetId + pathname + search} mode="list" fixture={fixture} budget={budget} />} />
              <Route path="/savings/new" element={<SavingsGoalsPage key={budgetId + pathname + search} mode="new" fixture={fixture} budget={budget} />} />
              <Route path="/savings/:id/edit" element={<SavingsGoalsPage key={budgetId + pathname + search} mode="edit" fixture={fixture} budget={budget} />} />
              <Route path="/loans" element={<LoansPage key={budgetId + pathname + search} mode="list" fixture={fixture} budget={budget} />} />
              <Route path="/loans/new" element={<LoansPage key={budgetId + pathname + search} mode="new" fixture={fixture} budget={budget} />} />
              <Route path="/loans/:id/edit" element={<LoansPage key={budgetId + pathname + search} mode="edit" fixture={fixture} budget={budget} />} />
              <Route path="/loans/:id/remove" element={<LoansPage key={budgetId + pathname + search} mode="remove" fixture={fixture} budget={budget} />} />
              <Route path="/plans/scenario" element={<ScenarioPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/plans" element={<PlannedItemsPage key={budgetId + pathname + search} mode="list" fixture={fixture} budget={budget} />} />
              <Route path="/plans/new" element={<PlannedItemsPage key={budgetId + pathname + search} mode="new" fixture={fixture} budget={budget} />} />
              <Route path="/plans/:id/edit" element={<PlannedItemsPage key={budgetId + pathname + search} mode="edit" fixture={fixture} budget={budget} />} />
              <Route path="/plans/:id/remove" element={<PlannedItemsPage key={budgetId + pathname + search} mode="remove" fixture={fixture} budget={budget} />} />
              <Route path="/recurring" element={<RecurringPage key={budgetId} fixture={fixture} budget={budget} />} />
              <Route path="/upload/history" element={<ReportHistoryPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/upload/history/:id/undo" element={<ReportHistoryPage key={budgetId + pathname + search} fixture={fixture} budget={budget} undo />} />
              <Route path="/upload/group" element={<ReportGroupPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/upload/:id/group" element={<ReportGroupPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/upload/:id/state" element={<ReportStatePage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/upload/:id/review" element={<CardReportPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/upload" element={<ReportLibraryPage key={budgetId} fixture={fixture} budget={budget} />} />
              <Route path="/categories" element={<ExpenseDetailsPage key={budgetId + search} mode="categories" fixture={fixture} budget={budget} />} />
              <Route path="/search" element={<ExpenseDetailsPage key={budgetId + search} mode="search" fixture={fixture} budget={budget} />} />
              <Route path="/details/:id/annotate" element={<DetailAnnotationPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/details/:id" element={<ExpenseDetailsPage key={budgetId + search} mode="source" fixture={fixture} budget={budget} />} />
              <Route path="/settings/spaces" element={<SpacesPage key={budgetId} fixture={fixture} budget={budget} />} />
              <Route path="/settings/history" element={<HistoryPage key={budgetId} fixture={fixture} budget={budget} />} />
              <Route path="/settings" element={<div className="mx-auto max-w-7xl space-y-4"><h1 className="text-2xl font-semibold">הגדרות אפליקציה</h1><ExistingWorkflowLinks/><label className="surface flex items-center gap-3 rounded-xl p-4">מראה <select className="rounded-lg border bg-card p-2" value={theme} onChange={event => { setTheme(event.target.value); try { localStorage.setItem('budgit-react-appearance', event.target.value) } catch { /* System appearance remains usable without storage. */ } }}><option value="system">מערכת</option><option value="light">בהיר</option><option value="dark">כהה</option></select></label><Link href={"/settings/history" + search} className="surface flex min-h-14 items-center rounded-xl p-4 text-primary underline">יומן שינויים וגיבוי</Link><Link href={"/settings/spaces" + search} className="surface flex min-h-14 items-center rounded-xl p-4 text-primary underline">המרחבים שלי ושיתוף</Link></div>} />
              <Route path="/about" element={<HelpPage budget={budget} />} />
              <Route path="*" element={<PendingPage title="העמוד אינו זמין" />} />
            </Routes>
            </Suspense>
          </main>
        </div>
      </div>
      <BottomNav />
      {pullHint&&<div role="status" className="pointer-events-none fixed inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-40 mx-auto w-fit rounded-xl surface-overlay px-4 py-2 text-sm">{pullHint}</div>}
      {(budget.status === 'error' || budget.status === 'ready' && budget.refreshError) && createPortal(
        <div role="alert" className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[100] mx-auto flex max-w-lg items-center gap-3 rounded-xl bg-foreground p-4 text-background shadow-2xl">
          <span className="min-w-0 flex-1">{budget.status === 'error' ? budget.message : `${budget.refreshError} הנתונים האחרונים נשארו מוצגים.`}</span>
          <button type="button" className="shrink-0 rounded-lg border border-background/40 px-2 py-1" onClick={()=>guard.run(budget.refresh)}>ניסיון חוזר</button>
          {budget.status === 'ready' && <button type="button" className="shrink-0 rounded-lg px-2 py-1" aria-label="סגירת הודעה" onClick={budget.dismissRefreshError}>סגירה</button>}
        </div>, document.body
      )}
    </NavSectionsProvider></AppearanceContext.Provider>
  )
}

const router = createBrowserRouter([{path:'*',element:<DraftGuardProvider><App /></DraftGuardProvider>}],{basename:'/next'})
createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>)
