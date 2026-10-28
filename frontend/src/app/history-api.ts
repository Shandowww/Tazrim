import {isVault} from '../../../src/vault.js'
import {revealHistoryVault} from './vault-session.ts'
import {validatePlan} from '../../../src/budget.js'
import {AccessError,loadBudgetSnapshot,type BudgetResponse} from './budget-api.ts'
export interface HistoryEntry{id:string;revision:number;actor:string;at:number;kind:string;fields:string[];snapshot:boolean;unavailable:string|null;canUndo:boolean}
export interface HistoryPageData{revision:number;next:number|null;entries:HistoryEntry[]}
function sameActor(base:BudgetResponse,current:BudgetResponse){if(base.accountId!==current.accountId||base.accountEmail!==current.accountEmail)throw new AccessError('החשבון השתנה. יש להיכנס מחדש לפני הצגת היומן או יצירת גיבוי.');if(base.revision!==current.revision)throw Error('התקציב השתנה מאז הטעינה. יש לרענן לפני המשך הפעולה.')}
async function check(budgetId:string,base:BudgetResponse,signal:AbortSignal,fetcher:typeof fetch){const snapshot=await loadBudgetSnapshot(budgetId,signal,fetcher);sameActor(base,snapshot.value);return snapshot}
export function validateHistory(value:any,offset:number):HistoryPageData{
 if(!value||!Number.isSafeInteger(value.revision)||value.revision<0||value.next!==null&&value.next!==offset+20||!Array.isArray(value.entries)||value.entries.length>20||value.next!==null&&value.entries.length!==20)throw Error('לא ניתן לאמת את עמוד היומן. אפשר לנסות שוב.')
 let prior=value.revision+1;const ids=new Set<string>()
 for(const e of value.entries){if(!e||typeof e.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(e.id)||ids.has(e.id)||!Number.isSafeInteger(e.revision)||e.revision<1||e.revision>=prior||typeof e.actor!=='string'||!e.actor||e.actor.length>320||!Number.isSafeInteger(e.at)||e.at<0||e.at>8640000000000000||typeof e.kind!=='string'||e.kind.length>100||!Array.isArray(e.fields)||e.fields.length>100||e.fields.some((s:any)=>typeof s!=='string'||s.length>80)||typeof e.snapshot!=='boolean'||typeof e.canUndo!=='boolean'||e.unavailable!==null&&typeof e.unavailable!=='string')throw Error('לא ניתן לאמת רשומה ביומן. אפשר לנסות שוב.');ids.add(e.id);prior=e.revision}
 return value
}
/** Scope and actor are checked before and after metadata reads. No snapshots or writes. */
export async function loadHistory(budgetId:string,base:BudgetResponse,offset:number,signal:AbortSignal,fetcher:typeof fetch=fetch){
 if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||offset%20)throw Error('עמוד היומן אינו תקין.')
 await check(budgetId,base,signal,fetcher)
 const response=await fetcher('/api/plan-history?budget='+encodeURIComponent(budgetId)+'&offset='+offset,{credentials:'same-origin',cache:'no-store',signal})
 if([401,403,404].includes(response.status))throw new AccessError('היומן אינו זמין לחשבון או למרחב שנבחר.')
 if(!response.ok)throw Error('היומן לא נטען. התקציב לא שונה; אפשר לנסות שוב.')
 const page=validateHistory(await response.json(),offset)
 await check(budgetId,base,signal,fetcher)
 if(page.revision!==base.revision)throw Error('התקציב השתנה בזמן טעינת היומן. יש לרענן.')
 return page
}
/** Export a freshly authorized saved plan; encrypted envelopes keep their existing legacy workflow. */
export async function loadBudgetExport(budgetId:string,base:BudgetResponse,signal:AbortSignal,fetcher:typeof fetch=fetch){
 const snapshot=await check(budgetId,base,signal,fetcher),plan=snapshot.value.plan
 if(snapshot.value.vault)return JSON.stringify(snapshot.value.vault,null,2)
 if(!plan||plan.format||!validatePlan(plan))throw Error('גיבוי התקציב הזה זמין בממשק הקיים בלבד.')
 return JSON.stringify({format:'monthly-flow-v1',plan},null,2)
}
export interface HistorySnapshot{id:string;revision:number;before:Record<string,unknown>|null;after:Record<string,unknown>;canUndo:boolean;undoIdentityBound:boolean}
function normalizeHistory(value:any):any{return value&&typeof value==='object'?Array.isArray(value)?value.map(normalizeHistory):Object.fromEntries(Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>[k,normalizeHistory(value[k])])):value}
const canonical=(value:any)=>JSON.stringify(normalizeHistory(value))
export async function loadHistorySnapshot(budgetId:string,base:BudgetResponse,entry:HistoryEntry,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<HistorySnapshot>{
 if(!/^[a-zA-Z0-9-]{1,100}$/.test(entry.id)||!entry.snapshot||base.plan?.format)throw Error('בדיקת הגרסה הזו זמינה בממשק הקיים בלבד.')
 await check(budgetId,base,signal,fetcher)
 const response=await fetcher('/api/plan-history?budget='+encodeURIComponent(budgetId)+'&id='+encodeURIComponent(entry.id),{credentials:'same-origin',cache:'no-store',signal,headers:{'x-budget-account-id':base.accountId}})
 if([401,403,404].includes(response.status))throw new AccessError('העותק ההיסטורי אינו זמין לחשבון או למרחב הזה.')
 if(!response.ok)throw Error('העותק ההיסטורי לא נטען. התקציב לא שונה; אפשר לנסות שוב.')
 const value=await response.json();await check(budgetId,base,signal,fetcher)
 if(base.vault){if(!isVault(value.before)||!isVault(value.after))throw Error('אין אפשרות לפתוח את הגרסה הקודמת במפתח הנוכחי.');value.before=await revealHistoryVault(budgetId,base,value.before);value.after=await revealHistoryVault(budgetId,base,value.after);await check(budgetId,base,signal,fetcher)}
 if(value?.revision!==entry.revision||typeof value.canUndo!=='boolean'||value.before!==null&&!validatePlan(value.before)||!validatePlan(value.after)||value.before?.format||value.after?.format)throw Error('העותק אינו תקציב גלוי שניתן לאמת. יש להשתמש בממשק הקיים.')
 return{id:entry.id,revision:value.revision,before:value.before,after:value.after,canUndo:value.canUndo,undoIdentityBound:value.undoIdentityBound===true}
}
export async function undoHistorySnapshot(budgetId:string,base:BudgetResponse,snapshot:HistorySnapshot,fetcher:typeof fetch=fetch){
 if(!snapshot.canUndo||!snapshot.before||!validatePlan(snapshot.before)||snapshot.revision!==base.revision||snapshot.undoIdentityBound!==true)throw Error('ניתן לבטל רק שמירה אחרונה שנבדקה, עם עותק קודם ותמיכת השרת.')
 const fresh=await loadBudgetSnapshot(budgetId,new AbortController().signal,fetcher)
 if(fresh.value.accountId!==base.accountId||fresh.value.accountEmail!==base.accountEmail)throw new AccessError('החשבון השתנה. יש לפתוח מחדש את היומן.')
 if(fresh.spaces.find(s=>s.id===budgetId)?.role==='viewer')throw Error('המרחב פתוח לצפייה בלבד. הביטול לא נשלח.')
 if(fresh.value.revision===base.revision+1&&canonical(fresh.value.plan)===canonical(snapshot.before)){const journal=await loadHistory(budgetId,fresh.value,0,new AbortController().signal,fetcher);if(journal.entries[0]?.kind==='undo'&&journal.entries[0]?.actor===base.accountEmail)return{...fresh,recovered:true}}
 sameActor(base,fresh.value)
 // Re-read the authoritative snapshot; restored values are never supplied by the client.
 const verified=await loadHistorySnapshot(budgetId,base,{id:snapshot.id,revision:snapshot.revision,snapshot:true} as HistoryEntry,new AbortController().signal,fetcher)
 if(!verified.canUndo||!verified.undoIdentityBound||canonical(verified.before)!==canonical(snapshot.before)||canonical(fresh.value.plan)!==canonical(verified.after))throw Error('הגרסה או הרשאת הביטול השתנו. יש לרענן ולבדוק שוב.')
 let response:Response;try{response=await fetcher('/api/plan-history?budget='+encodeURIComponent(budgetId),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-budget-account-id':base.accountId},body:JSON.stringify({action:'undo',id:snapshot.id,revision:base.revision})})}catch{throw Error('לא ניתן לאשר אם הביטול נשמר. ניסיון חוזר יבדוק את המצב השמור לפני שליחה.')}
 if([401,403,404].includes(response.status))throw new AccessError('החשבון או הגישה השתנו. יש לפתוח מחדש את היומן.')
 if(!response.ok)throw Error(response.status>=500?'לא ניתן לאשר את תוצאת הביטול. ניסיון חוזר יבדוק קודם את המצב השמור.':'הביטול לא אושר. יש לרענן ולבדוק אם שמירה אחרת או מקור דיווח מונעים ביטול.')
 let result:any;try{result=await response.json()}catch{throw Error('לא ניתן לקרוא את אישור הביטול. ניסיון חוזר יבדוק את המצב השמור.')}if(result.revision!==base.revision+1)throw Error('תוצאת הביטול אינה תואמת. יש לבדוק את המצב השמור לפני פעולה נוספת.')
 const saved=await loadBudgetSnapshot(budgetId,new AbortController().signal,fetcher)
 if(saved.value.accountId!==base.accountId||saved.value.accountEmail!==base.accountEmail)throw new AccessError('החשבון השתנה בזמן הביטול. יש להיכנס מחדש.')
 if(saved.value.revision!==result.revision||canonical(saved.value.plan)!==canonical(verified.before))throw Error('התקציב השתנה אחרי הביטול. יש לרענן ולבדוק את המצב העדכני.')
 return{...saved,recovered:false}
}
