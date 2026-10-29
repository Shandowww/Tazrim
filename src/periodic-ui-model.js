export function periodicSourceCandidates(plan,type,query=''){
 query=query.trim().toLocaleLowerCase('he');
 return (type==='detail'?(plan.details??[]).filter(row=>row.status==='cleared'):type==='bank'?(plan.bankImport?.entries??[]).filter(row=>row.source):plan.expenses??[]).map(row=>({id:row.id??row.key,name:row.name??row.source?.description??'תנועת בנק',month:row.month??row.firstMonth,amount:type==='bank'?-row.cents/100:row.amount})).filter(row=>!query||[row.name,row.month].join(' ').toLocaleLowerCase('he').includes(query)).sort((a,b)=>b.month.localeCompare(a.month)||a.id.localeCompare(b.id));
}
export function removePeriodicCost(plan,id){const next=JSON.parse(JSON.stringify(plan));next.periodicCosts=next.periodicCosts.filter(row=>row.id!==id);return next;}
export function periodicCostFormItem(original,values,newId=()=>crypto.randomUUID()){return {...original,id:original.id||newId(),name:values.name.trim(),amount:Number(values.amount),dueMonth:values.dueMonth,repeat:values.repeat};}
