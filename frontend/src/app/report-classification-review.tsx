import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {budgetFields,cashAccountList,creditCards} from '../../../src/budget.js'
import {ReportCategoryPicker,reportCategoryGroups} from './report-category-picker'
import {ReportTransactionDetails} from './report-transaction-details'
import {bankClassificationOptions,categoryMissing,optionalCategoryCounts,reportClassificationRows,type ReviewCheck} from './report-classification-model'
import type {ReviewStep} from './report-guided-review'
import Link from './link'
import {PurchaseNoteHint,usePurchaseNoteSuggestions} from './purchase-note-review'
import {inboxCardRowCategoryKey} from '../../../src/report-inbox-controller.js'

const input='mt-1 min-h-11 w-full rounded-xl border bg-card px-3 py-2 text-sm'
const button='min-h-11 rounded-xl border px-3 py-2 text-sm disabled:opacity-50'
export function ReportReviewChecks({checks,disabled,onOpen,compact=false}:{checks:ReviewCheck[];disabled:boolean;compact?:boolean;onOpen:(step:ReviewStep,id:string)=>void}){
 const [limit,setLimit]=useState(5)
 if(!checks.length)return null
 return <details open={!compact} className="surface space-y-3 rounded-xl p-4" aria-label="מה נשאר לבדוק"><summary className="min-h-11 cursor-pointer py-2"><h3 className="inline font-semibold">מה נשאר לבדוק · <bdi>{checks.length}</bdi></h3></summary><p className="text-sm text-muted-foreground">כל בדיקה פותחת את התנועה או ההחלטה המתאימה. קטגוריות הוצאה אופציונליות מוצגות בנפרד.</p><ul className="divide-y">{checks.slice(0,limit).map((check,index)=><li key={check.id+'-'+index} className="space-y-2 py-3 text-sm"><p className="font-medium">{check.label}</p><p className="break-words text-muted-foreground"><bdi>{check.source}</bdi>{check.month&&<> · <bdi dir="ltr">{check.month}</bdi></>}</p>{check.row&&<ReportTransactionDetails rows={[check.row]} kind={check.row.entry?'card':'bank'}/>}<button type="button" className={button} disabled={disabled} onClick={()=>onOpen(check.step,check.id)}>פתיחת הבדיקה</button></li>)}</ul>{limit<checks.length&&<button type="button" className={button} onClick={()=>setLimit(n=>n+5)}>הצגת בדיקות נוספות · <bdi>{checks.length-limit}</bdi></button>}</details>
}
type ReportSection=ReturnType<typeof reportClassificationRows>[number]

function ReportRows({sections,review,plan,disabled,focusId,onBank,onCategory,onOpen,href,noteSuggestions}:{sections:ReportSection[];review:any;plan:any;disabled:boolean;focusId:string|null;onBank:(index:number,value:string)=>void;onCategory:(key:string,value:string)=>void;onOpen:(step:ReviewStep,id:string)=>void;href:(path:string)=>string;noteSuggestions:Map<string,any[]>}){
 const [limit,setLimit]=useState(10)
 const heading=useRef<HTMLHeadingElement>(null)
 const advance=useRef<{id:string;category:string}|null>(null)
 const item=sections[0].item
 const isCard=item.kind==='card'
 const sourceRows=sections.flatMap(section=>section.rows.map(row=>({...row,sourceName:section.item.name})))
 const rows=isCard?[
  ...sourceRows.filter(row=>categoryMissing(row.current)),
  ...sourceRows.filter(row=>!categoryMissing(row.current))
 ]:sourceRows
 const focusIndex=rows.findIndex(row=>row.id===focusId),shown=Math.max(limit,focusIndex+1)
 const visibleRows=rows.slice(0,shown)
 useEffect(()=>{if(focusIndex>=limit)setLimit(focusIndex+1)},[focusIndex,limit])
 useLayoutEffect(()=>{
  const choice=advance.current
  if(disabled||!choice)return
  advance.current=null
  if(rows.find(row=>row.id===choice.id)?.current!==choice.category)return
  const active=document.activeElement
  if(active&&active!==document.body&&!active.closest('#'+choice.id))return
  const next=visibleRows.find(row=>row.editable&&categoryMissing(row.current))
  const target=(next&&document.getElementById(next.id))||heading.current
  target?.focus({preventScroll:true})
  target?.scrollIntoView({block:'nearest'})
 })
 const fields=new Map<string,string>([...budgetFields(plan),['exclude','ללא השפעה על התקציב']])
 const maskedCardNames=new Map<string,string>(creditCards(plan).map((card:any)=>{
  const lastFour=/^\d{4}$/.test(card.lastFour??'')?card.lastFour:/^\d{4}$/.test(card.alias??'')?card.alias:''
  return [card.id,[card.name,lastFour&&'•••• '+lastFour].filter(Boolean).join(' · ')]
 }))
 const categories=item.kind==='card'?reportCategoryGroups(plan,[
  ...(plan.details??[]).map((row:any)=>row.category),
  ...(review.cardGroups??[]).map((group:any)=>group.category)
 ]):[]
 const bankAccount=item.kind==='bank'?cashAccountList(plan).find((account:any)=>account.id===item.target):null
 return <section className="surface min-w-0 space-y-3 rounded-xl p-4"><h3 ref={heading} tabIndex={-1} className="break-words font-semibold">{sections.length===1?<><bdi>{item.name}</bdi> · {isCard?'עסקאות הכרטיס':'תנועות הבנק'}</>:'עסקאות הכרטיסים'} · <bdi>{rows.length}</bdi></h3>
 {bankAccount&&<p className="text-sm text-muted-foreground"><bdi>{bankAccount.label}</bdi> · {bankAccount.classificationScope==='personal'?'האפשרויות מסוננות לחשבון הפרטי.':bankAccount.classificationScope==='shared'?'האפשרויות מסוננות לחשבון המשותף.':'לסינון חיסכון והשקעות לפי פרטי/משותף, יש להגדיר את סוג החשבון.'} <Link className="inline-flex min-h-11 items-center underline" href={href('/accounts/'+encodeURIComponent(bankAccount.id)+'/edit')}>הגדרת סוג החשבון</Link></p>}
 {!rows.length&&<p className="text-sm">{item.kind==='card'?'בדוח נשמר סכום חיוב ללא פירוט עסקאות לסיווג.':'פירוט התנועות אינו זמין עדיין. יש להשלים את בחירת המקור והחשבון.'}</p>}<ol className="min-w-0 space-y-3">{visibleRows.map(value=>{
 const {row,id,current,status,editable,group,groupIndex,key,checkId,sourceName}=value,label=item.kind==='bank'?(row.cardSettlement?maskedCardNames.get(current):undefined)??fields.get(current)??current:current,existing=!!row.existing,individualCategory=group?.rows.length>1||!!noteSuggestions.get(id)?.length||review.categoryChoices.has(inboxCardRowCategoryKey(row))
 const bankOptions=item.kind==='bank'&&group?bankClassificationOptions(plan,group.rows,item.target):[]
 const settlementCards=new Set(row.cardSettlement?.candidates.map((candidate:any)=>candidate.cardId))
 const suggestedCards=bankOptions.filter(([key]:string[])=>settlementCards.has(key))
 const otherOptions=bankOptions.filter(([key]:string[])=>!settlementCards.has(key))
 const outsideAccount=item.kind==='bank'&&!categoryMissing(current)&&!bankOptions.some(([key]:string[])=>key===current)
 return <li key={id} id={id} tabIndex={-1} className="min-w-0 scroll-my-24 space-y-3 rounded-xl border p-3 focus:outline focus:outline-2 focus:outline-primary"><ReportTransactionDetails rows={[row]} kind={item.kind==='bank'?'bank':'card'} sourceName={sourceName}/><PurchaseNoteHint matches={noteSuggestions.get(id)??[]} groupSize={group?.rows.length??1} kind={item.kind}/><p className="text-sm"><span className="font-medium">{item.kind==='bank'?row.state==='conflict'?'סיווג מוצע, טרם אושר':'סוג התנועה בתקציב':'קטגוריית הוצאה'}: </span><bdi>{categoryMissing(label)?item.kind==='bank'?'טרם נבחר סיווג':'ללא קטגוריה':label}</bdi></p><p className="text-xs text-muted-foreground">{status}</p>{row.cardSettlement&&!row.manualClassification&&<p className="text-sm text-muted-foreground">{row.cardSettlement.reason}</p>}{editable&&(item.kind==='bank'?<details open={!row.reviewed} className="space-y-2">
  <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">שינוי סיווג</summary>
  {group.rows.length>1&&<p className="text-xs text-muted-foreground">הבחירה תחול על כל <bdi>{group.rows.length}</bdi> התנועות בקבוצה בעלת אותו תיאור וצד שני באותו כיוון. פרטי כל תנועה נשמרים בנפרד.</p>}
  <label className="block text-sm">איך התנועה נרשמת בתקציב?
   <select className={input} value={row.reviewed&&!categoryMissing(current)?current:''} disabled={disabled} onChange={event=>onBank(groupIndex,event.target.value)}>
    <option value="" disabled>בחירת סוג תנועה</option>
    {outsideAccount&&<option value={current} disabled>{label} · סיווג נוכחי מחוץ לסינון</option>}
    {suggestedCards.length>0&&<optgroup label="כרטיסים עם חיוב תואם">{suggestedCards.map(([value,label]:string[])=><option key={value} value={value}>{maskedCardNames.get(value)??label}</option>)}</optgroup>}
    {otherOptions.map(([value,label]:string[])=><option key={value} value={value}>{label}</option>)}
   </select>
  </label>
  {outsideAccount&&<p className="text-sm text-muted-foreground">הסיווג המוצג אינו ברשימה המסוננת של החשבון הזה ולא שונה אוטומטית. אפשר להשאיר אותו או לבחור סיווג מתאים מהרשימה.</p>}
 </details>:<div className="space-y-2">
  {individualCategory?<p className="text-xs text-muted-foreground">הקטגוריה שתיבחר תחול על הקנייה הזו בלבד.</p>:group.rows.length>1&&<p className="text-xs text-muted-foreground">הבחירה תחול על הקניות בקבוצה בעלת אותו תיאור, למעט קניות שנבחרה להן קטגוריה נפרדת. פרטי כל תנועה נשמרים בנפרד.</p>}
  <ReportCategoryPicker groups={categories} value={categoryMissing(current)?'':current} disabled={disabled} onChange={category=>{
   if(categoryMissing(current)&&!categoryMissing(category))advance.current={id,category}
   onCategory(individualCategory?inboxCardRowCategoryKey(row):key,category)
  }}/>
 </div>)}{checkId&&<button type="button" className={button} aria-controls={checkId} disabled={disabled} onClick={()=>onOpen('exceptions',checkId)}>השוואה לרישומים ושינוי ההחלטה</button>}{existing&&!disabled&&<Link className="inline-flex min-h-11 items-center text-sm text-primary underline" href={href('/details/'+encodeURIComponent(row.existing.id)+'/annotate')}>עריכת הקטגוריה השמורה</Link>}{!editable&&!checkId&&item.kind==='bank'&&<p className="text-xs text-muted-foreground">{row.state==='duplicate'||row.state==='duplicate-file'||item.already?'הסיווג השמור נשמר. תיקון נתונים שכבר נקלטו מתבצע בנפרד דרך היסטוריית הקליטה.':'התנועה מוצגת לבדיקה; שינוי הסיווג יתאפשר לאחר השלמת בדיקות המקור והחודש.'}</p>}</li>
 })}</ol>{shown<rows.length&&<button type="button" className={button} onClick={()=>setLimit(shown+10)}>הצגת תנועות נוספות · <bdi>{rows.length-shown}</bdi></button>}</section>
}
export function ReportClassificationReview({review,plan,...props}:{review:any;plan:any;disabled:boolean;focusId:string|null;onBank:(index:number,value:string)=>void;onCategory:(key:string,value:string)=>void;onOpen:(step:ReviewStep,id:string)=>void;href:(path:string)=>string}){
 const sections=reportClassificationRows(review),bankRows=sections.filter((s:any)=>s.item.kind==='bank').flatMap((s:any)=>s.rows),counts=optionalCategoryCounts(review),bankPending=review.bankGroups?.length??0,conflicts=bankRows.filter((value:any)=>value.row.state==='conflict').length
 const noteSuggestions=usePurchaseNoteSuggestions(sections,plan)
 const cards=sections.filter((section:ReportSection)=>section.item.kind==='card'&&section.rows.length)
 const other=sections.filter((section:ReportSection)=>section.item.kind!=='card'||!section.rows.length)
 return <div className="space-y-4" aria-label="סיווג כל התנועות"><section className="surface space-y-2 rounded-xl p-4 text-sm"><h3 className="font-semibold">הסיווג הנוכחי של כל התנועות</h3>{bankRows.length>0&&<><p>סוג תנועת הבנק קובע איך הכסף נרשם בתקציב: למשל משכורת, העברה בין חשבונות או חיוב כרטיס.</p><p role="status"><bdi>{bankRows.length}</bdi> תנועות בנק · <bdi>{bankPending}</bdi> קבוצות ממתינות לסיווג{conflicts>0&&<> · <bdi>{conflicts}</bdi> תנועות ממתינות לבדיקת התאמה</>}</p>{!bankPending&&<p>{conflicts?'אין כרגע תנועות חדשות שזמינות לסיווג. יש לפתוח את בדיקות ההתאמה המוצגות ליד התנועות.':'אין כרגע סיווג בנק שממתין לבחירה. אפשר לבדוק ולשנות את התנועות הזמינות למטה.'}</p>}</>}{sections.some((s:any)=>s.item.kind==='card')&&<><p>קטגוריות הוצאה, כמו מזון ובילויים, משמשות לפירוט. אפשר להשלים אותן גם לאחר הקליטה.</p><p role="status"><bdi>{counts.classified}</bdi> עסקאות חדשות עם קטגוריה · <bdi>{counts.missing}</bdi> ללא קטגוריה</p></>}<p className="text-muted-foreground">בחירות הסיווג נשמרות כהתקדמות בדיקה. הסכומים ייקלטו רק באישור הסופי.</p></section>{cards.length>0&&<ReportRows key="card-transactions" sections={cards} review={review} plan={plan} noteSuggestions={noteSuggestions} {...props}/>}{other.map((section:ReportSection)=><ReportRows key={section.item.storedId??section.itemIndex} sections={[section]} review={review} plan={plan} noteSuggestions={noteSuggestions} {...props}/>)}</div>
}
