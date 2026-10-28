import {applySavingsTransfer,clone,completeSavingTransfer,planSavingTransfer,previewSavingsTransfer,validatePlan} from '../../../src/budget.js'
import {moneyInputCents} from './monthly-report.ts'
export type SavingsTransferDraft={top:string;bottom:string;position:number;personal:string;shared:string;alreadyReported:boolean;confirmed:boolean}
export type SavingsTransferMode='allocation'|'new'|'complete'|'cancel'
export function savingsTransferPreview(plan:any,draft:SavingsTransferDraft,asOf:string){return previewSavingsTransfer(plan,draft.top,draft.bottom,draft.position,asOf)}
export function prepareSavingsTransferAction(plan:any,mode:SavingsTransferMode,id:string,draft:SavingsTransferDraft,asOf:string){
 if(!validatePlan(plan)||!draft||Object.keys(draft).sort().join(',')!=='alreadyReported,bottom,confirmed,personal,position,shared,top'||typeof draft.confirmed!=='boolean'||typeof draft.alreadyReported!=='boolean'||typeof draft.personal!=='string'||typeof draft.shared!=='string'||draft.personal.length>32||draft.shared.length>32||typeof draft.top!=='string'||typeof draft.bottom!=='string'||!Number.isInteger(draft.position)||typeof id!=='string'||!id||id.length>100)throw Error('יש לבדוק את פרטי הפעולה.')
 let next
 if(mode==='allocation'){const preview=savingsTransferPreview(plan,draft,asOf);if(!preview.amount)throw Error('יש לבחור סכום להעברה בין המטרות.');next=applySavingsTransfer(plan,draft.top,draft.bottom,draft.position,asOf)}
 else if(mode==='new')next=planSavingTransfer(plan,id,asOf,moneyInputCents(draft.personal)/100,moneyInputCents(draft.shared)/100,asOf)
 else{
  const request=plan.savingTransfers?.find((r:any)=>r.id===id&&r.status==='pending');if(!request)throw Error('בקשת ההעברה אינה ממתינה במרחב הזה.');if(!draft.confirmed)throw Error('יש לאשר את הפעולה לפני השמירה.')
  if(mode==='complete')next=completeSavingTransfer(plan,id,asOf,draft.alreadyReported)
  else if(mode==='cancel'){next=clone(plan);next.savingTransfers.find((r:any)=>r.id===id).status='cancelled'}
  else throw Error('הפעולה אינה זמינה.')
 }
 if(!validatePlan(next))throw Error('הפעולה אינה מתיישבת עם נתוני התקציב.');return next
}
