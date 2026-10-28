import {useRef,useState} from 'react'
import {useCreatedEditorRoute} from './use-created-editor-route'
import {useLocation,useParams} from 'react-router-dom'
import {accountColors,cashAccountList} from '../../../src/budget.js'
import {accountDraftFingerprint,initialAccountDraft,manualAccountEligibility,prepareManualAccount,type AccountDraft} from './account-command'
import {savePreparedPlan,SaveConflict} from './plan-save'
import {AccessError,type BudgetResponse} from './budget-api'
import {useFinancialDraft,useDraftGuard} from './draft-guard'
import type {BudgetState} from './use-budget'
import {legacyBudgetHref} from './navigation-query'
import Link from './link'
import {usePeriodHref} from '../tazrim/components/layout/period-context'
import {BankElement} from '../tazrim/components/accounts/account-element'
const input='mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'
function todayMonth(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit'}).formatToParts(new Date());return parts.find(p=>p.type==='year')!.value+'-'+parts.find(p=>p.type==='month')!.value}
function AccountEditor({budget,base,id,create,onSaved}:{budget:BudgetState;base:BudgetResponse;id:string;create:boolean;onSaved:(message:string)=>void}){
 const asOf=todayMonth(),[baseline]=useState(()=>initialAccountDraft(base.plan,create?'':id,asOf)),[draft,setDraft]=useState<AccountDraft>(baseline),[busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[error,setError]=useState<string|null>(null),inFlight=useRef(false),guard=useDraftGuard(),dirty=accountDraftFingerprint(draft)!==accountDraftFingerprint(baseline)
 const update=(key:keyof AccountDraft,value:string)=>{setDraft({...draft,[key]:value});setError(null);onSaved('')}
 const save=async()=>{if(inFlight.current||!dirty||blocked)return false;inFlight.current=true;setBusy(true);setError(null);try{const plan=prepareManualAccount(base.plan,id,draft,{create,asOf}),result=await savePreparedPlan({budgetId:budget.budgetId,base,plan});budget.accept(result);onSaved(result.recovered?'שמירת החשבון אושרה מול הנתונים השמורים.':'פרטי החשבון נשמרו.');return true}catch(e){const message=e instanceof Error?e.message:'החשבון לא נשמר.';if(e instanceof AccessError){budget.invalidate(message);return false}if(e instanceof SaveConflict)setBlocked(true);setError(message);return false}finally{inFlight.current=false;setBusy(false)}}
 useFinancialDraft({kind:'cash',dirty,busy,discard:()=>{setDraft(baseline);setError(null);setBlocked(false)},save:blocked?undefined:save})
 const backup=()=>{try{const plan=prepareManualAccount(base.plan,id,draft,{create,asOf}),url=URL.createObjectURL(new Blob([JSON.stringify({format:'monthly-flow-v1',plan},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='budgit-account-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError(e instanceof Error?e.message:'יש לתקן את השדות לפני הכנת גיבוי.')}}
 return <form className="space-y-5" onSubmit={event=>{event.preventDefault();void save()}}>
  <div className="max-w-md"><BankElement provider={cashAccountList(base.plan).find(a=>a.id===id)?.bankName??''} name={draft.label} colorChoice={draft.color||null} emptyText="תצוגת שם וצבע בלבד · ללא יתרה מדווחת" /></div>
  <fieldset disabled={busy} className="surface space-y-4 rounded-xl p-4 sm:p-6"><h2 className="font-semibold">פרטי חשבון הבנק</h2>
   <label className="block text-sm">שם החשבון<input className={input} name="account-label" value={draft.label} maxLength={80} onChange={event=>update('label',event.target.value)} /></label>
   <label className="block text-sm">צבע החשבון<select className={input} value={draft.color} onChange={event=>update('color',event.target.value)}><option value="">לפי ברירת המחדל של החשבון</option>{accountColors.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label className="block text-sm">כרית מזומן · ₪<input className={input} dir="ltr" inputMode="decimal" name="account-buffer" value={draft.buffer} maxLength={32} onChange={event=>update('buffer',event.target.value)} /></label>
   <label className="block text-sm">יתרת פתיחה לחשבון · ₪<input className={input} dir="ltr" inputMode="decimal" name="account-opening" value={draft.opening} maxLength={32} onChange={event=>update('opening',event.target.value)} /></label><p className="text-sm text-muted-foreground">ריק בחשבון חדש משאיר יתרה לא ידועה; אפס הוא יתרה מפורשת. אפשר להזין מינוס ליתרה שלילית. יתרת פתיחה אינה דיווח בנק או הכנסה.</p>
   <label className="block text-sm">חודש יתרת הפתיחה<input type="month" className={input} value={draft.openingMonth} min={base.plan?.startMonth as string} max={asOf} disabled={!draft.opening.trim()} onChange={event=>update('openingMonth',event.target.value)} /></label>
   <p className="text-sm text-muted-foreground">החשבון נשמר רק במרחב הנבחר. הוספתו אינה משייכת אליו סכומי חודשים, כרטיסים או התחייבויות ואינה משנה את יתרת התקציב הכוללת. תנועות המקור, דיווחי הבנק ושיוכי הכרטיסים נשמרים. יתרת פתיחה ידנית אינה משנה את הנתונים בקובץ הבנק.</p>
  </fieldset>
  {error&&<p className="rounded-xl border border-destructive p-4 text-sm text-destructive" role="alert">{error}</p>}
  <div className="surface flex flex-wrap items-center gap-3 rounded-xl p-4"><p role="status" className="flex-1 text-sm">{busy?'שומרים את החשבון…':dirty?'יש שינויים שעדיין לא נשמרו':'אין שינויים לשמירה'}</p><button type="submit" disabled={!dirty||busy||blocked} className="h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">שמירת החשבון</button><button type="button" disabled={!dirty||busy} onClick={backup} className="h-11 rounded-xl border px-4 text-sm disabled:opacity-50">גיבוי הטיוטה</button>{blocked&&<button type="button" disabled={busy} onClick={()=>guard.run(budget.refresh)} className="h-11 rounded-xl border px-4 text-sm">טעינת הגרסה השמורה</button>}</div>
 </form>
}
export function AccountPage({create=false,fixture,budget}:{create?:boolean;fixture:boolean;budget:BudgetState}){
 const {id:routeId}=useParams(),{search,state}=useLocation(),[newId]=useState(()=>crypto.randomUUID()),[message,setMessage]=useState(()=>typeof state?.setupSavedMessage==='string'?state.setupSavedMessage:''),[completedId,setCompletedId]=useState<string|null>(null),periodHref=usePeriodHref(),id=create?(completedId??newId):(routeId??'')
 useCreatedEditorRoute(create&&completedId?periodHref('/accounts/'+encodeURIComponent(completedId)+'/edit'):null,message)
 if(fixture)return <section className="surface rounded-xl p-6">נתוני הדוגמה אינם נשמרים. יש לפתוח תקציב שמור לעריכת חשבונות.</section>
 if(budget.status==='loading'||budget.refreshPending)return <section role="status" className="surface rounded-xl p-6">טוען חשבון…</section>
 if(budget.status==='error')return <section role="alert" className="surface rounded-xl p-6">{budget.message}</section>
 const reason=budget.spaces.find(s=>s.id===budget.budgetId)?.role==='viewer'?'התקציב פתוח לצפייה בלבד.':budget.value.writeIdentityBound!==true?'השמירה המוגנת עדיין אינה זמינה בשרת הזה.':manualAccountEligibility(budget.value.plan,create&&!completedId?'':id)
 return <div className="mx-auto max-w-3xl space-y-5"><Link className="text-primary underline text-sm" href={periodHref('/banks')}>חזרה לבנקים</Link><h1 className="text-2xl font-semibold">{create&&!completedId?'הוספת חשבון בנק':'עריכת חשבון בנק'}</h1><p className="text-sm text-muted-foreground"><bdi>{budget.spaces.find(s=>s.id===budget.budgetId)?.name}</bdi> · <bdi dir="ltr">{budget.value.accountEmail}</bdi></p>{message&&<p role="status" className="surface rounded-xl p-4 text-sm">{message}</p>}{reason?<section className="surface rounded-xl p-6"><p>{reason}</p><a className="mt-3 inline-block text-primary underline" href={legacyBudgetHref(search,'accounts')}>פתיחה בממשק הקיים</a></section>:<AccountEditor key={budget.budgetId+'/'+id+'/'+budget.value.revision} id={id} create={create&&!completedId} budget={budget} base={budget.value} onSaved={value=>{setMessage(value);if(value&&create)setCompletedId(id)}} />}</div>
}
