import {cashAccountList,cashAssignedItem,clone,removeLoan,setLoan,validatePlan} from '../../../src/budget.js'
import {moneyInputCents} from './monthly-report.ts'
export interface LoanDraft{name:string;monthly:string;months:string;from:string;cashAccountId:string}
export function loanEligibility(plan:any,id:string,create=false){if(!validatePlan(plan))return 'התקציב אינו זמין לעריכת הלוואות.';if(!create&&!(plan.loans??[]).some((l:any)=>l.id===id))return 'ההלוואה אינה זמינה במרחב הזה.';return null}
export function initialLoanDraft(plan:any,id:string,month:string):LoanDraft{const l=(plan.loans??[]).find((l:any)=>l.id===id);return{name:l?.name??'',monthly:l?String(l.monthly):'',months:String(l?.months??12),from:l?.from??(month>=plan.startMonth?month:plan.startMonth),cashAccountId:l?cashAssignedItem(plan,l)??'':''}}
export function loanDraftFingerprint(d:LoanDraft){let amount:any;try{amount=moneyInputCents(d.monthly)}catch{amount={invalid:d.monthly}}return JSON.stringify({...d,name:d.name.trim(),monthly:amount,months:/^\d+$/.test(d.months.trim())?Number(d.months):d.months})}
export function prepareLoan(plan:any,id:string,draft:LoanDraft,create=false){
 const reason=loanEligibility(plan,id,create);if(reason)throw Error(reason)
 const keys=['name','monthly','months','from','cashAccountId']
 if(typeof id!=='string'||!id||id.length>100||!draft||Object.keys(draft).length!==keys.length||Object.entries(draft).some(([k,v])=>!keys.includes(k)||typeof v!=='string'||v.length>100)||!/^\d{1,3}$/.test(draft.months.trim()))throw Error('יש לבדוק את פרטי ההלוואה.')
 if(create&&(plan.loans??[]).some((l:any)=>l.id===id))throw Error('מזהה ההלוואה כבר קיים. אין לדרוס אותו.')
 const accounts=cashAccountList(plan);if(accounts.length&&!accounts.some((a:any)=>a.id===draft.cashAccountId)||!accounts.length&&draft.cashAccountId)throw Error('יש לבחור חשבון משלם שקיים במרחב הזה.')
 const old=(plan.loans??[]).find((l:any)=>l.id===id),loan={...clone(old??{}),id,name:draft.name.trim(),monthly:moneyInputCents(draft.monthly)/100,months:Number(draft.months),from:draft.from}
 delete loan.cashAccountId;if(draft.cashAccountId)loan.cashAccountId=draft.cashAccountId
 return setLoan(plan,loan)
}
export function prepareLoanRemoval(plan:any,id:string){const reason=loanEligibility(plan,id);if(reason)throw Error(reason);const next=removeLoan(plan,id);if(!validatePlan(next))throw Error('לא ניתן להסיר את ההלוואה מהתכנון.');return next}
