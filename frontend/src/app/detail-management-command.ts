import {monthAt,clone,saveExpenseDetail,removeExpenseDetail,clearExpenseCheque,validatePlan} from '../../../src/budget.js'
import {moneyInputCents} from './monthly-report.ts'
export interface DetailDraft{name:string;amount:string;category:string;method:string;month:string;date:string;number:string;status:string;accounting:string;refund:boolean}
export function initialDetailDraft(plan:any,id:string,month:string,method='checks',today=''):DetailDraft{const e=plan.details?.find((r:any)=>r.id===id);return{name:e?.name??'',amount:e?String(e.refund?Math.abs(e.amount):e.amount):'',category:e?.category??'אחר',method:e?.method??method,month:e?.month??month,date:e?.date??(today.startsWith(month+'-')?today:month+'-01'),number:e?.number??'',status:e?.status??(method==='checks'?'pending':'cleared'),accounting:e?.accounting??(method==='checks'?'additional':'included'),refund:e?.refund===true}}
export function prepareDetailSave(plan:any,id:string,draft:DetailDraft,create=false){
 if(!validatePlan(plan)||typeof id!=='string'||!id||id.length>100||!draft||Object.keys(draft).sort().join(',')!=='accounting,amount,category,date,method,month,name,number,refund,status'||Object.entries(draft).some(([key,value])=>key==='refund'?typeof value!=='boolean':typeof value!=='string'||value.length>100))throw Error('יש לבדוק את פרטי הרשומה.')
 if(draft.date<plan.startMonth+'-01'||draft.date>monthAt(plan.startMonth,120)+'-01')throw Error('יש לבחור תאריך בתקופת התכנון.');
 const old=plan.details?.find((r:any)=>r.id===id);if(create&&old||!create&&!old)throw Error('הרשומה השתנתה. יש לפתוח אותה מחדש.')
 const negative=draft.amount.trim().startsWith('-'),amount=moneyInputCents(negative?draft.amount.trim().slice(1):draft.amount)/100
 if(!draft.amount.trim()||negative&&!old?.statement)throw Error('יש להזין סכום תקין. זיכוי ידני מסמנים בסוג הפירוט.')
 const next={...clone(old??{}),...draft,id,amount:(negative?-1:1)*amount}
 if(next.method!=='variable')delete next.refund
 if(next.refund)next.amount=-Math.abs(next.amount)
 if(next.method==='checks')next.month=next.date.slice(0,7)
 else{next.accounting='included';next.status='cleared';next.number=''}
 return saveExpenseDetail(plan,next)
}
export function prepareDetailAction(plan:any,id:string,action:'delete'|'clear',confirmed:boolean){if(!validatePlan(plan)||confirmed!==true||!plan.details?.some((r:any)=>r.id===id))throw Error('יש לבדוק ולאשר את הרשומה במרחב הנבחר.');if(action==='delete')return removeExpenseDetail(plan,id);if(action==='clear')return clearExpenseCheque(plan,id);throw Error('הפעולה אינה זמינה.')}
