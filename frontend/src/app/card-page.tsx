import {useRef,useState} from 'react'
import {useCreatedEditorRoute} from './use-created-editor-route'
import {useLocation,useParams} from 'react-router-dom'
import {creditCards,cashAccountList} from '../../../src/budget.js'
import {cardConfigEligibility,initialCardDraft,cardDraftFingerprint,prepareCardConfig,type CardDraft} from './card-command'
import {savePreparedPlan,SaveConflict} from './plan-save'
import {AccessError,type BudgetResponse} from './budget-api'
import type {BudgetState} from './use-budget'
import {useFinancialDraft,useDraftGuard} from './draft-guard'
import {legacyBudgetHref} from './navigation-query'
import Link from './link'
import {usePeriodHref} from '../tazrim/components/layout/period-context'
import {PaymentCard} from '../tazrim/components/accounts/account-element'
const input='mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'
function CardEditor({budget,base,id,create,onSaved}:{budget:BudgetState;base:BudgetResponse;id:string;create:boolean;onSaved:(message:string)=>void}){
 const [baseline]=useState(()=>initialCardDraft(base.plan,create?'':id)),[draft,setDraft]=useState<CardDraft>(baseline),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[blocked,setBlocked]=useState(false),flight=useRef(false),guard=useDraftGuard(),dirty=cardDraftFingerprint(draft)!==cardDraftFingerprint(baseline),accounts=cashAccountList(base.plan),existing=creditCards(base.plan).find((c:any)=>c.id===id)
 const update=(key:keyof CardDraft,value:string)=>{setDraft({...draft,[key]:value});setError(null);onSaved('')}
 const save=async()=>{if(flight.current||!dirty||blocked)return false;flight.current=true;setBusy(true);setError(null);try{const plan=prepareCardConfig(base.plan,id,draft,create),result=await savePreparedPlan({budgetId:budget.budgetId,base,plan});budget.accept(result);onSaved(result.recovered?'שמירת הכרטיס אושרה מול הנתונים השמורים.':'פרטי הכרטיס נשמרו.');return true}catch(e){const message=e instanceof Error?e.message:'הכרטיס לא נשמר.';if(e instanceof AccessError){budget.invalidate(message);return false}if(e instanceof SaveConflict)setBlocked(true);setError(message);return false}finally{flight.current=false;setBusy(false)}}
 useFinancialDraft({kind:'card',dirty,busy,discard:()=>{setDraft(baseline);setError(null);setBlocked(false)},save:blocked?undefined:save})
 const backup=()=>{try{const plan=prepareCardConfig(base.plan,id,draft,create),url=URL.createObjectURL(new Blob([JSON.stringify({format:'monthly-flow-v1',plan},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='budgit-card-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError(e instanceof Error?e.message:'יש לתקן את הפרטים לפני הכנת גיבוי.')}}
 return <form className="space-y-5" onSubmit={event=>{event.preventDefault();void save()}}>
  <div className="max-w-sm"><PaymentCard provider={existing?.provider??''} name={draft.name||'הכרטיס שלי'} lastFour={/^\d{4}$/.test(draft.alias)?draft.alias:null} network={existing?.network??null} colorChoice={existing?.color??null} /></div>
  <fieldset disabled={busy} className="surface space-y-4 rounded-xl p-4 sm:p-6"><h2 className="font-semibold">פרטי הכרטיס</h2>
   <label className="block text-sm">שם הכרטיס<input name="card-name" className={input} value={draft.name} maxLength={60} onChange={event=>update('name',event.target.value)} /></label>
   <label className="block text-sm">כינוי ייחודי או ארבע ספרות אחרונות<input name="card-alias" className={input} value={draft.alias} maxLength={80} onChange={event=>update('alias',event.target.value)} /></label><p className="text-sm text-muted-foreground">אין להזין מספר כרטיס מלא, קוד אבטחה או פרטי כניסה. הכינוי עשוי לשמש לזיהוי בקיצור Apple Pay; שינויו מחייב בדיקת החיבור הקיים. הוא אינו קובע מי משלם או מי רשאי לצפות בכרטיס.</p>
   <label className="block text-sm">יום חיוב בחודש<input name="card-billing-day" type="text" inputMode="numeric" dir="ltr" className={input} value={draft.billingDay} maxLength={2} onChange={event=>update('billingDay',event.target.value)} /></label>
   {create&&accounts.length>0?<label className="block text-sm">חשבון משלם<select className={input} value={draft.payer} onChange={event=>update('payer',event.target.value)}><option value="">בחירת חשבון מפורשת</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>:<p className="text-sm text-muted-foreground">חשבון משלם: <bdi>{accounts.find(a=>a.id===draft.payer)?.label||'ללא שיוך שמור'}</bdi>{!create&&' · שינוי שיוך לכרטיס קיים נעשה בממשק הקיים לאחר בדיקת הדיווחים.'}</p>}
   {existing?.removedFrom&&<p className="text-sm text-muted-foreground">הכרטיס הופסק החל מ־<bdi dir="ltr">{existing.removedFrom}</bdi>. עריכת הפרטים אינה מפעילה אותו מחדש ואינה מוחקת תשלומים קיימים.</p>}
   <p className="text-sm text-muted-foreground">השמירה משנה פרטי כרטיס בלבד. סכומי דיווח, רכישות ותשלומים קיימים נשמרים כפי שהם. לכרטיס חדש אין דיווח חיוב עד קליטת נתונים; אפס בהערכת הבסיס אינו דוח שהתקבל. אין כאן חיבור לבנק או בקשה לכרטיס חדש.</p>
  </fieldset>
  {error&&<p role="alert" className="rounded-xl border border-destructive p-4 text-sm text-destructive">{error}</p>}
  <div className="surface flex flex-wrap items-center gap-3 rounded-xl p-4"><p role="status" className="flex-1 text-sm">{busy?'שומרים את הכרטיס…':dirty?'יש שינויים שעדיין לא נשמרו':'אין שינויים לשמירה'}</p><button type="submit" disabled={!dirty||busy||blocked} className="h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">שמירת הכרטיס</button><button type="button" disabled={!dirty||busy} onClick={backup} className="h-11 rounded-xl border px-4 text-sm disabled:opacity-50">גיבוי הטיוטה</button>{blocked&&<button type="button" disabled={busy} onClick={()=>guard.run(budget.refresh)} className="h-11 rounded-xl border px-4 text-sm">טעינת הגרסה השמורה</button>}</div>
 </form>
}
export function CardPage({mode,fixture,budget}:{mode:'list'|'new'|'edit';fixture:boolean;budget:BudgetState}){
 const {id:routeId}=useParams(),{search,state}=useLocation(),[newId]=useState(()=>'card_'+crypto.randomUUID()),[completed,setCompleted]=useState<string|null>(null),[message,setMessage]=useState(()=>typeof state?.setupSavedMessage==='string'?state.setupSavedMessage:''),href=usePeriodHref(),id=mode==='new'?(completed??newId):(routeId??''),create=mode==='new'&&!completed
 useCreatedEditorRoute(mode==='new'&&completed?href('/card-setup/'+encodeURIComponent(completed)):null,message)
 if(fixture)return <section className="surface rounded-xl p-6">נתוני הדוגמה אינם נשמרים. יש לפתוח תקציב שמור להגדרת כרטיסים.</section>
 if(budget.status==='loading'||budget.refreshPending)return <section role="status" className="surface rounded-xl p-6">טוען כרטיסים…</section>
 if(budget.status==='error')return <section role="alert" className="surface rounded-xl p-6">{budget.message}</section>
 const plan=budget.value.plan
 if(!plan||plan.format==='monthly-flow-encrypted-v1')return <section className="surface rounded-xl p-6">{plan?'התקציב מוצפן.':'אין תקציב שמור.'} <a href={legacyBudgetHref(search,'accounts')} className="text-primary underline">פתיחה בממשק הקיים</a></section>
 const reason=mode==='list'?null:budget.spaces.find(s=>s.id===budget.budgetId)?.role==='viewer'?'התקציב פתוח לצפייה בלבד.':budget.value.writeIdentityBound!==true?'השמירה המוגנת עדיין אינה זמינה בשרת הזה.':cardConfigEligibility(plan,id,create)
 return <div className="mx-auto max-w-3xl space-y-5"><Link href={href('/cards')} className="text-primary underline text-sm">חזרה לכרטיסים</Link><h1 className="text-2xl font-semibold">{mode==='list'?'הגדרת כרטיסים':create?'הוספת כרטיס':'עריכת פרטי כרטיס'}</h1><p className="text-sm text-muted-foreground"><bdi>{budget.spaces.find(s=>s.id===budget.budgetId)?.name}</bdi> · <bdi dir="ltr">{budget.value.accountEmail}</bdi></p>{message&&<p role="status" className="surface rounded-xl p-4 text-sm">{message}</p>}
 {mode==='list'?<><Link href={href('/card-setup/new')} className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm">הוספת כרטיס</Link><section className="surface rounded-xl p-4"><ul className="divide-y">{creditCards(plan).map((c:any)=><li key={c.id}><Link className="flex min-h-11 flex-wrap items-center justify-between gap-3 py-3 text-sm" href={href('/card-setup/'+encodeURIComponent(c.id))}><bdi>{c.name}</bdi><span>{c.removedFrom?'הופסק החל מ־'+c.removedFrom:'עריכת פרטים'} · <bdi>{c.alias||'ללא כינוי'}</bdi></span></Link></li>)}</ul></section></>:reason?<section className="surface rounded-xl p-6"><p>{reason}</p><a href={legacyBudgetHref(search,'accounts')} className="mt-3 inline-block text-primary underline">פתיחה בממשק הקיים</a></section>:<CardEditor key={budget.budgetId+'/'+id+'/'+budget.value.revision} id={id} create={create} budget={budget} base={budget.value} onSaved={text=>{setMessage(text);if(text&&create)setCompleted(id)}} />}
 </div>
}
