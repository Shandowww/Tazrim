import {budgetFields,cashAccountList,clone,monthlyValues,saveMonthReport,validatePlan,cents,indexMonth} from '../../../src/budget.js'
import type {BudgetResponse} from './budget-api.ts'
import {savePreparedPlan} from './plan-save.ts'
export interface MonthlyDraft { values:Record<string,string>; actual:boolean; includesCard:boolean; includesDirect:boolean }
export {SaveConflict,SaveUncertain,WritePermissionError} from './plan-save.ts'
export function manualMonthEligibility(plan:any,month:string){
 if(!validatePlan(plan)||plan.format||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)||month<plan.startMonth||indexMonth(month)-indexMonth(plan.startMonth)>=120)return 'התקופה או התקציב אינם זמינים לעריכה הזו.'
 if(cashAccountList(plan).length||plan.bankImport)return 'דיווח לפי חשבון או דוח בנק נשמר בינתיים בממשק הקיים, עם כל השיוכים וההתאמות.'
 if(plan.months[month]?.cashReport||plan.months[month]?.bankCoverage||(plan.cardBilling?.reports??[]).some((r:any)=>r.dueDate.startsWith(month))||(plan.details??[]).some((r:any)=>r.month===month&&r.statement))return 'לחודש הזה יש מקורות דיווח שמורים. עדכון המקורות נעשה בינתיים בממשק הקיים.'
 return null
}
export function moneyInputCents(raw:string){
 const text=raw.trim();if(!text)return 0
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,2})?$/.test(text))throw Error('יש להזין סכום תקין עם עד שתי ספרות אחרי הנקודה.')
 const [whole,fraction='']=text.replaceAll(',','').split('.'),value=Number(whole)*100+Number(fraction.padEnd(2,'0'))
 if(!Number.isSafeInteger(value)||value>10000000000)throw Error('הסכום מחוץ לטווח המותר.')
 return value
}
export function initialMonthlyDraft(plan:any,month:string):MonthlyDraft{
 const record=plan.months[month],values=monthlyValues(plan,month)
 return {values:Object.fromEntries(budgetFields(plan).map(([key]:string[])=>[key,String(values[key]??0)])),actual:record?.actual??false,includesCard:record?.includesPlannedCard??false,includesDirect:record?.includesPlannedDirect??false}
}
export function monthlyDraftFingerprint(draft:MonthlyDraft){
 return JSON.stringify({values:Object.fromEntries(Object.entries(draft.values).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>{try{return[key,moneyInputCents(value)]}catch{return[key,{invalid:value}]}})),actual:draft.actual,card:draft.includesCard,direct:draft.includesDirect})
}
export function prepareMonthlyReport(plan:any,month:string,draft:MonthlyDraft,asOf:string){
 if(!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(asOf))throw Error('תאריך הבדיקה אינו תקין.')
 const reason=manualMonthEligibility(plan,month);if(reason)throw Error(reason)
 if(draft.actual&&month>asOf)throw Error('חודש עתידי ניתן לשמור כהערכה בלבד.')
 const allowed=budgetFields(plan).map(([key]:string[])=>key)
 if(Object.keys(draft.values).length!==allowed.length||Object.keys(draft.values).some(key=>!allowed.includes(key))||[draft.actual,draft.includesCard,draft.includesDirect].some(value=>typeof value!=='boolean'))throw Error('יש לבדוק את שדות הדיווח.')
 const next=clone(plan),previous=monthlyValues(plan,month),values={...previous}
 for(const key of allowed)values[key]=moneyInputCents(draft.values[key])/100
 next.months[month]={...(next.months[month]??{}),values,actual:next.months[month]?.actual??false,includesPlannedCard:draft.includesCard,includesPlannedDirect:draft.includesDirect}
 const result=saveMonthReport(next,month,draft.actual,asOf,cents(values.salary)!==cents(previous.salary))
 if(!validatePlan(result))throw Error('יש לבדוק את הסכומים והתאריכים לפני שמירה.')
 return result
}
export async function saveMonthlyReport(input:{budgetId:string;base:BudgetResponse;month:string;draft:MonthlyDraft;asOf:string},fetcher:typeof fetch=fetch){
 return savePreparedPlan({budgetId:input.budgetId,base:input.base,plan:prepareMonthlyReport(input.base.plan,input.month,input.draft,input.asOf)},fetcher)
}
