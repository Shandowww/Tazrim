import {validatePlan} from '../../../src/budget.js'
import {AccessError,loadBudgetSnapshot,type BudgetResponse} from './budget-api.ts'
export class SaveConflict extends Error {}
export class SaveUncertain extends Error {}
export class WritePermissionError extends Error {}
function normalize(value:any):any {return value&&typeof value==='object'?Array.isArray(value)?value.map(normalize):Object.fromEntries(Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>[key,normalize(value[key])])):value}
const canonical=(value:any)=>JSON.stringify(normalize(value))
export async function savePreparedPlan(input:{budgetId:string;base:BudgetResponse;plan:Record<string,unknown>},fetcher:typeof fetch=fetch){
 const {budgetId,base,plan}=input
 if(!validatePlan(plan)||!validatePlan(base.plan))throw Error('יש לבדוק את נתוני התקציב לפני שמירה.')
 const signal=new AbortController().signal
 const fresh=await loadBudgetSnapshot(budgetId,signal,fetcher)
 if(fresh.value.accountId!==base.accountId||fresh.value.accountEmail!==base.accountEmail)throw new AccessError('החשבון השתנה. יש לחזור לחשבון המקורי לפני שמירת הטיוטה.')
 if(fresh.value.writeIdentityBound!==true)throw Error('השרת עדיין לא תומך בשמירה המוגנת של התצוגה החדשה. יש להשתמש בממשק הקיים.')
 if(fresh.spaces.find(s=>s.id===budgetId)?.role==='viewer')throw new WritePermissionError('התקציב פתוח כעת לצפייה בלבד. הטיוטה לא נשלחה לשמירה.')
 // An explicit retry can acknowledge a committed-but-lost receipt; it never overwrites it.
 if(fresh.value.revision===base.revision+1&&canonical(fresh.value.plan)===canonical(plan))return {...fresh,recovered:true}
 if(fresh.value.revision!==base.revision||canonical(fresh.value.plan)!==canonical(base.plan))throw new SaveConflict('התקציב השתנה מאז פתיחת הטיוטה. היא נשארה כאן; יש להוריד גיבוי לפני טעינת הגרסה השמורה.')
 let response:Response
 try{response=await fetcher('/api/plan?budget='+encodeURIComponent(budgetId),{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,revision:base.revision,accountId:base.accountId})})}catch{throw new SaveUncertain('לא ניתן לאשר אם השמירה הושלמה. הטיוטה נשארה כאן. ניסיון חוזר יבדוק קודם את המצב השמור.')}
 let result:any
 try{result=await response.json()}catch{throw new SaveUncertain('לא ניתן לאשר את תוצאת השמירה. יש להשאיר את הטיוטה ולבדוק שוב.')}
 if(!response.ok){if(response.status===409)throw new SaveConflict(result.error||'התקציב השתנה. הטיוטה נשארה כאן.');if(response.status===401)throw new AccessError('החיבור לחשבון פג. יש להיכנס מחדש.');if(response.status===403){const check=await loadBudgetSnapshot(budgetId,signal,fetcher);if(check.value.accountId!==base.accountId||check.value.accountEmail!==base.accountEmail)throw new AccessError('החשבון השתנה בזמן השמירה. יש להיכנס לחשבון המקורי.');throw new WritePermissionError(result.error||'אין הרשאה לשמירה.')}if(response.status>=500)throw new SaveUncertain('לא ניתן לאשר את תוצאת השמירה. הטיוטה נשארה כאן; ניסיון חוזר יבדוק קודם את המצב השמור.');throw Error(result.error||'הנתונים לא נשמרו. אפשר לנסות שוב.')}
 if(result.revision!==base.revision+1)throw new SaveUncertain('תוצאת השמירה אינה תואמת לטיוטה. יש לבדוק שוב לפני פעולה נוספת.')
 return {...fresh,value:{...fresh.value,plan,revision:result.revision},spaces:fresh.spaces.map(space=>space.id===budgetId?{...space,revision:result.revision,hasData:true}:space),recovered:false}
}
