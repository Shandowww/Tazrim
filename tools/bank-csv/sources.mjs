// Contracts for future adapters. Bank totals own cash flow; card events explain them.
export const sourceRoles={hapoalimBank:'monthly-totals',applePay:'card-details',cal:'card-details',isracard:'card-details'};
export function reconcileCardSources(bankTotals,detailEvents){
 const groups=new Map(),seen=new Set();
 for(const b of bankTotals){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(b.month)||!b.cardId||!Number.isSafeInteger(b.cents)||b.cents<0)throw Error('סך כרטיס מהבנק אינו תקין.');
  const key=JSON.stringify([b.month,b.cardId]);if(groups.has(key))throw Error('יש יותר מסך כרטיס אחד לאותו חודש; יש לאחד את חיובי הבנק לפני התאמה.');
  groups.set(key,{month:b.month,cardId:b.cardId,bankCents:b.cents,detailsCents:0,review:0,duplicates:0});
 }
 for(const e of detailEvents){
  if(!['applePay','cal','isracard'].includes(e.source)||!e.cardId||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.billingMonth)||!Number.isSafeInteger(e.cents))throw Error('פירוט כרטיס אינו תקין.');
  const key=JSON.stringify([e.billingMonth,e.cardId]);if(!groups.has(key))groups.set(key,{month:e.billingMonth,cardId:e.cardId,bankCents:null,detailsCents:0,review:0,duplicates:0});
  const g=groups.get(key),identity=e.reference?JSON.stringify([e.cardId,e.billingMonth,e.reference]):e.id?JSON.stringify([e.source,e.id]):null;
  if(identity&&seen.has(identity)){g.duplicates++;continue;}if(identity)seen.add(identity);
  // Full installment purchase prices cannot substitute for billed installments.
  if(e.confirmed!==true||e.currency!=='ILS'||e.fullInstallmentPrice||!identity){g.review++;continue;}
  g.detailsCents+=e.cents;
 }
 return [...groups.values()].map(g=>({...g,cashFlowCents:g.bankCents,unexplainedCents:g.bankCents===null?null:g.bankCents-g.detailsCents,complete:g.bankCents!==null&&g.bankCents===g.detailsCents&&g.review===0}));
}
