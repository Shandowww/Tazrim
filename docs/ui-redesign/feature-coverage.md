# מפת כיסוי האב־טיפוס — 3.11.2026

מטרת ההצעה: לפשט את Budgit בלי לוותר על היכולות הקיימות. זו מפת עיצוב וחיבור, לא אישור פרסום או רשימת יכולות שהוסרו מהאפליקציה. מקור שנבדק: ענף `codex/tazrim-react-frontend`, נקודה `5acbeac`, במיקום `/Users/talshandor/.codex/worktrees/tazrim-react-frontend/monthly-flow`. גרסת הייצור לא אומתה מחדש בבדיקה זו.

## החלטות שהאב־טיפוס מדגים

- [x] הבית מציג שישה חודשים מדווחים; התחזיות נמצאות בכלי התכנון.
- [x] קיצורי הבית הם צ׳קים, הלוואות ומחשבון. מטרות נשארות בטאב הראשי בלבד.
- [x] המחשבון נגיש גם מתפריט עוד.
- [x] מסכי פירוט נפתחים עם חזרה למקור ובלי לסמן טאב חשבונות בזמן שמוצג תוכן אחר.
- [x] הזנת צ׳ק, הלוואה והכנסה עתידית מודגמת במסכים ייעודיים.
- [x] מחשבון הדוגמה מציג מחיר, מספר תשלומים, חודש ראשון, רף ביטחון ויתרות לפני/אחרי בכל חודש. הוא בוחן פריסה של 1–60 תשלומים לפי הנחות הדוגמה בלבד.
- [x] הסכומים העתידיים שהוזנו בדוגמה משויכים למרחב שנבחר ומשפיעים על מחשבון הדוגמה.
- [x] הלוואות מוצגות כלוח החזרים. סך ההחזרים שנותרו אינו מוצג כיתרת קרן.

## מה קיים במקור, ומה עדיין צריך לקבל מקום בעיצוב המלא

הטבלה הבאה מגדירה את הכיסוי הנדרש. מצב החיבור המעודכן מופיע בטבלת הביצוע בהמשך; קישור או הדגמה מקומית אינם השלמה של קבלת הפיצ׳ר באפליקציה.

| תחום קיים | מצב באב־טיפוס | יעד בהצעה המלאה / תנאי קבלה |
|---|---|---|
| מחשבון וניסוי רכישות | רכישה אחת עם חישוב מדגים | מחשבון: המנוע המקורי, עד 12 רכישות, שינוי פריט קיים, חשבון משלם וכרטיס, פריסה 1–60, שמירה מפורשת לתכנון וגיבוי. בלי ספירה כפולה. |
| הכנסה עתידית, תכנון חודשי והנחות | שינוי ידני לחודש והכנסה חד־פעמית בדוגמה | עוד → הכנסות ותכנון: הערכות קבועות, שינוי חודשי, הכנסה חד־פעמית, חשבון מקבל והבחנה בין משכורת להעברה נכנסת. |
| צ׳קים ופירוט ידני | הוספת צ׳ק עתידי, מספר, תאריך, סכום וקטגוריה | צ׳קים: רשימה, ספירה וסכומים, עריכה/מחיקה/ביטול/פירעון, שייכות לחשבון והבחנה בין פירוט הכלול בסך מדווח לבין תשלום נוסף. אין לחייב פעמיים בפירעון. |
| הלוואות ומעקב החזרים | לוח והוספת הלוואה עתידית בדוגמה | הלוואות: התחלה אמיתית כולל עבר, מספר ההחזרים הכולל, עריכה/הסרה מהתכנון, שיוך תשלומי דוחות ומעקב. דיווחי אמת נשמרים. אין חישוב ריבית או יתרת קרן. |
| רכישות ותשלומים קיימים, קבועות והוצאות תקופתיות | לא הושלם | עוד → תכנון והתחייבויות: ניהול הפריטים והתזמונים המקוריים, לא רק יצירת רכישה חדשה. |
| דוחות ומקורות | תהליך דמה של קובץ אחד | עדכון / עוד → דוחות: קבצים אמיתיים, מספר קבצים, בדיקה, סיווג אופציונלי, מניעת כפילויות, שמירת התקדמות והמשך, היסטוריה, תיקון וביטול מותר. |
| בנקים וכרטיסים | קרוסלה ויתרות מדומות | חשבונות: הוספה ועריכה, שיוך חשבון משלם, תיקון חיוב, דיווח חוסר פעילות והפסקת הערכות. שמירת הלוגואים, ההקשר והמקורות. |
| קטגוריות וניתוח | צבעים קבועים וסכומי דוגמה | פירוט: סיווג מקור, פיצולים/תגים/בתי עסק, חיפוש, מגבלות קטגוריה, חריגות והבחנה בין נתונים חלקיים למלאים. אין להציג סכום ללא פירוט כמסווג. |
| חיסכון ומטרות | יעד אחד ותצוגת התקדמות | מטרות: הוספה/עריכה, יתרות, חלוקה בין יעדים, הפקדות בפועל, לוחות הפקדה, בקשות והשלמתן, קצב ומועד יעד, חשבונות מימון. |
| השקעות | לא הוצג | מטרות / עוד: הפקדות מדווחות ומחשבון הצמיחה הקיים. תשואה משוערת אינה הישג שהושלם. |
| העברות ושיוך תשלומים | לא הוצג | חשבונות: העברות פנימיות, סכומים ללא שיוך, חשבון משלם והתאמות פרטיות. העברה למשותף אינה משכורת חדשה. |
| מרחבים, הזמנות והרשאות | החלפת דמות ומרחב לצורך הדגמה | עוד → מרחבים: הזמנות, עורך/צופה, ביטול גישה, תמונת מרחבים מורשים ומעברי חשבונות מוגנים. הבחירה בדמות אינה תחליף לאימות משתמש. |
| תזכורות ומרכז פעולות | לא הוצג | מרכז פעולות קומפקטי: דוחות חסרים, הגדרות מועדים, דחייה והעדפות אישיות. |
| גיבוי, שחזור, היסטוריה ואבטחה | לא הוצג | עוד → הגדרות: ייצוא/ייבוא, היסטוריה וביטול מותר, הצפנה, נעילה ושחזור, טיוטות, Drive וחיבורי Gmail הקיימים. |
| פרופיל, עזרה וניהול גישה | מראה בלבד | עוד → הגדרות: פרופיל, עזרה, חשבון מחובר, יציאה וניהול הגישה המתאים לתפקיד. |
| אמינות ושימושיות | בדיקות לוגיקת הדגמה בלבד | בכל המסכים: הגנת טיוטות, שמירה מפורשת, התנגשויות, כשל ורענון, RTL, נגישות, טלפון, מראה מערכת ושימור ההקשר. |

## מיפוי ביצוע — 3.11.2026

כל 16 התחומים ממופים להלן. הקבצים הם תחת `frontend/src/app/`, והבדיקות תחת `test/` עם הסיומת `.test.mjs`. הבדיקות נכללות בהרצה המלאה: 1,148 עברו. ״נשמר״ פירושו חיבור קיים שנשמר ונבדק בקוד/API; הוא אינו קבלת דפדפן חדשה. כל 90 נתיבי הבסיס נשארו, נוספו ארבעה; 26 יעדי ההגדרות רשומים בדיוק פעם אחת. ראו `settings-route-audit.json`.

| תחום | יעד חדש | רכיב | בדיקות מייצגות שעברו | מצב ומגבלה |
|---|---|---|---|---|
| מחשבון | `/plans/scenario` | scenario-page, scenario-comparison | household-scenario, tazrim-scenario-command, tazrim-scenario-save | מנוע מקורי; השוואת חשבון לפני/אחרי; קבלת טופס וחזרה פתוחה |
| הכנסות ותכנון | `/income`, `/monthly`, `/accounts/:id/monthly`, `/settings/forecast`, `/plans/new?kind=income` | income-planning-page, monthly-page, cash-monthly-page, forecast-settings-page | household-scenario, tazrim-cash-monthly, tazrim-monthly-report, tazrim-forecast-settings | חובר; אין ממוצע חדש; תצוגה ושמירה בדפדפן פתוחות |
| צ׳קים ופירוט | `/checks`, `/details/manage`, `/details/{new,:id/edit,:id/delete,:id/clear}` | cheques-page, detail-management-page, detail-payer-command | household-commitments, household-cheque-payer, tazrim-detail-management | פנקס מקורי ובחירת משלם חדש; כשל/פירעון/API מכוסים; קבלת טופס פתוחה |
| הלוואות | `/loans`, `/loans/:id/{edit,remove,payments}` | household-loans, loans-page, loan-payments-page | household-commitments, tazrim-loan-command, loan-payments, loan-removal | לוח שנותר נפרד מראיות; אין יתרת קרן; קבלה חזותית פתוחה |
| רכישות וקבועות | `/plans`, `/plans/:id/{edit,remove}`, `/recurring`, `/analysis` | planned-items-page, recurring-page, analysis-page | tazrim-planned-item, tazrim-planned-removal, tazrim-recurring, tazrim-periodic | פעולות מקור נשמרו; קבלת ממשק מעודכן פתוחה |
| דוחות ומקורות | `/upload`, `/upload/{group,:id/group,:id/review,:id/state,:id/delete}`, `/upload/history/:id/undo` | report-library-page, report-group-page, card-report-page, report-state-page, report-history-page | tazrim-report-library, tazrim-card-report-review, tazrim-encrypted-reports, tazrim-history-undo | orchestration מקורי ללא שינוי; מעטפת אחידה; זרימות דפדפן חדשות פתוחות |
| בנקים וכרטיסים | `/accounts`, `/banks/:id`, `/accounts/{new,:id/edit,:id/monthly}`, `/card-setup`, `/cards/:id/{payer,billing,no-activity,stop}` | household-accounts, account-page, card-page, billing-page | household-accounts, tazrim-account-command, tazrim-card-config, tazrim-card-payer, tazrim-billing-correction, tazrim-card-stop | חובר למקורות ולמשלם; מחוות/כרטיסים רבים/מגע פתוחים |
| קטגוריות וניתוח | `/categories`, `/categories/{manage,limits}`, `/search`, `/details/:id/annotate`, `/analysis` | expense-details-page, household-categories, category-management-page, detail-annotation-page, analysis-page | household-accounts, tazrim-react-details, tazrim-category-management, tazrim-category-limits, tazrim-coverage | פלטה אחידה ברשימות/תרשים/חיפוש; פיצולים/תגיות מקוריים; מראה פתוח |
| חיסכון ומטרות | `/savings`, `/savings/{accounts,allocation,returns,transfer,transfers,schedule,:id/deposit,:id/remove}` | savings-goals-page, savings-balance-page, savings-transfer-page, savings-schedule-page | tazrim-savings-goal, tazrim-savings-balance, tazrim-savings-deposit, tazrim-savings-transfer, tazrim-savings-schedule | פעולות מקור נשמרו; קרוסלה וצופה עודכנו; קבלה חזותית פתוחה |
| השקעות | `/investment` | investment-page | tazrim-investment, tazrim-savings-returns | תחזית בנפרד מהפקדות אמת; קבלה חדשה פתוחה |
| העברות ושיוכים | `/accounts/{transfers,assignments,:id/assign-remainder}`, `/overview/transfers` | cash-flow-page, cash-assignments-page, transfer-matches-page | tazrim-cash-flow, tazrim-cash-assignments, tazrim-transfer-matches | מנגנונים מקוריים; אין העברה חדשה ברקע; קבלה חזותית פתוחה |
| מרחבים והרשאות | בורר המעטפת, `/settings/spaces`, `/overview`, `/overview/migration` | Header, spaces-page, overview-page, migration-page | household-home, tazrim-spaces-management, tazrim-migration-controller | מרחבים מורשים בלבד; ניקוי מזהים בהחלפה; בדיקת משתמשים בדפדפן פתוחה |
| מרכז פעולות | פעמון, `/actions`, `/settings/report-expectations` | global-action-center, action-center-page, report-expectations-page | tazrim-action-center, tazrim-action-integrations, tazrim-report-expectations | שירות מקור והעדפות אישיות נשמרו; מיקום/מקלדת בדפדפן פתוחים |
| גיבוי/אבטחה/היסטוריה | `/settings/{security,history,device-draft,drive,gmail}`, `/settings/gmail/notices/:id` | security-page, history-page, device-draft-page, drive-backup-page, gmail-page | tazrim-vault, tazrim-history-undo, tazrim-encrypted-reports, tazrim-drive-backup, tazrim-gmail-settings | גבולות מקור ללא שינוי; בדיקות קבצים/נעילה/ספק במכשיר פתוחות |
| פרופיל/עזרה/גישה | `/settings`, `/settings/profile`, `/settings/access`, `/about` | profile-page, session-controls, admin-access-page, help-page, interface-layout-setting | tazrim-profile, tazrim-session-controls, tazrim-admin-access, tazrim-native-navigation | זהות ויציאה בהגדרות; החלפת ממשק רק שם; קבלה חזותית פתוחה |
| אמינות ושימושיות | כל המעטפת והעורכים | use-budget, plan-save, draft-guard, pull-refresh, link, household-model | household-home, household-cheque-payer, tazrim-draft-registry, tazrim-monthly-save, tazrim-pull-refresh, tazrim-react-hosting | API/סנטים/הרשאות/כשל מכוסים; גלילה/Back-Forward/OS/מגע וקבלה חזותית פתוחים |

## דיוקים לגבי ההכנסה

`monthlyValues` במקור משתמש בערכי החודש השמורים; כשאין חודש שמור, הוא בוחר חודש קודם מתאים או ברירות מחדל. אין בו ממוצע אוטומטי של משכורות. קיים טיפול ייעודי בהעברות, הלוואות וכרטיסים, ולכן אין להחליפו בהעתקה פשוטה של כל השדות.

הזנה ידנית של חודש עתידי נתמכת כהערכה. הכנסה חד־פעמית נתמכת גם כפריט מתוכנן מסוג income. אפשרות חדשה של ממוצע 3/6 משכורות תהיה שינוי התנהגות: יש להגדיר חודשים מדווחים בלבד, להתעלם מחודש חסר, להפריד העברות/בונוסים ולא לדרוס סכום ידני. היא אינה חלק מהמימוש הנוכחי ואינה מופעלת באב־טיפוס.

## מחוץ להיקף בהחלטה קודמת

Apple Pay / Wallet / Shortcuts הוצאו מהמשך הפיתוח ב־29.10.2026 לפי החלטת Tal. אין להציג זאת כפיצ׳ר שהעיצוב החדש שכח, ואין להחזיר את הפיתוח אוטומטית.

## מקורות שנבדקו

- `src/budget.js`: `monthlyValues`, `saveMonthReport`, `forecast`.
- `frontend/src/app/scenario-page.tsx` ו־`scenario-command.ts`: ניסוי, פריסה, חשבון משלם ושמירה.
- `frontend/src/app/monthly-report.ts` ו־`planned-item-command.ts`: דיווח/הערכה והכנסה מתוכננת.
- `frontend/src/app/detail-management-command.ts`: צ׳קים, סטטוס ומשמעות הכללה.
- `frontend/src/app/loans-page.tsx` ו־`loan-command.ts`: לוח החזרים וגבולות חישוב.
- `docs/tazrim-migration/feature-parity.md` ו־`completion-plan.md`: מלאי פעולות והנחיית חיבור למימושים המקוריים.

ביישום האמיתי יש לחבר את הפקודות הקיימות. חישובי האב־טיפוס הם להמחשה בלבד ואינם מקור לשכתוב המנוע. השמירה בדוגמה זמנית ונשארת בזיכרון התצוגה; אין חיבור לנתוני אמת. בדיקות המקור והאינטראקציות אינן בדיקת פריסה בדפדפן או במכשיר אמיתי.

## כלל טקסט מעודכן — 3.11.2026

- [x] בורר אישי/משותף מציין את ההקשר פעם אחת. הוסרו שורת הפרטיות ותתי־הכותרות שחזרו על בחירת המרחב.
- [x] כרטיס הבנק מזוהה בשם הבנק ובמספר החשבון, בלי חזרה על אישי/משותף ושם המשתמש.
- [x] הוסרו הוראות החלקה ולחיצה כשהחצים, הכרטיסים המבצבצים והפקדים כבר מסבירים את הפעולה.
- [x] נשארים תאריכי דיווח, סימון תחזית לעומת דיווח, משמעות סכומים וחשבון היעד לפני שמירה/ייבוא. הסבר פרטיות זמין לפי בקשה בתפריט עוד.
- [ ] ביישום המלא לבדוק כל משפט עזר: האם הוא מוסיף מידע הדרוש להחלטה, או חוזר על מידע שכבר מוצג? אין למלא חלל בכותרת או בהסבר מיותר.

## המלצת מסירה לביצוע

Sol 6.1 מתאים לביצוע על בסיס התוכנית והמקור הקיים. ההמלצה המעשית היא Medium לעיצוב וטקסט מוגדרים, ו־High לחיבורים פיננסיים, הרשאות, טיוטות ובדיקות מסכמות. זו המלצת עבודה לפרויקט, ולא הבטחה לתוצאה או למכסה מסוימת.

במסמך הביצוע המלא נדרשים לכל שלב: המסך והפעולה, קובצי המקור הקיימים, תמונת היעד, רשימת השינויים, בדיקות קבלה ורישום מה הושלם. יש לעבוד במסכים/זרימות תחומים, לחבר למימושים המקוריים ולשמור checkpoint קצר אחרי כל שלב. אין צורך להעמיס את כל היסטוריית הפיתוח בכל משימה.
