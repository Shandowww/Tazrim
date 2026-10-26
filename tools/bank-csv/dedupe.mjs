import {normalizedText} from './classifier.mjs';
const payload=r=>JSON.stringify([r.date,r.amountCents,normalizedText(r.description),normalizedText(r.details),normalizedText(r.beneficiary),normalizedText(r.purpose)]);
export const transactionKey=(r,scope)=>r.reference?.trim()&&r.date?JSON.stringify([scope,'hapoalim-current',r.date,r.reference.trim()]):null;
export function inspectDuplicates(records,ledger,scope){
 const known=new Map(ledger.entries.map(e=>[e.key,e.payload])),seen=new Map();let duplicate=0,conflict=0,missingReference=0;
 const rows=records.map(r=>{
  const next={...r,duplicateState:null};if(!r.valid||r.inPeriod===false||r.currency!=='ILS')return next;
  const key=transactionKey(r,scope);if(!key){missingReference++;return next;}
  const content=payload(r),previous=known.get(key)??seen.get(key);
  if(previous!==undefined){next.duplicateState=previous===content?'duplicate':'conflict';if(next.duplicateState==='duplicate')duplicate++;else conflict++;}
  else seen.set(key,content);return next;
 });
 // Conflicting identities within the new file require review of both versions.
 const conflicting=new Set(rows.filter(r=>r.duplicateState==='conflict').map(r=>transactionKey(r,scope)));
 for(const r of rows)if(!r.duplicateState&&conflicting.has(transactionKey(r,scope))){r.duplicateState='conflict';conflict++;}
 return {records:rows,duplicate,conflict,missingReference};
}
export function acceptReviewed(ledger,records,classification,scope){
 const confirmed=new Set(classification.filter(c=>c.confirmed).map(c=>c.line)),entries=new Map(ledger.entries.map(e=>[e.key,e]));let added=0,missingReference=0;
 for(const r of records){if(!confirmed.has(r.line)||r.duplicateState)continue;const key=transactionKey(r,scope);if(!key){missingReference++;continue;}if(entries.has(key))continue;entries.set(key,{key,payload:payload(r)});added++;}
 if(entries.size>50000)throw Error('רישום הבדיקה הגיע ל־50,000 תנועות. יש להפריד תקופות.');
 return {ledger:{format:'bank-import-registry',version:1,scope,entries:[...entries.values()]},added,missingReference};
}
export function readLedger(value,scope){
 if(!value||value.format!=='bank-import-registry'||value.version!==1||value.scope!==scope||!Array.isArray(value.entries)||value.entries.length>50000||new Set(value.entries.map(e=>e?.key)).size!==value.entries.length||value.entries.some(e=>!e||typeof e.key!=='string'||e.key.length>1000||typeof e.payload!=='string'||e.payload.length>50000))throw Error('רישום הבדיקה אינו תקין או שייך לחשבון אחר.');
 return value;
}
