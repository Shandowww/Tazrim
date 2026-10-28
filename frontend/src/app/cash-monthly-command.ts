import {budgetFields,cashAccountValues,cashAccountList,cashCardAccount,creditCards,clone,indexMonth,saveManualCashMonth,validatePlan} from '../../../src/budget.js'
import {moneyInputCents} from './monthly-report.ts'
export interface CashMonthlyDraft {values:Record<string,string>;actual:boolean;includesCard:boolean;includesDirect:boolean;balance:string}
const monthOK=(m:string)=>/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(m)
export function cashMonthlyEligibility(plan:any,id:string,month:string,{sourceAware=false}={}){
 if(!validatePlan(plan)||!monthOK(month)||month<plan.startMonth||indexMonth(month)-indexMonth(plan.startMonth)>=120)return 'התקופה או התקציב אינם זמינים לעריכה הזו.'
 if(!id||!sourceAware&&!(plan.cashPlanning?.accounts??[]).some((a:any)=>a.id===id)||!cashAccountList(plan).some((a:any)=>a.id===id))return 'החשבון אינו מוגדר במרחב הזה.'
 if(!sourceAware&&(plan.bankImport||plan.months[month]?.cashReport||plan.months[month]?.bankCoverage||plan.cashPlanning?.months?.[month]?.[id]?.bankImported))return 'לחודש או לתקציב יש מקורות בנק שמורים. אפשר לבדוק תיקון ידני ששומר את מקורות הדיווח.'
 const cards=new Set(creditCards(plan).filter((c:any)=>cashCardAccount(plan,c.id)===id).map((c:any)=>c.id))
 if(!sourceAware&&((plan.cardBilling?.reports??[]).some((r:any)=>r.dueDate.startsWith(month)&&(r.accountId===id||cards.has(r.cardId)))||(plan.details??[]).some((r:any)=>r.month===month&&r.statement&&(r.cashAccountId===id||cards.has(r.method)||cards.has(r.cardId)))))return 'לחשבון יש דוח כרטיס שמור בחודש הזה. אפשר לבדוק תיקון ידני לצד שמירת הדוח המקורי.'
 const {values}=cashAccountValues(plan,id,month)
 if(creditCards(plan).some((c:any)=>Number(values[c.id]??0)!==0&&!cards.has(c.id)))return 'יש בחשבון סכום כרטיס ללא שיוך משלם תואם. יש להשלים שיוכים בממשק הקיים לפני עריכה.'
 return null
}
export function cashMonthlyFields(plan:any,id:string){
 const cardIds=new Set(creditCards(plan).map((c:any)=>c.id))
 return budgetFields(plan).filter(([key]:string[])=>!cardIds.has(key)||cashCardAccount(plan,key)===id)
}
export function initialCashMonthlyDraft(plan:any,id:string,month:string):CashMonthlyDraft{
 const {values,record}=cashAccountValues(plan,id,month)
 return {values:Object.fromEntries(cashMonthlyFields(plan,id).map(([key]:string[])=>[key,String(values[key]??0)])),actual:record?.actual??false,includesCard:record?.includesPlannedCard??false,includesDirect:record?.includesPlannedDirect??false,balance:record?.balance===undefined?'':String(record.balance)}
}
const signedCents=(raw:string)=>{const t=raw.trim();if(t==='-')throw Error('יש להזין סכום יתרה מלא.');return t.startsWith('-')?-moneyInputCents(t.slice(1)):moneyInputCents(t)}
export function cashMonthlyDraftFingerprint(draft:CashMonthlyDraft){
 const amount=(v:string,signed=false)=>{try{return signed&&v.trim()===''?null:signed?signedCents(v):moneyInputCents(v)}catch{return{invalid:v}}}
 return JSON.stringify({values:Object.fromEntries(Object.entries(draft.values).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,amount(v)])),actual:draft.actual,card:draft.includesCard,direct:draft.includesDirect,balance:amount(draft.balance,true)})
}
export function prepareCashMonthlyReport(plan:any,id:string,month:string,draft:CashMonthlyDraft,asOf:string,{sourceAware=false}={}){
 const reason=cashMonthlyEligibility(plan,id,month,{sourceAware});if(reason)throw Error(reason)
 if(!monthOK(asOf)||!draft||Object.keys(draft).length!==5||Object.keys(draft).some(k=>!['values','actual','includesCard','includesDirect','balance'].includes(k))||typeof draft.balance!=='string'||draft.balance.length>32||[draft.actual,draft.includesCard,draft.includesDirect].some(v=>typeof v!=='boolean')||!draft.values||typeof draft.values!=='object'||Array.isArray(draft.values))throw Error('יש לבדוק את שדות הדיווח.')
 const keys=cashMonthlyFields(plan,id).map(([key]:string[])=>key)
 if(Object.keys(draft.values).length!==keys.length||Object.entries(draft.values).some(([k,v])=>!keys.includes(k)||typeof v!=='string'||v.length>32))throw Error('שדות הדיווח אינם תואמים לחשבון שנבחר.')
 const {values:previous}=cashAccountValues(plan,id,month),values=clone(previous)
 for(const key of keys)values[key]=moneyInputCents(draft.values[key])/100
 const old=plan.cashPlanning?.months?.[month]?.[id]
 const record:{values:any;actual:boolean;includesPlannedCard:boolean;includesPlannedDirect:boolean;balance?:number}={values,actual:draft.actual,includesPlannedCard:draft.includesCard,includesPlannedDirect:draft.includesDirect}
 if(draft.balance.trim()!=='')record.balance=signedCents(draft.balance)/100
 else if(old?.balance!==undefined)throw Error('כבר נשמרה יתרה לחשבון בחודש הזה. יש להזין סכום מפורש; אין למחוק אותה בשדה ריק.')
 return saveManualCashMonth(plan,id,month,record,asOf)
}
