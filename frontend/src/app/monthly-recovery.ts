import {initialMonthlyDraft,manualMonthEligibility,prepareMonthlyReport,type MonthlyDraft} from './monthly-report.ts'
import type {BudgetResponse} from './budget-api.ts'
const normalize=(value:any):any=>value&&typeof value==='object'?Array.isArray(value)?value.map(normalize):Object.fromEntries(Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>[key,normalize(value[key])])):value
async function snapshotHash(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(normalize(value))));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('')}
function checkedDraft(value:unknown,base:BudgetResponse,month:string):MonthlyDraft{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('קובץ הטיוטה אינו תקין.')
 const d=value as MonthlyDraft,keys=Object.keys(d)
 if(keys.length<4||keys.length>7||keys.some(key=>!['values','actual','includesCard','includesDirect','otherIncomeNote','balance','offCard'].includes(key))||!d.values||typeof d.values!=='object'||Array.isArray(d.values)||[d.actual,d.includesCard,d.includesDirect].some(v=>typeof v!=='boolean'))throw Error('קובץ הטיוטה אינו תקין.')
 if(d.otherIncomeNote!==undefined&&(typeof d.otherIncomeNote!=='string'||d.otherIncomeNote.length>120)||d.balance!==undefined&&(typeof d.balance!=='string'||d.balance.length>32))throw Error('שדות הטיוטה אינם תקינים.')
 if(d.offCard!==undefined&&(typeof d.offCard!=='string'||d.offCard.length>32))throw Error('שדות הטיוטה אינם תקינים.')
 const expected=Object.keys(initialMonthlyDraft(base.plan,month).values)
 if(Object.keys(d.values).length!==expected.length||Object.entries(d.values).some(([key,v])=>!expected.includes(key)||typeof v!=='string'||v.length>32))throw Error('שדות הטיוטה אינם תואמים לתקציב הזה.')
 return structuredClone(d)
}
/** Locally downloadable only; no browser storage and no automatic financial write. */
export async function createMonthlyRecovery(base:BudgetResponse,budgetId:string,month:string,draft:MonthlyDraft,asOf:string){
 const reason=manualMonthEligibility(base.plan,month);if(reason)throw Error(reason)
 const checked=checkedDraft(draft,base,month),monthlyDraft={version:1,accountId:base.accountId,budgetId,month,baseRevision:base.revision,baseHash:await snapshotHash(base.plan),draft:checked}
 try{return{format:'monthly-flow-v1',plan:prepareMonthlyReport(base.plan,month,checked,asOf),monthlyDraft}}catch{return{format:'monthly-flow-monthly-draft-v1',monthlyDraft}}
}
/** A recovery file cannot rebase, overwrite saved data or revive a draft in another scope. */
export async function readMonthlyRecovery(text:string,base:BudgetResponse,budgetId:string,month:string){
 if(typeof text!=='string'||text.length>12000000)throw Error('קובץ הטיוטה גדול מדי.')
 let value:any;try{value=JSON.parse(text)}catch{throw Error('קובץ הטיוטה אינו JSON תקין.')}
 if(!value||typeof value!=='object'||!['monthly-flow-v1','monthly-flow-monthly-draft-v1'].includes(value.format))throw Error('זהו אינו גיבוי טיוטת דיווח חודשי.')
 const allowed=value.format==='monthly-flow-v1'?['format','plan','monthlyDraft']:['format','monthlyDraft']
 if(Object.keys(value).some(k=>!allowed.includes(k)))throw Error('קובץ הטיוטה כולל שדות שאינם נתמכים.')
 const r=value.monthlyDraft
 if(!r||typeof r!=='object'||Array.isArray(r)||r.version!==1||Object.keys(r).length!==7||Object.keys(r).some(k=>!['version','accountId','budgetId','month','baseRevision','baseHash','draft'].includes(k)))throw Error('זהו אינו גיבוי טיוטה שנוצר בתצוגה הזו.')
 if(r.accountId!==base.accountId||r.budgetId!==budgetId||r.month!==month)throw Error('הטיוטה שייכת לחשבון, למרחב או לחודש אחר. הנתונים הנוכחיים לא שונו.')
 if(!Number.isInteger(r.baseRevision)||r.baseRevision!==base.revision||typeof r.baseHash!=='string'||!/^[a-f0-9]{64}$/.test(r.baseHash)||r.baseHash!==await snapshotHash(base.plan))throw Error('התקציב השמור השתנה מאז הורדת הטיוטה. אין לשחזר אותה מעל גרסה חדשה; הקובץ נשאר אצלך לבדיקה.')
 const reason=manualMonthEligibility(base.plan,month);if(reason)throw Error(reason)
 return checkedDraft(r.draft,base,month)
}

/** Resume the original month-only draft over its exact saved revision; retain every other edit. */
export function originalMonthlyFields(draft:any,base:BudgetResponse,budgetId:string,month:string):MonthlyDraft{
 const reason=manualMonthEligibility(base.plan,month);if(reason)throw Error(reason)
 const scope=JSON.stringify([base.accountId,budgetId]),v=draft?.value,expected=structuredClone(base.plan) as any
 if(v?.plan?.months?.[month])expected.months[month]=v.plan.months[month]
 if(draft?.scope!==scope||draft?.box?.archived||v?.revision!==base.revision||v?.selectedMonth!==month||v?.monthlyPending&&v.monthlyPending!==month||JSON.stringify(normalize(v?.plan))!==JSON.stringify(normalize(expected)))throw Error('הטיוטה כוללת גרסה, חודש או שינויים נוספים. העותק המקומי נשמר; אפשר להוריד אותו לבדיקה בלי להחליף את התקציב.')
 const result=initialMonthlyDraft(v.plan,month),raw=v.raw??{}
 if(typeof raw!=='object'||Array.isArray(raw)||!Object.keys(raw).length&&JSON.stringify(normalize(v.plan))===JSON.stringify(normalize(base.plan)))throw Error('אין בטיוטה שדות חודשיים להמשך עריכה.')
 for(const [name,value]of Object.entries(raw)){
  const key=name.startsWith('month-')?name.slice(6):''
  if(typeof value!=='string')throw Error('שדות הטיוטה אינם תקינים.')
  if(key==='otherIncomeNote'&&value.length<=120){result.otherIncomeNote=value;continue}
  if(key==='cashBalance'&&value.length<=32){result.balance=value;continue}
  if(key==='offCard'&&value.length<=32){
   // Preserve invalid text so it can be completed; the original aggregation owns the split.
   result.offCard=value;continue
  }
  if(!key||!Object.hasOwn(result.values,key)||value.length>32)throw Error('חלק משדות הטיוטה אינם מזוהים. העותק נשמר ולא נטען חלקית.')
  result.values[key]=value
 }
 return result
}
