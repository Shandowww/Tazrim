import {saveCashAccount,cashAccountList,clone,validatePlan,accountColors,cashAssignedItem,cashCardAccount,creditCards,cents} from '../../../src/budget.js'
import {moneyInputCents} from './monthly-report.ts'
export interface AccountDraft { label:string; color:string; buffer:string; opening:string; openingMonth:string }
export function manualAccountEligibility(plan:any,id:string){
 if(!validatePlan(plan))return 'התקציב אינו זמין לעריכה הזו.'
 if(!id)return null
 if(!(plan.cashPlanning?.accounts??[]).some((a:any)=>a.id===id))return 'החשבון אינו חשבון ידני מוגדר במרחב הזה.'
 if((plan.bankImport?.accounts??[]).some((a:any)=>a.id===id))return 'חשבון עם מקורות בנק נערך בינתיים בממשק הקיים, עם כל שיוכי המקור.'
 return null
}
export function initialAccountDraft(plan:any,id:string,month:string):AccountDraft{
 const a=(plan.cashPlanning?.accounts??[]).find((row:any)=>row.id===id)
 return {label:a?.label??'',color:a?.color??'',buffer:String(a?.buffer??0),opening:a?.opening===undefined?'':String(a.opening),openingMonth:a?.openingMonth??plan.startMonth??month}
}
const signedCents=(text:string)=>text.trim().startsWith('-')?-moneyInputCents(text.trim().slice(1)):moneyInputCents(text)
export function accountDraftFingerprint(d:AccountDraft){const amount=(text:string,signed=false)=>{try{return text.trim()===''&&signed?null:signed?signedCents(text):moneyInputCents(text)}catch{return {invalid:text}}};return JSON.stringify({label:d.label.trim(),color:d.color,buffer:amount(d.buffer),opening:amount(d.opening,true),openingMonth:d.opening.trim()===''?null:d.openingMonth})}
export function prepareManualAccount(plan:any,id:string,draft:AccountDraft,{create=false,asOf}:{create?:boolean;asOf:string}){
 const reason=manualAccountEligibility(plan,create?'':id);if(reason)throw Error(reason)
 if(typeof id!=='string'||!id||id.length>100||!draft||Object.keys(draft).length!==5||Object.keys(draft).some(key=>!['label','color','buffer','opening','openingMonth'].includes(key))||Object.values(draft).some(value=>typeof value!=='string'||value.length>100))throw Error('יש לבדוק את פרטי החשבון.')
 if(!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(asOf))throw Error('תאריך הבדיקה אינו תקין.')
 const existing=(plan.cashPlanning?.accounts??[]).find((a:any)=>a.id===id)
 if(create&&cashAccountList(plan).some((a:any)=>a.id===id))throw Error('מזהה החשבון כבר קיים. אין לדרוס אותו.')
 if(!draft.label.trim()||draft.label.trim().length>80||draft.color&&!accountColors.some(([color]:string[])=>color===draft.color))throw Error('יש לבדוק את שם החשבון והצבע.')
 const account={...clone(existing??{}),id,label:draft.label.trim(),buffer:moneyInputCents(draft.buffer)/100}
 if(draft.color)account.color=draft.color;else delete account.color
 if(draft.opening.trim()!==''){
  if(!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(draft.openingMonth)||draft.openingMonth<plan.startMonth||draft.openingMonth>asOf)throw Error('יש לבחור חודש יתרת פתיחה מתקופת התקציב ועד החודש הנוכחי.')
  account.opening=signedCents(draft.opening)/100;account.openingMonth=draft.openingMonth
 }else if(existing?.opening!==undefined){throw Error('יתרת הפתיחה קיימת. יש להזין סכום מפורש; למחיקה או שינוי מקור יש להשתמש בממשק הקיים.')}
 const result=saveCashAccount(plan,account)
 const dependencies=[...plan.expenses,...(plan.loans??[]),...(plan.details??[]),...(plan.savingTransfers??[])]
 if(dependencies.some(item=>cashAssignedItem(plan,item)!==cashAssignedItem(result,item)))throw Error('הוספת החשבון משנה שיוך משלם קיים או משתמע. יש להשלים שיוכים מפורשים בממשק הקיים לפני הוספה.')
 for(const card of creditCards(plan)){
  const used=cents(plan.defaults[card.id]??0)!==0||Object.values(plan.months).some((record:any)=>cents(record.values[card.id]??0)!==0)||(plan.cardBilling?.reports??[]).some((row:any)=>row.cardId===card.id)
  if(used&&cashCardAccount(plan,card.id)!==cashCardAccount(result,card.id))throw Error('הוספת החשבון משנה חשבון משלם משתמע לכרטיס. יש לשייך את הכרטיס במפורש בממשק הקיים.')
 }
 return result
}
