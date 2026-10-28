import {useLocation} from 'react-router-dom'
import {legacyBudgetHref,withViewQuery} from './navigation-query'
import Link from './link'
const nativeWorkflows=[
 ['/upload','מרכז הדוחות והמקורות השמורים'],
 ['/upload/history','היסטוריית ייבוא בנק וביטול קליטה'],
 ['/savings/schedule','תכנון הפקדות חודשיות לחיסכון'],
 ['/savings/transfers','העברות חיסכון ואישור ביצוע'],
 ['/details/manage','ניהול צ׳קים ופירוט ידני'],
 ['/categories/limits','תקרות הוצאה לפי קטגוריה'],
 ['/card-setup','פרטי הכרטיסים'],
] as const
const workflows=[
 ['reports','אפשרויות נוספות במרכז הדוחות'],
 ['report-history','תיקונים וניהול היסטוריית המקור'],
 ['accounts','שיוך פריטים ואפשרויות נוספות לחשבונות'],
 ['savings','אפשרויות חיסכון נוספות'],
 ['security','הצפנה, נעילה ושחזור'],
 ['backups','גיבוי וייבוא תקציב'],
 ['overview','תמונה כוללת, התאמות ומעברי חשבונות'],
 ['details','מילון קטגוריות ואפשרויות פירוט נוספות'],
 ['connections','Apple Pay, Gmail וחיבורים נוספים'],
] as const
export function ExistingWorkflowLinks(){
 const {search}=useLocation()
 return <><section className="surface space-y-3 rounded-xl p-4"><h2 className="font-semibold">ניהול ודיווחים</h2><p className="text-sm text-muted-foreground">הפעולות נפתחות במרחב ובתקופה שנבחרו. הרשאת צפייה ועריכות שטרם נשמרו נשמרות גם במעבר.</p><ul className="divide-y">{nativeWorkflows.map(([path,label])=><li key={path}><Link className="flex min-h-11 items-center py-2 text-sm text-primary underline" href={withViewQuery(path,search)}>{label}</Link></li>)}</ul></section><section className="surface space-y-3 rounded-xl p-4"><h2 className="font-semibold">אפשרויות נוספות בממשק הקיים</h2><p className="text-sm text-muted-foreground">אפשרויות שעדיין לא חוברו לתצוגה החדשה נשארות זמינות כאן, במרחב ובתקופה שנבחרו. עריכות שעדיין לא נשמרו מוגנות לפני המעבר.</p><ul className="divide-y">{workflows.map(([view,label])=><li key={view}><a className="flex min-h-11 items-center py-2 text-sm text-primary underline" href={legacyBudgetHref(search,view)}>{label}</a></li>)}</ul></section></>
}
