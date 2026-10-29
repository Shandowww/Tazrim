import {deviceDraftScope,deviceDraftStore,sealDeviceDraft,compareDeviceDraft} from '../../../src/device-drafts.js'
import {validatePlan} from '../../../src/budget.js'
import {nativeVaultSession,vaultGeneration} from './vault-session.ts'
import type {BudgetResponse} from './budget-api.ts'
export function originalDeviceWriter(budgetId:string,base:BudgetResponse,payloadFor:(value:any)=>any,deps={store:deviceDraftStore,compare:compareDeviceDraft,seal:sealDeviceDraft}){
 const scope=deviceDraftScope(base.accountId,budgetId),epoch=vaultGeneration(),session=nativeVaultSession(budgetId,base);let alive=true,expected='',queue=Promise.resolve(),failure=false
 const current=()=>alive&&epoch===vaultGeneration()&&(!base.vault||session===nativeVaultSession(budgetId,base))
 const ready=deps.store('readonly',(s:any)=>s.get('draft:'+scope)).then((box:any)=>{if(box)throw Error('כבר קיימת טיוטה במכשיר. בדקו או ייצאו אותה לפני יצירת עותק נוסף.');if(base.vault&&!session)throw Error('התקציב ננעל.');}).catch((e:any)=>{failure=true;throw e})
 // Attach rejection now; an untouched editor need not show a warning.
 void ready.catch(()=>{})
 return{stop(){alive=false},write(value:any){const work=queue.catch(()=>{}).then(async()=>{await ready;if(failure||!current())throw Error('שמירת הטיוטה במכשיר נעצרה.');const payload=payloadFor(value),box=await deps.seal(scope,payload,session?.key,base.vault?.keyId??'');if(!current())throw Error('התקציב ננעל.');try{expected=await deps.compare(scope,expected,box,current)}catch(e){failure=true;throw e}});queue=work;return work}}
}

export function originalPlanPayload(base:BudgetResponse,plan:any,month:string){if(!validatePlan(base.plan)||!validatePlan(plan)||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month))throw Error('הטיוטה אינה שלמה. יש להשלים את השדות לפני יציאה.');return{plan,revision:base.revision,selectedMonth:month,monthlyPending:'',monthlySalaryChanged:false,tab:'settings',raw:{}};}
