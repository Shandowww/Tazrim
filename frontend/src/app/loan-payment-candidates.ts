import {cashAssignedItem,loanMatchText,monthAt} from '../../../src/budget.js'
import {periodFor} from './detail-period.ts'

/** Read-only candidate list; the original link command still validates every save. */
export function loanPaymentCandidates(plan:any,id:string,search:string,query=''){
 const loan=plan.loans?.find((row:any)=>row.id===id)
 if(!loan)throw Error('ההלוואה אינה זמינה במרחב הזה.')
 const period=periodFor(search),from=period.year+'-'+(period.month||'01'),to=period.year+'-'+(period.month||'12'),loanEnd=monthAt(loan.from,loan.months-1),account=cashAssignedItem(plan,loan),needle=loanMatchText(query)
 const otherKeys=new Set((plan.loans??[]).filter((row:any)=>row.id!==id).flatMap((row:any)=>(row.repayments?.keys??[]).map((ref:any)=>ref.key)))
 const entries=(plan.bankImport?.entries??[]).filter((row:any)=>row.source&&!otherKeys.has(row.key)&&row.accountId===account&&row.month>=from&&row.month<=to&&row.month>=loan.from&&row.month<=loanEnd&&(row.cents<0||row.field==='loanRepayment')&&!loan.repayments?.keys.some((ref:any)=>ref.key===row.key&&ref.fingerprint===row.fingerprint)&&loanMatchText(row.source.description+' '+row.source.beneficiary+' '+row.source.date).includes(needle)).sort((a:any,b:any)=>b.source.date.localeCompare(a.source.date)||a.key.localeCompare(b.key))
 return {period,from,to,loanFrom:loan.from,loanEnd,account,outsideLoanTerm:to<loan.from||from>loanEnd,entries}
}
