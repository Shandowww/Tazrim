import {cents} from '../../../src/budget.js'
/** Presentation-only comparison of the existing scenario's two authoritative projections. */
export function scenarioComparison(preview,accountId,asOf){
 const account=accountId===null?null:preview.accounts.find(row=>row.account.id===accountId)
 if(accountId!==null&&!account)throw Error('החשבון אינו זמין בתרחיש הזה.')
 const after=account?account.rows:preview.rows,before=account?preview.baseAccounts.find(row=>row.account.id===accountId)?.rows:preview.base
 if(!before)throw Error('חסרה תחזית בסיס להשוואה.')
 return after.filter(row=>row.month>=asOf).map(row=>{
  const old=before.find(item=>item.month===row.month),known=value=>value&&Number.isFinite(value.balance)&&!(value.issues?.length)
  const a=known(row)?row.balance:null,b=known(old)?old.balance:null
  return {month:row.month,before:b,after:a,change:a===null||b===null?null:(cents(a)-cents(b))/100,issues:[...(old?.issues??[]),...(row.issues??[])]}
 })
}
