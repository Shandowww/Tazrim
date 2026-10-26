import {savingsBalances,monthAt} from './budget.js';
// Estimates never enter savingsBalances, allocations or the cash-flow ledger.
export function savingsGrowthEstimate(p,reference,asOf){
 const s=p.savingsGoals,accounts=s?.accounts??[];if(!accounts.some(a=>a.returnMode==='boi'))return null;
 const start=s.accountsAsOf??s.accountsMonth+'-01',end=Date.parse(asOf+'T00:00:00Z'),begin=Date.parse(start+'T00:00:00Z');
 const history=(reference?.history??[]).filter(point=>point.date<=asOf);if(!Number.isFinite(end)||!Number.isFinite(begin)||end<begin||!history.length||history[0].date>start)return{unavailable:true};
 if(history.some((point,i)=>!Number.isFinite(point.rate)||point.rate<0||point.rate>30||!/^\d{4}-\d{2}-\d{2}$/.test(point.date)||(i&&point.date<=history[i-1].date)))return{unavailable:true};
 const total=accounts.reduce((n,a)=>n+a.balance,0),weights=accounts.map(a=>total?a.balance/total:1/accounts.length),values=accounts.map(a=>a.balance);let capital=total,index=0;
 const covered=s.accountsCovered??(s.accountsMonth===s.snapshotMonth&&s.accountsAdjustment===0?(s.coveredPool??0)+Object.values(s.covered??{}).reduce((a,n)=>a+n,0):0);
 for(let day=begin;day<end;day+=86400000){const date=new Date(day).toISOString().slice(0,10),month=date.slice(0,7);while(index+1<history.length&&history[index+1].date<=date)index++;
  const year=Number(date.slice(0,4)),days=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;
  for(let i=0;i<values.length;i++)if(accounts[i].returnMode==='boi')values[i]*=Math.pow(1+history[index].rate/100,1/days);
  const nextDate=new Date(day+86400000).toISOString().slice(0,10);if(nextDate.slice(0,7)!==month){let deposit=s.poolDeposits?.[month]??Object.values(s.deposits[month]??{}).reduce((a,n)=>a+n,0);if(month===s.accountsMonth)deposit-=covered;capital+=deposit;for(let i=0;i<values.length;i++)values[i]+=deposit*weights[i];}
 }
 const growth=Math.round((values.reduce((a,n)=>a+n,0)-capital)*100)/100,reported=savingsBalances(p,asOf.slice(0,7)).balance,rate=history.at(-1).rate,weightedRate=accounts.reduce((n,a,i)=>n+(a.returnMode==='boi'?weights[i]*rate:0),0);
 return{reported,growth,estimated:Math.round((reported+growth)*100)/100,weightedRate,rate,start,asOf};
}
export function savingsGrowthProjection(current,target,monthly,annualRate,month){
 if(![current,target,monthly,annualRate].every(Number.isFinite)||current<0||target<=0||monthly<0||annualRate<0||annualRate>30)return null;
 if(current>=target)return{count:0,month:null};const factor=Math.pow(1+annualRate/100,1/12);let amount=current;
 for(let count=1;count<=1200;count++){const date=monthAt(month,count);if(date>'2099-12')return null;amount=amount*factor+monthly;if(amount>=target)return{count,month:date};}return null;
}
