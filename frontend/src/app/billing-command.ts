import {cashAccountList,creditCards,validatePlan} from '../../../src/budget.js'
import {billingReport,saveBillingReport} from '../../../src/card-billing-model.js'
import {moneyInputCents} from './monthly-report.ts'
export interface BillingDraft{amount:string;accountId:string;confirmed:boolean}
export function initialBillingDraft(plan:any,cardId:string,dueDate:string):BillingDraft{const report=billingReport(plan,cardId,dueDate);return{amount:report?String(report.amount):'',accountId:plan.cashPlanning?.cardAccounts[cardId]??report?.accountId??(cashAccountList(plan).length===1?cashAccountList(plan)[0].id:''),confirmed:false}}
export function prepareBillingCorrection(plan:any,cardId:string,dueDate:string,draft:BillingDraft,asOf:string){
 if(!validatePlan(plan)||!creditCards(plan).some((c:any)=>c.id===cardId)||!draft||Object.keys(draft).sort().join(',')!=='accountId,amount,confirmed'||typeof draft.amount!=='string'||!draft.amount.trim()||draft.amount.length>32||typeof draft.accountId!=='string'||!cashAccountList(plan).some((a:any)=>a.id===draft.accountId)||draft.confirmed!==true)throw Error('יש לבחור חשבון, להזין סכום ולאשר את תיקון החיוב.')
 const next=saveBillingReport(plan,{cardId,dueDate,accountId:draft.accountId,amount:moneyInputCents(draft.amount)/100,source:'manual'},asOf)
 if(!validatePlan(next))throw Error('פרטי החיוב אינם מתיישבים עם נתוני התקציב.');return next
}
