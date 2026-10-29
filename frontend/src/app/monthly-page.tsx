import {loadDeviceDraft} from './device-draft-api'
import {useRef,useState} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import Link from './link'
import {withViewQuery} from './navigation-query'
import {budgetFields,cashAccountList} from '../../../src/budget.js'
import {initialMonthlyDraft,manualMonthEligibility,monthlyDraftFingerprint,saveMonthlyReport,SaveConflict,type MonthlyDraft} from './monthly-report'
import {createMonthlyRecovery,readMonthlyRecovery,originalMonthlyFields} from './monthly-recovery'
import {AccessError,type BudgetResponse} from './budget-api'
import type {BudgetState} from './use-budget'
import {useDraftGuard,useFinancialDraft} from './draft-guard'
import {legacyBudgetHref} from './navigation-query'
function todayMonth(){const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit'}).formatToParts(new Date());return p.find(v=>v.type==='year')!.value+'-'+p.find(v=>v.type==='month')!.value}
async function exportDraft(base:BudgetResponse,budgetId:string,month:string,draft:MonthlyDraft,asOf:string){
 const payload=await createMonthlyRecovery(base,budgetId,month,draft,asOf)
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='budgit-monthly-draft-'+month+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
function MonthlyEditor({base,budget,month,asOf,onSaved}:{base:BudgetResponse;budget:BudgetState;month:string;asOf:string;onSaved:(message:string)=>void}){
 const [baseline]=useState(()=>initialMonthlyDraft(base.plan,month)),[draft,setDraft]=useState<MonthlyDraft>(baseline),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[blocked,setBlocked]=useState(false),flight=useRef(false),fileRef=useRef<HTMLInputElement>(null),[recoveryBusy,setRecoveryBusy]=useState(false),guard=useDraftGuard()
 const dirty=monthlyDraftFingerprint(draft)!==monthlyDraftFingerprint(baseline)
 const discard=()=>{setDraft(baseline);setError(null);setBlocked(false)}
 const save=async()=>{
  if(flight.current||recoveryBusy||!dirty||blocked)return false
  flight.current=true;setBusy(true);setError(null)
  try{const result=await saveMonthlyReport({budgetId:budget.budgetId,base,month,draft,asOf});budget.accept(result);onSaved(result.recovered?'השמירה אושרה מול התקציב השמור.':'הדיווח נשמר בתקציב.');return true}
  catch(e){const message=e instanceof Error?e.message:'הדיווח לא נשמר.';if(e instanceof AccessError){budget.invalidate(message);return false}if(e instanceof SaveConflict)setBlocked(true);setError(message);return false}
  finally{flight.current=false;setBusy(false)}
 }
 const restore=async(file:File)=>{
  if(flight.current||busy||recoveryBusy||dirty)return
  if(file.size>12000000){setError('קובץ הטיוטה גדול מדי.');return}
  flight.current=true;setRecoveryBusy(true);setError(null)
  try{const recovered=await readMonthlyRecovery(await file.text(),base,budget.budgetId,month);setDraft(recovered);onSaved('הטיוטה נטענה במכשיר בלבד. יש לבדוק ולשמור במפורש כדי לעדכן את התקציב.')}catch(e){setError(e instanceof Error?e.message:'לא ניתן לטעון את הטיוטה.')}finally{flight.current=false;setRecoveryBusy(false)}
 }
 const restoreDevice=async()=>{if(flight.current||busy||recoveryBusy||dirty)return;flight.current=true;setRecoveryBusy(true);setError(null);try{const local=await loadDeviceDraft(budget.budgetId,base);if(!local)throw Error('לא נמצאה טיוטה לחשבון ולמרחב האלה.');setDraft(originalMonthlyFields(local,base,budget.budgetId,month));onSaved('שדות הטיוטה נטענו במכשיר בלבד. טקסט חלקי נשמר כפי שהוזן; יש לבדוק ולשמור במפורש.')}catch(e){if(e instanceof AccessError)budget.invalidate(e.message);else setError(e instanceof Error?e.message:'הטיוטה לא נטענה.')}finally{flight.current=false;setRecoveryBusy(false)}}
 useFinancialDraft({kind:'monthly',dirty,busy:busy||recoveryBusy,discard,save:blocked?undefined:save})
 return <form className="space-y-5" onChange={()=>onSaved('')} onSubmit={event=>{event.preventDefault();void save()}}>
  <fieldset disabled={busy||recoveryBusy} className="space-y-5">
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
  <section className="surface space-y-3 rounded-xl p-4"><h2 className="font-semibold">שחזור טיוטת דיווח</h2><button type="button" className="my-3 min-h-11 rounded-xl border px-4 text-sm disabled:opacity-50" disabled={dirty||busy||recoveryBusy} onClick={()=>void restoreDevice()}>טעינת שדות מטיוטת המכשיר</button><p className="text-sm text-muted-foreground">נטענים רק שדות תואמים לאותו חודש ולאותה גרסה, ללא שינויים אחרים בתקציב. לבדיקה וייצוא של טיוטה אחרת אפשר לפתוח את מסך טיוטת המכשיר.</p><Link className="inline-flex min-h-11 items-center text-primary underline" href={withViewQuery('/settings/device-draft',window.location.search)}>בדיקת טיוטת המכשיר</Link><p className="text-sm text-muted-foreground">אפשר לטעון קובץ טיוטה שהורדת מהתצוגה הזו לאותו חשבון, מרחב, חודש וגרסה שמורה. הטעינה מקומית בלבד ואינה שומרת נתונים. טיוטה מגרסה קודמת נשארת בקובץ לבדיקה ידנית.</p><input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="קובץ טיוטת דיווח" disabled={busy||recoveryBusy||dirty} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void restore(file)}} /><button type="button" className="h-11 rounded-xl border px-4 text-sm disabled:opacity-50" disabled={busy||recoveryBusy||dirty} onClick={()=>fileRef.current?.click()}>{recoveryBusy?'מכינים או טוענים טיוטה…':'טעינת טיוטה מקובץ'}</button>{dirty&&<p className="text-sm text-muted-foreground">יש לשמור או לצאת ללא שמירה לפני טעינת טיוטה אחרת.</p>}</section>
  <div className="surface flex flex-wrap items-center gap-3 rounded-xl p-4"><p className="min-w-0 flex-1 text-sm" role="status">{recoveryBusy?'מכינים או טוענים טיוטה…':busy?'שומרים את הדיווח…':dirty?'יש שינויים שעדיין לא נשמרו':'אין שינויים לשמירה'}</p><button className="h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50" type="submit" disabled={!dirty||busy||recoveryBusy||blocked}>שמירת הדיווח</button><button className="h-11 rounded-xl border px-4 text-sm disabled:opacity-50" type="button" disabled={!dirty||busy||recoveryBusy} onClick={()=>{if(flight.current||busy||recoveryBusy||!dirty)return;flight.current=true;setRecoveryBusy(true);void exportDraft(base,budget.budgetId,month,draft,asOf).catch(e=>setError(e.message||'לא ניתן להכין גיבוי.')).finally(()=>{flight.current=false;setRecoveryBusy(false)})}}>הורדת גיבוי לטיוטה</button>{blocked&&<button className="h-11 rounded-xl border px-4 text-sm" type="button" disabled={busy} onClick={()=>guard.run(budget.refresh)}>טעינת הגרסה השמורה</button>}</div>
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
  {reason?<section className="surface rounded-xl p-6"><p>{reason}</p>{budget.value.plan&&!budget.value.plan.format&&cashAccountList(budget.value.plan).map(account=><p key={account.id} className="mt-3"><Link className="text-primary underline" href={withViewQuery('/accounts/'+encodeURIComponent(account.id)+'/monthly',search)}>דיווח חודשי · {account.label}</Link></p>)}<a href={editorHref} className="mt-3 inline-block text-primary underline">פתיחה בממשק הקיים</a></section>:<MonthlyEditor key={budget.budgetId+'/'+month+'/'+budget.value.revision} base={budget.value} budget={budget} month={month} asOf={asOf} onSaved={setNotice} />}
 </div>
}
