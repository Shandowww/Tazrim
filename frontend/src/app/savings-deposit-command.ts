import {applySavingsDeposit,cashAccountList,validatePlan} from '../../../src/budget.js'
import {initialMonthlyDraft,manualMonthEligibility,moneyInputCents,prepareMonthlyReport} from './monthly-report.ts'
import {initialCashMonthlyDraft,prepareCashMonthlyReport} from './cash-monthly-command.ts'
import {savingsBalanceEligibility} from './savings-balance-command.ts'
export interface GoalDepositDraft{amount:string;payerId:string}
export function goalDepositImpact(plan:any,id:string,draft:GoalDepositDraft,asOf:string){savingsBalanceEligibility(plan,asOf);if(!plan.savingsGoals.items.some((g:any)=>g.id===id))throw Error('המטרה אינה זמינה במרחב הזה.');if(!draft||Object.keys(draft).sort().join(',')!=='amount,payerId'||typeof draft.amount!=='string'||!draft.amount.trim()||draft.amount.length>32||typeof draft.payerId!=='string'||draft.payerId.length>100)throw Error('יש לבדוק את פרטי ההפקדה.');const amount=moneyInputCents(draft.amount),v=plan.months[asOf]?.values??plan.defaults,budgetBefore=Math.round((v.personalSaving??0)*100)+Math.round((v.sharedSaving??0)*100),assigned=Object.entries(plan.savingsGoals.deposits[asOf]??{}).reduce((n:number,[goal,value]:any)=>n+(goal===id?0:Math.round(value*100)),0)+amount,extra=Math.max(0,assigned-budgetBefore);return{amount:amount/100,budgetBefore:budgetBefore/100,budgetAfter:(budgetBefore+extra)/100,extra:extra/100}}
/** Assign the full month's performed goal deposit; uncovered cash first follows the original guarded monthly-report path. */
export function prepareGoalDeposit(plan:any,id:string,draft:GoalDepositDraft,asOf:string){
 const impact=goalDepositImpact(plan,id,draft,asOf),accounts=cashAccountList(plan);let next=plan
 if(draft.payerId&&!accounts.some((a:any)=>a.id===draft.payerId))throw Error('החשבון המשלם אינו זמין במרחב הזה.')
 if(impact.extra>0){if(accounts.length){if(!draft.payerId)throw Error('יש לבחור חשבון משלם מפורש לסכום שטרם נכלל בדיווח.');const month=initialCashMonthlyDraft(plan,draft.payerId,asOf);month.values.personalSaving=String((moneyInputCents(month.values.personalSaving)+Math.round(impact.extra*100))/100);next=prepareCashMonthlyReport(plan,draft.payerId,asOf,month,asOf)}else{const reason=manualMonthEligibility(plan,asOf);if(reason)throw Error(reason);const month=initialMonthlyDraft(plan,asOf);month.values.personalSaving=String((moneyInputCents(month.values.personalSaving)+Math.round(impact.extra*100))/100);next=prepareMonthlyReport(plan,asOf,month,asOf)}}
 next=applySavingsDeposit(next,id,asOf,impact.amount,asOf)
 if(!validatePlan(next))throw Error('ההפקדה אינה מתיישבת עם דיווחים או הקצאות קיימים.');return next
}
