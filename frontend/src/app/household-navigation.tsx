import {useLocation} from 'react-router-dom'
import {House,Landmark,Target,Ellipsis,ChevronRight} from 'lucide-react'
import Link from './link'
import {withViewQuery} from './navigation-query'
import {mainPages,returnDestination,householdTrail,householdFallback} from './household-model'
export function HouseholdBack(){
 const location=useLocation()
 if(mainPages.includes(location.pathname))return null
 const fallback=householdFallback(location.pathname,location.search)
 const trail=householdTrail(location.state,location.search)
 const target=returnDestination(trail.at(-1)??withViewQuery(fallback,location.search),location.search)
 return <Link className="household-back" replace state={{householdTrail:trail.slice(0,-1)}} href={withViewQuery(target,location.search,import.meta.env.DEV)}><ChevronRight size={18}/>חזרה</Link>
}
export function HouseholdNavigation(){
 const {pathname,search}=useLocation()
 const section=pathname==='/'?'/':/^\/(accounts|banks|cards|card-setup)(\/|$)/.test(pathname)?'/accounts':/^\/(savings|investment)(\/|$)/.test(pathname)?'/savings':'/more'
 return <nav className="household-tabs md:hidden" aria-label="ניווט ראשי">{[['/','תמונה כללית',House],['/accounts','חשבונות',Landmark],['/savings','מטרות',Target],['/more','עוד',Ellipsis]].map(([href,label,Icon]:any)=><Link key={href} href={withViewQuery(href,search,import.meta.env.DEV)} aria-current={section===href?'page':undefined}><Icon size={21}/><span>{label}</span></Link>)}</nav>
}
const groups=[['תכנון',[['/plans/scenario','מחשבון רכישה'],['/income','הכנסות עתידיות'],['/monthly','עדכון חודשי'],['/plans','רכישות והכנסות מתוכננות'],['/recurring','חיובים קבועים'],['/loans','הלוואות'],['/checks','צ׳קים']]],['דוחות וניתוח',[['/upload','דוחות ומקורות'],['/upload/history','היסטוריית קליטה'],['/categories','הוצאות לפי קטגוריות'],['/analysis','ניתוח וסקירות'],['/search','חיפוש בפירוט'],['/investment','השקעות'],['/actions','מרכז פעולות']]],['חשבונות והגדרות',[['/accounts','חשבונות'],['/accounts/transfers','העברות'],['/accounts/assignments','שיוך תשלומים'],['/overview','תמונת מרחבים'],['/settings/spaces','מרחבים ושיתוף'],['/settings','הגדרות'],['/about','עזרה']]]]
export function HouseholdMore(){const location=useLocation();return <div className="household-page"><h1>עוד</h1>{groups.map(([title,links]:any)=><section className="surface household-menu" key={title}><h2>{title}</h2>{links.map(([path,label]:string[])=><Link key={path} href={withViewQuery(path,location.search,import.meta.env.DEV)} state={{householdFrom:location.pathname+location.search}}>{label}<span aria-hidden>←</span></Link>)}</section>)}</div>}
