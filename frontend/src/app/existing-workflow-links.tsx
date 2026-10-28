import {useLocation} from 'react-router-dom'
import {legacyBudgetHref} from './navigation-query'
const workflows=[
 ['reports','מרכז הדוחות וקבוצות שמורות'],
 ['report-history','היסטוריית דוחות וביטול קליטה'],
 ['accounts','חשבונות, כרטיסים ודיווחים קיימים'],
 ['savings','העברות בין מטרות ולוחות הפקדה'],
 ['security','הצפנה, נעילה ושחזור'],
 ['backups','גיבוי וייבוא תקציב'],
 ['overview','תמונה כוללת, התאמות ומעברי חשבונות'],
 ['details','עריכת פירוט הוצאות וצ׳קים'],
 ['connections','Apple Pay, Gmail וחיבורים נוספים'],
] as const
export function ExistingWorkflowLinks(){
 const {search}=useLocation()
 return <section className="surface space-y-3 rounded-xl p-4"><h2 className="font-semibold">פעולות נוספות</h2><p className="text-sm text-muted-foreground">הפעולות האלה נפתחות בממשק הקיים, במרחב ובתקופה שנבחרו. עריכות שעדיין לא נשמרו מוגנות לפני המעבר.</p><ul className="divide-y">{workflows.map(([view,label])=><li key={view}><a className="flex min-h-11 items-center py-2 text-sm text-primary underline" href={legacyBudgetHref(search,view)}>{label}</a></li>)}</ul></section>
}
