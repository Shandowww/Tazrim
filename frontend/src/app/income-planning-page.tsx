import {PageHeading} from './page-heading'
import {useState} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import Link from './link'
import {periodFor} from './detail-period'
import {withViewQuery} from './navigation-query'
export function IncomePlanningPage(){
 const location=useLocation(),navigate=useNavigate(),period=periodFor(location.search),requested=period.year+'-'+(period.month||'01')
 const [month,setMonth]=useState(requested>=period.asOf?requested:period.asOf)
 const valid=/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)&&month>=period.asOf,href=(path:string)=>withViewQuery(path+(path.includes('?')?'&':'?')+'year='+month.slice(0,4)+'&month='+Number(month.slice(5)),location.search,import.meta.env.DEV)
 return <div className="household-page"><PageHeading>הכנסות עתידיות</PageHeading><label className="surface household-bank block text-sm">חודש לתכנון<input type="month" min={period.asOf} value={month} onChange={event=>{const next=event.target.value;setMonth(next);if(/^20\d{2}-(0[1-9]|1[0-2])$/.test(next))navigate(withViewQuery('/income?year='+next.slice(0,4)+'&month='+Number(next.slice(5)),location.search,import.meta.env.DEV),{replace:true,state:location.state})}} className="mt-2 min-h-11 w-full rounded-xl border bg-card px-3 text-base"/></label>{valid&&<section className="surface household-menu"><Link href={href('/monthly')}>הכנסה משוערת לחודש הזה<span aria-hidden>←</span></Link><Link href={href('/plans/new?kind=income')}>הכנסה חד־פעמית נוספת<span aria-hidden>←</span></Link><Link href={withViewQuery('/settings/forecast',location.search,import.meta.env.DEV)}>הערכות הבסיס<span aria-hidden>←</span></Link></section>}<p className="text-sm text-muted-foreground">הערכה חודשית והכנסה נוספת הן פעולות נפרדות. הכנסה עתידית אינה מסומנת כהכנסה שהתקבלה.</p><details className="surface household-bank text-sm"><summary>על מה מבוססת ההערכה?</summary><p className="pt-3 leading-relaxed text-muted-foreground">התחזית משתמשת בערכים השמורים לחודש. כשאין ערכים שמורים, המודל משתמש בערכי חודש קודם מתאים או בהערכות הבסיס. אין חישוב אוטומטי של ממוצע המשכורות. אפשר לערוך הערכה חודשית ולהוסיף הכנסה חד־פעמית בנפרד.</p></details></div>
}
