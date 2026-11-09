import {matchReviewId} from './report-classification-model.ts'
const text=(value:unknown)=>String(value??'').normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim().toLowerCase()
export function matchDifferences(incoming:any,saved:any){
 const source=saved.source??{},result:string[]=[]
 if(source.date!==incoming.date)result.push(source.date?'תאריך שונה':'התאריך המקורי אינו שמור')
 if(saved.cents!==incoming.amountCents)result.push('סכום שונה')
 if(text(source.description)!==text(incoming.description))result.push('תיאור שונה')
 if(!source.reference||!incoming.reference)result.push('חסרה אסמכתה באחד המקורות')
 else if(text(source.reference)!==text(incoming.reference))result.push('אסמכתאות שונות')
 if(['details','beneficiary','purpose'].some(key=>text(source[key])!==text(incoming[key])))result.push('פרטי פעולה נוספים שונים')
 return result
}
/** Evidence browsing only. Similar rows never authorize or create a financial match. */
export function bankMatchCandidates(plan:any,item:any,match:any,query=''){
 const incoming=match.row,search=text(query),batches=new Map((plan.bankImport?.batches??[]).map((batch:any)=>[batch.id,batch]))
 const stored=plan.bankImport?.entries??[],storedKeys=new Set(stored.map((entry:any)=>entry.key)),entries=[...stored]
 if(match.previous?.accountId===item.target&&!storedKeys.has(match.previous.key))entries.push(match.previous)
 return entries.filter((entry:any)=>entry.accountId===item.target).map((entry:any)=>{
  const source=entry.source??{},batch:any=batches.get(entry.batchId)??(entry.key===match.previous?.key?{file:match.previousFile}:undefined),sameDate=source.date===incoming.date,sameAmount=entry.cents===incoming.amountCents,sameReference=!!incoming.reference&&text(source.reference)===text(incoming.reference)
  const priority=entry.key===match.previous?.key?0:sameDate&&sameAmount?1:sameReference?2:sameDate?3:sameAmount&&entry.month===incoming.date?.slice(0,7)?4:5
  const date=source.date??'',dateParts=date.split('-'),displayDate=dateParts.length===3?dateParts.reverse().join('/'):'',amount=entry.cents/100
  const searchable=[source.description,source.details,source.beneficiary,source.purpose,source.reference,date,displayDate,entry.month,amount,amount.toFixed(2),new Intl.NumberFormat('he-IL').format(amount),batch?.file].map(text).join(' ')
  return {entry,batch,saved:storedKeys.has(entry.key),priority,differences:matchDifferences(incoming,entry),authorized:match.canMatch===true&&entry.key===match.previous?.key,searchable}
 }).filter((candidate:any)=>search?search.split(' ').every(word=>candidate.searchable.includes(word)):candidate.priority<5).sort((a:any,b:any)=>a.priority-b.priority||(b.entry.source?.date??'').localeCompare(a.entry.source?.date??''))
}
export function reportMatchRows(review:any){
 return (review?.items??[]).flatMap((item:any,itemIndex:number)=>item.skip?[]:(item.matchReviews??[]).map((match:any)=>({item,itemIndex,match,id:matchReviewId(itemIndex,match.id)})))
}
