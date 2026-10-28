import {useLocation} from 'react-router-dom'
import {legacyBudgetHref,withViewQuery} from './navigation-query'
import Link from './link'
const nativeWorkflows=[
 ['/goals','יעדים חודשיים והתקדמות מדיווחי אמת'],
 ['/settings/forecast','בסיס התחזית והערכות קבועות'],
 ['/start','התחלה מודרכת לתקציב חדש'],
 ['/settings/profile','שם לתצוגה וחשבון מחובר'],
 ['/overview','תמונה כוללת · חשבונות ומטרות'],
 ['/settings/device-draft','טיוטה שמורה במכשיר'],
 ['/settings/security','הצפנה, נעילה, שחזור וייבוא גיבוי'],
 ['/actions','לטיפול ותזכורות אישיות'],
 ['/upload','מרכז הדוחות והמקורות השמורים'],
 ['/settings/report-expectations','דוחות צפויים ומועדי הגעה'],
 ['/upload/history','היסטוריית ייבוא בנק וביטול קליטה'],
 ['/investment','סימולציית השקעות ויעד חודשי'],
 ['/savings/schedule','תכנון הפקדות חודשיות לחיסכון'],
 ['/savings/transfers','העברות חיסכון ואישור ביצוע'],
 ['/details/manage','ניהול צ׳קים ופירוט ידני'],
 ['/categories/manage','ניהול מילון הקטגוריות'],
 ['/categories/limits','תקרות הוצאה לפי קטגוריה'],
 ['/accounts/transfers','העברות בתכנון בין חשבונות עו״ש'],
 ['/accounts/assignments','שיוך כרטיסים והתחייבויות לחשבונות'],
 ['/card-setup','פרטי הכרטיסים'],
] as const
const workflows=[
 ['migration','סקירת מעבר חשבון וביצוע מוגן בממשק הקיים'],
 ['reports','אפשרויות נוספות במרכז הדוחות'],
 ['report-history','תיקונים וניהול היסטוריית המקור'],
 ['accounts','שיוך פריטים ואפשרויות נוספות לחשבונות'],
 ['savings','אפשרויות חיסכון נוספות'],
 ['backups','גיבוי וייבוא תקציב'],
 ['overview','תמונה כוללת, התאמות ומעברי חשבונות'],
 ['details','מילון קטגוריות ואפשרויות פירוט נוספות'],
 ['connections','Apple Pay וחיבורים נוספים'],
 ['gmail','סינון דוחות וחיבור Gmail בממשק הקיים'],
 ['appearance','סגנון וצבעי הממשק הקיים'],
] as const
export function ExistingWorkflowLinks(){
 const {search}=useLocation()
 return <><section className="surface space-y-3 rounded-xl p-4"><h2 className="font-semibold">ניהול ודיווחים</h2><p className="text-sm text-muted-foreground">הפעולות נפתחות במרחב ובתקופה שנבחרו. הרשאת צפייה ועריכות שטרם נשמרו נשמרות גם במעבר.</p><ul className="divide-y">{nativeWorkflows.map(([path,label])=><li key={path}><Link className="flex min-h-11 items-center py-2 text-sm text-primary underline" href={withViewQuery(path,search)}>{label}</Link></li>)}</ul></section><section className="surface space-y-3 rounded-xl p-4"><h2 className="font-semibold">אפשרויות נוספות בממשק הקיים</h2><p className="text-sm text-muted-foreground">אפשרויות שעדיין לא חוברו לתצוגה החדשה נשארות זמינות כאן, במרחב ובתקופה שנבחרו. עריכות שעדיין לא נשמרו מוגנות לפני המעבר.</p><ul className="divide-y">{workflows.map(([view,label])=><li key={view}><a className="flex min-h-11 items-center py-2 text-sm text-primary underline" href={legacyBudgetHref(search,view)}>{label}</a></li>)}</ul></section></>
}
