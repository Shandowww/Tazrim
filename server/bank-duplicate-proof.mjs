import {reportHash} from './report-crypto.mjs';

const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function snapshot(plan,target,keys){
 if(typeof target!=='string'||!Array.isArray(keys)||!keys.length||keys.length>10000||new Set(keys).size!==keys.length||keys.some(key=>typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)))return null;
 const entries=new Map((plan.bankImport?.entries??[]).map(entry=>[entry.key,entry])),batches=new Map((plan.bankImport?.batches??[]).map(batch=>[batch.id,batch])),guards=plan.importMigrationGuards?.movements??[],selected=[];
 for(const key of keys){const entry=entries.get(key),batch=entry&&batches.get(entry.batchId);if(!entry||entry.accountId!==target||!batch||batch.accountId!==target||guards.some(guard=>guard.key===key||guard.fingerprint===entry.fingerprint))return null;selected.push(entry)}
 const provenance=[...new Set(selected.map(entry=>entry.batchId))].sort().map(id=>{const batch=batches.get(id);return[id,batch.accountId,batch.from??null,batch.to??null]});
 return reportHash(JSON.stringify(canonical([target,selected.sort((first,second)=>first.key.localeCompare(second.key)),provenance])));
}
export function bankDuplicateProof(plan,item){
 const rows=item?.preview?.rows;
 if(item?.kind!=='bank'||!item.already||item.skip||item.activity||item.sheets||!Array.isArray(rows)||!rows.length||rows.length!==item.records?.length||rows.some(row=>!['duplicate','duplicate-file'].includes(row.state)))return null;
 const entries=new Map((plan.bankImport?.entries??[]).map(entry=>[entry.key,entry]));
 if(rows.some(row=>{const entry=entries.get(row.key);return !entry||entry.fingerprint!==row.fingerprint||entry.cents!==row.amountCents||entry.month!==row.date?.slice(0,7)}))return null;
 const keys=[...new Set(rows.map(row=>row.key))].sort(),digest=snapshot(plan,item.target,keys);
 return digest?{version:1,target:item.target,keys,digest}:null;
}
export function bankDuplicateProofCurrent(plan,proof){return proof?.version===1&&typeof proof.digest==='string'&&snapshot(plan,proof.target,proof.keys)===proof.digest}
