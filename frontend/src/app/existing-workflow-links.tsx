import {useLocation} from 'react-router-dom'
import {withViewQuery} from './navigation-query'
import Link from './link'
const nativeWorkflows=[
 ['/settings/access','ניהול כניסה לשרת · למנהל השרת'],
 ['/analysis','מדדי הוצאה, השוואה ותצוגות שמורות'],
 ['/settings/wallet','Apple Pay · חיבור האייפון ובדיקת הייבוא'],
 ['/settings/gmail','מצב Gmail ועדכוני בנק פרטיים'],
 ['/settings/drive','גיבוי חיצוני ב־Google Drive · למנהל השרת'],
 ['/overview/migration','סקירת מעבר רישום חשבון בין מרחבים'],
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
export function ExistingWorkflowLinks(){
 const {search}=useLocation()
 return <><section className="surface space-y-3 rounded-xl p-4"><h2 className="font-semibold">ניהול ודיווחים</h2><p className="text-sm text-muted-foreground">הפעולות נפתחות במרחב ובתקופה שנבחרו. הרשאת צפייה ועריכות שטרם נשמרו נשמרות גם במעבר.</p><ul className="divide-y">{nativeWorkflows.map(([path,label])=><li key={path}><Link className="flex min-h-11 items-center py-2 text-sm text-primary underline" href={withViewQuery(path,search)}>{label}</Link></li>)}</ul></section></>
}
