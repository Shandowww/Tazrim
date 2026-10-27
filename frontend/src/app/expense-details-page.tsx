import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { FormEvent } from 'react'
import Link from './link'
import { budgetDetailView, budgetDetailSource, detailSearchResults } from './detail-adapter'
import { legacyBudgetHref } from './navigation-query'
import { CategoryDonut } from '../tazrim/components/cards/category-donut'
import { SearchResultList } from '../tazrim/components/search/search-result-list'
import { formatCurrency } from '../tazrim/lib/utils/currency'
import type { useBudget } from './use-budget'
import { demoDetailPlan } from './demo-fixture'

function periodFor(search: string) {
  const query = new URLSearchParams(search)
  const now = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const asOf = `${now.find(p => p.type === 'year')!.value}-${now.find(p => p.type === 'month')!.value}`
  return { year: /^20\d{2}$/.test(query.get('year') || '') ? query.get('year')! : asOf.slice(0, 4), month: /^(?:[1-9]|1[0-2]|0[1-9])$/.test(query.get('month') || '') ? String(Number(query.get('month'))).padStart(2, '0') : '', asOf,
    account: query.get('account') || '', card: query.get('card') || '', category: query.get('category') || '', query: query.get('query') || '' }
}

export function ExpenseDetailsPage({ mode, fixture, budget }: { mode: 'categories' | 'search' | 'source'; fixture: boolean; budget: ReturnType<typeof useBudget> }) {
  const { search } = useLocation(), navigate = useNavigate(), { id } = useParams(), params = new URLSearchParams(search)
  const editorHref = legacyBudgetHref(search), options = periodFor(search)
  if (!fixture && budget.status === 'loading') return <section className="surface rounded-xl p-6" role="status">טוען פירוט…</section>
  if (!fixture && budget.status === 'error') return <section className="surface rounded-xl p-6" role="alert">{budget.message}</section>
  const plan: Record<string, unknown> | null = fixture ? demoDetailPlan : budget.status === 'ready' ? budget.value.plan : null
  if (!plan || plan.format === 'monthly-flow-encrypted-v1') return <section className="surface rounded-xl p-6">{plan ? 'התקציב מוצפן.' : 'עדיין אין תקציב שמור.'} <a href={editorHref} className="text-primary underline">פתיחה בממשק הקיים</a></section>
  let view: ReturnType<typeof budgetDetailView>
  let source: ReturnType<typeof budgetDetailSource> = null
  try {
    view = budgetDetailView(plan, options)
    if (mode === 'source') source = budgetDetailSource(plan, id || '', options)
  } catch {
    return <section className="surface rounded-xl p-6" role="alert">הפירוט או המסננים אינם זמינים במרחב ובתקופה האלה. <a href={editorHref} className="text-primary underline">פתיחת התקציב בממשק הקיים</a></section>
  }
  const href = (path: string, changes: Record<string, string | null> = {}) => {
    const next = new URLSearchParams(search)
    for (const [key, value] of Object.entries(changes)) { if (value === null) next.delete(key); else next.set(key, value) }
    return path + (next.size ? '?' + next : '')
  }
  const back = params.get('from') === 'search' ? '/search' : '/categories'
  if (mode === 'source') {
    if (!source) return <section className="surface rounded-xl p-6" role="alert">הרשומה אינה זמינה במרחב ובתקופה האלה. <Link className="text-primary underline" href={href(back, { from: null })}>חזרה לפירוט</Link></section>
    const raw = source.source, statement = raw.statement
    return <div className="mx-auto max-w-5xl space-y-5">
      <Link className="text-primary underline" href={href(back, { from: null })}>חזרה לפירוט</Link>
      <h1 className="text-2xl font-semibold">הרשומה המקורית שנשמרה</h1>
      {fixture && <p className="text-sm text-muted-foreground">נתוני דוגמה בלבד</p>}
      <section className="surface rounded-xl p-5 space-y-3"><h2 className="font-semibold"><bdi>{raw.name}</bdi></h2>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt>סכום מקורי שנשמר</dt><dd><bdi dir="ltr">{formatCurrency(raw.amountCents / 100)}</bdi></dd>
          <dt>תאריך רכישה</dt><dd><bdi dir="ltr">{raw.date}</bdi></dd><dt>חודש חיוב</dt><dd><bdi dir="ltr">{raw.month}</bdi></dd>
          <dt>רישום בסיכום החודש</dt><dd>{raw.accounting === 'included' ? 'כלול בסכומים החודשיים' : 'פריט נוסף לפי הכללים הקיימים'}</dd>
          <dt>מקור</dt><dd>{statement ? 'שורת דוח שנקלטה' : 'פירוט שמור ללא מסמך מקור'}</dd>
          {statement && <><dt>מנפיק בדוח</dt><dd><bdi>{statement.issuer === 'cal' ? 'כאל' : 'ישראכרט'}</bdi></dd><dt>מועד חיוב בדוח</dt><dd><bdi dir="ltr">{statement.dueDate}</bdi></dd>
            <dt>סכום עסקה מקורי בדוח</dt><dd><bdi dir="ltr">{formatCurrency(statement.originalCents / 100)}</bdi></dd>
            {statement.foreignCents !== undefined && <><dt>סכום במטבע מקור</dt><dd><bdi dir="ltr">{(statement.foreignCents / 100).toFixed(2)} {statement.originalCurrency || ''}</bdi></dd></>}
            {statement.page && <><dt>עמוד בדוח</dt><dd><bdi>{statement.page}</bdi></dd></>}
          </>}
        </dl>{statement?.notes && <p className="text-sm break-words"><bdi>{statement.notes}</bdi></p>}
        {source.row.split && <p className="text-sm text-muted-foreground">הרשומה פוצלה לצורך ניתוח. הסכום של החלק שנבחר הוא <bdi dir="ltr">{formatCurrency(source.row.cents / 100)}</bdi>; הסכום המקורי מוצג כאן בנפרד ואינו נוסף אליו.</p>}
      </section><p className="text-sm text-muted-foreground">אלה השדות שנשמרו בעת הקליטה, ללא טעינה או העברה של הקובץ המקורי. זו תצוגה לקריאה בלבד.</p>
    </div>
  }
  const page = Math.max(1, Math.min(Math.ceil(view.rows.length / 50) || 1, Math.floor(Number(params.get('page')) || 1))), shown = view.rows.slice((page - 1) * 50, page * 50)
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); navigate(href('/' + mode, { query: String(data.get('query') || '').trim() || null, page: null })) }
  return <div className="mx-auto max-w-7xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{mode === 'search' ? 'חיפוש בפירוט שנפרע' : 'קטגוריות ופירוט'}</h1><Link className="text-primary underline text-sm" href={href(mode === 'search' ? '/categories' : '/search', { page: null })}>{mode === 'search' ? 'פתיחת הקטגוריות' : 'חיפוש בפירוט'}</Link></div>
    {fixture && <p className="text-sm text-muted-foreground">נתוני דוגמה בלבד</p>}
    <p className="text-sm text-muted-foreground">פירוט שנפרע במרחב ובתקופת החיוב שנבחרו בלבד. החיפוש לפי שם בית העסק המוצג; הוא אינו מחפש בכל תנועות הבנק או בקבצים. תאריכי השורות הם תאריכי הרכישה.</p>
    <form key={budget.budgetId + options.query} onSubmit={submit} className="surface flex flex-wrap gap-3 rounded-xl p-4"><label className="flex-1 min-w-0 text-sm">שם בית עסק<input name="query" type="search" maxLength={80} defaultValue={options.query} className="mt-1 w-full rounded-lg border bg-card px-3 py-2" /></label><button className="self-end rounded-lg border px-4 py-2 text-sm" type="submit">חיפוש</button></form>
    {(options.category || options.account || options.card) && <div className="text-sm">מסננים פעילים: <bdi>{options.category || ''}</bdi>{options.account && ' · חשבון נבחר'}{options.card && ' · כרטיס נבחר'} · <Link className="text-primary underline" href={href('/' + mode, { category: null, account: null, card: null, page: null })}>ניקוי מסננים</Link></div>}
    <section className="surface rounded-xl p-5"><h2 className="font-semibold">סיכום הפירוט המסונן</h2><dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3"><div><dt className="text-sm text-muted-foreground">רכישות מפורטות</dt><dd><bdi dir="ltr">{view.rows.length ? formatCurrency(view.purchasesCents / 100) : 'אין פירוט'}</bdi></dd></div><div><dt className="text-sm text-muted-foreground">זיכויים מפורטים</dt><dd><bdi dir="ltr">{view.rows.length ? formatCurrency(view.refundsCents === 0 ? 0 : -view.refundsCents / 100) : 'אין פירוט'}</bdi></dd></div><div><dt className="text-sm text-muted-foreground">נטו בפירוט</dt><dd><bdi dir="ltr">{view.valueCents === null ? 'אין פירוט' : formatCurrency(view.valueCents / 100)}</bdi></dd></div></dl><p className="mt-3 text-sm text-muted-foreground">{view.coverage.explanation} אין כאן הוכחת כיסוי מלא או הוצאה נוספת על סיכום החודש.{view.coverage.pendingCount ? (view.coverage.pendingCount === 1 ? ' רשומה ממתינה אחת אינה כלולה בסיכום הזה.' : ` ${view.coverage.pendingCount} רשומות ממתינות אינן כלולות בסיכום הזה.`) : ''}</p></section>
    {mode === 'categories' && <CategoryDonut pagePath="/categories" data={view.positiveCategories} selectedCategory={options.category} title="רכישות חיוביות בפירוט לפי קטגוריה" emptyText="אין רכישות חיוביות מפורטות לתקופה זו" />}
    {mode === 'categories' && view.categories.length > 0 && <section className="surface rounded-xl p-5"><h2 className="font-semibold">נטו לפי קטגוריה, אחרי זיכויים</h2><ul className="mt-3 divide-y">{view.categories.map(row => <li key={row.category}><Link className="flex items-center justify-between gap-3 py-3 text-sm" href={href('/categories', { category: options.category === row.category ? null : row.category, page: null })}><bdi>{row.category}</bdi><bdi dir="ltr">{formatCurrency(row.cents / 100)}</bdi></Link></li>)}</ul><p className="mt-2 text-sm text-muted-foreground">התרשים מציג רכישות חיוביות בלבד; הרשימה הזו שומרת גם קטגוריות עם זיכוי נטו.</p></section>}
    <section className="surface rounded-xl p-4 sm:p-6"><h2 className="font-semibold">הרשומות השמורות</h2><p className="text-sm text-muted-foreground" role="status">{view.rows.length === 1 ? 'רשומה אחת' : `${view.rows.length} רשומות`} · עמוד {page} מתוך {Math.ceil(view.rows.length / 50) || 1}</p>{shown.length ? <SearchResultList results={detailSearchResults(plan, shown)} terms={options.query ? [options.query] : []} /> : <p className="py-8 text-sm text-muted-foreground">אין פירוט שנפרע התואם לתקופה ולמסננים. חוסר פירוט אינו אפס.</p>}
      {view.rows.length > 50 && <nav className="mt-4 flex gap-4" aria-label="עמודי פירוט">{page > 1 && <Link className="text-primary underline" href={href('/' + mode, { page: String(page - 1) })}>העמוד הקודם</Link>}{page * 50 < view.rows.length && <Link className="text-primary underline" href={href('/' + mode, { page: String(page + 1) })}>העמוד הבא</Link>}</nav>}
    </section>
    {!fixture && <p className="text-sm text-muted-foreground">תצוגה לקריאה בלבד. <a href={editorHref} className="text-primary underline">עריכה בממשק הקיים</a></p>}
  </div>
}
