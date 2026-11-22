import {AccessError,type BudgetResponse} from './budget-api.ts'
import {SaveConflict,SaveUncertain} from './plan-save.ts'

export interface PurchaseNote{id:string;key:string;date:string;merchant:string;amountCents:number;currency:'ILS';purpose:string;category:string;paymentCard:string;createdAt:string;revision:number;done:boolean;present:boolean}
export interface PurchaseNotesSnapshot{accountId:string;accountEmail:string;purchaseNotesIdentityBound:true;oauthConfigured:boolean;connected:boolean;revision:number;source:{spreadsheetId:string;tab:string}|null;notes:PurchaseNote[];lastChecked:number|null;lastSuccess:number|null;error:string|null;lastOperation:string|null}
export type PurchaseNotesCommand={action:'configure';url:string;tab:string;confirmChange:boolean}|{action:'disconnect'|'sync'}|{action:'note-state';key:string;noteRevision:number;done:boolean}
export interface PurchaseNotesAttempt{command:PurchaseNotesCommand;revision:number;operationId:string}
export class PurchaseNotesRejected extends Error{}
export const purchaseNotesPath=(actor:BudgetResponse)=>'/api/purchase-notes?accountId='+encodeURIComponent(actor.accountId)
function validSnapshot(data:any):data is PurchaseNotesSnapshot{return data?.purchaseNotesIdentityBound===true&&typeof data.connected==='boolean'&&typeof data.oauthConfigured==='boolean'&&Number.isSafeInteger(data.revision)&&data.revision>=0&&(data.source===null||typeof data.source?.spreadsheetId==='string'&&typeof data.source?.tab==='string')&&Array.isArray(data.notes)&&data.notes.length<=20000&&data.notes.every((note:any)=>note&&typeof note.key==='string'&&typeof note.id==='string'&&typeof note.date==='string'&&typeof note.merchant==='string'&&Number.isSafeInteger(note.amountCents)&&note.currency==='ILS'&&typeof note.purpose==='string'&&typeof note.category==='string'&&typeof note.paymentCard==='string'&&Number.isSafeInteger(note.revision)&&typeof note.done==='boolean'&&typeof note.present==='boolean')}
async function request(actor:BudgetResponse,signal:AbortSignal,init:RequestInit={},fetcher:typeof fetch=fetch){
 const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();const timer=setTimeout(abort,25000)
 try{
  const response=await fetcher(purchaseNotesPath(actor),{...init,credentials:'same-origin',cache:'no-store',signal:controller.signal});let data:any;try{data=await response.json()}catch{throw Error('תשובת פתקי הקנייה אינה תקינה.')}
  if(!response.ok){if([401,403].includes(response.status))throw new AccessError(data.error||'החשבון או ההרשאה לפתקים השתנו.');if(response.status===409)throw new SaveConflict(data.error||'חיבור הפתקים השתנה.');throw new PurchaseNotesRejected(data.error||'לא ניתן לקרוא את פתקי הקנייה כרגע.')}
  if(data.accountId!==actor.accountId||data.accountEmail!==actor.accountEmail)throw new AccessError('החשבון השתנה בזמן קריאת פתקי הקנייה.')
  if(!validSnapshot(data))throw Error('פרטי פתקי הקנייה אינם תקינים.');return data
 }finally{clearTimeout(timer);signal.removeEventListener('abort',abort)}
}
export const loadPurchaseNotes=(actor:BudgetResponse,signal:AbortSignal,fetcher:typeof fetch=fetch)=>request(actor,signal,{},fetcher)
export async function changePurchaseNotes(actor:BudgetResponse,attempt:PurchaseNotesAttempt,signal:AbortSignal,fetcher:typeof fetch=fetch){
 // A lost successful response is recovered without replaying the external read.
 const fresh=await loadPurchaseNotes(actor,signal,fetcher)
 if(fresh.lastOperation===attempt.operationId)return fresh
 if(fresh.revision!==attempt.revision)throw new SaveConflict('הפתקים או החיבור השתנו במכשיר אחר. רעננו ובדקו לפני פעולה נוספת.')
 try{return await request(actor,signal,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...attempt.command,accountId:actor.accountId,requireAccountId:true,expectedRevision:attempt.revision,operationId:attempt.operationId})},fetcher)}catch(error){if(error instanceof AccessError||error instanceof SaveConflict||error instanceof PurchaseNotesRejected)throw error
  // Recheck immediately: a rejected request has no success marker; a successful
  // request with a missing response can be confirmed by its stable operation ID.
  try{const recovered=await loadPurchaseNotes(actor,signal,fetcher);if(recovered.lastOperation===attempt.operationId)return recovered;if(recovered.revision===attempt.revision&&recovered.error)throw new PurchaseNotesRejected(recovered.error)}catch(checkError){if(checkError instanceof AccessError||checkError instanceof PurchaseNotesRejected)throw checkError}
  throw new SaveUncertain((error instanceof Error?error.message:'תוצאת הפעולה לא התקבלה.')+' ניסיון חוזר יבדוק את אותה פעולה.')
 }
}
export const purchaseNotesConnectHref=(actor:BudgetResponse,revision:number,search='')=>'/auth/purchase-notes?accountId='+encodeURIComponent(actor.accountId)+'&revision='+revision+'&returnQuery='+encodeURIComponent(search.replace(/^\?/,''))
