import {cashAccountList,cashAccountForecast,cashSourceRecords,cashForecastIssues,forecast,monthAt,indexMonth,paymentFor,cashAssignedItem,cents,creditCards,loanPaymentEvidence} from '../../../src/budget.js'
const monthOK=value=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(value??'')

function datedPendingDebits(plan,accountId,month,balanceDate){
 const afterBalance=date=>typeof date==='string'&&date.startsWith(month+'-')&&date>balanceDate
 const bills=(plan.cardBilling?.reports??[]).filter(report=>report.accountId===accountId&&
  report.status==='pending'&&report.source!=='no-transactions'&&afterBalance(report.dueDate))
 const cheques=(plan.details??[]).filter(item=>item.method==='checks'&&item.status==='pending'&&
  cashAssignedItem(plan,item)===accountId&&afterBalance(item.date))
 return [...bills,...cheques].reduce((total,item)=>total+cents(item.amount),0)
}

function outlookRows(plan,account,months,day){
 let provisional=null
 const rows=[]
 for(const row of account.rows){
  if(row.month>months.at(-1))break
  const record=account.source[row.month]
  const partialBank=account.id!=='budget'&&record?.fromBank&&!record.actual
  if(row.month===account.openingMonth||Number.isFinite(record?.balance)||partialBank)provisional=null
  // An older account row can have a synthetic fallback date. Require an
  // explicitly dated bank balance before using it as an intramonth baseline.
  const manualRow=plan.cashPlanning?.months?.[row.month]?.[account.id]
  if(partialBank&&Number.isFinite(record.balance)&&Number.isFinite(row.balance)&&
   record.date?.slice(0,7)===row.month&&record.date<=day&&(!manualRow||manualRow.date)){
   const closing=cents(record.balance)-datedPendingDebits(plan,account.id,row.month,record.date)
   provisional={date:record.date,adjustment:closing-cents(row.balance)}
  }
  if(!months.includes(row.month))continue
  const issues=[...new Set(row.issues??[])]
  const canShow=Number.isFinite(row.balance)&&issues.every(issue=>provisional&&
   (issue===cashForecastIssues.partialBank||issue===cashForecastIssues.unassigned))
  const balance=canShow?(cents(row.balance)+(provisional?.adjustment??0))/100:null
  rows.push({month:row.month,balance,issues,balanceDate:canShow?provisional?.date??null:null})
 }
 return rows
}

/** Read-only projections. The partial month uses dated pending payments, then later months use the normal account forecast. */
export function householdOutlook(plan,anchor,asOf,day=asOf+'-01'){
 const start=[asOf,plan.startMonth,monthOK(anchor)?monthAt(anchor,1):asOf].sort().at(-1)
 const months=Array.from({length:3},(_,i)=>monthAt(start,i)),last=months.at(-1),horizon=indexMonth(last)-indexMonth(plan.startMonth)+1
 const accounts=cashAccountList(plan),projected=accounts.length?accounts.map(account=>({id:account.id,label:account.label,buffer:account.buffer??0,openingMonth:account.openingMonth,source:cashSourceRecords(plan,account.id),rows:cashAccountForecast(plan,account.id,[],horizon)})):[{id:'budget',label:'התקציב כולו',buffer:plan.buffer??0,source:plan.months,rows:forecast(plan,undefined,horizon)}]
 const series=projected.map(account=>{
  const latest=Object.keys(account.source).filter(month=>month<start&&month<=asOf&&account.source[month].actual).sort().at(-1)??null
  const rows=outlookRows(plan,account,months,day)
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

/** Open coverage for the selected bank in the latest completed month, if one exists. */
export function forecastCoveragePath(plan,accountId,asOf){
 const month=monthAt(asOf,-1)
 const query=new URLSearchParams({sync:'missing'})
 if(monthOK(month)&&month>=plan.startMonth){
  query.set('coverageEnd',month)
  if(cashAccountList(plan).some(account=>account.id===accountId)){
   query.set('coverageEntity','bank:'+accountId)
   query.set('coverageMonth',month)
  }
 }
 return '/incoming?'+query
}
