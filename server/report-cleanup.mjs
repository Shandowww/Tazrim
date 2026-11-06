import {reportHash} from './report-crypto.mjs';

// Full-file receipts are deliberately stricter than the legacy committed flag.
// Activity exports prove only a selected cycle, so never qualify here.
export function fullReportReceipt(plan, member){
 const receipt=plan?.reportInbox?.receipts?.find(r=>r.hash===member.hash&&r.kind===member.kind&&r.target===member.target&&r.reference===member.reference);
 if(!receipt||plan.importMigrationGuards?.receipts?.includes(member.hash))return false;
 if(member.kind==='bank')return plan.bankImport?.batches?.some(b=>b.id===receipt.reference&&b.accountId===receipt.target)===true;
 if(member.kind!=='card')return false;
 const bill=plan.cardBilling?.reports?.find(r=>r.cardId===receipt.target&&r.dueDate===receipt.reference);
 const ids=(plan.details??[]).filter(e=>e.method===receipt.target&&e.statement?.dueDate===receipt.reference).map(e=>e.id).sort();
 return !!bill&&receipt.proof===reportHash(JSON.stringify([bill.amount,ids]));
}
export function fullReportGroup(plan, records){
 if(!records.length||records.some(row=>JSON.stringify(row.parsedDraft)!==JSON.stringify(records[0].parsedDraft)))return null;
 const members=records.map(row=>{
  const draft=row.parsedDraft;
  if(draft?.version!==1||!Array.isArray(draft.items)||draft.items.length!==records.length)return null;
  if(new Set(draft.items.map(i=>i.storedId)).size!==records.length||draft.items.some(i=>!records.some(r=>r.id===i.storedId&&r.source_hash===i.hash)||i.activity||i.sheets||i.skip||i.error||!['bank','card'].includes(i.kind)))return null;
  const item=draft.items.find(i=>i.storedId===row.id&&i.hash===row.source_hash);
  if(!item||item.kind==='bank'&&(item.bankOptions?.scope!=='complete'||Object.values(item.monthDecisions??{}).includes('skip')||!Array.isArray(item.records)||!item.records.length||item.records.some(r=>!r.valid||r.currency!=='ILS'||!r.date||!item.from||!item.to||r.date<item.from||r.date>item.to)))return null;
  if(item.kind==='card'&&(item.inspection||item.records))return null;
  const member={id:row.id,hash:row.source_hash,revision:row.revision+1,kind:item.kind,target:item.target,reference:item.kind==='bank'?item.id:item.report?.dueDate};
  return fullReportReceipt(plan,member)?member:null;
 });
 return members.every(Boolean)?members:null;
}
