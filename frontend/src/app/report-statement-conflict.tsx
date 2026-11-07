import {ReportTransactionDetails} from './report-transaction-details'
const money=(n:number)=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).format(n)
const button='min-h-11 rounded-xl border px-4 py-2 text-sm disabled:opacity-50'
/** The evidence and confirmation come from the original statement comparison. */
export function ReportStatementConflict({comparison,accepted,onReplace,onKeep}:{comparison:any;accepted:boolean;onReplace:(token:string)=>void;onKeep:()=>void}){
 const saved=comparison.savedOnly.map((row:any)=>({id:row.id,entry:{date:row.date,merchant:row.name,amountCents:Math.round(row.amount*100),originalCents:row.statement?.originalCents,notes:row.statement?.notes,originalCurrency:row.statement?.originalCurrency,foreignCents:row.statement?.foreignCents},category:row.category}))
 return <section className="space-y-3 rounded-xl border border-amber-500/40 p-3" aria-label="בדיקת דוח שכבר נשמר">
  <h3 className="font-semibold">{accepted?'החלפת הדוח נבחרה · ממתינה לאישור הקליטה':'הבדיקה הנדרשת: דוח שונה לאותו חיוב'}</h3>
  <p className="text-sm">מועד החיוב: <bdi dir="ltr">{comparison.dueDate}</bdi>. {comparison.savedTotal!==null&&<>בדוח השמור: <bdi>{money(comparison.savedTotal)}</bdi>. </>}בקובץ הזה: <bdi>{money(comparison.incomingTotal)}</bdi>.</p>
  <p className="text-sm">{comparison.unchanged} שורות ללא שינוי. בהחלפה יוסרו {saved.length} שורות מהדוח השמור ויתווספו {comparison.incomingOnly.length} שורות מהקובץ הזה. השורות שלא השתנו ישמרו את הסיווגים והפרטים שלהן.</p>
  <h4 className="text-sm font-medium">רק בדוח השמור · יוסרו בהחלפה</h4>
  <ReportTransactionDetails rows={saved} kind="card"/>
  <h4 className="text-sm font-medium">רק בקובץ הזה · יתווספו בהחלפה</h4>
  {comparison.incomingOnly.length?<ReportTransactionDetails rows={comparison.incomingOnly} kind="card"/>:<p className="text-sm">אין שורות חדשות.</p>}
  <p className="text-sm">בחירת החלפה אינה שומרת נתונים. לאחר הבדיקה נדרש עדיין אישור הקליטה בתחתית העמוד. קובצי המקור והיסטוריית השמירה נשמרים.</p>
  <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>onReplace(accepted?'':comparison.token)}>{accepted?'ביטול בחירת ההחלפה':'בדקתי את ההבדלים · להשתמש בקובץ הזה במקום הדוח השמור'}</button><button type="button" className={button} onClick={onKeep}>להשאיר את הדוח השמור ולדלג על הקובץ הזה</button></div>
 </section>
}
