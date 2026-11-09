import {PageHeading} from './page-heading'
import {useLocation,useParams, useNavigate} from 'react-router-dom'
import {bankActivityView} from './bank-activity-read'
import {periodFor} from './detail-period'
import {withViewQuery} from './navigation-query'
import {demoHouseholdPlan} from './demo-fixture'
import type {useBudget} from './use-budget'
import Link from './link'
import BackLink from './back-link'
import {formatCurrency} from '../tazrim/lib/utils/currency'

export function BankActivityPage({fixture,budget}:{fixture:boolean;budget:ReturnType<typeof useBudget>}) {
 const {id=''}=useParams(),{search}=useLocation(),navigate=useNavigate(),options=periodFor(search),params=new URLSearchParams(search)
 const href=(path:string)=>withViewQuery(path,search)
 if(!fixture&&budget.status==='loading')return <p role="status">טוען תנועות…</p>
 if(!fixture&&budget.status==='error')return <p role="alert">{budget.message}</p>
 const plan:Record<string,unknown>|null=fixture?demoHouseholdPlan:budget.status==='ready'?budget.value.plan:null
 if(!plan||plan.format==='monthly-flow-encrypted-v1')return <p>{plan?'יש לפתוח את התקציב המוצפן כדי להציג תנועות.':'עדיין אין תקציב שמור.'} <Link className="text-primary underline" href={href('/settings/security')}>אבטחה ופתיחת התקציב</Link></p>
 let view:ReturnType<typeof bankActivityView>
 try{view=bankActivityView(plan,id,options)}catch(e){return <p role="alert">{e instanceof Error?e.message:'לא ניתן להציג את התנועות.'}</p>}
 const pages=Math.max(1,Math.ceil(view.rows.length/50)),page=Math.min(pages,Math.max(1,Math.floor(Number(params.get('page'))||1))),rows=view.rows.slice((page-1)*50,page*50)
 const pageHref=(number:number)=>{const next=new URLSearchParams(search);next.set('page',String(number));return '?'+next}
 const money=(cents:number)=><bdi dir="ltr">{formatCurrency(cents/100)}</bdi>
 return <div className="mx-auto max-w-5xl space-y-5">
  <BackLink href={href('/accounts')}>חזרה לחשבונות</BackLink>
  <PageHeading className="text-2xl font-semibold">תנועות החשבון · <bdi>{view.account.label}</bdi></PageHeading>
  {fixture&&<p>נתוני דוגמה בלבד</p>}
  <p className="text-sm text-muted-foreground">תנועות שנשמרו מדוחות הבנק בתקופה שנבחרה, כולל כניסות, יציאות, חיובי כרטיס והעברות. הן מוצגות לקריאה ואינן מתווספות שוב לסיכום התקציב.</p>
  <form className="surface flex flex-wrap items-end gap-3 rounded-xl p-4" onSubmit={event=>{event.preventDefault();const next=new URLSearchParams(search);const value=String(new FormData(event.currentTarget).get('query')||'').trim();if(value)next.set('query',value);else next.delete('query');next.delete('page');navigate('?'+next)}}>
   <label className="min-w-0 flex-1 text-sm">חיפוש בתנועות<input key={options.query} name="query" type="search" maxLength={80} defaultValue={options.query} className="mt-1 min-h-11 w-full rounded-lg border bg-card px-3"/></label><button className="min-h-11 rounded-lg border px-4">חיפוש</button>
  </form>
  <section className="surface space-y-3 rounded-xl p-5"><h2 className="font-semibold">סיכום התנועות המוצגות</h2><dl className="grid gap-3 sm:grid-cols-3"><div><dt>יציאות</dt><dd>{view.rows.length?money(view.debitCents):'אין תנועות'}</dd></div><div><dt>כניסות</dt><dd>{view.rows.length?money(view.creditCents):'אין תנועות'}</dd></div><div><dt>שינוי נטו</dt><dd>{view.rows.length?money(view.netCents):'אין תנועות'}</dd></div></dl><p className="text-sm text-muted-foreground">זהו סיכום של התנועות השמורות בלבד, ולא יתרת החשבון או סך הרכישות. דוח חלקי אינו מכסה בהכרח את כל החודש.</p></section>
  <section className="surface rounded-xl p-4 sm:p-6"><h2 className="font-semibold">התנועות השמורות</h2><p role="status" className="text-sm text-muted-foreground">{view.rows.length} תנועות · עמוד {page} מתוך {pages}</p>
   {rows.length?<ul className="divide-y">{rows.map((row:any)=><li key={row.key} className="min-w-0 space-y-2 break-words py-4"><div className="flex flex-wrap justify-between gap-2"><strong><bdi>{row.source?.description||'תנועה ללא תיאור שמור'}</bdi></strong>{money(row.cents)}</div><p className="text-sm text-muted-foreground"><bdi dir="ltr">{row.source?.date||row.month}</bdi> · <bdi>{row.label}</bdi>{row.cents<0?' · יציאה':row.cents>0?' · כניסה':''}</p>{row.source?.details&&<p className="text-sm"><bdi>{row.source.details}</bdi></p>}{!row.source&&<p className="text-sm text-muted-foreground">פרטי המקור לא נשמרו בקליטה הישנה.</p>}</li>)}</ul>:<p className="py-6 text-sm text-muted-foreground">{view.totalCount?'אין תנועות התואמות לחיפוש.':'לא נשמרו תנועות בנק לחשבון בתקופה הזו. יתרה או סיכום חודשי יכולים להיות שמורים גם ללא שורות הדוח.'}</p>}
   {pages>1&&<nav className="flex flex-wrap gap-4" aria-label="עמודי תנועות">{page>1&&<Link className="inline-flex min-h-11 items-center text-primary underline" href={pageHref(page-1)}>העמוד הקודם</Link>}{page<pages&&<Link className="inline-flex min-h-11 items-center text-primary underline" href={pageHref(page+1)}>העמוד הבא</Link>}</nav>}
  </section>
  <Link className="inline-flex min-h-11 items-center text-primary underline" href={href('/categories?account='+encodeURIComponent(id))}>פירוט הוצאות וקטגוריות של החשבון</Link>
 </div>
}
