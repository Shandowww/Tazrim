import {validatePlan,loanRulesTextOverlap,indexMonth} from '../../../src/budget.js'
import {linkLoanPayment,unlinkLoanPayment,stopLoanPaymentRule} from '../../../src/bank-import-model.js'

/** One prepared plan/save, composed from the original loan payment commands. */
export function prepareLoanPaymentLink(plan:any,id:string,key:string,previousLoanId:string,remember=false){
 if(!validatePlan(plan)||typeof previousLoanId!=='string'||typeof remember!=='boolean')throw Error('יש לבדוק את פרטי השיוך.')
 const owner=plan.loans?.find((loan:any)=>loan.repayments?.keys.some((ref:any)=>ref.key===key)),target=plan.loans?.find((loan:any)=>loan.id===id),entry=plan.bankImport?.entries.find((row:any)=>row.key===key)
 if((owner?.id??'')!==previousLoanId)throw Error('השיוך הקודם השתנה. יש לפתוח את הרשימה מחדש.')
 let next=plan
 if(owner&&owner.id!==id){
  next=unlinkLoanPayment(next,owner.id,key)
  const rule=owner.repayments?.rule,newRule=entry?.source?{accountId:entry.accountId,amountCents:-entry.cents,action:entry.source.description,beneficiary:entry.source.beneficiary,match:'name-amount'}:null
  if(remember&&rule&&newRule&&target&&rule.accountId===newRule.accountId&&rule.amountCents===newRule.amountCents&&loanRulesTextOverlap(rule,newRule)&&Math.max(indexMonth(owner.from),indexMonth(target.from))<Math.min(indexMonth(owner.from)+owner.months,indexMonth(target.from)+target.months))next=stopLoanPaymentRule(next,owner.id)
 }else if(owner&&entry&&owner.repayments.keys.some((ref:any)=>ref.key===key&&(ref.fingerprint!==entry.fingerprint||ref.accountId!==entry.accountId)))next=unlinkLoanPayment(next,owner.id,key)
 return linkLoanPayment(next,id,key,remember,'name-amount')
}
