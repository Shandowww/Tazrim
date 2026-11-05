import {cashAccountList,cashAssignedItem,cents,indexMonth,monthAt,loanPaymentEvidence} from '../../../src/budget.js'
/** Display-only cheque groups; dates never imply clearance and totals never enter cash flow. */
export function chequeRegister(plan,{year,month=''}){
 const banks=cashAccountList(plan),inPeriod=row=>row.month.startsWith(year+'-')&&(!month||row.month===year+'-'+month)
 const records=(plan.details??[]).filter(row=>row.method==='checks').map(row=>({...row,payer:banks.find(bank=>bank.id===cashAssignedItem(plan,row))??null})).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
 const group=status=>{const rows=records.filter(row=>row.status===status&&(status==='pending'||inPeriod(row)));return {rows,count:rows.length,totalCents:rows.reduce((sum,row)=>sum+cents(row.amount),0)}}
 return {pending:group('pending'),cleared:group('cleared'),cancelled:group('cancelled')}
}
/** Scheduled future instalments and identified payments are deliberately separate. */
export function loanScheduleSummaries(plan,asOf){
 const banks=cashAccountList(plan)
 return (plan.loans??[]).map(loan=>{
  const end=monthAt(loan.from,loan.months-1),from=[loan.from,asOf].sort().at(-1),remainingMonths=Math.max(0,indexMonth(end)-indexMonth(from)+1)
  return {loan,end,from,remainingMonths,scheduledRemainingCents:cents(loan.monthly)*remainingMonths,payer:banks.find(bank=>bank.id===cashAssignedItem(plan,loan))??null,evidence:loanPaymentEvidence(plan,loan.id)}
 })
}
