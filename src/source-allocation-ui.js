import {sourceAllocationUsage} from './reconciliation-model.js';
export function sourceAllocationCandidates(plan,{from,to,query=''}){
 const usage=sourceAllocationUsage(plan),cents=value=>Math.round(Number(value)*100);
 query=query.trim().toLocaleLowerCase('he');
 const match=row=>row.month>=from&&row.month<=to&&(!query||row.name.toLocaleLowerCase('he').includes(query));
  const banks=(plan.bankImport?.entries??[]).filter(entry=>entry.source&&['variable','checks'].includes(entry.field)&&entry.cents!==0&&!usage.staleBanks.has(entry.key)).map(entry=>({id:entry.key,month:entry.month,date:entry.source.date,name:entry.source.description||'תנועת בנק',cents:-entry.cents,available:Math.abs(entry.cents)-(usage.bank.get(entry.key)??0),type:'bank'})).filter(row=>row.available>0&&match(row));
  const details=(plan.details??[]).filter(row=>['variable','checks'].includes(row.method)&&row.accounting==='included'&&row.status==='cleared'&&!usage.staleDetails.has(row.id)).map(row=>({...row,cents:cents(row.amount),available:Math.abs(cents(row.amount))-(usage.detail.get(row.id)??0),type:'detail'})).filter(row=>row.available>0&&match(row));
 return {banks,details};
}
