import {cashAccountList,cashUnassigned,appendCashTransfer,removeCashTransfer,assignCashRemainder,indexMonth,validatePlan} from '../../../src/budget.js'
import {moneyInputCents} from './monthly-report.ts'
export interface CashTransferDraft{from:string;to:string;month:string;amount:string;status:'planned'|'included';confirmed:boolean}
function eligible(plan:any,month:string){if(!validatePlan(plan)||typeof month!=='string'||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)||month<plan.startMonth||indexMonth(month)-indexMonth(plan.startMonth)>=120)throw Error('יש לבחור חודש בתקופת התכנון.')}
export function prepareCashTransfer(plan:any,id:string,draft:CashTransferDraft){
 if(!draft||Object.keys(draft).sort().join(',')!=='amount,confirmed,from,month,status,to'||typeof draft.amount!=='string'||draft.amount.length>32||!draft.amount.trim()||typeof id!=='string'||!id||id.length>100||draft.confirmed!==true)throw Error('יש לבדוק ולאשר את פרטי ההעברה בתכנון.')
 eligible(plan,draft.month)
 if((plan.cashPlanning?.transfers??[]).some((r:any)=>r.id===id))throw Error('ההעברה כבר קיימת. אין ליצור אותה שוב.')
 return appendCashTransfer(plan,{id,from:draft.from,to:draft.to,month:draft.month,amount:moneyInputCents(draft.amount)/100,status:draft.status})
}
export function prepareCashTransferRemoval(plan:any,id:string,month:string,confirmed:boolean){
 eligible(plan,month)
 if(confirmed!==true||!(plan.cashPlanning?.transfers??[]).some((row:any)=>row.id===id&&row.month===month))throw Error('יש לבחור העברה קיימת בחודש הנבחר ולאשר הסרה מהתכנון.')
 return removeCashTransfer(plan,id)
}
export function prepareCashRemainder(plan:any,id:string,month:string,confirmed:boolean){
 eligible(plan,month)
 if(confirmed!==true||!cashAccountList(plan).some((a:any)=>a.id===id))throw Error('יש לאשר את חשבון היעד לשיוך הסכומים.')
 if(!Object.keys(cashUnassigned(plan,month)).length)throw Error('אין סכומים חודשיים שממתינים לשיוך בחודש הזה.')
 return assignCashRemainder(plan,id,month)
}
