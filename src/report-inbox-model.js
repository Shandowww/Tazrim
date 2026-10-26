import {clone,creditCards,cashAccountList,validatePlan,cents} from './budget.js';
import {applyBankImport} from './bank-import-model.js';
import {applyBillingBatch} from './card-statement-model.js';
export async function inboxHash(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export const inboxCardLast4=item=>/^(cal|isracard):\d{4}$/.test(item.identity??'')?item.identity.split(':').at(-1):'';
export function inboxTarget(p,item){
 const kind=item.kind,targets=kind==='bank'?cashAccountList(p):creditCards(p),binding=(p.reportInbox?.bindings??[]).find(b=>b.key===item.identityKey&&b.kind===kind);
 const contradicts=t=>kind==='card'&&inboxCardLast4(item)&&/^\d{4}$/.test(t.alias)&&t.alias!==inboxCardLast4(item);
 if(binding&&targets.some(t=>t.id===binding.target&&!contradicts(t)))return binding.target;
 if(kind==='bank'&&item.provider){const matches=targets.filter(t=>t.bankName===item.provider);return matches.length===1?matches[0].id:'';}
 if(kind==='card'&&inboxCardLast4(item)){const last4=inboxCardLast4(item),matches=targets.filter(t=>t.alias===last4);if(matches.length===1)return matches[0].id;}
 return targets.length===1&&!contradicts(targets[0])?targets[0].id:'';
}
export async function inboxCardProof(p,target,dueDate){const r=p.cardBilling?.reports.find(r=>r.cardId===target&&r.dueDate===dueDate);if(!r)return '';const ids=(p.details??[]).filter(e=>e.method===target&&e.statement?.dueDate===dueDate).map(e=>e.id).sort();return inboxHash(JSON.stringify([r.amount,ids]));}
export async function inboxReceiptPresent(p,receipt){if(receipt.kind==='bank')return (p.bankImport?.batches??[]).some(b=>b.id===receipt.reference&&b.accountId===receipt.target);return !!receipt.proof&&receipt.proof===await inboxCardProof(p,receipt.target,receipt.reference);}
export async function applyReportInbox(p,bankEntries,cardEntries,receipts,bindings,asOf){
 let next=clone(p);
 for(const entry of bankEntries)next=applyBankImport(next,entry.records,entry.options);
 if(cardEntries.length)next=applyBillingBatch(next,cardEntries,asOf);
 next.reportInbox??={version:1,bindings:[],receipts:[]};
 const destinations=new Map();for(const b of bindings){if(!destinations.has(b.key))destinations.set(b.key,new Set());destinations.get(b.key).add(b.kind+':'+b.target);}
 for(const b of bindings){if(destinations.get(b.key).size>1){next.reportInbox.bindings=next.reportInbox.bindings.filter(old=>old.key!==b.key);continue;}next.reportInbox.bindings=next.reportInbox.bindings.filter(old=>old.key!==b.key);next.reportInbox.bindings.push(b);}
 for(const r of receipts){const receipt={...r};if(r.kind==='card')receipt.proof=await inboxCardProof(next,r.target,r.reference);next.reportInbox.receipts=next.reportInbox.receipts.filter(old=>old.hash!==r.hash);next.reportInbox.receipts.push(receipt);}
 next.reportInbox.bindings=next.reportInbox.bindings.slice(-100);next.reportInbox.receipts=next.reportInbox.receipts.slice(-2000);
 if(!validatePlan(next)||JSON.stringify(next).length>2000000)throw Error('הקליטה גדולה מדי או אינה תקינה. שום נתון לא נשמר; נסו פחות דוחות יחד.');
 return next;
}
