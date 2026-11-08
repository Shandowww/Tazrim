import {useInterfaceMode} from './interface-mode'
import {modeAllows} from './interface-mode-model'
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
 ['/actions','התראות ותזכורות אישיות'],
 ['/notices','עדכוני בנקים ומנפיקים'],
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
const groups=[
 {label:'דוחות וניתוח',paths:['/analysis','/actions','/notices','/upload','/upload/history','/settings/report-expectations','/categories/manage','/categories/limits','/details/manage']},
 {label:'תכנון וחיסכון',paths:['/goals','/settings/forecast','/investment','/savings/schedule','/savings/transfers']},
 {label:'חשבונות ומרחבים',paths:['/overview','/overview/migration','/accounts/transfers','/accounts/assignments','/card-setup','/start']},
 {label:'פרטיות וגיבוי',paths:['/settings/security','/settings/device-draft','/settings/drive','/settings/gmail']},
 {label:'פרופיל וחיבורים נוספים',paths:['/settings/profile','/settings/access','/settings/wallet']},
]
export function ExistingWorkflowLinks(){
 const {search}=useLocation(),{mode}=useInterfaceMode()
 const visible=groups.map(group=>({...group,paths:group.paths.filter(path=>modeAllows(mode,path))})).filter(group=>group.paths.length)
 return <section className="surface household-bank"><h2 className="font-semibold">ניהול והגדרות נוספות</h2>{visible.map(group=><details key={group.label}><summary className="min-h-11 py-3 text-sm">{group.label}</summary><ul className="divide-y">{nativeWorkflows.filter(([path])=>group.paths.includes(path)).map(([path,label])=><li key={path}><Link className="flex min-h-11 items-center py-2 text-sm text-primary underline" href={withViewQuery(path,search,import.meta.env.DEV)}>{label}</Link></li>)}</ul></details>)}</section>
}
