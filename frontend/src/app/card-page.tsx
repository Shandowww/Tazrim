import {AdaptiveSections} from './adaptive-sections'
import {useFormDraft} from './use-form-draft'
import {CARD_ISSUERS,CARD_CLUBS} from '../../../src/card-metadata.js'
import {CARD_NETWORKS} from '../tazrim/lib/accounts/brands'
import {CardClubMark} from '../tazrim/components/accounts/card-club-mark'
import {savedCardIssuer,savedCardNetwork} from './budget-adapter'
import {PageHeading} from './page-heading'
import {useRef,useState} from 'react'
import {useSavedReturn} from './use-saved-return'
import {useLocation,useParams} from 'react-router-dom'
import {creditCards,cashAccountList} from '../../../src/budget.js'
import {cardConfigEligibility,initialCardDraft,cardDraftFingerprint,prepareCardConfig,type CardDraft} from './card-command'
import {savePreparedPlan,SaveConflict,SaveUncertain} from './plan-save'
import {AccessError,type BudgetResponse} from './budget-api'
import type {BudgetState} from './use-budget'
import {useDraftGuard} from './draft-guard'
import Link from './link'
import {usePeriodHref} from '../tazrim/components/layout/period-context'
import {PaymentCard} from '../tazrim/components/accounts/account-element'
const input='mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'
export function CardEditor({budget,base,id,create,onSaved,report}:{budget:BudgetState;base:BudgetResponse;id:string;create:boolean;onSaved:(message:string,saved?:BudgetResponse)=>void;report?:{id:string;seed:Partial<CardDraft>;onBack:()=>void}}){
 const href=usePeriodHref()
 const [baseline]=useState(()=>({...initialCardDraft(base.plan,create?'':id),...report?.seed}))
 const [draft,setDraft]=useState<CardDraft>(baseline),[busy,setBusy]=useState(false),[leaving,setLeaving]=useState(false),[error,setError]=useState<string|null>(null),[blocked,setBlocked]=useState(false),[uncertain,setUncertain]=useState(false)
 const flight=useRef(false),guard=useDraftGuard(),dirty=cardDraftFingerprint(draft)!==cardDraftFingerprint(baseline)
 const accounts=cashAccountList(base.plan),existing=creditCards(base.plan).find((c:any)=>c.id===id)
 const update=(key:keyof CardDraft,value:string)=>{setDraft({...draft,[key]:value});setError(null);onSaved('')}
 const saveRaw=async()=>{
  if(flight.current||(!dirty&&!report)||blocked||leaving)return false
  flight.current=true;setBusy(true);setError(null)
  try{
   if(report&&/^\d{4}$/.test(draft.alias.trim())&&draft.alias.trim()!==report.seed.alias)throw Error('ארבע הספרות צריכות להתאים לדוח. אפשר לבחור כינוי שאינו ארבע ספרות.')
   const plan=prepareCardConfig(base.plan,id,draft,create),result=await savePreparedPlan({budgetId:budget.budgetId,base,plan})
   budget.accept(result)
   onSaved(result.recovered?'שמירת הכרטיס אושרה מול הנתונים השמורים.':'פרטי הכרטיס נשמרו.',result.value)
   return true
  }catch(e){
   const message=e instanceof Error?e.message:'הכרטיס לא נשמר.'
   if(e instanceof AccessError){budget.invalidate(message);return false}
   if(e instanceof SaveConflict)setBlocked(true)
   setUncertain(!!report&&e instanceof SaveUncertain);setError(message)
   return false
  }finally{flight.current=false;setBusy(false)}
 }
 const formDraft=useFormDraft({kind:'card',dirty,busy:busy||leaving,discard:()=>{setDraft(baseline);setError(null);setBlocked(false);setUncertain(false)},save:blocked?undefined:saveRaw},{budgetId:budget.budgetId,base,kind:'card',record:report?'report-'+report.id:create?'new':id,values:draft,baseline,restore:setDraft,mutationPending:blocked||uncertain,enabled:true}),save=formDraft.save
 const back=async()=>{
  if(!report||busy||leaving||uncertain)return
  if(JSON.stringify(draft)===JSON.stringify(baseline)){report.onBack();return}
  setLeaving(true)
  const saved=await formDraft.preserve()
  setLeaving(false)
  if(saved)report.onBack()
  else setError('לא ניתן לשמור את הטיוטה במכשיר. השינויים נשארו בטופס.')
 }
 const backup=()=>{try{const plan=prepareCardConfig(base.plan,id,draft,create),url=URL.createObjectURL(new Blob([JSON.stringify({format:'monthly-flow-v1',plan},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='budgit-card-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError(e instanceof Error?e.message:'יש לתקן את הפרטים לפני הכנת גיבוי.')}}
 const cardPreview=<div className="max-w-sm card-config-preview" data-club={draft.club||undefined}><PaymentCard provider={draft.issuer||savedCardIssuer(base.plan,existing??{})} name={draft.name||'הכרטיס שלי'} lastFour={/^\d{4}$/.test(draft.alias)?draft.alias:null} network={draft.network||savedCardNetwork(base.plan,existing??{})} colorChoice={existing?.color??null} />{draft.club&&<CardClubMark club={draft.club}/>}</div>
 if(!formDraft.ready)return <p role="status">בודקים טיוטה במכשיר…</p>
 return <form className="space-y-5" onSubmit={event=>{event.preventDefault();void save()}}>
  {report&&<button type="button" disabled={busy||leaving||uncertain} className="min-h-11 text-sm underline disabled:opacity-50" onClick={()=>void back()}>חזרה לשיוך הדוח</button>}
  {!report&&<details className="form-preview"><summary>תצוגה מקדימה של הכרטיס</summary>{cardPreview}</details>}
  <AdaptiveSections labels={['שם וכינוי',report?'מנפיק וסמלים':'מנפיק ומועדון','חיוב ושיוך','הנחה ועמלות']} disabled={busy||leaving||uncertain}>
  <fieldset disabled={busy||leaving||uncertain} className="surface space-y-4 rounded-xl p-4 sm:p-6"><h2 className="font-semibold">פרטי הכרטיס</h2>
   <label className="block text-sm">שם הכרטיס<input name="card-name" className={input} value={draft.name} maxLength={60} onChange={event=>update('name',event.target.value)} /></label>
   <label className="block text-sm">כינוי ייחודי או ארבע ספרות אחרונות<input name="card-alias" dir={report?'ltr':undefined} className={input} value={draft.alias} maxLength={80} onChange={event=>update('alias',event.target.value)} /></label><p className="text-sm text-muted-foreground">אין להזין מספר כרטיס מלא, קוד אבטחה או פרטי כניסה. הכינוי עשוי לשמש לזיהוי בקיצור Apple Pay; שינויו מחייב בדיקת החיבור הקיים. הוא אינו קובע מי משלם או מי רשאי לצפות בכרטיס.</p>
  </fieldset>
  <fieldset disabled={busy||leaving||uncertain} className="surface space-y-4 rounded-xl p-4 sm:p-6"><h2 className="font-semibold">{report?'מנפיק, סמלים ומועדון':'מנפיק ומועדון'}</h2>
   <label className="block text-sm">מנפיק<select aria-label="מנפיק" name="card-issuer" className={input} value={draft.issuer??''} onChange={event=>update('issuer',event.target.value)}><option value="">לפי הפרטים הקיימים</option>{CARD_ISSUERS.map(([key,label]:string[])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label className="block text-sm">שייך למועדון<select aria-label="שייך למועדון" name="card-club" className={input} value={draft.club??''} onChange={event=>update('club',event.target.value)}><option value="">ללא מועדון</option>{CARD_CLUBS.map(([key,label]:string[])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label className="block text-sm">{report?'סמל רשת התשלום':'רשת תשלום'}<select aria-label="רשת תשלום" name="card-network" className={input} value={draft.network??''} onChange={event=>update('network',event.target.value)}><option value="">לפי הפרטים הקיימים</option>{CARD_NETWORKS.map(({key,label})=><option key={key} value={key}>{label}</option>)}</select></label>
   {report&&cardPreview}
  </fieldset>
  <fieldset disabled={busy||leaving||uncertain} className="surface space-y-4 rounded-xl p-4 sm:p-6"><h2 className="font-semibold">חיוב ושיוך</h2>
   <label className="block text-sm">יום חיוב בחודש<input name="card-billing-day" type="text" inputMode="numeric" dir="ltr" className={input} value={draft.billingDay} maxLength={2} onChange={event=>update('billingDay',event.target.value)} /></label>
   {create&&accounts.length>0?<label className="block text-sm">חשבון משלם<select name="card-payer" className={input} value={draft.payer} onChange={event=>update('payer',event.target.value)}><option value="">בחירת חשבון מפורשת</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>:<p className="text-sm text-muted-foreground">חשבון משלם: <bdi>{accounts.find(a=>a.id===draft.payer)?.label||'ללא שיוך שמור'}</bdi>{!create&&<> · <Link href={href('/cards/'+encodeURIComponent(id)+'/payer')} className="inline-flex min-h-11 items-center text-primary underline">שינוי חשבון משלם</Link></>}</p>}
   {existing?.removedFrom&&<p className="text-sm text-muted-foreground">הכרטיס הופסק החל מ־<bdi dir="ltr">{existing.removedFrom}</bdi>. עריכת הפרטים אינה מפעילה אותו מחדש ואינה מוחקת תשלומים קיימים.</p>}
   <p className="text-sm text-muted-foreground">השמירה משנה פרטי כרטיס בלבד. סכומי דיווח, רכישות ותשלומים קיימים נשמרים כפי שהם. לכרטיס חדש אין דיווח חיוב עד קליטת נתונים; אפס בהערכת הבסיס אינו דוח שהתקבל. אין כאן חיבור לבנק או בקשה לכרטיס חדש.</p>
  </fieldset>
  <fieldset disabled={busy||leaving||uncertain} className="surface space-y-4 rounded-xl p-4 sm:p-6"><h2 className="font-semibold">הנחה ודמי כרטיס <span className="text-sm font-normal text-muted-foreground">· רשות</span></h2>
   <label className="block text-sm">בחינם/הנחה עד<input name="card-discount-end" type="date" dir="ltr" min="2000-01-01" max="2099-12-31" className={input} value={draft.discountEndsOn??''} onChange={event=>update('discountEndsOn',event.target.value)} /></label>
   <label className="block text-sm">עלות לאחר תום הנחה (₪)<input name="card-fee" type="text" inputMode="decimal" dir="ltr" className={input} value={draft.feeAfterDiscount??''} onChange={event=>update('feeAfterDiscount',event.target.value)} /></label>
   <label className="block text-sm">טלפון מנפיק לחידוש הנחה<input name="card-issuer-phone" type="tel" dir="ltr" maxLength={30} className={input} value={draft.issuerPhone??''} onChange={event=>update('issuerPhone',event.target.value)} /></label>
   <p className="text-sm text-muted-foreground">חודש לפני תום ההנחה תופיע תזכורת במרכז ההתראות. הפרטים מוצגים בגב הכרטיס בלחיצה עליו במסך החשבונות. העלות מיועדת למעקב ואינה מוסיפה חיוב לתקציב.</p>
  </fieldset>
  </AdaptiveSections>
  {error&&<p role="alert" className="rounded-xl border border-destructive p-4 text-sm text-destructive">{error}</p>}
  <div className="surface flex flex-wrap items-center gap-3 rounded-xl p-4"><p role="status" className="flex-1 text-sm">{busy?'שומרים את הכרטיס…':leaving?'שומרים את הטיוטה במכשיר…':dirty?'יש שינויים שעדיין לא נשמרו':report?'הכרטיס טרם נשמר':'אין שינויים לשמירה'}</p><button type="submit" disabled={(!dirty&&!report)||busy||leaving||blocked} className="h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">{uncertain?'בדיקת השמירה שוב':'שמירת הכרטיס'}</button><button type="button" disabled={!dirty||busy} onClick={backup} className="h-11 rounded-xl border px-4 text-sm disabled:opacity-50">גיבוי הטיוטה</button>{blocked&&<button type="button" disabled={busy} onClick={()=>guard.run(budget.refresh)} className="h-11 rounded-xl border px-4 text-sm">טעינת הגרסה השמורה</button>}</div>
 </form>
}
export function CardPage({mode,fixture,budget}:{mode:'list'|'new'|'edit';fixture:boolean;budget:BudgetState}){
 const {id:routeId}=useParams(),{state}=useLocation(),[newId]=useState(()=>'card_'+crypto.randomUUID()),[completed,setCompleted]=useState<string|null>(null),[message,setMessage]=useState(()=>typeof state?.setupSavedMessage==='string'&&!state.setupSavedScope?state.setupSavedMessage:''),href=usePeriodHref(),id=mode==='new'?(completed??newId):(routeId??''),create=mode==='new'&&!completed
 const returnAfterSave=useSavedReturn(budget.status==='ready'?budget.value.accountId+'/'+budget.budgetId:'')
 if(fixture)return <section className="surface rounded-xl p-6">נתוני הדוגמה אינם נשמרים. יש לפתוח תקציב שמור להגדרת כרטיסים.</section>
 if(budget.status==='loading'||budget.refreshPending)return <section role="status" className="surface rounded-xl p-6">טוען כרטיסים…</section>
 if(budget.status==='error')return <section role="alert" className="surface rounded-xl p-6">{budget.message}</section>
 const plan=budget.value.plan
 if(!plan||plan.format==='monthly-flow-encrypted-v1')return <section className="surface rounded-xl p-6">{plan?'התקציב מוצפן.':'אין תקציב שמור.'} </section>
 const reason=mode==='list'?null:budget.spaces.find(s=>s.id===budget.budgetId)?.role==='viewer'?'התקציב פתוח לצפייה בלבד.':budget.value.writeIdentityBound!==true?'השמירה המוגנת עדיין אינה זמינה בשרת הזה.':cardConfigEligibility(plan,id,create)
 return <div className="adaptive-editor mx-auto max-w-3xl space-y-5"><PageHeading mobilePeriod={false} className="text-2xl font-semibold">{mode==='list'?'הגדרת כרטיסים':create?'הוספת כרטיס':'עריכת פרטי כרטיס'}</PageHeading><p className="text-sm text-muted-foreground"><bdi>{budget.spaces.find(s=>s.id===budget.budgetId)?.name}</bdi> · <bdi dir="ltr">{budget.value.accountEmail}</bdi></p>{(message||(state?.setupSavedScope===budget.value.accountId+'/'+budget.budgetId&&state?.setupSavedMessage))&&<p role="status" className="surface rounded-xl p-4 text-sm">{message||(state?.setupSavedScope===budget.value.accountId+'/'+budget.budgetId?state?.setupSavedMessage:'')}</p>}{mode==='edit'&&<Link href={href('/cards/'+encodeURIComponent(id)+'/stop')} className="inline-flex min-h-11 items-center text-sm text-primary underline">הפסקת הערכות לכרטיס</Link>}
 {mode==='list'?<><Link href={href('/card-setup/new')} className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm">הוספת כרטיס</Link><section className="surface rounded-xl p-4"><ul className="divide-y">{creditCards(plan).map((c:any)=><li key={c.id}><Link className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-3 py-3 text-sm [overflow-wrap:anywhere]" href={href('/card-setup/'+encodeURIComponent(c.id))}><bdi>{c.name}</bdi><span>{c.removedFrom?'הופסק החל מ־'+c.removedFrom:'עריכת פרטים'} · <bdi>{c.alias||'ללא כינוי'}</bdi></span></Link></li>)}</ul></section></>:reason?<section className="surface rounded-xl p-6"><p>{reason}</p></section>:<CardEditor key={budget.budgetId+'/'+id+'/'+budget.value.revision} id={id} create={create} budget={budget} base={budget.value} onSaved={text=>{setMessage(text);returnAfterSave(text);if(text&&create)setCompleted(id)}} />}
 </div>
}
