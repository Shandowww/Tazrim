import {ChartNoAxesCombined,ChevronDown,Plus,Sparkles,Trash2} from 'lucide-react'
import {PlanningMonthField} from './planning-month-field'
import {useFormDraft} from './use-form-draft'
import {MoneyAmount} from './money-amount'
import {PageHeading} from './page-heading'
import {ScenarioComparison} from './scenario-comparison'
import {useRef,useState} from 'react'
import {useLocation} from 'react-router-dom'
import {ForecastBuffer} from './forecast-buffer'
import {forecastCoveragePath} from './outlook-model'
import {scenarioComparison} from './scenario-comparison-model'
import {withViewQuery} from './navigation-query'
import {cashAccountList,indexMonth,scenarioAssessment,validatePlan} from '../../../src/budget.js'
import {initialScenarioRow,prepareScenario,shortestScenarioSplit,type ScenarioRow} from './scenario-command'
import {plannedItemCards,plannedItemSchedule,type PlannedItemDraft} from './planned-item-command'
import {savePreparedPlan,SaveConflict} from './plan-save'
import {AccessError,type BudgetResponse} from './budget-api'
import type {BudgetState} from './use-budget'
import {useDraftGuard} from './draft-guard'
import BackLink from './back-link'
import Link from './link'
import {groupAmountText,groupedAmountChange} from './amount-format'
import {usePeriodHref} from '../tazrim/components/layout/period-context'
const input='mt-1 min-h-11 w-full rounded-xl border bg-card px-3 text-base tabular-nums',button='min-h-11 rounded-xl border px-4 text-sm disabled:opacity-50'
function currentMonth(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit'}).formatToParts(new Date());return parts.find(p=>p.type==='year')!.value+'-'+parts.find(p=>p.type==='month')!.value}
type OutlookContext={month:string;accountId:string|null;label:string;buffer:number}
function outlookContext(plan:any,search:string,asOf:string):OutlookContext|null{
 const query=new URLSearchParams(search),month=query.get('scenarioMonth'),accountId=query.get('scenarioAccount')
 if(!month||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month<asOf||month<plan.startMonth||indexMonth(month)-indexMonth(plan.startMonth)>=120)return null
 const accounts=cashAccountList(plan),account=accounts.find(item=>item.id===accountId)
 if(account)return {month,accountId:account.id,label:account.label,buffer:account.buffer??0}
 return !accounts.length&&accountId==='budget'?{month,accountId:null,label:'התקציב כולו',buffer:plan.buffer??0}:null
}
export function ScenarioEditor({budget,base,onSaved,onSaveComplete,demo=false,onDemoSaved,embedded=false,purchaseId='',detailsHref,readOnlyReason=''}:{budget:BudgetState;base:BudgetResponse;onSaved:(s:string)=>void;onSaveComplete?:()=>void;demo?:boolean;onDemoSaved?:(plan:any)=>void;embedded?:boolean;purchaseId?:string;detailsHref?:string;readOnlyReason?:string}){
 const plan=base.plan!,[asOf]=useState(currentMonth),[rows,setRows]=useState<ScenarioRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[hint,setHint]=useState<{text:string;rowId?:string}|null>(null),[blocked,setBlocked]=useState(false),flight=useRef(false),newPurchase=useRef(''),addButton=useRef<HTMLButtonElement>(null),guard=useDraftGuard(),href=usePeriodHref(),accounts=cashAccountList(plan),dirty=rows.length>0
 const {search}=useLocation(),context=!embedded&&!purchaseId?outlookContext(plan,search,asOf):null
 const firstMonth=asOf<String(plan.startMonth)?String(plan.startMonth):asOf
 const [blankPurchase]=useState(()=>{
  const row=initialScenarioRow(plan,crypto.randomUUID(),context?.month??firstMonth,purchaseId)
  if(context?.accountId)row.draft.cashAccountId=context.accountId
  return row
 })
 const displayedRows=rows.length?rows:[blankPurchase]
 const change=(next:ScenarioRow[])=>{setRows(next);setError(null);setHint(null);onSaved('')}
 const update=(id:string,key:keyof PlannedItemDraft,value:string)=>change(displayedRows.map(row=>{if(row.id!==id)return row;const draft={...row.draft,[key]:value};if(['cashAccountId','source','firstMonth'].includes(key)&&draft.cardId&&!plannedItemCards(plan,draft).some((c:any)=>c.id===draft.cardId))draft.cardId='';return{...row,draft}}))
 const add=(originalId='')=>{try{const row=initialScenarioRow(plan,crypto.randomUUID(),firstMonth,originalId);newPurchase.current=row.id;change([...(purchaseId?displayedRows:rows),row])}catch(e){setError(e instanceof Error?e.message:'הפריט אינו זמין.')}}
 let preview:ReturnType<typeof prepareScenario>|null=null,previewError=''
 try{if(dirty||purchaseId)preview=prepareScenario(plan,displayedRows)}catch(e){previewError=e instanceof Error?e.message:'יש לבדוק את נתוני התרחיש.'}
 const saveRaw=async()=>{if(flight.current||!dirty||blocked||readOnlyReason)return false;flight.current=true;setBusy(true);setError(null);try{const prepared=prepareScenario(plan,rows).plan;if(demo){onDemoSaved?.(prepared);onSaved(purchaseId?'הרכישה עודכנה בדוגמה הזמנית בלבד.':'הרכישה נוספה לדוגמה הזמנית בלבד.');return true}const result=await savePreparedPlan({budgetId:budget.budgetId,base,plan:prepared});budget.accept(result);onSaved(result.recovered?'שמירת התרחיש אושרה מול התקציב השמור.':purchaseId?'הרכישה עודכנה בתכנון.':'התרחיש נוסף לתכנון. דיווחי אמת נשמרו.');return true}catch(e){if(e instanceof AccessError){budget.invalidate(e.message);return false}if(e instanceof SaveConflict)setBlocked(true);setError(e instanceof Error?e.message:'התרחיש לא נשמר.');return false}finally{flight.current=false;setBusy(false)}}
 const formDraft=useFormDraft({kind:'scenario',dirty,busy,discard:()=>{setRows([]);setError(null);setBlocked(false);setHint(null)},save:blocked||readOnlyReason?undefined:saveRaw},{budgetId:demo?'demo':budget.budgetId,base,kind:'scenario',record:purchaseId||'new',context:purchaseId?'purchase':'',period:asOf,values:rows,baseline:purchaseId?blankPurchase.draft:[],restore:value=>{setRows(value)},mutationPending:blocked}),save=formDraft.save
 const backup=()=>{try{const prepared=prepareScenario(plan,rows).plan,url=URL.createObjectURL(new Blob([JSON.stringify({format:'monthly-flow-v1',plan:prepared},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='budgit-scenario-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setHint({text:'גיבוי התכנון הועבר לדפדפן להורדה.'})}catch(e){setError(e instanceof Error?e.message:'יש לתקן את התכנון לפני גיבוי.')}}
 const shortest=(row:ScenarioRow)=>{try{const payments=shortestScenarioSplit(plan,displayedRows,row.id,asOf);if(payments===null){setHint({rowId:row.id,text:'לא נמצאה פריסה השומרת על רף הביטחון. ייתכן שחסרים נתוני יתרה.'});return}update(row.id,'payments',String(payments));setHint({rowId:row.id,text:payments===1?'נבחר תשלום אחד לפי התחזית הנוכחית.':'נבחרו '+payments+' תשלומים לפי התחזית הנוכחית.'})}catch(e){setError(e instanceof Error?e.message:'יש להשלים את נתוני התרחיש.')}}
 const outlookResult=preview&&context?scenarioComparison(preview,context.accountId,context.month).find((row:{month:string})=>row.month===context.month):null
 const assessment=preview?scenarioAssessment(preview.rows,asOf):null
 if(!formDraft.ready)return <p role="status">בודקים טיוטה במכשיר…</p>
 const existingPurchases=(plan.expenses as {id:string;kind:string;name:string}[]).filter(item=>item.kind==='expense'&&item.id!==purchaseId&&!rows.some(row=>row.originalId===item.id))
 return <div className={embedded?'scenario-workspace scenario-workspace--embedded':'scenario-workspace'}>
  <div className="scenario-content">
   <div className="scenario-columns">
    <fieldset disabled={busy} className="scenario-form">
     {displayedRows.map((row,i)=>{
      const number=i+1
      const item=preview?.items.find((item:{id:string})=>item.id===(row.originalId||row.id))
      const schedule=item?plannedItemSchedule(item):[]
      const first=schedule[0],last=schedule.at(-1)
      return <section key={row.id} className="scenario-purchase">
       <header className="scenario-section-heading scenario-purchase-heading">
        <h3>{rows.length>1?'רכישה '+number+(row.originalId?' · החלפת פריט קיים':''):row.originalId?'שינוי רכישה קיימת':'חישוב רכישה חדשה'}</h3>
        {dirty&&(!purchaseId||row.originalId!==purchaseId)&&<button type="button" className="scenario-remove" aria-label={'הוצאה מהניסוי · רכישה '+number} onClick={()=>{change(rows.filter(item=>item.id!==row.id));addButton.current?.focus()}}>
         <Trash2 size={18} aria-hidden/>
        </button>}
       </header>
       <label className="scenario-price">
        <span>מחיר סופי כולל עמלות</span>
        <span className="scenario-price-input" dir="ltr">
         <span aria-hidden="true">₪</span>
         <input className="scenario-price-value" autoFocus={newPurchase.current===row.id} aria-label={'מחיר סופי כולל עמלות בשקלים · רכישה '+number} dir="ltr" inputMode="decimal" maxLength={32}
          placeholder="0" value={groupAmountText(row.draft.amount)} onChange={event=>groupedAmountChange(event,(value:string)=>update(row.id,'amount',value))}/>
        </span>
       </label>
       <label className="block text-sm">שם רכישה {number}
        <input className={input} maxLength={100} value={row.draft.name} onChange={event=>update(row.id,'name',event.target.value)}/>
       </label>
       <div className="scenario-split">
        <label className="block text-sm">מספר תשלומים · רכישה {number}
         <input className={input} dir="ltr" inputMode="numeric" maxLength={2} value={row.draft.payments} onChange={event=>update(row.id,'payments',event.target.value)}/>
        </label>
        <div className="scenario-slider">
         <input type="range" min={1} max={60} dir="rtl" aria-label={'פריסת תשלומים · רכישה '+number}
          value={Math.max(1,Math.min(60,Number(row.draft.payments)||1))}
          onChange={event=>update(row.id,'payments',event.target.value)}/>
         <div aria-hidden="true"><span>1</span><span>60</span></div>
        </div>
        {first&&last&&<p className="scenario-installment">
         <strong><MoneyAmount value={first.amount} minimumFractionDigits={2}/></strong> {schedule.length===1?'בתשלום אחד':'לתשלום'}
         {last.amount!==first.amount&&<> · תשלום אחרון <MoneyAmount value={last.amount} minimumFractionDigits={2}/></>}
        </p>}
       </div>
       <PlanningMonthField label={'חודש ראשון · רכישה '+number} className={input} value={row.draft.firstMonth} startMonth={plan.startMonth as string} onChange={value=>update(row.id,'firstMonth',value)}/>
       {accounts.length>0&&<label className="block text-sm">חשבון משלם · רכישה {number}
        <select className={input} value={row.draft.cashAccountId} onChange={event=>update(row.id,'cashAccountId',event.target.value)}>
         <option value="">בחירת חשבון מפורשת</option>
         {accounts.map(account=><option key={account.id} value={account.id}>{account.label}</option>)}
        </select>
       </label>}
       <label className="block text-sm">אופן תשלום · רכישה {number}
        <select className={input} value={row.draft.source} onChange={event=>update(row.id,'source',event.target.value)}>
         <option value="direct">ישירות מהחשבון</option><option value="card">כרטיס אשראי</option>
        </select>
       </label>
       {row.draft.source==='card'&&<label className="block text-sm">כרטיס לחיוב · רכישה {number}
        <select className={input} value={row.draft.cardId} onChange={event=>update(row.id,'cardId',event.target.value)}>
         <option value="">בחירת כרטיס</option>
         {plannedItemCards(plan,row.draft).map((card:any)=><option key={card.id} value={card.id}>{card.name}</option>)}
        </select>
       </label>}
       <button type="button" disabled={!dirty&&!purchaseId} aria-label={'חיפוש הפריסה הקצרה · רכישה '+number} onClick={()=>shortest(row)} className="scenario-find">
        <Sparkles size={18} aria-hidden/>חיפוש הפריסה הקצרה
       </button>
       {hint?.rowId===row.id&&<p role="status" className="scenario-note">{hint.text}</p>}
       {row.originalId&&<p className="scenario-note">הוצאה מהניסוי משאירה את הפריט המקורי בתקציב.</p>}
      </section>
     })}
     {dirty&&<button ref={addButton} type="button" disabled={rows.length>=12} onClick={()=>add()} className="scenario-add">
      <Plus size={18} aria-hidden/>הוספת רכישה נוספת
     </button>}
     {detailsHref&&<Link href={detailsHref} className="inline-flex min-h-11 items-center text-sm text-primary underline">עריכת פרטי רכישה</Link>}
     {existingPurchases.length>0&&<details className="scenario-existing scenario-replace">
      <summary>שינוי רכישה קיימת<ChevronDown size={18} aria-hidden/></summary>
      <label className="block p-3 pt-0 text-sm">בחירת רכישה
       <select className={input} value="" disabled={rows.length>=12} onChange={event=>{if(event.target.value)add(event.target.value)}}>
        <option value="">בחירת פריט קיים</option>
        {existingPurchases.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
       </select>
      </label>
     </details>}
    </fieldset>
    <section className="scenario-forecast">
     <header className="scenario-section-heading">
      <h3>{preview?'השוואת תחזיות':'השפעה על התחזית'}</h3>
      <ChartNoAxesCombined size={20} aria-hidden/>
     </header>
     {context&&<div className="scenario-balance scenario-outlook-result">
      <h4><bdi>{context.label}</bdi> · סוף {new Intl.DateTimeFormat('he-IL',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(context.month+'-01T12:00:00Z'))}</h4>
      {outlookResult&&<div className="grid gap-1" aria-live="polite">
       <p>לפני התרחיש <MoneyAmount value={outlookResult.before} missing="חסר מידע"/></p>
       <p>אחרי התרחיש <strong><MoneyAmount value={outlookResult.after} missing="חסר מידע"/></strong></p>
       <ForecastBuffer balance={outlookResult.after} buffer={context.buffer}/>
      </div>}
      <Link className="inline-flex min-h-11 items-center text-sm text-primary underline" href={withViewQuery(forecastCoveragePath(plan,context.accountId,asOf),search)}>בדיקת כיסוי דוחות</Link>
     </div>}
     {preview?<>
      <p className="scenario-note">תחזית מחודש <bdi dir="ltr">{asOf}</bdi>. הסכומים הם הערכה.</p>
      {accounts.length?preview.accounts.map((account:any)=>{
       const considered=account.rows.filter((row:any)=>row.month>=asOf)
       const unknown=considered.some((row:any)=>row.balance===null||row.issues.length)
       const low=unknown?null:considered.reduce((min:any,row:any)=>!min||row.balance<min.balance?row:min,null)
       return <div key={account.account.id} className="scenario-balance">
        <h4>{account.account.label}</h4>
        {unknown?<p>היתרה או נתוני החשבון חסרים.</p>:low?<p>יתרה חזויה נמוכה <strong><MoneyAmount value={low.balance} minimumFractionDigits={2}/></strong><bdi dir="ltr">{low.month}</bdi></p>:<p>אין תקופה להשוואה.</p>}
       </div>
      }):assessment&&<div className="scenario-balance">
       <h4>יתרה חזויה נמוכה</h4>
       <strong><MoneyAmount value={assessment.balance} minimumFractionDigits={2}/></strong>
       <p><bdi dir="ltr">{assessment.month}</bdi> · רף ביטחון <MoneyAmount value={Number(plan.buffer)} minimumFractionDigits={2}/></p>
      </div>}
      <ScenarioComparison preview={preview} asOf={asOf} initiallyOpen={!embedded} initialAccount={context?.accountId}/>
      <details className="scenario-existing">
       <summary>איך התחזית מחושבת<ChevronDown size={18} aria-hidden/></summary>
       <p className="scenario-note p-3 pt-0">הפריסה הקצרה נבדקת לכל התקופה, כששאר הפריטים קבועים. רכישות חדשות בתרחיש נבדקות כהוצאה נוספת גם אם הדיווח החודשי כולל תכנון.</p>
      </details>
     </>:<p className="scenario-note" role={previewError?'status':undefined}>{previewError||'הזינו את פרטי הרכישה כדי לראות איך הפריסה תשפיע על היתרה.'}</p>}
    </section>
   </div>
  </div>
  <footer className="scenario-footer">
   {error&&<p role="alert" className="scenario-error">{error}</p>}
   {readOnlyReason&&<p role="status" className="scenario-note">{readOnlyReason}</p>}
   {hint&&!hint.rowId&&<p role="status" className="scenario-note">{hint.text}</p>}
   {formDraft.status&&embedded&&<p role="status" className="scenario-note">{formDraft.status}</p>}
   <div className="scenario-footer-actions">
    <button type="button" disabled={!dirty||!preview?.items.length||busy||blocked||!!readOnlyReason} onClick={()=>void save().then(saved=>{if(saved)onSaveComplete?.()})}
     className="scenario-save">{busy?'שומרים תכנון…':demo?(purchaseId?'עדכון הרכישה בדוגמה':'הוספה לדוגמה הזמנית'):(purchaseId?'שמירת השינויים בתכנון':'שמירת התרחיש בתכנון')}</button>
    {!demo&&<button type="button" disabled={!dirty||!preview||busy} onClick={backup} className={button}>גיבוי התכנון</button>}
    {blocked&&!demo&&<button type="button" disabled={busy} onClick={()=>guard.run(budget.refresh)} className={button}>טעינת הגרסה השמורה</button>}
   </div>
  </footer>
  {!embedded&&<BackLink href={href('/plans')}>חזרה לתכנון</BackLink>}
 </div>
}
export function ScenarioPage({fixture,budget}:{fixture:boolean;budget:BudgetState}){
 const [message,setMessage]=useState(''),href=usePeriodHref()
 if(fixture)return <p>יש לפתוח תקציב שמור כדי לתכנן ניסוי.</p>
 if(budget.status==='loading'||budget.refreshPending)return <p role="status">טוען תכנון…</p>
 if(budget.status==='error')return <p role="alert">{budget.message}</p>
 const plan=budget.value.plan,reason=!plan||plan.format||!validatePlan(plan)?'התקציב אינו זמין לניסוי בתצוגה הזו.':budget.spaces.find(s=>s.id===budget.budgetId)?.role==='viewer'?'התקציב פתוח לצפייה בלבד.':budget.value.writeIdentityBound!==true?'שמירה מוגנת אינה זמינה בשרת הזה.':null
 return <div className="mx-auto max-w-3xl space-y-5"><PageHeading className="text-2xl font-semibold">מחשבון רכישה</PageHeading><Link href={href('/income')} className="inline-flex min-h-11 items-center text-primary underline">הכנסות עתידיות והערכות</Link>{message&&<p role="status" className="surface rounded-xl p-4 text-sm">{message}</p>}{reason?<section className="surface space-y-3 rounded-xl p-4"><p>{reason}</p><BackLink href={href('/plans')}>חזרה לתכנון</BackLink></section>:<ScenarioEditor key={budget.budgetId+'/'+budget.value.accountId+'/'+budget.value.revision} budget={budget} base={budget.value} onSaved={setMessage}/>}</div>
}
