import {deviceDraftStore,sealDeviceDraft,compareDeviceDraft} from '../../../src/device-drafts.js'
import {originalDeviceWriter} from './device-draft-writer.ts'
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
export function monthlyDeviceWriter(budgetId:string,base:BudgetResponse,month:string,asOf:string,deps={store:deviceDraftStore,compare:compareDeviceDraft,seal:sealDeviceDraft}){return originalDeviceWriter(budgetId,base,(draft:MonthlyDraft)=>originalMonthlyPayload(base,month,draft,asOf),deps)}
