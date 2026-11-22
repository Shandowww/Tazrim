import {useEffect,useRef,useState} from 'react'
import {useLocation} from 'react-router-dom'
import {FileSpreadsheet,RefreshCw} from 'lucide-react'
import type {BudgetState} from './use-budget'
import {AccessError} from './budget-api'
import {SaveConflict,SaveUncertain} from './plan-save'
import {useDraftGuard} from './draft-guard'
import {useFormDraft} from './use-form-draft'
import {changePurchaseNotes,loadPurchaseNotes,purchaseNotesConnectHref,type PurchaseNotesAttempt,type PurchaseNotesCommand,type PurchaseNotesSnapshot} from './purchase-notes-api'
import {purchaseNoteSource} from '../../../src/purchase-notes-model.js'
import {instinctPurchaseNoteInstructions} from '../../../src/purchase-notes-instructions.js'
import {PageHeading} from './page-heading'
import Link from './link'
import {MoneyAmount} from './money-amount'
import {withViewQuery} from './navigation-query'

const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm disabled:opacity-50',input='mt-2 min-h-11 w-full rounded-xl border bg-card px-3 py-2'
const date=(value:number|null)=>value?new Intl.DateTimeFormat('he-IL',{dateStyle:'short',timeStyle:'short'}).format(value):'טרם עודכן'
export function PurchaseNotesPage({budget,fixture}:{budget:BudgetState;fixture:boolean}){
 if(fixture)return <p>חיבור פתקי קנייה דורש חשבון מחובר.</p>
 if(budget.status==='loading')return <p role="status">טוענים חשבון…</p>
 if(budget.status==='error')return <p role="alert">{budget.message}</p>
 return <div className="household-page"><PageHeading mobilePeriod={false}>פתקי קנייה</PageHeading><PurchaseNotesContent key={budget.value.accountId+'/'+budget.value.accountEmail} budget={budget}/></div>
}
function PurchaseNotesContent({budget}:{budget:Extract<BudgetState,{status:'ready'}>}){
 const actor=budget.value,{search}=useLocation(),guard=useDraftGuard(),[snapshot,setSnapshot]=useState<PurchaseNotesSnapshot|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[tick,setTick]=useState(0),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState<PurchaseNotesAttempt|null>(null),[blocked,setBlocked]=useState(false),[showDone,setShowDone]=useState(false),[limit,setLimit]=useState(20),[url,setUrl]=useState(''),[tab,setTab]=useState('Purchases'),[confirmChange,setConfirmChange]=useState(false),flight=useRef(false),controller=useRef(new AbortController())
 useEffect(()=>{
  const abort=new AbortController();controller.current=abort;setLoading(true);setError('')
  void loadPurchaseNotes(actor,abort.signal).then(value=>{if(abort.signal.aborted)return;setSnapshot(value);setUrl(value.source?'https://docs.google.com/spreadsheets/d/'+value.source.spreadsheetId+'/edit':'');setTab(value.source?.tab??'Purchases')}).catch(error=>{if(abort.signal.aborted)return;if(error instanceof AccessError){setSnapshot(null);budget.invalidate(error.message)}setError(error instanceof Error?error.message:'לא ניתן לקרוא את הפתקים.')}).finally(()=>{if(!abort.signal.aborted)setLoading(false)})
  return()=>abort.abort()
 },[tick])
 const initialUrl=snapshot?.source?'https://docs.google.com/spreadsheets/d/'+snapshot.source.spreadsheetId+'/edit':'',dirty=!!snapshot&&(url!==initialUrl||tab!==(snapshot.source?.tab??'Purchases'))
 const run=async(command:PurchaseNotesCommand)=>{
  if(flight.current||loading||blocked||!snapshot)return false
  const pending=attempt??{command,revision:snapshot.revision,operationId:crypto.randomUUID()};flight.current=true;setBusy(true);setError('');setMessage('');setAttempt(pending)
  try{const next=await changePurchaseNotes(actor,pending,controller.current.signal);if(controller.current.signal.aborted)return false;setSnapshot(next);setUrl(next.source?'https://docs.google.com/spreadsheets/d/'+next.source.spreadsheetId+'/edit':'');setTab(next.source?.tab??'Purchases');setAttempt(null);setConfirmChange(false);setMessage(pending.command.action==='sync'?'הפתקים עודכנו מהגיליון.':pending.command.action==='disconnect'?'חיבור Google הוסר. הפתקים שכבר נקראו נשמרו.':pending.command.action==='note-state'?'מצב הפתק נשמר.':'הקישור לגיליון נשמר.');return true}
  catch(error){if(controller.current.signal.aborted)return false;if(error instanceof AccessError){setSnapshot(null);budget.invalidate(error.message)}if(error instanceof SaveConflict)setBlocked(true);if(!(error instanceof SaveUncertain))setAttempt(null);setError(error instanceof Error?error.message:'תוצאת השמירה לא התקבלה.');return false}
  finally{flight.current=false;if(!controller.current.signal.aborted)setBusy(false)}
 }
 const save=()=>{try{purchaseNoteSource(url,tab)}catch(error){setError(error instanceof Error?error.message:'בדקו את הקישור.');return Promise.resolve(false)}return run({action:'configure',url,tab,confirmChange})}
 const form=useFormDraft({kind:'security',dirty:dirty||!!attempt,busy,saveError:error||undefined,save:blocked?undefined:attempt?()=>run(attempt.command):save,discard:()=>{setUrl(initialUrl);setTab(snapshot?.source?.tab??'Purchases');setAttempt(null);setBlocked(false);setConfirmChange(false);setError('')}},{budgetId:'personal',base:actor,kind:'purchase-notes-source',values:{url,tab},baseline:{revision:snapshot?.revision??0},restore:values=>{setUrl(values.url);setTab(values.tab);setConfirmChange(false)},enabled:!!snapshot,mutationPending:!!attempt})
 const disabled=loading||busy||!!attempt||blocked||!form.ready,sourceChanging=!!snapshot?.source&&(url!==initialUrl||tab!==snapshot.source.tab),notes=(snapshot?.notes??[]).filter(note=>showDone?note.done||!note.present:!note.done&&note.present)
 const exportNotes=()=>{if(!snapshot)return;const blob=URL.createObjectURL(new Blob([JSON.stringify({format:'budgit-purchase-notes-v1',notes:snapshot.notes},null,2)],{type:'application/json'})),anchor=document.createElement('a');anchor.href=blob;anchor.download='budgit-purchase-notes.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(blob),1000)}
 return <div className="mx-auto w-full max-w-3xl space-y-5">
  <p className="text-sm text-muted-foreground">זוכרים מה קנינו, גם כשהדוח מגיע חודש אחר כך.</p>
  <p className="text-sm">פרטי לחשבון <bdi dir="ltr" className="[overflow-wrap:anywhere]">{actor.accountEmail}</bdi>. הפתקים אינם משנים יתרות או סכומי הוצאה.</p>
  {loading&&<p role="status">טוענים פתקי קנייה…</p>}
  {error&&<p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm">{error} {snapshot&&'הפתקים מהעדכון האחרון נשארו מוצגים.'}</p>}
  {message&&<p role="status" className="rounded-xl border p-3 text-sm">{message}</p>}
  {new URLSearchParams(search).get('sheets')==='failed'&&<p role="alert">חיבור Google לא הושלם. התחברו באותו חשבון שמוצג למעלה ונסו שוב.</p>}
  {new URLSearchParams(search).get('sheets')==='connected'&&snapshot?.connected&&<p role="status">חיבור Google הושלם. אפשר לעדכן את הפתקים מהגיליון.</p>}
  {attempt&&<div className="space-y-2 text-sm"><p>תוצאת הפעולה טרם אושרה. ניסיון חוזר יבדוק את אותה פעולה בלי ליצור כפילות.</p><button type="button" className={button} disabled={busy||blocked} onClick={()=>void form.save()}>בדיקת אותה פעולה שוב</button></div>}
  <section className="surface min-w-0 space-y-4 rounded-xl p-4 sm:p-5">
   <h2 className="flex items-center gap-2 font-semibold"><FileSpreadsheet size={20} aria-hidden/>הגיליון של Instinct</h2>
   <p className="text-sm text-muted-foreground">Instinct מוסיף קנייה לגיליון Google פרטי. Budgit קורא את הלשונית שבחרת ומציג פתקים מתאימים בבדיקת דוחות.</p>
   <form className="space-y-4" onSubmit={event=>{event.preventDefault();void form.save()}}>
    <label className="block text-sm" htmlFor="purchase-notes-url">קישור ל־Google Sheets<input id="purchase-notes-url" className={input} type="url" dir="ltr" value={url} onChange={event=>{setUrl(event.target.value);setConfirmChange(false)}} disabled={disabled} placeholder="https://docs.google.com/spreadsheets/d/…" required autoComplete="off"/></label>
    <label className="block text-sm" htmlFor="purchase-notes-tab">שם הלשונית<input id="purchase-notes-tab" className={input} dir="auto" value={tab} onChange={event=>{setTab(event.target.value);setConfirmChange(false)}} disabled={disabled} maxLength={80} required/></label>
    {sourceChanging&&<label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmChange} disabled={disabled} onChange={event=>setConfirmChange(event.target.checked)}/>להחליף את המקור. פתקים מהמקור הקודם יישמרו ויוסתרו מההצעות.</label>}
    <button type="submit" className={button} disabled={disabled||!dirty||sourceChanging&&!confirmChange}>{busy?'שומרים…':'שמירת קישור לגיליון'}</button>
   </form>
   <p className="text-xs text-muted-foreground">הרשאת Google היא לקריאת גיליונות. Budgit משתמש בגיליון שנבחר כאן, ללא שינוי תאים. הפתקים נשמרים בנפרד מהתקציב ונגישים לשרת גם אם התקציב מוצפן.</p>
   {snapshot?.source&&!snapshot.connected&&<a href={purchaseNotesConnectHref(actor,snapshot.revision,search)} aria-disabled={disabled||dirty||!snapshot.oauthConfigured} onClick={event=>{if(disabled||dirty||!snapshot.oauthConfigured)event.preventDefault()}} className={button+' bg-primary text-primary-foreground'}>חיבור Google לקריאת פתקים</a>}
   {snapshot&&!snapshot.oauthConfigured&&<p className="text-sm">חיבור Google אינו מוגדר בסביבה הזו. אפשר לבדוק כאן נתוני דוגמה בלבד.</p>}
   {snapshot?.connected&&<div className="flex flex-wrap gap-3"><button type="button" className={button+' bg-primary text-primary-foreground'} disabled={disabled||dirty} onClick={()=>void run({action:'sync'})}><RefreshCw size={16} aria-hidden/>{busy?'מעדכנים…':'עדכון מהגיליון'}</button><button type="button" className={button} disabled={disabled||dirty} onClick={()=>void run({action:'disconnect'})}>ניתוק Google</button></div>}
   {snapshot?.source&&<a className="inline-flex min-h-11 items-center text-sm text-primary underline" href={'https://docs.google.com/spreadsheets/d/'+snapshot.source.spreadsheetId+'/edit'} target="_blank" rel="noopener noreferrer">פתיחת הגיליון</a>}
   <p className="text-xs text-muted-foreground">עדכון מוצלח אחרון: <bdi>{date(snapshot?.lastSuccess??null)}</bdi>{snapshot&&!snapshot.connected&&snapshot.lastSuccess&&' · חיבור Google מנותק'}</p>
   {snapshot?.error&&<p role="alert" className="text-sm">{snapshot.error}</p>}
  </section>
  <details className="surface space-y-3 rounded-xl p-4 sm:p-5"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">הוראות ל־Instinct</summary><p className="text-sm text-muted-foreground">שלחו את ההוראות פעם אחת כדי להכין את הלשונית ולתעד קניות באותו מבנה.</p><textarea readOnly aria-label="הוראות להעתקה ל־Instinct" dir="ltr" className="min-h-48 w-full rounded-xl border bg-card p-3 text-sm" value={instinctPurchaseNoteInstructions(initialUrl||'PASTE_YOUR_PRIVATE_SHEET_LINK_HERE')}/><button type="button" className={button} disabled={!snapshot?.source} onClick={()=>{void navigator.clipboard.writeText(instinctPurchaseNoteInstructions(initialUrl)).then(()=>setMessage('ההוראות הועתקו. אפשר להדביק אותן בשיחה עם Instinct.')).catch(()=>setError('לא ניתן להעתיק אוטומטית. אפשר לבחור ולהעתיק את הטקסט שמופיע כאן.'))}}>העתקת הוראות</button></details>
  <section className="surface space-y-4 rounded-xl p-4 sm:p-5">
   <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{showDone?'פתקים שטופלו או הוסרו מהגיליון':'ממתינים לדוח'} · <bdi>{notes.length}</bdi></h2><button type="button" className={button} aria-pressed={showDone} onClick={()=>{setShowDone(value=>!value);setLimit(20)}}>{showDone?'הצגת פתקים פעילים':'הצגת פתקים שטופלו'}</button></div>
   <p className="text-sm text-muted-foreground">סימון כטופל הוא תזכורת פרטית. הוא אינו מאשר קליטה של עסקה. שינוי פרטי קנייה בגיליון מחזיר את הפתק לבדיקה.</p>
   {!notes.length&&<p className="py-4 text-sm">{showDone?'אין פתקים ברשימה הזו.':'כאן יופיעו הקניות שיתועדו דרך Instinct.'}</p>}
   <ul className="divide-y">{notes.slice(0,limit).map(note=><li key={note.key} className="min-w-0 space-y-2 py-4"><h3 className="break-words font-semibold"><bdi>{note.purpose}</bdi></h3><p className="flex flex-wrap gap-x-3 gap-y-1 text-sm"><bdi>{note.merchant}</bdi><bdi dir="ltr">{note.date}</bdi><MoneyAmount value={note.amountCents/100} minimumFractionDigits={2}/></p>{note.category&&<p className="text-sm">קטגוריה בפתק: <bdi>{note.category}</bdi></p>}{note.paymentCard&&<p className="text-sm">כרטיס מסתיים ב־<bdi dir="ltr">{note.paymentCard}</bdi></p>}{!note.present&&<p className="text-sm text-muted-foreground">הפתק הוסר מהגיליון ואינו מוצע להתאמה. העותק הקודם נשמר.</p>}<button type="button" className={button} disabled={disabled||dirty} onClick={()=>void run({action:'note-state',key:note.key,noteRevision:note.revision,done:!note.done})}>{note.done?'החזרה לפתקים פעילים':'סימון כטופל'}</button></li>)}</ul>
   {notes.length>limit&&<button type="button" className={button} onClick={()=>setLimit(value=>value+20)}>הצגת פתקים נוספים</button>}
   <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={loading||busy||!!attempt} onClick={()=>guard.run(()=>{setBlocked(false);setMessage('');setTick(value=>value+1)})}>רענון הרשימה השמורה</button><button type="button" className={button} disabled={!snapshot?.notes.length} onClick={exportNotes}>ייצוא פתקים</button><Link className="inline-flex min-h-11 items-center text-sm text-primary underline" href={withViewQuery('/upload',search)}>לבדיקת דוחות</Link></div>
  </section>
 </div>
}
