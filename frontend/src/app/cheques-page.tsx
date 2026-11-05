import {useLocation} from 'react-router-dom'
import {chequeRegister} from './commitment-summary'
import {periodFor} from './detail-period'
import {withViewQuery} from './navigation-query'
import {demoHouseholdPlan} from './demo-fixture'
import type {BudgetState} from './use-budget'
import Link from './link'
const money=(c:number)=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).format(c/100)
export function ChequesPage({budget,fixture}:{budget:BudgetState;fixture:boolean}){
 const location=useLocation(),period=periodFor(location.search),href=(path:string)=>withViewQuery(path,location.search,import.meta.env.DEV)
 if(!fixture&&budget.status==='loading')return <p role="status">טוען צ׳קים…</p>
 if(!fixture&&budget.status==='error')return <p role="alert">{budget.message}</p>
 const plan=fixture?demoHouseholdPlan:budget.status==='ready'?budget.value.plan:null,viewer=fixture||budget.status==='ready'&&budget.spaces.find(s=>s.id===budget.budgetId)?.role==='viewer'
 if(!plan||('format' in plan&&plan.format))return <section className="surface household-empty"><p>יש לפתוח תקציב כדי להציג צ׳קים.</p><Link className="household-back" href={href(plan?'/settings/security':'/upload')}>{plan?'פתיחת התקציב':'התחלה מדוח'}</Link></section>
 const register=chequeRegister(plan,period)
 const groups=[['pending','טרם נפרעו · כל המועדים'],['cleared','נפרעו בתקופה הנבחרת'],['cancelled','בוטלו בתקופה הנבחרת']] as const
 return <div className="household-page"><div className="household-title"><h1>צ׳קים</h1>{!viewer&&<Link className="household-update" href={href('/details/new')}>הוספת צ׳ק</Link>}</div>{groups.map(([status,title])=><section className="surface household-bank" key={status}><div className="household-title"><h2>{title}</h2><span>{register[status].count}</span></div><p className="household-detail-note">סכום כולל <bdi>{money(register[status].totalCents)}</bdi></p>{!register[status].count&&<p className="household-detail-note">אין צ׳קים בקבוצה זו.</p>}{register[status].rows.map((row:{id:string;name:string;amount:number;date:string;number:string;category:string;accounting:string;payer:{label:string}|null})=><details key={row.id} className="household-cheque"><summary><strong><bdi>{row.name}</bdi></strong><bdi>{money(Math.round(row.amount*100))}</bdi><small><bdi>{row.date}</bdi> · {row.number?'מס׳ '+row.number:'ללא מספר'}</small></summary><p className="household-detail-note">{row.accounting==='included'?'כלול בסך החודשי':'נוסף לתחזית'} · {row.payer?.label??'ללא שיוך לחשבון'}</p><p className="household-detail-note"><bdi>{row.category}</bdi></p>{!viewer&&<nav className="household-account-actions"><Link href={href('/details/'+encodeURIComponent(row.id)+'/edit')}>עריכה או ביטול</Link>{status==='pending'&&<Link href={href('/details/'+encodeURIComponent(row.id)+'/clear')}>סימון כנפרע</Link>}<Link href={href('/details/'+encodeURIComponent(row.id)+'/delete')}>מחיקה ובדיקת ההשפעה</Link>{!row.payer&&row.accounting==='additional'&&<Link href={href('/accounts/assignments')}>שיוך חשבון משלם</Link>}</nav>}</details>)}</section>)}<Link className="household-back" href={href('/details/manage')}>פירוט ידני ופעולות נוספות</Link></div>
}
