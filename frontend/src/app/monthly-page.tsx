import {useRef,useState} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import {budgetFields} from '../../../src/budget.js'
import {initialMonthlyDraft,manualMonthEligibility,monthlyDraftFingerprint,prepareMonthlyReport,saveMonthlyReport,SaveConflict,type MonthlyDraft} from './monthly-report'
import {AccessError,type BudgetResponse} from './budget-api'
import type {BudgetState} from './use-budget'
import {useDraftGuard,useFinancialDraft} from './draft-guard'
import {legacyBudgetHref} from './navigation-query'
function todayMonth(){const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit'}).formatToParts(new Date());return p.find(v=>v.type==='year')!.value+'-'+p.find(v=>v.type==='month')!.value}
function exportDraft(base:BudgetResponse,budgetId:string,month:string,draft:MonthlyDraft,asOf:string){
 let payload:unknown
 try{payload={format:'monthly-flow-v1',plan:prepareMonthlyReport(base.plan,month,draft,asOf)}}catch{payload={format:'monthly-flow-monthly-draft-v1',accountId:base.accountId,budgetId,month,baseRevision:base.revision,draft}}
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='budgit-monthly-draft-'+month+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
function MonthlyEditor({base,budget,month,asOf,onSaved}:{base:BudgetResponse;budget:BudgetState;month:string;asOf:string;onSaved:(message:string)=>void}){
 const [baseline]=useState(()=>initialMonthlyDraft(base.plan,month)),[draft,setDraft]=useState<MonthlyDraft>(baseline),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[blocked,setBlocked]=useState(false),flight=useRef(false),guard=useDraftGuard()
 const dirty=monthlyDraftFingerprint(draft)!==monthlyDraftFingerprint(baseline)
 const discard=()=>{setDraft(baseline);setError(null);setBlocked(false)}
 const save=async()=>{
  if(flight.current||!dirty||blocked)return false
  flight.current=true;setBusy(true);setError(null)
  try{const result=await saveMonthlyReport({budgetId:budget.budgetId,base,month,draft,asOf});budget.accept(result);onSaved(result.recovered?'השמירה אושרה מול התקציב השמור.':'הדיווח נשמר בתקציב.');return true}
  catch(e){const message=e instanceof Error?e.message:'הדיווח לא נשמר.';if(e instanceof AccessError){budget.invalidate(message);return false}if(e instanceof SaveConflict)setBlocked(true);setError(message);return false}
  finally{flight.current=false;setBusy(false)}
 }
 useFinancialDraft({kind:'monthly',dirty,busy,discard,save:blocked?undefined:save})
 return <form className="space-y-5" onChange={()=>onSaved('')} onSubmit={event=>{event.preventDefault();void save()}}>
  <fieldset disabled={busy} className="space-y-5">
   <section className="surface rounded-xl p-4 sm:p-6"><h2 className="font-semibold">סכומי החודש · ₪</h2><p className="mt-1 text-sm text-muted-foreground">דיווח ידני לכל התקציב, ללא חשבונות בנק מוגדרים. שדה סכום ריק יישמר כאפס. עריכת שדות אינה שומרת אוטומטית. שינוי שכר יעדכן גם דיווחי הערכה עתידיים שמורים.</p>
    <p className="mt-2 text-sm text-muted-foreground">{budget.budgetId==='personal'?'בדיווח האישי, חיסכון משותף הוא רק ההפקדה שלך שיוצאת מהחשבון האישי, ללא הפקדת בן או בת הזוג.':'בדיווח משותף, חיסכון משותף הוא סך ההפקדות המשותפות המדווחות, כולל תרומות המשתתפים. אין להוסיף אותן שוב בדיווח אישי.'}</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">{budgetFields(base.plan).map(([key,label])=><label key={key} className="min-w-0 text-sm">{label}<input name={'monthly-'+key} inputMode="decimal" dir="ltr" type="text" value={draft.values[key]} autoComplete="off" maxLength={32} className="mt-1 h-11 w-full rounded-xl border bg-card px-3 tabular-nums" onChange={event=>{setDraft({...draft,values:{...draft.values,[key]:event.target.value}});setError(null)}} /></label>)}</div>
   </section>
   <section className="surface space-y-3 rounded-xl p-4 sm:p-6"><h2 className="font-semibold">מה כולל הדיווח?</h2>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={draft.actual} disabled={month>asOf&&!draft.actual} onChange={event=>setDraft({...draft,actual:event.target.checked})} className="mt-1 h-5 w-5" /><span>אלה נתוני אמת לחודש הזה{month>asOf?' · חודש עתידי נשמר כהערכה בלבד':''}</span></label>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={draft.includesCard} onChange={event=>setDraft({...draft,includesCard:event.target.checked})} className="mt-1 h-5 w-5" /><span>סכומי הכרטיס כוללים כבר את התשלומים המתוכננים בכרטיס</span></label>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={draft.includesDirect} onChange={event=>setDraft({...draft,includesDirect:event.target.checked})} className="mt-1 h-5 w-5" /><span>הסכומים כוללים כבר את הפריטים המתוכננים הישירים</span></label>
    <p className="text-sm text-muted-foreground">סימון חיובים שכבר נכללו מונע הוספה כפולה. עד אישור נתוני אמת, הסכומים נשארים הערכה. אין כאן אישור שבוצע תשלום בבנק.</p>
   </section>
  </fieldset>
  {error&&<p className="rounded-xl border border-destructive p-4 text-sm text-destructive" role="alert">{error}</p>}
  <div className="surface flex flex-wrap items-center gap-3 rounded-xl p-4"><p className="min-w-0 flex-1 text-sm" role="status">{busy?'שומרים את הדיווח…':dirty?'יש שינויים שעדיין לא נשמרו':'אין שינויים לשמירה'}</p><button className="h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50" type="submit" disabled={!dirty||busy||blocked}>שמירת הדיווח</button><button className="h-11 rounded-xl border px-4 text-sm disabled:opacity-50" type="button" disabled={!dirty||busy} onClick={()=>exportDraft(base,budget.budgetId,month,draft,asOf)}>הורדת גיבוי לטיוטה</button>{blocked&&<button className="h-11 rounded-xl border px-4 text-sm" type="button" disabled={busy} onClick={()=>guard.run(budget.refresh)}>טעינת הגרסה השמורה</button>}</div>
 </form>
}
export function MonthlyPage({fixture,budget}:{fixture:boolean;budget:BudgetState}){
 const {search}=useLocation(),navigate=useNavigate(),[notice,setNotice]=useState<string|null>(null),asOf=todayMonth(),params=new URLSearchParams(search),year=/^20\d{2}$/.test(params.get('year')||'')?params.get('year')!:asOf.slice(0,4),part=/^(?:[1-9]|1[0-2]|0[1-9])$/.test(params.get('month')||'')?String(Number(params.get('month'))).padStart(2,'0'):year===asOf.slice(0,4)?asOf.slice(5):'01',month=year+'-'+part,editorHref=legacyBudgetHref(search)
 if(fixture)return <section className="surface rounded-xl p-6">דוגמת התצוגה אינה נשמרת. לעריכה יש לפתוח תקציב שמור.</section>
 if(budget.status==='loading')return <section role="status" className="surface rounded-xl p-6">טוען דיווח…</section>
 if(budget.refreshPending)return <section role="status" className="surface rounded-xl p-6">מרענן את הדיווח…</section>
 if(budget.status==='error')return <section role="alert" className="surface rounded-xl p-6">{budget.message}</section>
 const role=budget.spaces.find(space=>space.id===budget.budgetId)?.role,reason=role==='viewer'?'התקציב פתוח לצפייה בלבד.':budget.value.writeIdentityBound!==true?'השמירה המוגנת עדיין אינה זמינה בשרת הזה.':manualMonthEligibility(budget.value.plan,month)
 return <div className="mx-auto max-w-5xl space-y-5"><h1 className="text-2xl font-semibold">דיווח חודשי</h1><p className="text-sm text-muted-foreground"><bdi>{budget.spaces.find(s=>s.id===budget.budgetId)?.name}</bdi> · <bdi dir="ltr">{budget.value.accountEmail}</bdi></p><label className="flex flex-wrap items-center gap-3 text-sm">חודש הדיווח<input type="month" aria-label="חודש הדיווח" value={month} min={(budget.value.plan?.startMonth as string)||undefined} className="h-11 rounded-xl border bg-card px-3" onChange={event=>{const [y,m]=event.target.value.split('-');if(!y||!m)return;const next=new URLSearchParams(search);next.set('year',y);next.set('month',String(Number(m)));navigate('/monthly?'+next)}} /></label>
  {notice&&<p role="status" className="surface rounded-xl p-4 text-sm">{notice}</p>}
  {reason?<section className="surface rounded-xl p-6"><p>{reason}</p><a href={editorHref} className="mt-3 inline-block text-primary underline">פתיחה בממשק הקיים</a></section>:<MonthlyEditor key={budget.budgetId+'/'+month+'/'+budget.value.revision} base={budget.value} budget={budget} month={month} asOf={asOf} onSaved={setNotice} />}
 </div>
}
