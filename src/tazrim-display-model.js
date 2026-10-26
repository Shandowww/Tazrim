// Read-only presentation adapter. Budgit's report/forecast math remains authoritative.
import {cashAccountList,cashSourceRecords,cashCardAccount,creditCards,forecast,zero,cents,analyticalExpenseDetails} from './budget.js';
import {cardChargeSnapshot} from './card-billing-model.js';
export function tazrimDisplaySnapshot(p,{year,month='',asOf,accountId='',cardId=''}={}){
 if(!/^20\d{2}$/.test(String(year))||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(asOf)||month&&!/^(0[1-9]|1[0-2])$/.test(month))throw Error('Invalid display period');
 const accounts=cashAccountList(p),account=accounts.find(a=>a.id===accountId);
 if(accountId&&!account)throw Error('Unknown display account');
 if(cardId&&!creditCards(p).some(c=>c.id===cardId))throw Error('Unknown display card');
 const sources=account?[cashSourceRecords(p,accountId)]:accounts.map(a=>cashSourceRecords(p,a.id));
 // A confirmed combined report already contains its accounts and is used once.
 const series=Array.from({length:12},(_,i)=>{
  const key=year+'-'+String(i+1).padStart(2,'0'),future=key>asOf;
  const combined=!accountId&&p.months[key]?.actual?p.months[key]:null;
  const records=future?[]:combined?[combined]:sources.map(r=>r[key]).filter(r=>r?.actual);
  const amounts=records.map(record=>forecast({...p,startMonth:key,opening:0,horizon:1,defaults:zero(),months:{[key]:{...record,cashReport:undefined}},expenses:[],details:[],loans:[],savingTransfers:[]})[0]);
  const sum=name=>amounts.length?amounts.reduce((n,r)=>n+cents(r[name]??0),0)/100:null;
  const cards=creditCards(p).filter(c=>(!c.removedFrom||key<c.removedFrom)&&(!cardId||c.id===cardId)&&(!accountId||cashCardAccount(p,c.id)===accountId)).map(card=>({id:card.id,name:card.name,...cardChargeSnapshot(p,card.id,key)}));
  const known=future?[]:cards.filter(c=>c.amount!==null&&c.kind!=='estimate');
  return {month:key,future,reported:records.length>0,partial:!combined&&records.length>0&&records.length<(account?1:accounts.length),income:sum('income'),spending:sum('spending'),saving:sum('saving'),incomingTransfers:sum('incomingTransfers'),outgoingTransfers:sum('outgoingTransfers'),net:sum('net'),cardTotal:known.length?known.reduce((n,c)=>n+cents(c.amount),0)/100:null,cards:future?[]:cards};
 });
 const selected=series.filter(r=>!month||r.month.endsWith('-'+month)),reported=selected.filter(r=>r.reported),sum=name=>{const rows=selected.filter(r=>r[name]!==null);return rows.length?rows.reduce((n,r)=>n+cents(r[name]),0)/100:null;};
 const details=analyticalExpenseDetails(p).filter(r=>r.status!=='cancelled'&&r.month<=asOf&&r.month.startsWith(year+'-')&&(!cardId||r.method===cardId)&&(!month||r.month.endsWith('-'+month))&&(!accountId||(r.cashAccountId??cashCardAccount(p,r.method))===accountId));
 const categories=new Map();for(const row of details)categories.set(row.category,(categories.get(row.category)??0)+cents(row.amount));
 return {year:String(year),month,accountId,series,selected,hasReports:reported.length>0,reportedMonths:reported.length,partial:reported.some(r=>r.partial),income:sum('income'),spending:sum('spending'),saving:sum('saving'),incomingTransfers:sum('incomingTransfers'),outgoingTransfers:sum('outgoingTransfers'),net:sum('net'),cardTotal:sum('cardTotal'),average:reported.length?reported.reduce((n,r)=>n+cents(r.spending),0)/100/reported.length:null,categories:[...categories].map(([category,value])=>({category,amount:value/100})).sort((a,b)=>b.amount-a.amount),details};
}
