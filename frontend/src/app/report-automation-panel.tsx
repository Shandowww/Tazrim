import {useEffect,useRef,useState} from 'react'
import {budgetFields,cashAccountList,creditCards} from '../../../src/budget.js'
import type {BudgetState} from './use-budget'
import {AccessError} from './budget-api'
import {useFinancialDraft} from './draft-guard'
import {loadAutomation,updateAutomation,type AutomationSnapshot} from './report-automation-api'
import Link from './link'

const button='min-h-11 rounded-xl border px-4 py-2 text-sm disabled:opacity-50'
const statuses={queued:'ממתין להכנה',working:'מכין הצעה…',review:'מוכן לבדיקה',attention:'דורש טיפול',rejected:'ההצעה נדחתה',imported:'נקלט בתקציב'}
const amount=(value:number)=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:2}).format(value)
export function ReportAutomationPanel({budget,tick,names,href}:{budget:Extract<BudgetState,{status:'ready'}>;tick:number;names:Record<string,string>;href:(path:string,route?:any)=>string}){
 const [snapshot,setSnapshot]=useState<AutomationSnapshot|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0)
 const [rejectId,setRejectId]=useState<string|null>(null)
 const flight=useRef(false),mounted=useRef(true),accountId=budget.value.accountId
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 useEffect(()=>{const abort=new AbortController();loadAutomation(accountId,abort.signal).then(v=>{if(!abort.signal.aborted)setSnapshot(v)}).catch(e=>{if(!abort.signal.aborted){if(e instanceof AccessError)budget.invalidate(e.message);else setError(e.message)}});return()=>abort.abort()},[accountId,tick,refresh])
 useFinancialDraft({kind:'detail',dirty:consent||!!rejectId,busy,discard:()=>{setConsent(false);setRejectId(null)}})
 const run=async(input:unknown,success:string)=>{if(flight.current)return;flight.current=true;setBusy(true);setError('');try{await updateAutomation(accountId,input);if(mounted.current){setConsent(false);setRejectId(null);setMessage(success);setRefresh(v=>v+1)}}catch(e){if(mounted.current){if(e instanceof AccessError)budget.invalidate(e.message);else setError(e instanceof Error?e.message:'הפעולה לא הושלמה. יש לרענן ולבדוק.')}}finally{flight.current=false;if(mounted.current)setBusy(false)}}
 if(!snapshot?.available)return error?<p role="alert">{error}</p>:null
 const policy=snapshot.policies?.find(p=>p.budget===budget.budgetId),owner=budget.spaces.find(s=>s.id===budget.budgetId)?.role==='owner',plan=budget.value.plan
 const targets=plan?[...cashAccountList(plan),...creditCards(plan)]:[],fields=plan?budgetFields(plan):[]
 return <section className="surface space-y-4 rounded-xl p-4" aria-label="הכנה אוטומטית של דוחות">
  <h2 className="font-semibold">הכנה אוטומטית · בדיקה לפני קליטה</h2>
  <p className="text-sm">דוחות עם שיוך מזהה שאישרת יוכנו לבדיקה. סכומים יישמרו בתקציב רק אחרי הבדיקה והאישור שלך במרכז הדוחות.</p>
  <p className="text-sm">התקציב הנבחר: {budget.value.budget?.name??'התקציב שלי'} · {policy?.enabled?'ההכנה פעילה':'ההכנה מושהית'}</p>
  {owner&&(!policy?.enabled?<><label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>אני מאשר/ת לשרת לקרוא דוחות שמגיעים לתיבה ולהכין הצעות לתקציב הזה לפי שיוכים שאישרתי. אישור זה אינו מאשר שמירת סכומים.</label><button className={button} disabled={busy||!consent} onClick={()=>void run({action:'policy',budget:budget.budgetId,enabled:true,revision:policy?.revision??0,confirmReadAndPrepare:true},'ההכנה האוטומטית הופעלה לדוחות הבאים.')}>הפעלת הכנה לתקציב הזה</button></>:<button className={button} disabled={busy} onClick={()=>void run({action:'policy',budget:budget.budgetId,enabled:false,revision:policy.revision},'ההכנה הושהתה. ההצעות הקיימות נשמרו.')}>השהיית ההכנה</button>)}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm">{message}</p>}
  {(snapshot.jobs??[]).some(j=>j.status==='queued'||j.status==='working')&&<button className={button} disabled={busy} onClick={()=>void run({action:'resume'},'נבדקה התקדמות התור. דוחות שנותרו ממתינים יוצגו כאן.')}>המשך הכנת דוחות ממתינים</button>}
  <ul className="space-y-4">{(snapshot.jobs??[]).map(job=>{
   const own=job.budget===budget.budgetId,summary=job.summary,target=own?targets.find((t:any)=>t.id===job.target):null,route={budget:job.budget,kind:job.kind,target:job.target}
   return <li key={job.id} className="space-y-3 rounded-xl border p-3">
    <h3 className="break-words font-semibold"><bdi>{names[job.id]??'דוח בתיבת הסנכרון'}</bdi> · {statuses[job.status]}</h3>
    {job.budget&&<p className="text-sm">{budget.spaces.find(s=>s.id===job.budget)?.name??'תקציב משויך'}{target&&<> · {target.label??target.name} <bdi>{target.alias??''}</bdi></>}</p>}
    {job.message&&<p className="text-sm">{job.message}</p>}
    {job.stale&&job.status!=='imported'&&<p className="text-sm">התקציב או הפענוח השתנו מאז ההכנה. נדרשת בדיקה מחודשת לפני אישור.</p>}
    {summary&&<><p className="text-sm"><bdi>{summary.months.join(', ')}</bdi> · חדשות: {summary.counts.new} · כפילויות: {summary.counts.duplicates} · תיקונים לבדיקה: {summary.counts.conflicts} · שאלות: {summary.counts.questions}</p>{summary.cardTotal!==null&&<p className="text-sm">סך חיוב בדוח: <bdi>{amount(summary.cardTotal)}</bdi></p>}
     {own&&summary.after&&<div className="space-y-3">{summary.before.map(before=>{const after=summary.after?.find(a=>a.month===before.month);const changed=fields.filter(([key]:string[])=>before.values[key]!==after?.values[key]);return <div key={before.month}><p className="text-sm font-medium"><bdi>{before.month}</bdi> · סכומים חודשיים לפני ואחרי</p>{changed.length?<ul className="text-sm">{changed.map(([key,label]:string[])=><li key={key}>{label}: <bdi>{amount(before.values[key]??0)}</bdi> ← <bdi>{amount(after?.values[key]??0)}</bdi></li>)}</ul>:<p className="text-sm">אין שינוי בסכומים החודשיים.</p>}</div>})}</div>}
     {summary.warnings.map((warning,i)=><p key={i} className="text-sm">{warning}</p>)}<p className="text-xs text-muted-foreground">הודעות המנפיק מוצגות בנפרד במרכז העדכונים ואינן חיובים.</p>
    </>}
    {job.reportId&&job.budget&&<Link className="inline-flex min-h-11 items-center text-sm underline" href={href('/upload/'+encodeURIComponent(job.reportId)+'/group',route)}>בדיקת פרטי העסקאות, תיקון ואישור קליטה</Link>}
    {['review','attention'].includes(job.status)&&<div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={()=>void run({action:'prepare',id:job.id,revision:job.revision},'ההצעה נבדקה מחדש. יש לעבור על התוצאה לפני אישור.')}>הכנה מחדש</button><button className={button} disabled={busy} onClick={()=>setRejectId(job.id)}>דחיית ההצעה</button></div>}
    {rejectId===job.id&&<div className="space-y-2"><p className="text-sm">לדחות את ההצעה? המקור והרשומות הקיימות נשמרים. אפשר להמשיך בבדיקה ידנית.</p><button className={button} disabled={busy} onClick={()=>void run({action:'reject',id:job.id,revision:job.revision},'ההצעה נדחתה. לא נשמרו סכומים.')}>אישור דחיית ההצעה</button><button className={button} disabled={busy} onClick={()=>setRejectId(null)}>ביטול</button></div>}
   </li>
  })}</ul>
  {busy&&<p role="status">מעדכן הכנת דוחות…</p>}
 </section>
}
