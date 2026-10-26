import {creditCards,cashAccountList,cents,clone,monthAt,monthlyValues,cashSourceRecords,cashCardAccount} from './budget.js';
const billingDateOk=d=>typeof d==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
export function billingDate(month,day){const [y,m]=month.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();return month+'-'+String(Math.min(day,last)).padStart(2,'0');}
export function billingWindow(date,asOf){const days=Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(asOf+'T12:00:00Z'))/86400000);return days>=0&&days<=10;}
export function cardBillingValid(p){if(p.cardBilling===undefined)return true;const b=p.cardBilling;if(!b||b.version!==1||!Array.isArray(b.reports)||b.reports.length>3600)return false;const ids=new Set(creditCards(p).map(c=>c.id)),accounts=new Set(cashAccountList(p).map(a=>a.id)),seen=new Set();return b.reports.every(r=>{const k=r.cardId+'/'+r.dueDate;if(!ids.has(r.cardId)||!accounts.has(r.accountId)||(p.cashPlanning?.cardAccounts[r.cardId]&&p.cashPlanning.cardAccounts[r.cardId]!==r.accountId)||!billingDateOk(r.dueDate)||!billingDateOk(r.updatedOn)||!Number.isFinite(r.amount)||r.amount<0||r.amount>100000000||cents(r.amount)/100!==r.amount||!['pending','included'].includes(r.status)||!['manual','file','no-transactions'].includes(r.source)||r.previousUpdatedOn!==undefined&&(r.source!=='no-transactions'||!billingDateOk(r.previousUpdatedOn))||r.source==='no-transactions'&&(r.amount!==0||r.dueDate.slice(0,7)>=r.updatedOn.slice(0,7))||seen.has(k))return false;seen.add(k);return true;});}
// A declaration is not an uploaded statement. Later contradictory evidence wins.
export function cardActivityRecorded(p,cardId,month){
 return (p.cardBilling?.reports??[]).some(r=>r.cardId===cardId&&r.dueDate.slice(0,7)===month&&r.source!=='no-transactions'&&(r.source==='file'||r.amount!==0))||
  (p.details??[]).some(r=>r.method===cardId&&r.month===month&&r.status!=='cancelled')||
  (p.bankImport?.entries??[]).some(r=>r.field===cardId&&r.month===month&&r.cents!==0)||
  [p.months[month],...Object.values(p.cashPlanning?.months?.[month]??{})].some(r=>r?.actual&&Number(r.values?.[cardId]??0)!==0);
}
export function cardNoTransactionsConfirmed(p,cardId,month){return (p.cardBilling?.reports??[]).some(r=>r.cardId===cardId&&r.dueDate.slice(0,7)===month&&r.source==='no-transactions'&&r.amount===0)&&!cardActivityRecorded(p,cardId,month);}
export function cardNoTransactionsAccount(p,cardId){
 const accounts=cashAccountList(p),linked=cashCardAccount(p,cardId);
 return linked?(accounts.some(account=>account.id===linked)?linked:null):accounts.length===1?accounts[0].id:null;
}
export function setCardNoTransactions(p,cardId,month,confirmed,asOf){
 const card=creditCards(p).find(c=>c.id===cardId);
 if(!card||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||!billingDateOk(asOf)||month<p.startMonth||month>=asOf.slice(0,7)||card.removedFrom&&month>=card.removedFrom)throw Error('אפשר לאשר רק חודש שהסתיים ובו הכרטיס היה במעקב.');
 const next=clone(p);next.cardBilling??={version:1,reports:[]};
 next.cardBilling.reports=next.cardBilling.reports.flatMap(r=>r.cardId===cardId&&r.dueDate.slice(0,7)===month&&r.source==='no-transactions'?(r.previousUpdatedOn?[{...Object.fromEntries(Object.entries(r).filter(([key])=>key!=='previousUpdatedOn')),source:'manual',updatedOn:r.previousUpdatedOn}]:[]):[r]);
 if(confirmed){
  if(cardActivityRecorded(p,cardId,month))throw Error('קיימים דוח, עסקאות או חיוב לכרטיס בחודש הזה. יש לבדוק אותם לפני סימון ללא עסקאות.');
  const accountId=cardNoTransactionsAccount(p,cardId);
  if(!accountId)throw Error('יש לשייך את הכרטיס לחשבון המשלם בהגדרות תחילה.');
  // Upgrade an existing manual zero in place; undo restores its original provenance.
  const previous=next.cardBilling.reports.find(r=>r.cardId===cardId&&r.dueDate.slice(0,7)===month&&r.source==='manual');
  if(previous){previous.previousUpdatedOn=previous.updatedOn;previous.updatedOn=asOf;previous.source='no-transactions';}
  else next.cardBilling.reports.push({cardId,accountId,dueDate:billingDate(month,card.billingDay??15),amount:0,source:'no-transactions',status:'pending',updatedOn:asOf});
 }
 if(!cardBillingValid(next))throw Error('לא ניתן לעדכן את מצב הכרטיס.');
 return next;
}
export function billingReport(p,cardId,dueDate){return p.cardBilling?.reports.find(r=>r.cardId===cardId&&r.dueDate===dueDate&&(r.source!=='no-transactions'||cardNoTransactionsConfirmed(p,cardId,dueDate.slice(0,7))))??null;}
// Remind about the latest charged cycle; a manual total is not a report.
export function cardReportReminderRows(p,asOf){
 if(!billingDateOk(asOf))return [];
 const current=asOf.slice(0,7);
 return creditCards(p).filter(card=>!card.removedFrom||current<card.removedFrom).flatMap(card=>{
  const day=card.billingDay??15,currentDue=billingDate(current,day),month=currentDue<=asOf?current:monthAt(current,-1),dueDate=billingDate(month,day);
  if(month<p.startMonth)return [];
  const received=(p.cardBilling?.reports??[]).some(report=>report.cardId===card.id&&report.dueDate.slice(0,7)===month&&report.source==='file')||(p.details??[]).some(row=>row.method===card.id&&row.month===month&&row.status!=='cancelled'&&['cal','isracard'].includes(row.statement?.issuer));
  return received||cardNoTransactionsConfirmed(p,card.id,month)?[]:[{id:card.id,name:card.name,month,dueDate}];
 });
}
export function saveBillingReport(p,input,asOf){const next=clone(p),card=creditCards(p).find(c=>c.id===input.cardId);if(!card||!billingDateOk(input.dueDate)||(input.source==='file'?input.dueDate.slice(0,7)<p.startMonth||input.dueDate.slice(0,7)>monthAt(p.startMonth,119):input.dueDate.slice(0,7)!==asOf.slice(0,7)&&!billingWindow(input.dueDate,asOf)))throw Error('בחר חיוב של החודש הנוכחי או חיוב קרוב.');const mapped=p.cashPlanning?.cardAccounts[card.id];if(mapped&&mapped!==input.accountId)throw Error('בחר את החשבון שמשלם את הכרטיס.');next.cardBilling??={version:1,reports:[]};next.cardBilling.reports=next.cardBilling.reports.filter(r=>!(r.cardId===input.cardId&&(r.dueDate===input.dueDate||r.source==='no-transactions'&&r.dueDate.slice(0,7)===input.dueDate.slice(0,7))));next.cardBilling.reports.push({...input,updatedOn:asOf,status:'pending'});if(!cardBillingValid(next))throw Error('יש לבדוק את סכום החיוב והחשבון המשלם.');return next;}
// Reconciled card debits or confirmed manual reports avoid a second charge. Estimates need only
// the difference from any card amount already present in that month's forecast.
export function billingForecastAdjustment(p,id,month,record,values){let amount=0;for(const r of p.cardBilling?.reports??[]){if(r.accountId!==id||r.dueDate.slice(0,7)!==month||r.status==='included'||r.source==='no-transactions'&&!cardNoTransactionsConfirmed(p,r.cardId,month))continue;if(record?.date&&record.date>=r.dueDate){const charged=(p.bankImport?.entries??[]).filter(e=>e.accountId===id&&e.field===r.cardId&&e.month===month&&e.cents<0).reduce((n,e)=>n-e.cents,0);if(charged>=cents(r.amount)||!record.fromBank&&record.actual)continue;}amount+=cents(r.amount)-(record?.balance!==undefined?0:cents(values[r.cardId]??0));}return amount/100;}

// Charge snapshots are read-only; unknown history is never filled from estimates.
export function cardChargeSnapshot(p,cardId,month,allowEstimate=false){
 const report=(p.cardBilling?.reports??[]).filter(r=>r.cardId===cardId&&r.dueDate.slice(0,7)===month&&(r.source!=='no-transactions'||cardNoTransactionsConfirmed(p,cardId,month))).sort((a,b)=>b.dueDate.localeCompare(a.dueDate))[0];
 if(report)return {amount:report.amount,kind:'updated',date:report.updatedOn,dueDate:report.dueDate,accountId:report.accountId};
 const accountId=p.cashPlanning?.cardAccounts[cardId]??(cashAccountList(p).length===1?cashAccountList(p)[0].id:null),record=accountId?cashSourceRecords(p,accountId)[month]:null;
 const imported=(p.bankImport?.entries??[]).some(e=>e.accountId===accountId&&e.month===month&&e.field===cardId);
 if(record&&Object.hasOwn(record.values,cardId)&&(!record.fromBank||imported))return {amount:record.values[cardId],kind:record.fromBank?'bank':record.actual?'reported':'estimate',date:record.date??null,accountId};
 const aggregate=p.months[month],bankAmount=(p.bankImport?.entries??[]).some(e=>e.month===month&&e.field===cardId);if(aggregate&&Object.hasOwn(aggregate.values,cardId)&&(!aggregate.bankCoverage||bankAmount||aggregate.values[cardId]!==0))return {amount:aggregate.values[cardId],kind:aggregate.bankCoverage&&bankAmount?'bank':aggregate.actual?'reported':'estimate',date:aggregate.bankCoverage?.date??null,accountId};
 const estimate=monthlyValues(p,month)[cardId]??0;return {amount:allowEstimate&&estimate!==0?estimate:null,kind:allowEstimate&&estimate!==0?'estimate':'unknown',date:null,accountId};
}

// Statement coverage is provenance only, independent of forecast estimates and amounts.
export function cardStatementCoverage(p,year,asOf){
 const current=asOf.slice(0,7),y=Number(year);
 if(!Number.isInteger(y)||y<2000||y>Number(current.slice(0,4)))return [];
 return creditCards(p).map(card=>{
  const months=Array.from({length:12},(_,i)=>`${y}-${String(i+1).padStart(2,'0')}`).filter(month=>month>=p.startMonth&&month<=current&&(!card.removedFrom||month<card.removedFrom)).map(month=>{
   const reports=(p.cardBilling?.reports??[]).filter(r=>r.cardId===card.id&&r.dueDate.slice(0,7)===month),file=reports.some(r=>r.source==='file')||(p.details??[]).some(e=>e.method===card.id&&e.month===month&&['cal','isracard'].includes(e.statement?.issuer));
   const snapshot=file?null:cardChargeSnapshot(p,card.id,month),state=file?'file':cardNoTransactionsConfirmed(p,card.id,month)?'no-transactions':reports.some(r=>r.source==='manual')||snapshot?.kind==='reported'||snapshot?.kind==='updated'?'manual':snapshot?.kind==='bank'?'bank':'missing';
   return {month,state,missing:state!=='file'&&state!=='no-transactions'};
  });
  return {card,months,missing:months.filter(m=>m.missing).map(m=>m.month),received:months.filter(m=>m.state==='file').length,confirmedZero:months.filter(m=>m.state==='no-transactions').length};
 }).filter(row=>row.months.length);
}
