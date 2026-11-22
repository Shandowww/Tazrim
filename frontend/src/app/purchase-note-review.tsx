import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react'
import type {BudgetResponse} from './budget-api'
import {AccessError} from './budget-api'
import {changePurchaseNotes,loadPurchaseNotes,type PurchaseNote,type PurchaseNotesSnapshot} from './purchase-notes-api'
import {purchaseNoteMatches} from '../../../src/purchase-notes-model.js'
import Link from './link'
import {MoneyAmount} from './money-amount'
import {usePeriodHref} from '../tazrim/components/layout/period-context'

const Context=createContext<{snapshot:PurchaseNotesSnapshot|null;loading:boolean;error:string}|null>(null)
export function PurchaseNoteReviewProvider({actor,enabled,children}:{actor:BudgetResponse;enabled:boolean;children:ReactNode}){
 const [value,setValue]=useState<{snapshot:PurchaseNotesSnapshot|null;loading:boolean;error:string}>({snapshot:null,loading:true,error:''})
 useEffect(()=>{
  if(!enabled)return
  const controller=new AbortController();setValue({snapshot:null,loading:true,error:''})
  void(async()=>{let saved:PurchaseNotesSnapshot|null=null;try{
   saved=await loadPurchaseNotes(actor,controller.signal);if(controller.signal.aborted)return;setValue({snapshot:saved,loading:saved.connected,error:''})
   if(saved.connected){const next=await changePurchaseNotes(actor,{command:{action:'sync'},revision:saved.revision,operationId:crypto.randomUUID()},controller.signal);if(!controller.signal.aborted)setValue({snapshot:next,loading:false,error:''})}
  }catch(error){if(!controller.signal.aborted)setValue({snapshot:error instanceof AccessError?null:saved,loading:false,error:error instanceof Error?error.message:'עדכון הפתקים לא הושלם.'})}})()
  return()=>controller.abort()
 },[actor.accountId,actor.accountEmail,enabled])
 return <Context.Provider value={enabled?value:null}>{children}</Context.Provider>
}
export function PurchaseNoteReviewStatus(){
 const value=useContext(Context),href=usePeriodHref();if(!value)return null
 if(value.loading)return <p role="status" className="text-sm text-muted-foreground">בודקים פתקי קנייה פרטיים…</p>
 if(value.error)return <aside className="surface space-y-2 rounded-xl border p-4 text-sm"><p role="alert">{value.error} {value.snapshot?.notes.length?'הפתקים מהעדכון הקודם נשארו זמינים.':'אפשר להמשיך בבדיקת הדוח.'}</p><Link href={href('/settings/purchase-notes')} className="inline-flex min-h-11 items-center text-primary underline">פתקי קנייה וחיבור Google Sheets</Link></aside>
 if(!value.snapshot?.source)return <Link href={href('/settings/purchase-notes')} className="inline-flex min-h-11 items-center text-sm text-primary underline">חיבור פתקי קנייה מ־Instinct</Link>
 return <p className="text-sm text-muted-foreground">פתקי הקנייה פרטיים לחשבון שלך. התאמות אפשריות מוצגות ליד התנועות.{!value.snapshot.connected&&' החיבור מנותק; מוצגים פתקים מהעדכון האחרון.'} <Link href={href('/settings/purchase-notes')} className="inline-flex min-h-11 items-center text-primary underline">ניהול פתקים</Link></p>
}
export function usePurchaseNoteSuggestions(sections:any[],plan:any){
 const value=useContext(Context),notes=value?.snapshot?.notes??[]
 return useMemo(()=>{
  const results=new Map<string,any[]>(),uses=new Map<string,Set<string>>()
  for(const section of sections)for(const item of section.rows){
   const entry=item.row.entry??item.row,card=plan.creditCards?.find((card:any)=>card.id===section.item.target)
   const matches=purchaseNoteMatches(notes,{...entry,merchant:entry.merchant??entry.description,kind:section.item.kind,paymentCard:card?.alias?.match(/\d{4}$/)?.[0]??'',installment:entry.installment,originalCurrency:entry.originalCurrency})
   results.set(item.id,matches)
   for(const match of matches){const rows=uses.get(match.note.key)??new Set();rows.add(item.id);uses.set(match.note.key,rows)}
  }
  for(const [id,matches]of results)results.set(id,matches.map(match=>({...match,ambiguous:matches.length>1||(uses.get(match.note.key)?.size??0)>1})))
  return results
 },[sections,notes,plan])
}
export function PurchaseNoteHint({matches,groupSize,kind}:{matches:any[];groupSize:number;kind:'card'|'bank'}){
 if(!matches.length)return null
 return <aside className="purchase-note-hint space-y-2 rounded-xl border bg-muted/40 p-3 text-sm" aria-label="פתקי קנייה שעשויים להתאים">
  <p className="font-semibold">{matches.length===1?'פתק קנייה שעשוי להתאים':'פתקי קנייה אפשריים · יש לבחור לפי הפרטים'}</p>
  {matches.slice(0,5).map(({note,merchantMatches,dateExact,cardChecked,ambiguous,installment}:{note:PurchaseNote;merchantMatches:boolean;dateExact:boolean;cardChecked:boolean;ambiguous:boolean;installment:boolean})=><div key={note.key} className="space-y-1 border-s-2 border-primary/40 ps-3">
   <p className="break-words font-medium"><bdi>{note.purpose}</bdi></p>
   <p className="flex flex-wrap gap-x-2"><bdi>{note.merchant}</bdi><bdi dir="ltr">{note.date}</bdi><MoneyAmount value={note.amountCents/100} minimumFractionDigits={2}/></p>
   {note.category&&<p>קטגוריה בפתק: <bdi>{note.category}</bdi></p>}
   <p className="text-xs text-muted-foreground">{merchantMatches?'שם בית העסק תואם.':'הסכום והתאריך קרובים, אך שם בית העסק שונה.'} {!dateExact&&'תאריך הדוח סמוך לתאריך הקנייה.'} {note.paymentCard&&!cardChecked&&'הכרטיס שצוין בפתק לא אומת.'} {ambiguous&&'יש כמה התאמות אפשריות; הפתק טרם שויך.'} {installment&&'ההשוואה היא לסכום הקנייה המקורי, לא לתשלום החודשי.'}</p>
  </div>)}
  {matches.length>5&&<p>יש <bdi>{matches.length-5}</bdi> פתקים נוספים. אפשר לבדוק אותם ברשימת הפתקים.</p>}
  <p className="text-xs text-muted-foreground">{kind==='bank'?'הפתק מספק הקשר לתנועה. הסיווג כאן קובע את סוג תנועת הבנק; קטגוריית ההוצאה ניתנת לעריכה בפירוט לאחר הקליטה.':<>בדקו את הפרטים ובחרו קטגוריה לקנייה הזו.{groupSize>1&&' שאר הקניות מאותו בית עסק ישמרו על הקטגוריות שלהן.'}</>}</p>
 </aside>
}
