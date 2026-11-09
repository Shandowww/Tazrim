import {cashAssignedItem,loanMatchText,monthAt} from '../../../src/budget.js'
import {periodFor} from './detail-period.ts'

/** Read-only candidate list; the original link command still validates every save. */
export function loanPaymentCandidates(plan:any,id:string,search:string,query=''){
 const loan=plan.loans?.find((row:any)=>row.id===id)
 if(!loan)throw Error('ההלוואה אינה זמינה במרחב הזה.')
 const period=periodFor(search),from=period.year+'-'+(period.month||'01'),to=period.year+'-'+(period.month||'12'),loanEnd=monthAt(loan.from,loan.months-1),account=cashAssignedItem(plan,loan),needle=loanMatchText(query)
 const assignments=new Map<string,{id:string;name:string}>();for(const other of plan.loans??[])for(const ref of other.repayments?.keys??[])assignments.set(ref.key,{id:other.id,name:other.name})
 const entries=(plan.bankImport?.entries??[]).filter((row:any)=>row.source&&row.accountId===account&&row.month>=from&&row.month<=to&&row.month>=loan.from&&row.month<=loanEnd&&(row.cents<0||row.field==='loanRepayment')&&loanMatchText(row.source.description+' '+row.source.beneficiary+' '+row.source.date).includes(needle)).map((row:any)=>({...row,assignedLoan:assignments.get(row.key)??null})).sort((a:any,b:any)=>b.source.date.localeCompare(a.source.date)||a.key.localeCompare(b.key))
 return {period,from,to,loanFrom:loan.from,loanEnd,account,outsideLoanTerm:to<loan.from||from>loanEnd,entries}
}
