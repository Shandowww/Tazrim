import {deviceDraftScope,deviceDraftStore,openDeviceDraft,deviceDraftExport} from '../../../src/device-drafts.js'
import {validatePlan} from '../../../src/budget.js'
import {isVault} from '../../../src/vault.js'
import {nativeVaultSession,vaultGeneration} from './vault-session.ts'
import {loadBudgetSnapshot,AccessError,type BudgetResponse} from './budget-api.ts'
import {canonicalPlan,savePreparedPlan,SaveConflict} from './plan-save.ts'
export type LocalDraft={box:any;value:any;scope:string;restorable:boolean;reason:string}
export const draftBoxWitness=(box:any)=>box?canonicalPlan({keyId:box.keyId,archived:!!box.archived,iv:Array.from(new Uint8Array(box.iv)),encrypted:Array.from(new Uint8Array(box.encrypted))}):''
export async function loadDeviceDraft(budgetId:string,base:BudgetResponse,store= deviceDraftStore):Promise<LocalDraft|null>{
 if(isVault(base.plan)||!validatePlan(base.plan))throw Error('יש לפתוח את התקציב לפני בדיקת טיוטה במכשיר.')
 const epoch=vaultGeneration(),current=nativeVaultSession(budgetId,base),scope=deviceDraftScope(base.accountId,budgetId),box=await store('readonly',(s:any)=>s.get('draft:'+scope))
 if(base.vault&&!current)throw Error('התקציב ננעל. יש לפתוח מחדש.');if(!box)return null
 const value=await openDeviceDraft(scope,box,current?.key,base.vault?.keyId??'')
 if(epoch!==vaultGeneration()||base.vault&&current!==nativeVaultSession(budgetId,base))throw new AccessError('התקציב ננעל בזמן פתיחת הטיוטה.')
 if(typeof value?.selectedMonth!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value.selectedMonth)||!validatePlan(value?.plan)||!Number.isSafeInteger(value.revision)||value.revision<0||value.raw!==undefined&&(!value.raw||typeof value.raw!=='object'||Array.isArray(value.raw)||Object.values(value.raw).some(v=>typeof v!=='string')))throw Error('טיוטת המכשיר אינה תקינה. העותק המקומי נשמר.')
 const reason=box.archived?'הטיוטה נשמרה בנפרד בזמן רענון.':value.revision!==base.revision?'הגרסה השמורה השתנתה מאז יצירת הטיוטה.':Object.keys(value.raw??{}).length||value.monthlyPending||value.monthlySalaryChanged?'יש בטיוטה שדות חודשיים שדורשים השלמה בממשק המקורי.':''
 return{box,value,scope,restorable:!reason,reason}
}
export function exportDeviceDraft(draft:LocalDraft){return deviceDraftExport(draft.value)}
export async function saveDeviceDraft(budgetId:string,base:BudgetResponse,draft:LocalDraft,confirmed:boolean,fetcher:typeof fetch=fetch,store=deviceDraftStore){
 if(!confirmed||!draft.restorable||draft.scope!==deviceDraftScope(base.accountId,budgetId)||draft.value.revision!==base.revision)throw Error('יש לבדוק ולאשר טיוטה שלמה מאותה גרסה.')
 const current=await loadDeviceDraft(budgetId,base,store);if(!current?.restorable||canonicalPlan(current.value)!==canonicalPlan(draft.value)||draftBoxWitness(current.box)!==draftBoxWitness(draft.box))throw new SaveConflict('טיוטת המכשיר השתנתה בלשונית אחרת. יש לבדוק אותה מחדש.')
 const fresh=await loadBudgetSnapshot(budgetId,new AbortController().signal,fetcher)
 if(fresh.value.accountId!==base.accountId||fresh.value.accountEmail!==base.accountEmail)throw new AccessError('החשבון השתנה. הטיוטה לא נשלחה.')
 return savePreparedPlan({budgetId,base,plan:draft.value.plan},fetcher)
}
