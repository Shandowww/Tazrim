import {captureReportExpectationRules,reportExpectationEntities,validatePlan} from '../../../src/budget.js'
import {AccessError,loadBudgetSnapshot,type BudgetResponse} from './budget-api.ts'
import {SaveConflict,SaveUncertain,WritePermissionError} from './plan-save.ts'
export interface ExpectationRule{kind:'bank'|'card';target:string;enabled:boolean;startMonth:string;dueDay:number;graceDays:number;exceptions:string[]}
export interface ExpectationInput{enabled:boolean;start:string;due:string;grace:string;exceptions:string}
export interface ActionsResponse{accountId:string;accountEmail:string;budgetId:string;actionIdentityBound:boolean;actionPreferenceCAS?:boolean;backupAdmin?:boolean;revision:number;expectations:ExpectationRule[];reports:any[];preferences:Record<string,{evidence:string;until:number}>}
export interface ActionIntegrations{gmail:any;notices:any[];backup:any;admin:boolean;errors:string[]}
export interface ExpectationsSnapshot{integrations?:ActionIntegrations;budget:Awaited<ReturnType<typeof loadBudgetSnapshot>>;actions:ActionsResponse}
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v)
export function initialExpectationInputs(plan:any,rules:ExpectationRule[],asOf:string):ExpectationInput[]{return reportExpectationEntities(plan).map(e=>{const r=rules.find(row=>row.kind===e.kind&&row.target===e.id);return{enabled:r?.enabled??false,start:r?.startMonth??asOf,due:String(r?.dueDay??15),grace:String(r?.graceDays??3),exceptions:r?.exceptions.join(', ')??''}})}
export function prepareExpectationRules(plan:any,inputs:ExpectationInput[]){
 if(!validatePlan(plan)||!Array.isArray(inputs)||inputs.some(r=>!r||Object.keys(r).sort().join(',')!=='due,enabled,exceptions,grace,start'))throw Error('יש לבדוק את נתוני הדוחות הצפויים.')
 return captureReportExpectationRules(reportExpectationEntities(plan),inputs) as ExpectationRule[]
}
export async function loadExpectations(budgetId:string,actor:Pick<BudgetResponse,'accountId'|'accountEmail'>,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<ExpectationsSnapshot>{
 const budget=await loadBudgetSnapshot(budgetId,signal,fetcher)
 if(budget.value.accountId!==actor.accountId||budget.value.accountEmail!==actor.accountEmail)throw new AccessError('החשבון השתנה. יש לפתוח מחדש את הדוחות הצפויים בחשבון המקורי.')
 const response=await fetcher('/api/actions?budget='+encodeURIComponent(budgetId),{credentials:'same-origin',cache:'no-store',signal})
 if(response.status===401||response.status===403||response.status===404)throw new AccessError('החשבון או המרחב אינם זמינים כרגע.')
 if(!response.ok)throw Error('לא ניתן לטעון את הגדרות הדוחות. אפשר לנסות שוב.')
 const actions=await response.json() as ActionsResponse
 if(actions.actionIdentityBound!==true)throw Error('השרת עדיין לא תומך בשמירת הגדרות המוגנת לחשבון. יש להשתמש בממשק הקיים.')
 if(actions.accountId!==actor.accountId||actions.accountEmail!==actor.accountEmail||actions.budgetId!==budgetId)throw new AccessError('החשבון השתנה בזמן טעינת ההגדרות.')
 if(!Number.isSafeInteger(actions.revision)||actions.revision<0||!Array.isArray(actions.expectations))throw Error('תגובת ההגדרות אינה תקינה. יש לנסות לרענן.')
 return{budget,actions}
}
export async function saveExpectations(input:{budgetId:string;base:ExpectationsSnapshot;rules:ExpectationRule[]},fetcher:typeof fetch=fetch){
 const {budgetId,base,rules}=input,signal=new AbortController().signal,fresh=await loadExpectations(budgetId,base.budget.value,signal,fetcher)
 if(fresh.budget.spaces.find(s=>s.id===budgetId)?.role==='viewer')throw new WritePermissionError('המרחב פתוח לצפייה בלבד. הגדרות הדוחות לא נשלחו לשמירה.')
 if(fresh.actions.revision===base.actions.revision+1&&canonical(fresh.actions.expectations)===canonical(rules))return{...fresh,recovered:true}
 if(fresh.actions.revision!==base.actions.revision||canonical(fresh.actions.expectations)!==canonical(base.actions.expectations))throw new SaveConflict('הגדרות הדוחות השתנו. הטיוטה נשארה כאן; יש לגבות אותה לפני טעינת ההגדרות השמורות.')
 if(!validatePlan(fresh.budget.value.plan)||!validatePlan(base.budget.value.plan)||canonical(reportExpectationEntities(fresh.budget.value.plan))!==canonical(reportExpectationEntities(base.budget.value.plan)))throw new SaveConflict('רשימת החשבונות או הכרטיסים השתנתה. יש לפתוח מחדש את ההגדרות לפני שמירה.')
 let response:Response,result:any
 try{response=await fetcher('/api/actions?budget='+encodeURIComponent(budgetId),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'expectations',revision:base.actions.revision,rules,accountId:base.budget.value.accountId})})}catch{throw new SaveUncertain('לא ניתן לאשר אם ההגדרות נשמרו. ניסיון חוזר יבדוק קודם את ההגדרות השמורות.')}
 try{result=await response.json()}catch{throw new SaveUncertain('תוצאת השמירה לא התקבלה. יש לבדוק שוב את אותה שמירה.')}
 if(!response.ok){if(response.status===401)throw new AccessError('החיבור לחשבון פג.');if(response.status===409)throw new SaveConflict(result.error||'ההגדרות השתנו.');if(response.status===403){const check=await loadBudgetSnapshot(budgetId,signal,fetcher);if(check.value.accountId!==base.budget.value.accountId||check.value.accountEmail!==base.budget.value.accountEmail)throw new AccessError('החשבון השתנה בזמן השמירה.');throw new WritePermissionError(result.error||'אין הרשאה לשמירה.')}if(response.status>=500)throw new SaveUncertain('לא ניתן לאשר את תוצאת השמירה. הבחירות נשמרו לבדיקה חוזרת של אותה פעולה.');throw Error(result.error||'יש לבדוק את הגדרות הדוחות.')}
 if(result.revision!==base.actions.revision+1)throw new SaveUncertain('תוצאת השמירה אינה תואמת לגרסה הצפויה. יש לבדוק שוב.')
 return{...fresh,actions:{...fresh.actions,expectations:rules,revision:result.revision},recovered:false}
}
