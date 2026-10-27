import {activeCards,cashAccountList,cashAssignedItem,cashCardsForAccount,clone,monthAt,paymentFor,validatePlan} from '../../../src/budget.js'
import {moneyInputCents} from './monthly-report.ts'
export interface PlannedItemDraft{name:string;amount:string;fees:string;firstMonth:string;payments:string;source:string;kind:string;cashAccountId:string;cardId:string}
export function plannedItemEligibility(plan:any,id:string,create=false){
 if(!validatePlan(plan))return 'התקציב אינו זמין לעריכת התכנון.'
 if(!create&&!plan.expenses.some((e:any)=>e.id===id))return 'הפריט אינו זמין במרחב הזה.'
 return null
}
export function initialPlannedItemDraft(plan:any,id:string,month:string):PlannedItemDraft{
 const e=plan.expenses.find((e:any)=>e.id===id)
 return {name:e?.name??'',amount:e?String(e.amount):'',fees:String(e?.fees??0),firstMonth:e?.firstMonth??(month>=plan.startMonth?month:plan.startMonth),payments:String(e?.payments??1),source:e?.source??'direct',kind:e?.kind??'expense',cashAccountId:e?cashAssignedItem(plan,e)??'':'',cardId:e?.cardId??''}
}
export function plannedItemDraftFingerprint(d:PlannedItemDraft){
 const amount=(v:string)=>{try{return moneyInputCents(v)}catch{return{invalid:v}}}
 return JSON.stringify({...d,name:d.name.trim(),amount:amount(d.amount),fees:d.kind==='income'?0:amount(d.fees),payments:/^\d+$/.test(d.payments.trim())?Number(d.payments):d.payments,source:d.kind==='income'?'direct':d.source,cardId:d.kind==='income'||d.source==='direct'?'':d.cardId})
}
export function plannedItemCards(plan:any,draft:PlannedItemDraft){return cashAccountList(plan).length?cashCardsForAccount(plan,draft.cashAccountId,draft.firstMonth):activeCards(plan,draft.firstMonth)}
export function preparePlannedItem(plan:any,id:string,draft:PlannedItemDraft,create=false){
 const reason=plannedItemEligibility(plan,id,create);if(reason)throw Error(reason)
 const expected=['name','amount','fees','firstMonth','payments','source','kind','cashAccountId','cardId']
 if(typeof id!=='string'||!id||id.length>100||!draft||Object.keys(draft).length!==expected.length||Object.entries(draft).some(([k,v])=>!expected.includes(k)||typeof v!=='string'||v.length>100))throw Error('יש לבדוק את פרטי התכנון.')
 if(create&&plan.expenses.some((e:any)=>e.id===id))throw Error('מזהה הפריט כבר קיים. אין לדרוס אותו.')
 if(!['expense','income'].includes(draft.kind)||!['direct','card'].includes(draft.source)||!/^\d{1,2}$/.test(draft.payments.trim())||!draft.name.trim())throw Error('יש להזין שם, סוג פריט ומספר תשלומים תקינים.')
 const accounts=cashAccountList(plan)
 if(accounts.length&&!accounts.some((a:any)=>a.id===draft.cashAccountId))throw Error('יש לבחור חשבון משלם או מקבל מפורש לפריט.')
 if(!accounts.length&&draft.cashAccountId)throw Error('החשבון אינו זמין במרחב הזה.')
 const existing=plan.expenses.find((e:any)=>e.id===id),item={...clone(existing??{}),id,name:draft.name.trim(),amount:moneyInputCents(draft.amount)/100,fees:draft.kind==='income'?0:moneyInputCents(draft.fees)/100,firstMonth:draft.firstMonth,payments:Number(draft.payments),source:draft.kind==='income'?'direct':draft.source,kind:draft.kind}
 delete item.cashAccountId;delete item.cardId
 if(draft.cashAccountId)item.cashAccountId=draft.cashAccountId
 if(item.source==='card'){
  if(!draft.cardId||!plannedItemCards(plan,draft).some((c:any)=>c.id===draft.cardId))throw Error('יש לבחור כרטיס פעיל שמשויך לחשבון המשלם.')
  item.cardId=draft.cardId
 }
 const next=clone(plan),index=next.expenses.findIndex((e:any)=>e.id===id)
 if(index>=0)next.expenses[index]=item;else next.expenses.push(item)
 if(!validatePlan(next))throw Error('יש לבדוק סכומים, תאריך ומספר תשלומים (1–60), בתוך עשר שנים מתחילת התקציב.')
 return next
}
export function plannedItemSchedule(item:any){return Array.from({length:item.payments},(_,i)=>({month:monthAt(item.firstMonth,i),amount:paymentFor(item,monthAt(item.firstMonth,i))}))}
