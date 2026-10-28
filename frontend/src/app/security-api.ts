import {createVault,isVault,unlockVault} from '../../../src/vault.js'
import {preserveImportMigrationGuards,validatePlan} from '../../../src/budget.js'
import {loadBudgetSnapshot,AccessError,type BudgetResponse} from './budget-api.ts'
import {acceptVaultUnlock,forgetNativeVault,vaultContext,vaultGeneration} from './vault-session.ts'
import {canonicalPlan,saveWirePlan,SaveConflict} from './plan-save.ts'
export type VaultSetup=Awaited<ReturnType<typeof createVault>> & {snapshot:string}
export async function prepareEncryption(budgetId:string,base:BudgetResponse,password:string,confirm:string){if(base.vault||!validatePlan(base.plan))throw Error('יש לפתוח תקציב גלוי ושמור לפני הכנת הצפנה.');if(password!==confirm)throw Error('הסיסמאות אינן זהות.');const setup=await createVault(base.plan,password,vaultContext(budgetId,base));return {...setup,snapshot:canonicalPlan(base.plan)}}
export async function enableEncryption(budgetId:string,base:BudgetResponse,setup:VaultSetup,confirmed:boolean,fetcher:typeof fetch=fetch){
 if(!confirmed||base.vault||setup.snapshot!==canonicalPlan(base.plan)||setup.envelope.context!==vaultContext(budgetId,base))throw Error('יש לאשר שמירת מפתח שחזור עבור התקציב שנבדק.')
 const fresh=await loadBudgetSnapshot(budgetId,new AbortController().signal,fetcher)
 if(fresh.value.accountId!==base.accountId||fresh.value.accountEmail!==base.accountEmail)throw new AccessError('החשבון השתנה. יש להכין הצפנה מחדש בחשבון המקורי.')
 if(fresh.spaces.find(s=>s.id===budgetId)?.role!=='owner')throw Error('רק בעל התקציב יכול להפעיל הצפנה.')
 const saved=await saveWirePlan({budgetId,base,plan:setup.envelope,wire:setup.envelope},fetcher)
 const value=await acceptVaultUnlock(budgetId,{...saved.value,plan:setup.envelope}, {...setup,plan:base.plan})
 return {...saved,value}
}
export async function openSavedVault(budgetId:string,base:BudgetResponse,secret:string,recovery=false,fetcher:typeof fetch=fetch,deviceResult?:any){
 const epoch=vaultGeneration(),fresh=await loadBudgetSnapshot(budgetId,new AbortController().signal,fetcher)
 if(fresh.value.accountId!==base.accountId||fresh.value.accountEmail!==base.accountEmail)throw new AccessError('החשבון השתנה. יש לפתוח מחדש את המרחב.')
 if(!isVault(base.plan)||base.plan?.context!==vaultContext(budgetId,base)||canonicalPlan(fresh.value.plan)!==canonicalPlan(base.plan)||fresh.value.revision!==base.revision)throw new SaveConflict('התקציב השתנה. יש לרענן לפני הפתיחה.')
 const result=deviceResult??await unlockVault(base.plan,secret,recovery)
 try{const after=await loadBudgetSnapshot(budgetId,new AbortController().signal,fetcher);if(epoch!==vaultGeneration()||after.value.accountId!==base.accountId||after.value.accountEmail!==base.accountEmail||after.value.revision!==base.revision||canonicalPlan(after.value.plan)!==canonicalPlan(base.plan))throw new AccessError('החשבון או התקציב השתנו בזמן הפתיחה.');const value=await acceptVaultUnlock(budgetId,base,result);result.rawKey.fill(0);return {...after,value}}catch(e){result.rawKey.fill(0);forgetNativeVault();throw e}
}
export async function prepareBudgetImport(base:BudgetResponse,text:string,secret='',recovery=false){
 if(text.length>12000000)throw Error('קובץ הגיבוי גדול מדי.');const file=JSON.parse(text);let plan:any
 if(isVault(file)){const result=await unlockVault(file,secret,recovery);try{plan=result.plan}finally{result.rawKey.fill(0)}}else if(file.format==='monthly-flow-v1')plan=file.plan
 if(!validatePlan(plan)||!validatePlan(base.plan))throw Error('זהו אינו קובץ גיבוי תקין של תזרים חודשי.');return preserveImportMigrationGuards(base.plan,plan)
}
