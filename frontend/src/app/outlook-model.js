import {cashAccountList,cashAccountForecast,cashSourceRecords,forecast,monthAt,indexMonth,paymentFor,cashAssignedItem,cents,creditCards,loanPaymentEvidence} from '../../../src/budget.js'
const monthOK=value=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(value??'')
/** Read-only presentation of the existing projections; scheduled reminders never change their math. */
export function householdOutlook(plan,anchor,asOf,day=asOf+'-01'){
 const start=[asOf,plan.startMonth,monthOK(anchor)?monthAt(anchor,1):asOf].sort().at(-1)
 const months=Array.from({length:3},(_,i)=>monthAt(start,i)),last=months.at(-1),horizon=indexMonth(last)-indexMonth(plan.startMonth)+1
 const accounts=cashAccountList(plan),projected=accounts.length?accounts.map(account=>({id:account.id,label:account.label,buffer:account.buffer??0,source:cashSourceRecords(plan,account.id),rows:cashAccountForecast(plan,account.id,[],horizon)})):[{id:'budget',label:'התקציב כולו',buffer:plan.buffer??0,source:plan.months,rows:forecast(plan,undefined,horizon)}]
 const series=projected.map(account=>{
  const latest=Object.keys(account.source).filter(month=>month<start&&month<=asOf&&account.source[month].actual).sort().at(-1)??null
  const rows=months.map(month=>{const row=account.rows.find(row=>row.month===month),issues=[...(row?.issues??[])];return {month,balance:row&&Number.isFinite(row.balance)&&!issues.length?row.balance:null,issues:[...new Set(issues)]}})
  return {id:account.id,label:account.label,buffer:account.buffer,latest,stale:!latest||latest<monthAt(asOf,-1),rows}
 })
 const upcoming=[],add=row=>{if(row.month<start||row.month>last||row.date&&row.date<day)return;upcoming.push(row)},accountLabel=id=>accounts.find(a=>a.id===id)?.label??'ללא שיוך חשבון'
 // Only pending, saved card bills have a proven due date and total. Do not list their individual installments again.
 for(const report of plan.cardBilling?.reports??[]){if(report.status!=='pending'||report.source==='no-transactions'||!report.amount)continue;const card=creditCards(plan).find(card=>card.id===report.cardId);if(!card)continue;add({id:'card:'+report.cardId+':'+report.dueDate,kind:'card',title:card.name,amount:report.amount,month:report.dueDate.slice(0,7),date:report.dueDate,accountId:report.accountId,account:accountLabel(report.accountId),note:'חיוב כרטיס מדווח',href:'/cards/'+encodeURIComponent(report.cardId)})}
 for(const item of plan.expenses??[]){if(item.kind==='income')continue;for(const month of months){const amount=paymentFor(item,month);if(!amount)continue;if(item.source==='card'&&item.cardId&&(plan.cardBilling?.reports??[]).some(r=>r.cardId===item.cardId&&r.dueDate.slice(0,7)===month))continue;const accountId=cashAssignedItem(plan,item);add({id:'plan:'+item.id+':'+month,kind:'purchase',title:item.name,amount,month,date:null,accountId,account:accountLabel(accountId),note:item.source==='card'?'תשלום מתוכנן בכרטיס':'תשלום מתוכנן',href:'/plans'})}}
 for(const item of plan.details??[]){if(item.method!=='checks'||item.status!=='pending')continue;const accountId=cashAssignedItem(plan,item);add({id:'check:'+item.id,kind:'cheque',title:item.name,amount:item.amount,month:item.month,date:item.date,accountId,account:accountLabel(accountId),note:'צ׳ק ממתין',href:'/checks'})}
 for(const loan of plan.loans??[]){const evidence=loanPaymentEvidence(plan,loan.id);for(const month of months){if(month<loan.from||indexMonth(month)>=indexMonth(loan.from)+loan.months||!loan.monthly||evidence.rows.filter(row=>row.month===month).reduce((sum,row)=>sum-row.cents,0)>=cents(loan.monthly))continue;const accountId=cashAssignedItem(plan,loan);add({id:'loan:'+loan.id+':'+month,kind:'loan',title:loan.name,amount:loan.monthly,month,date:null,accountId,account:accountLabel(accountId),note:'לפי לוח ההלוואה',href:'/loans'})}}
 upcoming.sort((a,b)=>a.month.localeCompare(b.month)||(a.date??a.month+'-99').localeCompare(b.date??b.month+'-99')||a.id.localeCompare(b.id))
 return {start,months,accounts:series,upcoming}
}
