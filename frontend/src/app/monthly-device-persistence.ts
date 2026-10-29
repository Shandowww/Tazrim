import {deviceDraftScope,deviceDraftStore,sealDeviceDraft,compareDeviceDraft} from '../../../src/device-drafts.js'
import {nativeVaultSession,vaultGeneration} from './vault-session.ts'
import {manualMonthEligibility,initialMonthlyDraft,prepareMonthlyReport,type MonthlyDraft} from './monthly-report.ts'
import type {BudgetResponse} from './budget-api.ts'
export function originalMonthlyPayload(base:BudgetResponse,month:string,draft:MonthlyDraft,asOf:string){
 const reason=manualMonthEligibility(base.plan,month);if(reason)throw Error(reason);const baseline=initialMonthlyDraft(base.plan,month);if(!draft?.values||Object.keys(draft.values).sort().join()!==Object.keys(baseline.values).sort().join()||Object.values(draft.values).some(v=>typeof v!=='string'||v.length>32)||[draft.actual,draft.includesCard,draft.includesDirect].some(v=>typeof v!=='boolean'))throw Error('יש לבדוק את שדות הטיוטה.')
 let plan=base.plan,raw:Record<string,string>={}
 try{plan=prepareMonthlyReport(base.plan,month,draft,asOf)}catch{
  const initial=initialMonthlyDraft(base.plan,month)
  if(draft.actual!==initial.actual||draft.includesCard!==initial.includesCard||draft.includesDirect!==initial.includesDirect)throw Error('לטיוטה הזו יש להוריד גיבוי לקובץ לפני יציאה.')
  for(const [key,value]of Object.entries(draft.values)){if(value===initial.values[key])continue;if(!Object.hasOwn(initial.values,key)||['variable','transfers'].includes(key)||typeof value!=='string'||value.length>32)throw Error('לטיוטה הזו יש להוריד גיבוי לקובץ לפני יציאה.');raw['month-'+key]=value}
 }
 return{plan,revision:base.revision,selectedMonth:month,monthlyPending:'',monthlySalaryChanged:false,tab:'monthly',raw}
}
export function monthlyDeviceWriter(budgetId:string,base:BudgetResponse,month:string,asOf:string,deps={store:deviceDraftStore,compare:compareDeviceDraft,seal:sealDeviceDraft}){
 const scope=deviceDraftScope(base.accountId,budgetId),epoch=vaultGeneration(),session=nativeVaultSession(budgetId,base);let alive=true,expected='',queue=Promise.resolve(),failure=false
 const current=()=>alive&&epoch===vaultGeneration()&&(!base.vault||session===nativeVaultSession(budgetId,base))
 const ready=deps.store('readonly',(s:any)=>s.get('draft:'+scope)).then((box:any)=>{if(box)throw Error('כבר קיימת טיוטה במכשיר. בדקו או ייצאו אותה לפני יצירת עותק נוסף.');if(base.vault&&!session)throw Error('התקציב ננעל.');}).catch((e:any)=>{failure=true;throw e})
 // Attach rejection now; an untouched editor need not show a warning.
 void ready.catch(()=>{})
 return{stop(){alive=false},write(draft:MonthlyDraft){const work=queue.catch(()=>{}).then(async()=>{await ready;if(failure||!current())throw Error('שמירת הטיוטה במכשיר נעצרה.');const payload=originalMonthlyPayload(base,month,draft,asOf),box=await deps.seal(scope,payload,session?.key,base.vault?.keyId??'');if(!current())throw Error('התקציב ננעל.');try{expected=await deps.compare(scope,expected,box,current)}catch(e){failure=true;throw e}});queue=work;return work}}
}
