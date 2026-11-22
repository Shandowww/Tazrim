import {navigationLabels} from './navigation-sections.js'

/** Every secondary Budgit destination, grouped once for the compact navigation. */
export const toolGroups = [
  { title: 'תכנון', items: [
    ['/income', 'הכנסות עתידיות'],
    ['/monthly', 'עדכון חודשי'], ['/recurring', 'חיובים קבועים'],
    ['/loans', 'הלוואות'], ['/checks', 'צ׳קים'], ['/goals', 'יעדים חודשיים'],
    ['/settings/forecast', 'בסיס התחזית'], ['/investment', 'סימולציית השקעות'],
    ['/savings/schedule', 'הפקדות חודשיות'], ['/savings/transfers', 'העברות חיסכון'],
  ] },
  { title: 'דוחות וניתוח', items: [
    ['/incoming', navigationLabels.sync], ['/upload', navigationLabels.sources],
    ['/upload/history', 'היסטוריית קליטה'], ['/analysis', 'מדדים וניתוח מקורות'],
    ['/search', 'חיפוש בפירוט'], ['/actions', 'התראות ותזכורות'],
    ['/notices', 'עדכוני בנקים ומנפיקים'], ['/settings/report-expectations', 'דוחות צפויים'],
    ['/settings/purchase-notes', 'פתקי קנייה'],
    ['/details/manage', 'ניהול פירוט ידני'], ['/categories/manage', 'עריכת קטגוריות'],
    ['/categories/limits', 'תקרות הוצאה'],
  ] },
  { title: 'חשבונות ומרחבים', items: [
    ['/accounts/transfers', 'העברות בין חשבונות'],
    ['/accounts/assignments', 'שיוך תשלומים'], ['/card-setup', 'פרטי הכרטיסים'],
    ['/overview', 'תמונת מרחבים'], ['/overview/migration', 'מעבר בין מרחבים'],
    ['/settings/spaces', 'מרחבים ושיתוף'], ['/start', 'התחלה מודרכת'],
  ] },
  { title: 'פרטיות וגיבוי', items: [
    ['/settings/security', 'הצפנה, שחזור וייבוא'],
    ['/settings/device-draft', 'טיוטות במכשיר'],
    ['/settings/history', 'יומן שינויים וגיבוי'],
    ['/settings/drive', 'גיבוי Google Drive'],
    ['/settings/gmail', 'Gmail ועדכוני בנק'],
  ] },
  { title: 'פרופיל וחיבורים', items: [
    ['/settings/profile', 'הפרופיל שלי'],
    ['/settings/wallet', 'Apple Pay'],
    ['/settings/access', 'ניהול כניסה לשרת'],
  ] },
]
