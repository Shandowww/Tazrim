import {useState} from 'react'

const money=(cents:number)=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).format(cents/100)
/** Display the existing reader's evidence beside the decision that uses it. */
export function ReportTransactionDetails({rows,kind,accounts=[],sourceName}:{rows:any[];kind:'bank'|'card';accounts?:{id:string;label:string}[];sourceName?:string}){
 const [limit,setLimit]=useState(5)
 return <div className="min-w-0 space-y-2 text-sm">
  <ul aria-label="פרטי התנועות לסיווג" className="min-w-0 divide-y rounded-xl border px-3">
   {rows.slice(0,limit).map((row:any,index:number)=>{
    const entry=row.entry??row,amount=entry.amountCents,description=entry.merchant??row.description
    const direction=Number.isFinite(amount)?kind==='bank'?(amount<0?'יציאה מהחשבון':amount>0?'כניסה לחשבון':'תנועה בסכום אפס'):(amount<0?'זיכוי':'חיוב'):''
    const account=accounts.find(a=>a.id===row.accountId)?.label
    const fields:[string,any][]=[['פירוט',row.details],['מוטב / צד שני',row.beneficiary],['מטרת התשלום',row.purpose],['אסמכתה',row.reference],['תאריך ערך',row.valueDate],['הערות',entry.notes],['חשבון',account],['כרטיס',row.cardName],['קובץ מקור',row.fileName??sourceName],['מועד חיוב',row.dueDate]]
    return <li key={row.id??row.key??row.line??index} className="min-w-0 space-y-2 py-3">
     <p className="break-words font-medium"><bdi>{description||'ללא תיאור במקור'}</bdi></p>
     <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><bdi dir="ltr">{entry.date||'לא נמסר תאריך'}</bdi><span>{direction}</span><bdi dir="ltr" className="font-semibold">{Number.isFinite(amount)?money(amount):'לא נמסר סכום במקור'}</bdi></p>
     <dl className="space-y-1 text-xs text-muted-foreground">
      {fields.filter(([,value])=>value!==undefined&&value!==null&&String(value).trim()!=='').map(([label,value])=><div key={label} className="min-w-0 break-words"><dt className="inline">{label}: </dt><dd className="inline"><bdi dir="auto" className="[overflow-wrap:anywhere]">{String(value)}</bdi></dd></div>)}
      {kind==='bank'&&Number.isFinite(row.balanceCents)&&<div><dt className="inline">יתרה לאחר התנועה: </dt><dd className="inline"><bdi dir="ltr">{money(row.balanceCents)}</bdi></dd></div>}
      {kind==='card'&&Number.isFinite(entry.originalCents)&&entry.originalCents!==amount&&<div><dt className="inline">סכום העסקה המקורי: </dt><dd className="inline"><bdi dir="ltr">{money(entry.originalCents)}</bdi></dd></div>}
     </dl>
    </li>
   })}
  </ul>
  {rows.length>5&&<button type="button" aria-expanded={limit>5} className="min-h-11 rounded-xl border px-3 py-2 text-sm" onClick={()=>setLimit(n=>n>=rows.length?5:n+5)}>{limit>=rows.length?'הצגת פחות תנועות':`הצגת תנועות נוספות · ${rows.length-limit} נותרו`}</button>}
 </div>
}
