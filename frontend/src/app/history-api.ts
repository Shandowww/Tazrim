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
 if(!plan||plan.format||!validatePlan(plan))throw Error('גיבוי התקציב הזה זמין בממשק הקיים בלבד.')
 return JSON.stringify({format:'monthly-flow-v1',plan},null,2)
}
