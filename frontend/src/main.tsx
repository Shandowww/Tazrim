import {PageHeading} from './app/page-heading'
import {SavedReturnNotice} from './app/use-saved-return'
import {ChequesPage} from './app/cheques-page'
import {IncomePlanningPage} from './app/income-planning-page'
import {HouseholdAccountsPage} from './app/household-accounts'
import {HouseholdHome} from './app/household-home'
import {householdSpaceHref} from './app/household-model'
import {HouseholdNavigation,HouseholdBack,HouseholdMore} from './app/household-navigation'
import {InterfaceLayoutSetting} from './app/interface-layout-setting'
import {openingViewSearch} from './app/navigation-query'
import {SessionControls} from './app/session-controls'
import {GlobalActionCenter} from './app/global-action-center'
import {ComparisonGoalsPage} from './app/comparison-goals-page'
import {ForecastSettingsPage} from './app/forecast-settings-page'
import {OnboardingPage} from './app/onboarding-page'
import {ProfilePage} from './app/profile-page'
import {ExistingWorkflowLinks} from './app/existing-workflow-links'
import { StrictMode, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { createBrowserRouter, RouterProvider, Route, Routes, useLocation, useNavigate, ScrollRestoration, type Location } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Sidebar } from './tazrim/components/layout/sidebar'
import { NavSectionsProvider } from './tazrim/components/layout/nav-context'
import { AppearanceContext } from './app/appearance'
import { buildNavSections } from './tazrim/lib/nav/state'
import { demoAccounts, demoHouseholdPlan } from './app/demo-fixture'
import { budgetNavigation } from './app/budget-adapter'
import { withViewQuery, scrollRouteSearch } from './app/navigation-query'
import { DraftGuardProvider, useDraftGuard } from './app/draft-guard'
import { installPullRefresh } from './app/pull-refresh'
import { RefreshIndicator } from './app/refresh-indicator'
import { createAppRefresh } from './app/refresh-app'
import {InterfaceModeProvider,InterfaceModeSelector,InterfaceModeBoundary} from './app/interface-mode'
import { useBudget, type BudgetResponse } from './app/use-budget'
import './tazrim/globals.css'
import './app.css'
import Link from './app/link'
import {PageLoadBoundary} from './app/page-load-boundary'

const AdminAccessPage = lazy(async () => ({ default: (await import('./app/admin-access-page')).AdminAccessPage }))
const AnalysisPage = lazy(async () => ({ default: (await import('./app/analysis-page')).AnalysisPage }))
const WalletPage = lazy(async () => ({ default: (await import('./app/wallet-page')).WalletPage }))
const GmailPage = lazy(async () => ({ default: (await import('./app/gmail-page')).GmailPage }))
const DriveBackupPage = lazy(async () => ({ default: (await import('./app/drive-backup-page')).DriveBackupPage }))
const MigrationPage = lazy(async () => ({ default: (await import('./app/migration-page')).MigrationPage }))
const TransferMatchesPage = lazy(async () => ({ default: (await import('./app/transfer-matches-page')).TransferMatchesPage }))
const OverviewPage = lazy(async () => ({ default: (await import('./app/overview-page')).OverviewPage }))
const DeviceDraftPage = lazy(async () => ({ default: (await import('./app/device-draft-page')).DeviceDraftPage }))
const SecurityPage = lazy(async () => ({ default: (await import('./app/security-page')).SecurityPage }))
const HelpPage = lazy(async () => ({ default: (await import('./app/help-page')).HelpPage }))
const StatementNoticesPage = lazy(async () => ({ default: (await import('./app/statement-notices-page')).StatementNoticesPage }))
const ActionCenterPage = lazy(async () => ({ default: (await import('./app/action-center-page')).ActionCenterPage }))
const ReportExpectationsPage = lazy(async () => ({ default: (await import('./app/report-expectations-page')).ReportExpectationsPage }))
const ReportHistoryPage = lazy(async () => ({ default: (await import('./app/report-history-page')).ReportHistoryPage }))
const ReportGroupPage = lazy(async () => ({ default: (await import('./app/report-group-page')).ReportGroupPage }))
const ReportStatePage = lazy(async () => ({ default: (await import('./app/report-state-page')).ReportStatePage }))
const ReportLibraryPage = lazy(async () => ({ default: (await import('./app/report-library-page')).ReportLibraryPage }))
const IncomingReportsPage = lazy(async () => ({default:(await import('./app/incoming-reports-page')).IncomingReportsPage}))
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
const LoanPaymentsPage = lazy(async () => ({default:(await import('./app/loan-payments-page')).LoanPaymentsPage}))
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
const BankActivityPage = lazy(async () => ({ default: (await import('./app/bank-activity-page')).BankActivityPage }))
const ExpenseDetailsPage = lazy(async () => ({ default: (await import('./app/expense-details-page')).ExpenseDetailsPage }))
const AccountsPage = lazy(async () => ({ default: (await import('./app/accounts-page')).AccountsPage }))

function useFixtureMode() {
  const { search } = useLocation()
  return import.meta.env.DEV && new URLSearchParams(search).get('demo') === '1'
}

function Header({ budget,refreshApp,refreshPending }: { budget: ReturnType<typeof useBudget>;refreshApp:()=>void;refreshPending:boolean }) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  function selectBudget(id: string) {
    if(budget.status!=='ready'||id===budget.budgetId||!budget.spaces.some(space=>space.id===id))return
    navigate(householdSpaceHref(pathname,search,id))
  }
  return (
    <header className="household-header sticky top-0 z-30 border-b">
      <div className="household-topbar">
      {budget.status==='ready'&&(budget.spaces.length===2?<div className="household-space-switch" role="group" aria-label="מרחב תקציב">{budget.spaces.map(space=><button type="button" key={space.id} aria-pressed={budget.budgetId===space.id} aria-label={space.name+(space.role==='viewer'?' · צפייה בלבד':'')} title={space.name} onClick={()=>selectBudget(space.id)}><span><span className="household-space-short">{space.id==='personal'?'אישי':'משותף'}</span><span className="household-space-full">{space.name}</span></span>{space.role==='viewer'&&<small>צפייה בלבד</small>}</button>)}</div>:budget.spaces.length>2?<label className="household-space-select"><span className="sr-only">מרחב תקציב</span><select value={budget.budgetId} onChange={event=>selectBudget(event.target.value)}>{budget.spaces.map(space=><option key={space.id} value={space.id}>{space.name}{space.role==='viewer'?' · צפייה בלבד':''}</option>)}</select></label>:<div className="household-space-name">{budget.spaces[0]?.name}{budget.spaces[0]?.role==='viewer'&&' · צפייה בלבד'}</div>)}
        {budget.status!=='ready'&&<div className="household-space-name" role="status">{budget.status==='loading'?'טוען תקציב…':'תקציב'}</div>}
        <div className="household-header-actions"><GlobalActionCenter budget={budget}/>
          <button type="button" className="text-muted-foreground disabled:opacity-50" aria-label="רענון האפליקציה והנתונים" disabled={refreshPending || budget.refreshPending || budget.status === 'loading'} onClick={refreshApp}><RefreshCw className="h-5 w-5" /></button>
        </div>
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
  if (!fixture && budget.status === 'loading') return <section className="surface rounded-xl p-6" role="status">טוען נתונים…</section>
  if (!fixture && budget.status === 'error') return <section className="surface rounded-xl p-6" role="alert">{budget.message} </section>
  if (!fixture && budget.status === 'ready' && !budget.value.plan) return <section className="surface rounded-xl p-6">עדיין אין תקציב שמור. <Link className="inline-flex min-h-11 items-center px-3 text-primary underline" href={withViewQuery('/upload',locationSearch)}>העלאת דוחות והתחלה</Link><Link className="inline-flex min-h-11 items-center px-3 text-primary underline" href={withViewQuery('/start',locationSearch)}>הגדרה ידנית</Link><Link className="inline-flex min-h-11 items-center px-3 text-primary underline" href={withViewQuery('/settings/security',locationSearch)}>יש לי גיבוי לייבוא</Link></section>
  if (!fixture && budget.status === 'ready' && budget.value.plan?.format === 'monthly-flow-encrypted-v1') return <section className="surface rounded-xl p-6">התקציב מוצפן. </section>
  if (!fixture && budget.status === 'ready') {
    try {return <HouseholdHome key={budget.budgetId} plan={budget.value.plan} asOf={jerusalemMonth()}/>}
    catch {return <section className="surface rounded-xl p-6" role="alert">לא ניתן להציג את נתוני התקציב.</section>}
  }
  return <HouseholdHome plan={demoHouseholdPlan} asOf={jerusalemMonth()}/>
}

function PendingPage({ title }: { title: string }) {
  const fixture = useFixtureMode()
  return <div className="mx-auto max-w-7xl space-y-4"><PageHeading className="text-2xl font-semibold">{title}</PageHeading><section className="surface rounded-xl p-6 text-muted-foreground">{fixture ? 'מסך פיתוח עם נתוני דוגמה. חיבור Budgit עדיין בעבודה.' : 'ממתין לחיבור לנתוני Budgit.'}</section></div>
}

function App() {
  const guard = useDraftGuard()
  const navigate = useNavigate()
  const [pullHint, setPullHint] = useState('')
  const [pullProgress,setPullProgress] = useState<number|null>(null)
  const fixture = useFixtureMode()
  const { pathname, search } = useLocation()
  const budgetId = new URLSearchParams(search).get('budget') || 'personal'
  const budget = useBudget(budgetId, !fixture)
  const [appRefreshState,setAppRefreshState]=useState<{pending:boolean;error:string|null}>({pending:false,error:null})
  const [reloadApp]=useState(()=>createAppRefresh({location:window.location,fetch:(...args:Parameters<typeof fetch>)=>fetch(...args),guard:guard.run,onState:setAppRefreshState}))
  const refreshApp=useCallback(()=>{document.activeElement instanceof HTMLElement&&document.activeElement.blur();guard.run(()=>{void reloadApp()})},[guard,reloadApp])
  const currentAccountId = !fixture && budget.status === 'ready' ? budget.value.accountId : null
  const lastAccountId = useRef<string | null>(null)
  const accountChanged = !!currentAccountId && !!lastAccountId.current && currentAccountId !== lastAccountId.current
  useEffect(() => {
    if (!currentAccountId) return
    lastAccountId.current = currentAccountId
    if (accountChanged) navigate(householdSpaceHref(pathname, search, budgetId), {replace:true, state:null})
  }, [currentAccountId, accountChanged, budgetId, pathname, search, navigate])
  const routeScopeKey = fixture ? 'demo' : budget.status === 'ready' ? budget.value.accountId + '/' + budgetId : 'pending/' + budgetId
  const scrollKeys = useRef(new Map<string, string>())
  const scrollActor = fixture ? 'demo' : budget.status === 'ready' ? budget.value.accountId : undefined
  const getScrollKey = useCallback((location: Location) => {
    if (!scrollActor) return location.key
    const route = JSON.stringify([scrollActor, location.pathname, scrollRouteSearch(location.pathname,location.search)])
    const key = scrollKeys.current.get(route)
    if (key) return key
    // Keep account identifiers and route filters out of React Router's session storage.
    const opaqueKey = crypto.randomUUID()
    if (scrollKeys.current.size >= 80) scrollKeys.current.delete(scrollKeys.current.keys().next().value!)
    scrollKeys.current.set(route, opaqueKey)
    return opaqueKey
  }, [scrollActor])
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
  useEffect(()=>installPullRefresh({document,window,refresh:refreshApp,isBusy:()=>appRefreshState.pending||budget.refreshPending||budget.status==='loading'||guard.navigationPending||guard.registry.getSnapshot().busy,onHint:setPullHint,onProgress:setPullProgress}),[guard,refreshApp,appRefreshState.pending,budget.refreshPending,budget.status])
  const actualPlan: BudgetResponse['plan'] = budget.status === 'ready' ? budget.value.plan : null
  const sections = buildNavSections(fixture ? demoAccounts : actualPlan && actualPlan.format !== 'monthly-flow-encrypted-v1' ? budgetNavigation(actualPlan) : [])
  return (
    <InterfaceModeProvider key={scrollActor??'pending'} accountId={scrollActor??'pending'} hasPlan={fixture||!!actualPlan}><AppearanceContext.Provider value={dark}><NavSectionsProvider sections={sections}>
      <div className="household-shell flex min-h-screen font-sans">
        <Sidebar initialCollapsed={false} initialClosed={[]} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header budget={budget} refreshApp={refreshApp} refreshPending={appRefreshState.pending||guard.navigationPending}/>
          {!fixture&&budget.status==='ready'&&budget.value.vault&&<div className="border-b px-4 py-2 text-sm"><Link href={withViewQuery('/settings/security',search)} className="inline-flex min-h-11 items-center text-primary underline">מוצפן · פתוח במכשיר · נעילה ופרטיות</Link></div>}
          <main className="flex-1 p-4 pb-[calc(5.75rem+max(0.75rem,env(safe-area-inset-bottom)))] md:p-6">
            {!fixture&&budget.status==='ready'&&budget.value.vault&&pathname.startsWith('/upload')&&<p className="mb-4 rounded-xl border p-4 text-sm">הצפנת התקציב אינה מכסה את תיבת הדוחות: קובצי המקור והתקדמות הבדיקה נגישים לשרת לאחר אישור נפרד של בעל המרחב.</p>}
            {!accountChanged&&<><SavedReturnNotice scope={!fixture&&budget.status==='ready'?budget.value.accountId+'/'+budget.budgetId:''}/><HouseholdBack/></>}<div className="household-screen"><PageLoadBoundary resetKey={routeScopeKey+pathname+search}><Suspense fallback={<section className="surface rounded-xl p-6" role="status">טוען מסך…</section>}>
            {accountChanged ? <section className="household-page" role="status">מעדכנים את החשבון…</section> : !fixture && budget.status==='error' ? (
              <section className="household-page">
                <PageHeading>התקציב לא זמין</PageHeading>
                <div className="surface space-y-3 p-4">
                  <p role="alert">{budget.message}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="household-update" disabled={budget.refreshPending} onClick={()=>guard.run(budget.refresh)}>ניסיון חוזר</button>
                    {budgetId!=='personal'&&<Link href={householdSpaceHref(pathname,search,'personal')} className="household-update">לתקציב האישי</Link>}
                  </div>
                </div>
              </section>
            ) : !fixture && budget.status==='ready' && budget.value.plan?.format==='monthly-flow-encrypted-v1' ? <SecurityPage key={routeScopeKey} fixture={fixture} budget={budget}/> : <InterfaceModeBoundary><Routes key={routeScopeKey}>
              <Route path="/" element={<Dashboard fixture={fixture} budget={budget} />} />
              <Route path="/accounts" element={<HouseholdAccountsPage fixture={fixture} budget={budget}/>}/>
              <Route path="/checks" element={<ChequesPage fixture={fixture} budget={budget}/>}/>
              <Route path="/income" element={<IncomePlanningPage/>}/>
              <Route path="/notices" element={<StatementNoticesPage fixture={fixture} budget={budget}/>}/>
              <Route path="/notices/:id" element={<StatementNoticesPage fixture={fixture} budget={budget}/>}/>
              <Route path="/more" element={<HouseholdMore/>}/>
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
              <Route path="/accounts/:id/activity" element={<BankActivityPage key={budgetId + search} fixture={fixture} budget={budget} />} />
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
              <Route path="/loans/:id/payments" element={<LoanPaymentsPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/loans/:id/edit" element={<LoansPage key={budgetId + pathname + search} mode="edit" fixture={fixture} budget={budget} />} />
              <Route path="/loans/:id/remove" element={<LoansPage key={budgetId + pathname + search} mode="remove" fixture={fixture} budget={budget} />} />
              <Route path="/plans/scenario" element={<ScenarioPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/plans" element={<PlannedItemsPage key={budgetId + pathname + search} mode="list" fixture={fixture} budget={budget} />} />
              <Route path="/plans/new" element={<PlannedItemsPage key={budgetId + pathname + search} mode="new" fixture={fixture} budget={budget} />} />
              <Route path="/plans/:id/edit" element={<PlannedItemsPage key={budgetId + pathname + search} mode="edit" fixture={fixture} budget={budget} />} />
              <Route path="/plans/:id/remove" element={<PlannedItemsPage key={budgetId + pathname + search} mode="remove" fixture={fixture} budget={budget} />} />
              <Route path="/recurring" element={<RecurringPage key={budgetId} fixture={fixture} budget={budget} />} />
              <Route path="/settings/device-draft" element={<DeviceDraftPage fixture={fixture} budget={budget} />} />
              <Route path="/overview/transfers" element={<TransferMatchesPage fixture={fixture} budget={budget}/>} />
              <Route path="/overview/migration" element={<MigrationPage fixture={fixture} budget={budget}/>} />
              <Route path="/overview" element={<OverviewPage fixture={fixture} budget={budget}/>} />
              <Route path="/actions" element={<ActionCenterPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/settings/report-expectations" element={<ReportExpectationsPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/upload/history" element={<ReportHistoryPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/upload/history/:id/undo" element={<ReportHistoryPage key={budgetId + pathname + search} fixture={fixture} budget={budget} undo />} />
              <Route path="/upload/group" element={<ReportGroupPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/upload/:id/group" element={<ReportGroupPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/upload/:id/state" element={<ReportStatePage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/upload/:id/review" element={<ReportGroupPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/upload" element={<ReportLibraryPage key={budgetId} fixture={fixture} budget={budget} />} />
              <Route path="/incoming" element={<IncomingReportsPage fixture={fixture} budget={budget}/>} />
              <Route path="/categories" element={<ExpenseDetailsPage key={budgetId + search} mode="categories" fixture={fixture} budget={budget} />} />
              <Route path="/search" element={<ExpenseDetailsPage key={budgetId + search} mode="search" fixture={fixture} budget={budget} />} />
              <Route path="/details/:id/annotate" element={<DetailAnnotationPage key={budgetId + pathname + search} fixture={fixture} budget={budget} />} />
              <Route path="/details/:id" element={<ExpenseDetailsPage key={budgetId + search} mode="source" fixture={fixture} budget={budget} />} />
              <Route path="/settings/spaces" element={<SpacesPage key={budgetId} fixture={fixture} budget={budget} />} />
              <Route path="/analysis" element={<AnalysisPage fixture={fixture} budget={budget}/>} />
              <Route path="/settings/wallet" element={<WalletPage fixture={fixture} budget={budget}/>} />
              <Route path="/settings/gmail" element={<GmailPage fixture={fixture} budget={budget}/>} />
              <Route path="/settings/gmail/notices/:id" element={<GmailPage fixture={fixture} budget={budget}/>} />
              <Route path="/settings/access" element={<AdminAccessPage fixture={fixture} budget={budget}/>} />
              <Route path="/settings/drive" element={<DriveBackupPage fixture={fixture} budget={budget}/>} />
              <Route path="/settings/security" element={<SecurityPage fixture={fixture} budget={budget}/>} />
              <Route path="/settings/history" element={<HistoryPage key={budgetId} fixture={fixture} budget={budget} />} />
              <Route path="/settings/forecast" element={<ForecastSettingsPage key={budgetId} fixture={fixture} budget={budget}/>} />
              <Route path="/goals" element={<ComparisonGoalsPage key={budgetId} fixture={fixture} budget={budget}/>} />
              <Route path="/start" element={<OnboardingPage key={budgetId} fixture={fixture} budget={budget}/>} />
              <Route path="/settings/profile" element={<ProfilePage key={budgetId} fixture={fixture} budget={budget}/>} />
              <Route path="/settings" element={<div className="household-page"><PageHeading className="text-2xl font-semibold">הגדרות אפליקציה</PageHeading>{!fixture&&<SessionControls email={budget.status==='ready'?budget.value.accountEmail:undefined}/>}<InterfaceModeSelector/><InterfaceLayoutSetting/><ExistingWorkflowLinks/><label className="surface flex items-center gap-3 rounded-xl p-4">מראה <select className="rounded-lg border bg-card p-2" value={theme} onChange={event => { setTheme(event.target.value); try { localStorage.setItem('budgit-react-appearance', event.target.value) } catch { /* System appearance remains usable without storage. */ } }}><option value="system">מערכת</option><option value="light">בהיר</option><option value="dark">כהה</option></select></label><Link href={"/settings/history" + search} className="surface flex min-h-14 items-center rounded-xl p-4 text-primary underline">יומן שינויים וגיבוי</Link><Link href={"/settings/spaces" + search} className="surface flex min-h-14 items-center rounded-xl p-4 text-primary underline">המרחבים שלי ושיתוף</Link></div>} />
              <Route path="/about" element={<HelpPage budget={budget} />} />
              <Route path="*" element={<PendingPage title="העמוד אינו זמין" />} />
            </Routes></InterfaceModeBoundary>}
              <ScrollRestoration getKey={getScrollKey} storageKey="budgit-scroll-positions"/>
            </Suspense></PageLoadBoundary></div>
          </main>
        </div>
      </div>
      <HouseholdNavigation />
      <RefreshIndicator progress={pullProgress} pending={appRefreshState.pending||budget.refreshPending} hint={pullHint}/>
      {appRefreshState.error&&createPortal(<div role="alert" className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[100] mx-auto flex max-w-lg items-center gap-3 rounded-xl bg-foreground p-4 text-background shadow-2xl"><span className="min-w-0 flex-1">{appRefreshState.error} הנתונים והטיוטות נשארו פתוחים.</span><button type="button" className="shrink-0 rounded-lg border border-background/40 px-2 py-1" onClick={refreshApp}>ניסיון חוזר</button><button type="button" className="shrink-0 rounded-lg px-2 py-1" aria-label="סגירת הודעה" onClick={()=>setAppRefreshState({pending:false,error:null})}>סגירה</button></div>,document.body)}
      {budget.status === 'ready' && budget.refreshError && createPortal(
        <div role="alert" className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[100] mx-auto flex max-w-lg items-center gap-3 rounded-xl bg-foreground p-4 text-background shadow-2xl">
          <span className="min-w-0 flex-1">{budget.refreshError} הנתונים האחרונים נשארו מוצגים.</span>
          <button type="button" className="shrink-0 rounded-lg border border-background/40 px-2 py-1" onClick={()=>guard.run(budget.refresh)}>ניסיון חוזר</button>
          <button type="button" className="shrink-0 rounded-lg px-2 py-1" aria-label="סגירת הודעה" onClick={budget.dismissRefreshError}>סגירה</button>
        </div>, document.body
      )}
    </NavSectionsProvider></AppearanceContext.Provider></InterfaceModeProvider>
  )
}

const openingSearch=openingViewSearch(window.location.search,jerusalemMonth())
if(openingSearch!==window.location.search.slice(1))window.history.replaceState(window.history.state,'',window.location.pathname+(openingSearch?'?'+openingSearch:'')+window.location.hash)
const router = createBrowserRouter([{path:'*',element:<DraftGuardProvider><App /></DraftGuardProvider>}],{basename:'/next'})
createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>)
