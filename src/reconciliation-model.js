// Evidence-only allocations. No source values or budget cash-flow totals are changed.
const reconciliationCents=value=>Math.round(Number(value)*100);
const reconciliationClone=value=>JSON.parse(JSON.stringify(value));
const directBankSource=entry=>!!entry?.source?.date&&['variable','checks'].includes(entry.field)&&Number.isSafeInteger(entry.cents)&&entry.cents!==0;
const directDetailSource=detail=>!!detail&&['variable','checks'].includes(detail.method)&&detail.status==='cleared'&&detail.accounting==='included'&&reconciliationCents(detail.amount)!==0;
export const reconciliationBankSnapshot=entry=>JSON.stringify([entry.key,entry.cents,entry.month,entry.field,entry.accountId,entry.source?.date,entry.fingerprint]);
export const reconciliationDetailSnapshot=detail=>JSON.stringify([detail.id,reconciliationCents(detail.amount),detail.month,detail.method,detail.date,detail.cashAccountId??'',detail.accounting,detail.status]);
const reconciliationSourceMaps=p=>({banks:new Map((p.bankImport?.entries??[]).map(row=>[row.key,row])),details:new Map((p.details??[]).map(row=>[row.id,row]))});
export function sourceAllocationState(p,group,indexes=reconciliationSourceMaps(p)){
 const {banks,details}=indexes;
 const valid=group.bankParts.every(part=>directBankSource(banks.get(part.key))&&reconciliationBankSnapshot(banks.get(part.key))===part.snapshot)&&group.detailParts.every(part=>directDetailSource(details.get(part.id))&&reconciliationDetailSnapshot(details.get(part.id))===part.snapshot);
 return valid?'confirmed':'stale';
}
function sourceAllocationStructure(group){
 if(!group||typeof group.id!=='string'||!group.id||group.id.length>100||!Array.isArray(group.bankParts)||!Array.isArray(group.detailParts)||!group.bankParts.length||!group.detailParts.length||group.bankParts.length>30||group.detailParts.length>30)return false;
 const keys=new Set(),ids=new Set(),partValid=part=>part&&Number.isSafeInteger(part.cents)&&part.cents!==0&&Math.abs(part.cents)<=10000000000&&typeof part.snapshot==='string'&&part.snapshot.length<=1000;
 if(!group.bankParts.every(part=>partValid(part)&&typeof part.key==='string'&&/^[a-f0-9]{64}$/.test(part.key)&&!keys.has(part.key)&&!!keys.add(part.key))||!group.detailParts.every(part=>partValid(part)&&typeof part.id==='string'&&part.id.length>0&&part.id.length<=100&&!ids.has(part.id)&&!!ids.add(part.id)))return false;
 const sign=Math.sign(group.bankParts[0].cents);return [...group.bankParts,...group.detailParts].every(part=>Math.sign(part.cents)===sign)&&group.bankParts.reduce((sum,part)=>sum+part.cents,0)===group.detailParts.reduce((sum,part)=>sum+part.cents,0);
}
export function sourceAllocationUsage(p){
 const bank=new Map(),detail=new Map(),staleBanks=new Set(),staleDetails=new Set(),indexes=reconciliationSourceMaps(p);
 const add=(map,key,value)=>map.set(key,(map.get(key)??0)+Math.abs(value));
 for(const group of p.sourceAllocations??[]){
  if(sourceAllocationState(p,group,indexes)==='stale'){group.bankParts.forEach(part=>staleBanks.add(part.key));group.detailParts.forEach(part=>staleDetails.add(part.id));continue;}
  group.bankParts.forEach(part=>add(bank,part.key,part.cents));group.detailParts.forEach(part=>add(detail,part.id,part.cents));
 }
 // Legacy one-to-one approvals reserve the full source on both sides.
 for(const link of p.bankDetailLinks??[]){
  const b=indexes.banks.get(link.bankKey),d=indexes.details.get(link.detailId);
  if(b&&d&&directBankSource(b)&&directDetailSource(d)&&reconciliationBankSnapshot(b)===link.bankSnapshot&&reconciliationDetailSnapshot(d)===link.detailSnapshot){add(bank,b.key,b.cents);add(detail,d.id,reconciliationCents(d.amount));}
  else{staleBanks.add(link.bankKey);staleDetails.add(link.detailId);}
 }
 return{bank,detail,staleBanks,staleDetails};
}
export function sourceAllocationsValid(p){
 if(p.bankDetailLinks!==undefined&&(!Array.isArray(p.bankDetailLinks)||p.bankDetailLinks.some(row=>!row||typeof row.bankKey!=='string'||typeof row.detailId!=='string')))return false;
 if(p.sourceAllocations!==undefined&&(!Array.isArray(p.sourceAllocations)||p.sourceAllocations.length>5000||new Set(p.sourceAllocations.map(group=>group?.id)).size!==p.sourceAllocations.length||!p.sourceAllocations.every(sourceAllocationStructure)))return false;
 const indexes=reconciliationSourceMaps(p);
 for(const group of p.sourceAllocations??[])if(sourceAllocationState(p,group,indexes)==='confirmed'){
  const banks=group.bankParts.map(part=>indexes.banks.get(part.key)),details=group.detailParts.map(part=>indexes.details.get(part.id)),accounts=new Set(banks.map(row=>row.accountId)),methods=new Set(banks.map(row=>row.field));
  if(accounts.size!==1||methods.size!==1||group.bankParts.some((part,i)=>Math.sign(part.cents)!==Math.sign(-banks[i].cents))||group.detailParts.some((part,i)=>Math.sign(part.cents)!==Math.sign(details[i].amount)||!methods.has(details[i].method)||details[i].cashAccountId&&!accounts.has(details[i].cashAccountId)))return false;
 }
 const usage=sourceAllocationUsage(p);
 for(const [key,amount]of usage.bank){const source=indexes.banks.get(key);if(!source||amount>Math.abs(source.cents))return false;}
 for(const [id,amount]of usage.detail){const source=indexes.details.get(id);if(!source||amount>Math.abs(reconciliationCents(source.amount)))return false;}
 return true;
}
export function withSourceAllocation(p,{id,bankParts,detailParts}){
 const next=reconciliationClone(p),banks=new Map((p.bankImport?.entries??[]).map(row=>[row.key,row])),details=new Map((p.details??[]).map(row=>[row.id,row]));
 const group={id,bankParts:bankParts.map(part=>{const row=banks.get(part.key);if(!directBankSource(row)||Math.sign(part.cents)!==Math.sign(-row.cents)||Math.abs(part.cents)>Math.abs(row.cents))throw Error('הקצאת בנק אינה תואמת למקור ישיר מזוהה.');return{key:part.key,cents:part.cents,snapshot:reconciliationBankSnapshot(row)};}),detailParts:detailParts.map(part=>{const row=details.get(part.id);if(!directDetailSource(row)||Math.sign(part.cents)!==Math.sign(row.amount)||Math.abs(part.cents)>Math.abs(reconciliationCents(row.amount)))throw Error('הקצאת פירוט אינה תואמת למקור שנפרע.');return{id:part.id,cents:part.cents,snapshot:reconciliationDetailSnapshot(row)};})};
 const accounts=new Set(group.bankParts.map(part=>banks.get(part.key).accountId)),methods=new Set(group.bankParts.map(part=>banks.get(part.key).field));
 if(accounts.size!==1||methods.size!==1||group.detailParts.some(part=>{const row=details.get(part.id);return !methods.has(row.method)||row.cashAccountId&&!accounts.has(row.cashAccountId);}))throw Error('יש להתאים מקורות מאותו חשבון ואמצעי תשלום ישיר. חשבון לא ידוע בפירוט יישאר לא ידוע.');
 next.sourceAllocations=[...(next.sourceAllocations??[]).filter(row=>row.id!==id),group];
 if(!sourceAllocationStructure(group)||!sourceAllocationsValid(next))throw Error('הסכומים המקושרים חייבים להיות שווים ובאותו סימן, ללא הקצאה כפולה או חריגה מהמקורות.');return next;
}
export function withoutSourceAllocation(p,id){const next=reconciliationClone(p);const removed=next.sourceAllocations?.find(row=>row.id===id);next.sourceAllocations=(next.sourceAllocations??[]).filter(row=>row.id!==id);const keys=new Set((removed?.bankParts??[]).map(row=>row.key));next.bankConsumptionReviews=(next.bankConsumptionReviews??[]).filter(row=>!keys.has(row.key));return next;}
export function bankConsumptionReviewsValid(p){
 if(p.bankConsumptionReviews===undefined)return true;
 const keys=new Set();return Array.isArray(p.bankConsumptionReviews)&&p.bankConsumptionReviews.length<=10000&&p.bankConsumptionReviews.every(row=>row&&typeof row.key==='string'&&/^[a-f0-9]{64}$/.test(row.key)&&!keys.has(row.key)&&!!keys.add(row.key)&&['purchase','not-consumption'].includes(row.decision)&&typeof row.snapshot==='string'&&row.snapshot.length<=1000);
}
export function reviewBankConsumption(p,key,decision){
 const next=reconciliationClone(p);next.bankConsumptionReviews=(next.bankConsumptionReviews??[]).filter(row=>row.key!==key);
 if(decision!=='reset'){
  const row=p.bankImport?.entries?.find(row=>row.key===key);if(!directBankSource(row)||!['purchase','not-consumption'].includes(decision))throw Error('אפשר לבדוק רק תנועת בנק ישירה מזוהה.');
  if(sourceAllocationUsage(p).staleBanks.has(key))throw Error('יש לבדוק או לבטל את ההתאמות הישנות של התנועה לפני אישור צריכה.');
  next.bankConsumptionReviews.push({key,decision,snapshot:reconciliationBankSnapshot(row)});
 }
 if(!bankConsumptionReviewsValid(next))throw Error('בדיקת הצריכה אינה תקינה.');return next;
}
export function bankConsumptionRemainders(p){
 const usage=sourceAllocationUsage(p),reviews=new Map((p.bankConsumptionReviews??[]).map(row=>[row.key,row]));
 return (p.bankImport?.entries??[]).filter(directBankSource).map(entry=>{
  const review=reviews.get(entry.key),stale=usage.staleBanks.has(entry.key)||!!review&&review.snapshot!==reconciliationBankSnapshot(entry),remainingCents=-entry.cents-Math.sign(-entry.cents)*(usage.bank.get(entry.key)??0);
  return{entry,remainingCents,allocatedCents:(usage.bank.get(entry.key)??0)*Math.sign(-entry.cents),decision:stale?'stale':review?.decision??'unreviewed'};
 });
}
