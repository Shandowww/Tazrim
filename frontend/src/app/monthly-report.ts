import {budgetFields,cashAccountList,clone,monthlyValues,saveMonthReport,validatePlan,cents,indexMonth,setReportedCashBalance,setOffCardTotal} from '../../../src/budget.js'
import type {BudgetResponse} from './budget-api.ts'
import {savePreparedPlan} from './plan-save.ts'
export interface MonthlyDraft { values:Record<string,string>; actual:boolean; includesCard:boolean; includesDirect:boolean; otherIncomeNote?:string; balance?:string; offCard?:string }
export {SaveConflict,SaveUncertain,WritePermissionError} from './plan-save.ts'
export function manualMonthEligibility(plan:any,month:string){
 if(!validatePlan(plan)||plan.format||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)||month<plan.startMonth||indexMonth(month)-indexMonth(plan.startMonth)>=120)return 'התקופה או התקציב אינם זמינים לעריכה הזו.'
 if(cashAccountList(plan).length||plan.bankImport)return 'בחרו חשבון כדי לדווח על החודש. כל חשבון נשמר עם השיוכים ומקורות הדיווח שלו.'
 if(plan.months[month]?.bankCoverage||(plan.cardBilling?.reports??[]).some((r:any)=>r.dueDate.startsWith(month))||(plan.details??[]).some((r:any)=>r.month===month&&r.statement))return 'לחודש הזה יש מקורות דיווח שמורים. אפשר לבדוק ולתקן אותם דרך הכרטיס או מרכז הדוחות.'
 return null
}
export function moneyInputCents(raw:string,limit=10000000000){
 const text=raw.trim();if(!text)return 0
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,2})?$/.test(text))throw Error('יש להזין סכום תקין עם עד שתי ספרות אחרי הנקודה.')
 const [whole,fraction='']=text.replaceAll(',','').split('.'),value=Number(whole)*100+Number(fraction.padEnd(2,'0'))
 if(!Number.isSafeInteger(value)||value>limit)throw Error('הסכום מחוץ לטווח המותר.')
 return value
}
export function initialMonthlyDraft(plan:any,month:string):MonthlyDraft{
 const record=plan.months[month],values=monthlyValues(plan,month)
 return {otherIncomeNote:record?.otherIncomeNote??'',balance:record?.cashReport?String(record.cashReport.balance):'',values:Object.fromEntries(budgetFields(plan).map(([key]:string[])=>[key,String(values[key]??0)])),actual:record?.actual??false,includesCard:record?.includesPlannedCard??false,includesDirect:record?.includesPlannedDirect??false}
}
export function monthlyDraftFingerprint(draft:MonthlyDraft){
 return JSON.stringify({values:Object.fromEntries(Object.entries(draft.values).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>{try{return[key,moneyInputCents(value)]}catch{return[key,{invalid:value}]}})),actual:draft.actual,card:draft.includesCard,direct:draft.includesDirect,note:draft.otherIncomeNote?.trim()??'',balance:draft.balance?.trim()||null,offCard:draft.offCard??null})
}
export function prepareMonthlyReport(plan:any,month:string,draft:MonthlyDraft,asOf:string){
 if(!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(asOf))throw Error('תאריך הבדיקה אינו תקין.')
 const reason=manualMonthEligibility(plan,month);if(reason)throw Error(reason)
 if(draft.actual&&month>asOf)throw Error('חודש עתידי ניתן לשמור כהערכה בלבד.')
 const allowed=budgetFields(plan).map(([key]:string[])=>key)
 if(Object.keys(draft.values).length!==allowed.length||Object.keys(draft.values).some(key=>!allowed.includes(key))||[draft.actual,draft.includesCard,draft.includesDirect].some(value=>typeof value!=='boolean'))throw Error('יש לבדוק את שדות הדיווח.')
 if(draft.otherIncomeNote!==undefined&&(typeof draft.otherIncomeNote!=='string'||draft.otherIncomeNote.length>120)||draft.balance!==undefined&&(typeof draft.balance!=='string'||draft.balance.length>32))throw Error('יש לבדוק את תיאור ההכנסה ואת יתרת הבנק.')
 let next=clone(plan);const previous=monthlyValues(plan,month),values={...previous}
 for(const key of allowed)values[key]=moneyInputCents(draft.values[key])/100
 if(draft.offCard!==undefined)setOffCardTotal(values,moneyInputCents(draft.offCard,20000000000)/100)
 next.months[month]={...(next.months[month]??{}),values,actual:next.months[month]?.actual??false,includesPlannedCard:draft.includesCard,includesPlannedDirect:draft.includesDirect,...(draft.otherIncomeNote!==undefined?{otherIncomeNote:draft.otherIncomeNote.trim()}:{})}
 if(draft.balance?.trim()){
  const raw=draft.balance.trim();if(raw==='-')throw Error('יש להשלים את יתרת הבנק לפני שמירה.');const balance=(raw.startsWith('-')?-1:1)*moneyInputCents(raw.startsWith('-')?raw.slice(1):raw)/100
  next=setReportedCashBalance(next,month,balance)
 }else if(plan.months[month]?.cashReport&&draft.balance!==undefined)throw Error('כבר נשמרה יתרת בנק. יש להזין סכום מפורש, כולל 0; שדה ריק אינו מוחק יתרה.')
 const result=saveMonthReport(next,month,draft.actual,asOf,cents(values.salary)!==cents(previous.salary))
 if(!validatePlan(result))throw Error('יש לבדוק את הסכומים והתאריכים לפני שמירה.')
 return result
}
export async function saveMonthlyReport(input:{budgetId:string;base:BudgetResponse;month:string;draft:MonthlyDraft;asOf:string},fetcher:typeof fetch=fetch){
 return savePreparedPlan({budgetId:input.budgetId,base:input.base,plan:prepareMonthlyReport(input.base.plan,input.month,input.draft,input.asOf)},fetcher)
}
