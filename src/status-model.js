import {cashAccountList,cashSourceRecords,cashAccountValues,cashAccountForecast,cashAssignedItem,creditCards,budgetFields,paymentFor,cents,indexMonth} from './budget.js';
import {billingReport,billingDate} from './card-billing-model.js';
// Read-only summaries. The account forecast remains the single balance calculation.
export function statusAccountSummaries(p,month,asOf){
 const accounts=cashAccountList(p),sources=new Map(accounts.map(a=>[a.id,cashSourceRecords(p,a.id)])),accountValues=new Map(accounts.map(a=>[a.id,cashAccountValues(p,a.id,month,sources.get(a.id))]));
 const assignments=new Map(creditCards(p).map(c=>{const report=billingReport(p,c.id,billingDate(month,c.billingDay??15)),observed=accounts.filter(a=>(accountValues.get(a.id).values[c.id]??0)>0);return [c.id,p.cashPlanning?.cardAccounts[c.id]??report?.accountId??(accounts.length===1?accounts[0].id:observed.length===1?observed[0].id:null)];}));
 const unassignedCards=creditCards(p).filter(c=>(!c.removedFrom||month<c.removedFrom)&&!assignments.get(c.id));
 return accounts.map(account=>{
  const records=sources.get(account.id),{values,record}=accountValues.get(account.id),rows=cashAccountForecast(p,account.id,[],Math.max(p.horizon,indexMonth(month)-indexMonth(p.startMonth)+1)),row=rows.find(r=>r.month===month);
  const readings=Object.entries(records).filter(([m,r])=>m<=month&&r.balance!==undefined&&r.date&&r.date<=asOf).sort((a,b)=>b[1].date.localeCompare(a[1].date));
  const reading=readings.length?{balance:readings[0][1].balance,date:readings[0][1].date,fromBank:readings[0][1].fromBank}:account.opening!==undefined&&(!account.openingMonth||account.openingMonth+'-01'<=asOf)?{balance:account.opening,date:(account.openingMonth??p.startMonth)+'-01',opening:true}:null;
  const cards=creditCards(p).filter(c=>(!c.removedFrom||month<c.removedFrom)&&assignments.get(c.id)===account.id).map(card=>{
   const dueDate=billingDate(month,card.billingDay??15),report=billingReport(p,card.id,dueDate),bankEntries=(p.bankImport?.entries??[]).filter(e=>e.accountId===account.id&&e.month===month&&e.field===card.id),bankPaid=bankEntries.reduce((n,e)=>n-e.cents,0),value=values[card.id]??0;
   let state,amount;
   if(report){amount=report.amount;const included=report.status==='included'||record?.date&&record.date>=dueDate&&(bankPaid>=cents(amount)||!record.fromBank&&record.actual);state=included?'included':'pending';}
   else if(record?.fromBank&&bankEntries.length){amount=value;state='included';}
   else if(record&&!record.fromBank&&record.actual&&Object.hasOwn(record.values,card.id)){amount=value;state='included';}
   else if(value!==0||record&&!record.fromBank&&Object.hasOwn(record.values,card.id)){amount=value;state='estimate';}
   else{amount=null;state='unknown';}
   return {id:card.id,name:card.name,dueDate,amount,state,updatedOn:report?.updatedOn??null};
  });
  const issues=[...(row?.issues??[])];if(cards.some(c=>c.state==='unknown'||c.state==='estimate'))issues.push('יש חיובי כרטיסים שעדיין לא עודכנו');if(record?.date&&record.date>asOf)issues.push('היתרה בדוח מתייחסת לתאריך עתידי');if(unassignedCards.length)issues.push('יש כרטיסים ללא חשבון משלם');
  const pendingCards=cards.filter(c=>c.state==='pending'||c.state==='estimate'),pendingKnown=pendingCards.reduce((n,c)=>n+cents(c.amount??0),0)/100,cardPartial=cards.some(c=>c.state==='unknown'||c.state==='estimate');
  const reportedCards=cards.filter(c=>c.state==='pending'||c.state==='included'),reportedCardTotal=reportedCards.reduce((sum,c)=>sum+cents(c.amount),0)/100,includedCardTotal=reportedCards.filter(c=>c.state==='included').reduce((sum,c)=>sum+cents(c.amount),0)/100,pendingReported=reportedCards.filter(c=>c.state==='pending').reduce((sum,c)=>sum+cents(c.amount),0)/100,estimatedCardTotal=cards.filter(c=>c.state==='estimate').reduce((sum,c)=>sum+cents(c.amount),0)/100;
  const otherFields=budgetFields(p).filter(([k,type,kind])=>!k.startsWith('card')&&['expense','saving'].includes(kind)).map(([key,label,kind])=>({key,label,kind,amount:values[key]??0})).filter(f=>f.amount!==0);
  const planned=(p.expenses??[]).filter(e=>cashAssignedItem(p,e)===account.id&&paymentFor(e,month)>0).map(e=>({id:e.id,name:e.name,amount:paymentFor(e,month),kind:e.kind,included:!!(record?.includesPlannedCard&&e.source==='card'&&e.kind==='expense'||record?.includesPlannedDirect&&e.source==='direct')}));
  const risk=rows.find(r=>r.month>=month&&r.balance!==null&&r.balance<0);
  return {account,row,reading,cards,pendingKnown,cardPartial,reportedCardTotal,reportedCardCount:reportedCards.length,includedCardTotal,pendingReported,estimatedCardTotal,otherFields,planned,issues:[...new Set(issues)],unassignedCards,risk,margin:row?.balance===null||!row||issues.length?null:(cents(row.balance)-cents(account.buffer??0))/100};
 });
}
