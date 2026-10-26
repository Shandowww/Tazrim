import {budgetSpaceScope,spaceEntityKey} from './space-model.js';

// Only observed, explicitly classified bank movements. No forecasts or inferred legs.
export function transferLegs(p,user,budget,revision,asOf){
 const scope=budgetSpaceScope(user,budget);
 return (p.bankImport?.entries??[]).filter(e=>['outgoingTransfers','incomingTransfers'].includes(e.field)&&e.source?.currency==='ILS'&&/^20\d{2}-\d{2}-\d{2}$/.test(e.source.date??'')&&e.source.date<=asOf&&Number.isSafeInteger(e.cents)&&(e.field==='outgoingTransfers'?e.cents<0:e.cents>0)).map(e=>({
  key:spaceEntityKey(scope,'bank-transfer',e.key),ref:{budget,key:e.key,fingerprint:e.fingerprint,revision},
  direction:e.field==='outgoingTransfers'?'out':'in',cents:e.cents,date:e.source.date,month:e.month,
  account:(p.cashPlanning?.accounts??[]).find(a=>a.id===e.accountId)?.label??(p.bankImport?.accounts??[]).find(a=>a.id===e.accountId)?.label??'חשבון המקור',
  description:[e.source.description,e.source.beneficiary].filter(Boolean).join(' · ').slice(0,240),
  partial:!(p.cashPlanning?.months?.[e.month]?.[e.accountId]?.actual??p.months[e.month]?.actual)
 })).sort((a,b)=>b.date.localeCompare(a.date)||a.key.localeCompare(b.key));
}
export function transferRefsEqual(a,b){return !!a&&!!b&&['budget','key','fingerprint','revision'].every(k=>a[k]===b[k]);}
export function transferPairValid(out,incoming){return !!out&&!!incoming&&out.direction==='out'&&incoming.direction==='in'&&out.ref.budget!==incoming.ref.budget&&out.cents===-incoming.cents;}
export function transferBrowserSelection(entries,matches=[]){
 const legs=[...entries.values()].flatMap(e=>{const list=['ready','locked'].includes(e.status)&&e.matching?.status==='ready'?e.matching.legs:e.status==='ready'&&!e.summary?.transferMatchingLocked?e.summary?.transfers??[]:[];return list.map(leg=>({...leg,space:e.meta.name}));});
 const resolved=matches.map(m=>{
  const out=legs.find(l=>transferRefsEqual(l.ref,m.out)),incoming=legs.find(l=>transferRefsEqual(l.ref,m.in));
  return m.status==='current'&&transferPairValid(out,incoming)?{id:m.id,status:'current',out,in:incoming}:{id:m.id,status:m.status==='locked'?'locked':'unavailable'};
 });
 const used=new Set(resolved.filter(m=>m.status==='current').flatMap(m=>[m.out.key,m.in.key]));
 return {legs:legs.filter(l=>!used.has(l.key)),matches:resolved,blocked:resolved.some(m=>m.status!=='current')};
}
