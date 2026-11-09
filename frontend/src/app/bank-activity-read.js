import {cashAccountList,budgetFields,monthlyMetricSnapshot} from '../../../src/budget.js'

/** Original imported bank entries, separate from purchase-detail analytics. No writes. */
export function bankActivityView(plan,accountId,{year,month='',asOf,query=''}={}) {
 const account=cashAccountList(plan).find(row=>row.id===accountId)
 if(!account)throw Error('החשבון אינו זמין במרחב הזה.')
 if(!/^20\d{2}$/.test(year)||month&&!/^(0[1-9]|1[0-2])$/.test(month)||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(asOf))throw Error('תקופה לא תקינה.')
 const start=year+'-'+(month||'01'),end=[year+'-'+(month||'12'),asOf].sort()[0],needle=query.trim().toLocaleLowerCase('he'),labels=new Map(budgetFields(plan).map(([id,label])=>[id,label]))
 const entries=(plan.bankImport?.entries??[]).filter(row=>row.accountId===accountId&&row.month>=start&&row.month<=end)
 const rows=entries.filter(row=>!needle||[row.source?.description,row.source?.details,row.source?.beneficiary].some(value=>value?.toLocaleLowerCase('he').includes(needle)))
  .map(row=>({...row,label:row.field==='exclude'?'ללא השפעה על התקציב':labels.get(row.field)||row.field}))
  .sort((a,b)=>(b.source?.date||b.month).localeCompare(a.source?.date||a.month)||a.key.localeCompare(b.key))
 const debitCents=rows.reduce((sum,row)=>sum+Math.max(0,-row.cents),0),creditCents=rows.reduce((sum,row)=>sum+Math.max(0,row.cents),0)
 return {account,rows,totalCount:entries.length,debitCents,creditCents,netCents:creditCents-debitCents,
  // Keep the original coverage and account status; a partial import is never full coverage.
  coverage:month&&start<=end?monthlyMetricSnapshot(plan,'bank-debits',start,{accountId,asOf}).coverage:null}
}
