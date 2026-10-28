import {isVault,decryptVault,saveVault} from '../../../src/vault.js'
import {validatePlan} from '../../../src/budget.js'
import type {BudgetResponse} from './budget-api.ts'
type Session={budgetId:string;accountId:string;accountEmail:string;envelope:any;key:CryptoKey;rawKey:Uint8Array;prepared?:{witness:string;envelope:any}}
let session:Session|null=null
let generation=0
export function forgetNativeVault(){session?.rawKey.fill(0);session=null;generation++}
export const vaultGeneration=()=>generation
export function nativeVaultSession(budgetId:string,base:BudgetResponse){return session&&session.budgetId===budgetId&&session.accountId===base.accountId&&session.accountEmail===base.accountEmail?session:null}
export const vaultContext=(budgetId:string,base:BudgetResponse)=>budgetId==='personal'?'personal:'+base.accountId:budgetId
export async function acceptVaultUnlock(budgetId:string,base:BudgetResponse,result:any):Promise<BudgetResponse>{
 const envelope=base.plan
 if(!isVault(envelope)||envelope?.context!==vaultContext(budgetId,base)||!validatePlan(result.plan)){result.rawKey.fill(0);throw Error('התקציב שנפתח אינו תואם למרחב שנבחר.')}
 forgetNativeVault();session={budgetId,accountId:base.accountId,accountEmail:base.accountEmail,envelope,key:result.key,rawKey:new Uint8Array(result.rawKey)}
 return {...base,plan:result.plan,vault:envelope!}
}
export async function revealVault(budgetId:string,value:BudgetResponse):Promise<BudgetResponse>{
 if(!session)return value
 if(!nativeVaultSession(budgetId,value)||!isVault(value.plan)||value.plan?.context!==session.envelope.context||value.plan?.keyId!==session.envelope.keyId){forgetNativeVault();return value}
 const current=session,epoch=generation
 try{const plan=await decryptVault(value.plan,current.key);if(epoch!==generation||current!==session)throw Error('התקציב ננעל. יש לפתוח אותו מחדש.');if(!validatePlan(plan))throw Error('הנתונים שנפתחו אינם תקציב תקין.');current.envelope=value.plan;return {...value,plan,vault:value.plan!}}
 catch(e){forgetNativeVault();throw e}
}
export async function sealNativePlan(budgetId:string,base:BudgetResponse,plan:Record<string,unknown>,witness:string){const current=nativeVaultSession(budgetId,base),epoch=generation;if(!current||!base.vault||!isVault(base.vault)||current.envelope.keyId!==base.vault.keyId||current.envelope.context!==base.vault.context)throw Error('התקציב ננעל. יש לפתוח אותו מחדש לפני שמירה.');if(current.prepared?.witness===witness)return current.prepared.envelope;const envelope=await saveVault(base.vault,current.key,plan);if(epoch!==generation)throw Error('התקציב ננעל במהלך הכנת השמירה.');current.prepared={witness,envelope};return envelope}
export async function revealHistoryVault(budgetId:string,base:BudgetResponse,value:any){const current=nativeVaultSession(budgetId,base),epoch=generation;if(!current||!isVault(value)||value.context!==current.envelope.context||value.keyId!==current.envelope.keyId)throw Error('אין אפשרות לפתוח את הגרסה הקודמת במפתח הנוכחי.');const plan=await decryptVault(value,current.key);if(epoch!==generation||!validatePlan(plan))throw Error('התקציב ננעל או שהגרסה אינה תקינה.');return plan}
if(typeof window!=='undefined')window.addEventListener('pagehide',forgetNativeVault)
