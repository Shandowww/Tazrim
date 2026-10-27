import {analysisMetricSnapshot,creditCards,cashAccountList,cents} from '../../../src/budget.js'

/** Read-only cleared-detail scope; monthly totals are never added to this metric. */
export function budgetDetailView(plan,{year,month='',asOf,account='',card='',category='',query='',scope='current-budget',revision=null}={}){
 if(!/^20\d{2}$/.test(year)||month&&!/^(?:0[1-9]|1[0-2])$/.test(month)||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(asOf))throw Error('תקופה לא תקינה')
 if(account&&!cashAccountList(plan).some(row=>row.id===account)||card&&!creditCards(plan).some(row=>row.id===card))throw Error('החשבון אינו זמין במרחב הזה')
 const startMonth=[year+'-'+(month||'01'),plan.startMonth].sort().at(-1),endMonth=[year+'-'+(month||'12'),asOf].sort()[0]
 if(startMonth>endMonth)return{rows:[],categories:[],positiveCategories:{},purchasesCents:0,refundsCents:0,valueCents:null,coverage:{complete:false,pendingCount:0,explanation:'אין פירוט שנפרע בתקופה זו. חוסר מידע אינו אפס.'}}
 const options={metric:'detail',startMonth,endMonth,asOf,account,method:card,scope,revision},all=analysisMetricSnapshot(plan,{...options,query}),filtered=category?analysisMetricSnapshot(plan,{...options,category,query}):all,positiveCategories={}
 for(const row of all.rows)if(row.cents>0)positiveCategories[row.category]=(positiveCategories[row.category]??0)+row.cents
 return {...filtered,coverage:{...filtered.coverage,pendingCount:('pendingCount' in filtered.coverage?filtered.coverage.pendingCount:0)??0},categories:all.categories,positiveCategories:Object.fromEntries(Object.entries(positiveCategories).map(([key,value])=>[key,value/100])),allRows:all.rows}
}

/** A source lookup is bounded to the visible scope/period; raw source stays distinct from split analysis. */
export function budgetDetailSource(plan,id,options){
 const view=budgetDetailView(plan,options),row=view.rows.find(row=>row.id===id)
 if(!row)return null
 const original=(plan.details??[]).find(detail=>detail.id===row.sourceId)
 if(!original)return null
 return {row,source:{id:original.id,name:original.name,date:original.date,month:original.month,amountCents:cents(original.amount),method:original.method,accounting:original.accounting,status:original.status,statement:original.statement?{issuer:original.statement.issuer,dueDate:original.statement.dueDate,originalCents:original.statement.originalCents,originalCurrency:original.statement.originalCurrency,foreignCents:original.statement.foreignCents,notes:original.statement.notes,page:original.statement.page}:null}}
}

export function detailSearchResults(plan,rows){
 const banks=cashAccountList(plan),cards=creditCards(plan)
 return rows.map(row=>({id:row.id,source:cards.some(card=>card.id===row.method)?'card':'bank',accountId:row.accountId||'',accountName:banks.find(account=>account.id===row.accountId)?.label||'ללא שיוך לחשבון',date:row.date,dateMs:Date.parse(row.date+'T12:00:00Z'),description:row.name,originalDescription:row.sourceName!==row.name?row.sourceName:undefined,amount:row.cents/100,category:row.category,ignored:false,note:row.month!==row.date.slice(0,7)?'חודש חיוב '+row.month:undefined}))
}
