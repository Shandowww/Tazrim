import {sourceAllocationsValid,bankConsumptionReviewsValid,bankConsumptionRemainders,withSourceAllocation,withoutSourceAllocation,sourceAllocationUsage} from './reconciliation-model.js';
import {cardBillingValid,billingForecastAdjustment,cardNoTransactionsConfirmed} from './card-billing-model.js';
export const fields=[['salary','הכנסה נטו','income'],['otherIncome','הכנסות נוספות','income'],['incomingTransfers','העברה נכנסת','transfer'],['outgoingTransfers','העברה יוצאת פנימית','transfer'],['variable','הוצאות אחרות','expense'],['card1','כרטיס מזרחי / הפועלים','expense'],['card2','כרטיס וואן זירו','expense'],['transfers','העברות יוצאות','expense'],['checks','צ׳קים — סך חודשי','expense'],['loanRepayment','החזר הלוואות','expense'],['personalSaving','חיסכון אישי','saving'],['personalInvest','חשבון פרטי · השקעות','saving'],['sharedSaving','חיסכון משותף','saving'],['sharedInvest','חשבון משותף · השקעות','saving']];
// Stable card keys retain historical monthly totals when a card is removed.
export const creditCards=p=>p.creditCards??[{id:'card1',name:'כרטיס מזרחי / הפועלים',alias:''},{id:'card2',name:'כרטיס וואן זירו',alias:''}];
export const activeCards=(p,m)=>creditCards(p).filter(c=>!c.removedFrom||m<c.removedFrom);
export const visibleCards=(p,m)=>creditCards(p).filter(c=>!c.removedFrom||m<c.removedFrom||(p.months[m]?.values[c.id]??0)>0);
export const budgetFields=p=>[...fields.map(f=>f[0].startsWith('card')?[f[0],creditCards(p).find(c=>c.id===f[0])?.name??f[1],f[2]]:f),...creditCards(p).filter(c=>!['card1','card2'].includes(c.id)).map(c=>[c.id,c.name,'expense'])];
// Initial navigation follows the current month without changing the budget period.
export const defaultBudgetMonth=(p,asOf)=>asOf<p.startMonth?p.startMonth:asOf;
// Transfers are needs-based: inherit only an explicit recurring estimate, never a prior report.
export function monthlyValues(p,m){const prior=Object.keys(p.months).filter(k=>k<m&&(p.months[k].actual||p.months[k].bankCoverage?.complete!==false)).sort().at(-1),v=clone(p.months[m]?.values??(prior?p.months[prior].values:p.defaults));if(!p.months[m]){const schedule=(p.savingSchedules??[]).filter(r=>r.from<=m).sort((a,b)=>a.from.localeCompare(b.from)).at(-1);if(schedule){v.personalSaving=schedule.personalSaving;v.sharedSaving=schedule.sharedSaving;}}for(const k of ['incomingTransfers','outgoingTransfers'])v[k]=p.months[m]?v[k]??0:p.defaults[k]??0;v.loanRepayment??=0;if(!p.months[m]&&p.loans!==undefined)v.loanRepayment=scheduledLoans(p,m);for(const c of creditCards(p)){v[c.id]??=p.defaults[c.id]??0;if(!p.months[m]&&c.removedFrom&&m>=c.removedFrom)v[c.id]=0;}return v;}
export function saveMonthReport(p,m,actual,asOf,salaryChanged=false){if(actual&&m>asOf)throw Error('חודש עתידי ניתן לשמור כהערכה בלבד.');const next=clone(p),values=monthlyValues(p,m);next.months[m]={values,actual,includesPlannedCard:p.months[m]?.includesPlannedCard??false,...(p.months[m]?.includesPlannedDirect!==undefined?{includesPlannedDirect:p.months[m].includesPlannedDirect}:{}),...(p.months[m]?.bankCoverage?{bankCoverage:p.months[m].bankCoverage}:{}),...(p.months[m]?.otherIncomeNote!==undefined?{otherIncomeNote:p.months[m].otherIncomeNote}:{}),...(actual&&p.months[m]?.cashReport?{cashReport:{balance:p.months[m].cashReport.balance,net:p.months[m].cashReport.pending?forecast(p,undefined,Math.max(p.horizon,indexMonth(m)-indexMonth(p.startMonth)+1)).find(r=>r.month===m).net+pendingSavingCents(p,m)/100:p.months[m].cashReport.net}}:{})};if(salaryChanged)for(const [month,r] of Object.entries(next.months))if(month>m&&!r.actual)r.values.salary=values.salary;if(next.savingsGoals&&m>=next.savingsGoals.snapshotMonth&&m<=asOf)return confirmMonthlySavings(next,m,asOf,!actual);return next;}
export function cardsValid(p){if(p.creditCards===undefined)return true;if(!Array.isArray(p.creditCards)||p.creditCards.length>30)return false;const ids=new Set(),aliases=new Set();return p.creditCards.every(c=>{if(!c||!/^card(?:[12]|_[a-zA-Z0-9-]{1,70})$/.test(c.id)||ids.has(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>60||typeof c.alias!=='string'||c.alias.length>80||/^\d{13,19}$/.test(c.alias.replace(/[ -]/g,''))||c.billingDay!==undefined&&(!Number.isInteger(c.billingDay)||c.billingDay<1||c.billingDay>31)||c.removedFrom!==undefined&&!monthOk(c.removedFrom)||c.alias&&aliases.has(c.alias))return false;ids.add(c.id);if(c.alias)aliases.add(c.alias);return true;});}
// Legacy split is kept in stored reports; the form exposes one combined amount.
export const offCardTotal=v=>(cents(v.variable??0)+cents(v.transfers??0))/100;
// A bank debit can be a purchase, card settlement, transfer, or saving deposit.
// Keep these source movements separate from categorized purchase details.
export function bankMovementAudit(p,month){
 const cardIds=new Set(creditCards(p).map(card=>card.id));
 const savingFields=new Set(fields.filter(([, ,kind])=>kind==='saving').map(([key])=>key));
 const groups=Object.fromEntries(['direct','transfers','cards','saving','loans','income','excluded'].map(key=>[key,{count:0,debitCents:0,creditCents:0}]));
 let sourceMissing=0;
 for(const entry of p.bankImport?.entries??[]){
  if(entry.month!==month)continue;
  const key=entry.field==='exclude'?'excluded':cardIds.has(entry.field)?'cards':savingFields.has(entry.field)?'saving':['transfers','incomingTransfers','outgoingTransfers'].includes(entry.field)?'transfers':entry.field==='loanRepayment'?'loans':['salary','otherIncome'].includes(entry.field)?'income':'direct';
  const group=groups[key];group.count++;
  if(entry.cents<0)group.debitCents-=entry.cents;
  else group.creditCents+=entry.cents;
  if(!entry.source)sourceMissing++;
 }
 return {month,groups,sourceMissing,totalCount:Object.values(groups).reduce((sum,group)=>sum+group.count,0)};
}
export function setOffCardTotal(v,total){if(!Number.isFinite(total)||total<0||total>200000000)throw Error('יש להזין סכום הוצאות תקין.');v.variable=Math.min(total,100000000);v.transfers=(cents(total)-cents(v.variable))/100;return v;}
export const formBudgetFields=p=>budgetFields(p).filter(([k])=>k!=='transfers').map(f=>f[0]==='variable'?['offCard','הוצאות שלא שולמו בכרטיס',f[2]]:f);
export const zero=()=>Object.fromEntries(fields.map(([k])=>[k,0]));
export function scheduledLoans(p,month){return (p.loans??[]).filter(l=>month>=l.from&&indexMonth(month)<indexMonth(l.from)+l.months).reduce((n,l)=>n+cents(l.monthly),0)/100;}
export function loansValid(p){return p.loans===undefined||Array.isArray(p.loans)&&p.loans.length<=20&&new Set(p.loans.map(l=>l?.id)).size===p.loans.length&&p.loans.every(l=>l&&typeof l.id==='string'&&l.id.length>0&&l.id.length<=100&&typeof l.name==='string'&&l.name.trim()&&l.name.length<=80&&moneyOk(l.monthly)&&l.monthly>0&&cents(l.monthly)/100===l.monthly&&monthOk(l.from)&&l.from>=p.startMonth&&Number.isInteger(l.months)&&l.months>=1&&l.months<=120&&indexMonth(l.from)-indexMonth(p.startMonth)+l.months<=120);}
export function setLoan(p,loan){
 if(cashAccountList(p).length>1&&!cashAssignedItem(p,loan))throw Error('בחר את החשבון שממנו נגבית ההלוואה.');
 const next=clone(p);next.loans=[...(p.loans??[]).filter(l=>l.id!==loan.id),loan];
 if(!loansValid(next))throw Error('יש להזין שם, החזר חודשי ומספר חודשים תקינים בתוך תקופת התכנון.');
 for(const [m,r] of Object.entries(next.months))if(!r.actual)r.values.loanRepayment=scheduledLoans(next,m);
 if(!validatePlan(next))throw Error('לא ניתן לעדכן את ההלוואה.');return next;
}
export function removeLoan(p,id){if(cashAccountList(p).length>1&&!cashAssignedItem(p,loan))throw Error('בחר את החשבון שממנו נגבית ההלוואה.');
 const next=clone(p);next.loans=(p.loans??[]).filter(l=>l.id!==id);for(const [m,r] of Object.entries(next.months))if(!r.actual)r.values.loanRepayment=scheduledLoans(next,m);return next;}
export function savingTransfersValid(p){return p.savingTransfers===undefined||Array.isArray(p.savingTransfers)&&p.savingTransfers.length<=120&&new Set(p.savingTransfers.map(t=>t?.id)).size===p.savingTransfers.length&&p.savingTransfers.every(t=>t&&typeof t.id==='string'&&t.id.length>0&&t.id.length<=100&&monthOk(t.month)&&t.month>=p.startMonth&&moneyOk(t.personal)&&moneyOk(t.shared)&&cents(t.personal)/100===t.personal&&cents(t.shared)/100===t.shared&&cents(t.personal)+cents(t.shared)>0&&['pending','completed','cancelled'].includes(t.status));}
export function pendingSavingCents(p,month){return (p.savingTransfers??[]).filter(t=>t.status==='pending'&&t.month===month).reduce((n,t)=>n+cents(t.personal)+cents(t.shared),0);}
export function planSavingTransfer(p,id,month,personal,shared,asOf){
 if((p.savingTransfers??[]).some(t=>t.id===id))throw Error('הבקשה כבר קיימת.');
 reportAdditionalSavings(p,month,personal,shared,asOf); // Check available cash; do not post it as performed.
 const next=clone(p);next.savingTransfers=[...(p.savingTransfers??[]),{id,month,personal,shared,status:'pending'}];
 if(!validatePlan(next))throw Error('לא ניתן לשמור את בקשת ההעברה.');return next;
}
export function completeSavingTransfer(p,id,asOf,alreadyReported=false){
 const request=p.savingTransfers?.find(t=>t.id===id);if(!request)throw Error('בקשת ההעברה לא נמצאה.');if(request.status==='completed')return clone(p);if(request.status!=='pending')throw Error('הבקשה בוטלה.');
 const base=clone(p);base.savingTransfers.find(t=>t.id===id).status='completed';
 if(alreadyReported){const r=base.months[asOf];if(!r?.actual||!r.cashReport||r.cashReport.pending||cents(r.values.personalSaving)<cents(request.personal)||cents(r.values.sharedSaving)<cents(request.shared))throw Error('ההפקדה אינה מכוסה בדיווח בפועל לחודש הזה.');return confirmMonthlySavings(base,asOf,asOf);}
 return reportAdditionalSavings(base,asOf,request.personal,request.shared,asOf);
}
export const demoPlan={startMonth:'2026-10',opening:10000,buffer:5000,horizon:24,defaults:{...zero(),salary:16500,variable:6500,card1:2500,card2:500,personalInvest:2300,sharedSaving:4000},months:{},expenses:[{id:'demo-trip',name:'חופשה משפחתית',amount:5000,fees:0,firstMonth:'2026-12',payments:1,source:'direct',kind:'expense'}],demo:true};
// Synthetic, isolated walkthrough; never written into a user's saved budget.
export function createDemoPlan(asOf){
 const startMonth=monthAt(asOf,-6),defaults={salary:18500,otherIncome:900,variable:6200,card1:2800,card2:700,transfers:450,checks:1200,loanRepayment:1000,personalSaving:700,personalInvest:1800,sharedSaving:2500,sharedInvest:500};
 const months=Object.fromEntries(Array.from({length:9},(_,i)=>[monthAt(startMonth,i),{values:{...defaults,salary:18500+i*100,otherIncome:800+(i%3)*300,variable:6000+(i%4)*200,card1:2700+(i%3)*150,card2:650+(i%2)*150,personalSaving:700+(i%3)*100,sharedSaving:2500+(i%2)*200},actual:i<=6,includesPlannedCard:i<=6}]));
 const categories=[['דיור','variable',4300,'שכר דירה'],['מזון','card1',1400,'סך מזון בכרטיס'],['קניות','card1',500,'סך קניות בכרטיס'],['בילויים','card1',400,'סך בילויים בכרטיס'],['תחבורה','card2',350,'נסיעות'],['בריאות','variable',600,'בריאות'],['אחר','transfers',300,'העברה מתוכננת'],['חינוך','checks',900,'צ׳ק לחוגים']];
 const details=Array.from({length:24},(_,i)=>categories.map(([category,method,amount,name],j)=>{const month=monthAt(startMonth,i);return{id:`demo-detail-${i}-${j}`,name,category,method,amount:amount+(i%3)*20,month,date:month+'-10',number:method==='checks'?String(1000+i):'',status:i<=6?'cleared':'pending',accounting:'included'};})).flat();
 details.push({id:'demo-pending-cheque',name:'צ׳ק לטיפול בבית',category:'דיור',method:'checks',amount:500,month:asOf,date:asOf+'-25',number:'2001',status:'pending',accounting:'additional'});
 return{startMonth,opening:18000,buffer:5000,horizon:24,defaults,months,expenses:[
  {id:'demo-furniture',name:'ריהוט לבית',amount:10560,fees:240,firstMonth:startMonth,payments:24,source:'direct',kind:'expense'},
  {id:'demo-computer',name:'מחשב נייד',amount:3600,fees:120,firstMonth:startMonth,payments:12,source:'card',kind:'expense'},
  {id:'demo-gift',name:'מתנה משפחתית',amount:900,fees:0,firstMonth:monthAt(startMonth,1),payments:1,source:'direct',kind:'expense'},
  {id:'demo-bonus',name:'מענק חד־פעמי',amount:3200,fees:0,firstMonth:monthAt(startMonth,5),payments:1,source:'direct',kind:'income'},
  {id:'demo-insurance',name:'ביטוח רכב שנתי',amount:2400,fees:60,firstMonth:asOf,payments:3,source:'direct',kind:'expense'},
  {id:'demo-trip',name:'חופשה משפחתית',amount:5000,fees:0,firstMonth:monthAt(asOf,2),payments:1,source:'direct',kind:'expense'},
  {id:'demo-refund',name:'החזר הוצאות צפוי',amount:1600,fees:0,firstMonth:monthAt(asOf,3),payments:1,source:'direct',kind:'income'}
 ],details,showDetails:true,categoryGoals:{'מזון':2000,'בילויים':800,'חינוך':1500},goals:{saving:4000,invest:3000,spending:15000,income:22000},savingsGoals:{balance:500000,snapshotMonth:asOf,items:[{id:'house',name:'ההון העצמי לבית',icon:'house',target:600000,allocated:400000,monthly:2000},{id:'holiday',name:'חופשות משפחתיות',icon:'plane',target:80000,allocated:50000,monthly:400},{id:'furniture',name:'ריהוט לבית',icon:'armchair',target:40000,allocated:20000,monthly:400},{id:'child',name:'חסכון לילדה',icon:'baby',target:150000,allocated:30000,monthly:400}],deposits:{}},profileName:'משפחה לדוגמה',demo:true};
}

export const clone=v=>JSON.parse(JSON.stringify(v));
export function indexMonth(m){const [y,n]=m.split('-').map(Number);return y*12+n-1;}
export function monthAt(m,n){const i=indexMonth(m)+n;return `${Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`;}
export function monthLabel(m,long=false){return new Intl.DateTimeFormat('he-IL',{month:long?'long':'short',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-01T12:00:00Z'));}
export function currency(n){return new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:2,minimumFractionDigits:0}).format(n).replace(/[\u200e\u200f\u061c]/g,'');}
export const cents=n=>Math.round(n*100);
export function paymentFor(e,m){const i=indexMonth(m)-indexMonth(e.firstMonth);if(i<0||i>=e.payments)return 0;const total=cents(e.amount)+cents(e.fees),part=Math.floor(total/e.payments);return(part+(i===e.payments-1?total%e.payments:0))/100;}
export function forecast(p,candidate,minHorizon=0,additionalIds=[]){const all=candidate?[...p.expenses,candidate]:p.expenses;const length=Math.max(p.horizon,minHorizon,...all.map(e=>indexMonth(e.firstMonth)-indexMonth(p.startMonth)+e.payments),...(p.details??[]).map(e=>indexMonth(e.month)-indexMonth(p.startMonth)+1),...(p.loans??[]).map(e=>indexMonth(e.from)-indexMonth(p.startMonth)+e.months));let balance=cents(p.opening);return Array.from({length},(_,i)=>{const month=monthAt(p.startMonth,i),record=p.months[month],v=monthlyValues(p,month);const income=cents(v.salary)+cents(v.otherIncome),spending=budgetFields(p).filter(f=>f[2]==='expense').reduce((s,[k])=>s+cents(v[k]??0),0),saving=fields.filter(f=>f[2]==='saving').reduce((s,[k])=>s+cents(v[k]??0),0);const planned=all.reduce((s,e)=>s+(cashPlanIncludes(p,e,month,record)&&e.id!==candidate?.id&&!additionalIds.includes(e.id)?0:cents(paymentFor(e,month))*(e.kind==='income'?-1:1)),0);const pendingTransfer=pendingSavingCents(p,month);const cheque=chequesFor(p,month)+pendingTransfer;const incomingTransfers=cents(v.incomingTransfers??0),outgoingTransfers=cents(v.outgoingTransfers??0),net=income+incomingTransfers-outgoingTransfers-spending-saving-planned-cheque;balance+=net;if((record?.actual||record?.bankCoverage)&&record.cashReport)balance=cents(record.cashReport.balance)+net-cents(record.cashReport.net);return{month,income:income/100,incomingTransfers:incomingTransfers/100,outgoingTransfers:outgoingTransfers/100,spending:spending/100,saving:saving/100,planned:(planned+cheque)/100,net:net/100,balance:balance/100,actual:record?.actual??false};});}
export const lowest=rows=>rows.reduce((a,b)=>b.balance<a.balance?b:a);
export function setReportedCashBalance(p,month,balance){
 if(!monthOk(month)||month<p.startMonth||!Number.isFinite(balance)||Math.abs(balance)>100000000||cents(balance)/100!==balance)throw Error('יש להזין יתרת עו״ש תקינה, עם עד שתי ספרות אחרי הנקודה. אפשר להזין גם מינוס.');
 const next=clone(p),net=forecast(p,undefined,Math.max(p.horizon,indexMonth(month)-indexMonth(p.startMonth)+1)).find(r=>r.month===month).net+pendingSavingCents(p,month)/100;
 next.months[month]??={values:monthlyValues(p,month),actual:false,includesPlannedCard:false};
 next.months[month].cashReport={balance,net,pending:true};
 if(!validatePlan(next))throw Error('לא ניתן לעדכן את יתרת העו״ש עם הנתונים האלה.');
 return next;
}
const monthOk=m=>typeof m==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(m);
const moneyOk=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000000;
const valuesOk=v=>v&&fields.every(([k])=>moneyOk(v[k]===undefined&&['checks','loanRepayment','incomingTransfers','outgoingTransfers'].includes(k)?0:v[k]))&&Object.entries(v).every(([k,n])=>fields.some(([key])=>key===k)||/^card_[a-zA-Z0-9-]{1,70}$/.test(k)&&moneyOk(n));
function validateCorePlan(p){if(!p||!reportInboxValid(p)||!cardBillingValid(p)||!cashPlanningValid(p)||!cashLinksValid(p)||!cardsValid(p)||!loansValid(p)||!savingTransfersValid(p)||!bankImportsValid(p)||(p.setupCompleted!==undefined&&typeof p.setupCompleted!=='boolean')||!goalsValid(p)||!savingSchedulesValid(p)||!detailsValid(p)||!monthOk(p.startMonth)||!Number.isFinite(p.opening)||Math.abs(p.opening)>100000000||!moneyOk(p.buffer)||!Number.isInteger(p.horizon)||p.horizon<12||p.horizon>60||!valuesOk(p.defaults)||!Object.keys(p.defaults).every(k=>fields.some(([key])=>key===k)||creditCards(p).some(c=>c.id===k))||typeof p.demo!=='boolean'||!p.months||Array.isArray(p.months)||typeof p.months!=='object'||Object.keys(p.months).length>120||!Array.isArray(p.expenses)||p.expenses.length>200)return false;for(const [m,v] of Object.entries(p.months)){if(!monthOk(m)||!valuesOk(v?.values)||!Object.keys(v.values).every(k=>fields.some(([key])=>key===k)||creditCards(p).some(c=>c.id===k))||typeof v.actual!=='boolean'||typeof v.includesPlannedCard!=='boolean'||v.bankCoverage!==undefined&&(!v.bankCoverage||typeof v.bankCoverage.complete!=='boolean'||typeof v.bankCoverage.accountId!=='string'||v.bankCoverage.accountId.length>100||!dateOk(v.bankCoverage.from)||!dateOk(v.bankCoverage.to)||!dateOk(v.bankCoverage.date)||v.bankCoverage.accountComplete!==undefined&&typeof v.bankCoverage.accountComplete!=='boolean'||v.bankCoverage.sourceBalanceCents!==undefined&&v.bankCoverage.sourceBalanceCents!==null&&(!Number.isSafeInteger(v.bankCoverage.sourceBalanceCents)||Math.abs(v.bankCoverage.sourceBalanceCents)>10000000000))||v.includesPlannedDirect!==undefined&&typeof v.includesPlannedDirect!=='boolean'||(v.otherIncomeNote!==undefined&&(typeof v.otherIncomeNote!=='string'||v.otherIncomeNote.length>120))||(v.cashReport!==undefined&&(!v.cashReport||Array.isArray(v.cashReport)||typeof v.cashReport!=='object'||!Number.isFinite(v.cashReport.balance)||Math.abs(v.cashReport.balance)>100000000||cents(v.cashReport.balance)/100!==v.cashReport.balance||!Number.isFinite(v.cashReport.net)||Math.abs(v.cashReport.net)>100000000000||cents(v.cashReport.net)/100!==v.cashReport.net||(v.cashReport.pending!==undefined&&typeof v.cashReport.pending!=='boolean'))))return false;}const ids=new Set();for(const e of p.expenses){if(!e||typeof e.id!=='string'||!e.id||e.id.length>100||ids.has(e.id)||typeof e.name!=='string'||!e.name.trim()||e.name.length>100||!moneyOk(e.amount)||e.amount<=0||!moneyOk(e.fees)||!monthOk(e.firstMonth)||!Number.isInteger(e.payments)||e.payments<1||e.payments>60||!['card','direct'].includes(e.source)||!['expense','income'].includes(e.kind))return false;ids.add(e.id);const offset=indexMonth(e.firstMonth)-indexMonth(p.startMonth);if(offset<0||offset+e.payments>120)return false;}return true;}

export function savingSchedulesValid(p){
 if(p.savingSchedules===undefined)return true;
 if(!Array.isArray(p.savingSchedules)||p.savingSchedules.length>120)return false;
 const dates=new Set();return p.savingSchedules.every(r=>r&&monthOk(r.from)&&indexMonth(r.from)-indexMonth(p.startMonth)<120&&!dates.has(r.from)&&!!dates.add(r.from)&&moneyOk(r.personalSaving)&&moneyOk(r.sharedSaving)&&cents(r.personalSaving)/100===r.personalSaving&&cents(r.sharedSaving)/100===r.sharedSaving);
}
export function updateSavingSchedule(p,from,amounts){
 if(!monthOk(from)||from<p.startMonth||indexMonth(from)-indexMonth(p.startMonth)>=120)throw Error('יש לבחור חודש בתקופת התכנון.');
 const next=clone(p);next.savingSchedules=[...(p.savingSchedules??[]).filter(r=>r.from<from),{from,personalSaving:amounts.personalSaving,sharedSaving:amounts.sharedSaving}];
 if(!savingSchedulesValid(next))throw Error('יש לבחור חודש בתקופת התכנון וסכומים תקינים, עם עד שתי ספרות אחרי הנקודה.');
 for(const [m,r] of Object.entries(next.months))if(m>=from&&!r.actual){r.values.personalSaving=amounts.personalSaving;r.values.sharedSaving=amounts.sharedSaving;}
 if(!validatePlan(next))throw Error('לא ניתן לעדכן את ההפקדות עם הנתונים האלה.');return next;
}

export function goalsValid(p){
 if(!savingsGoalsValid(p))return false;
 if(p.profileName!==undefined&&(typeof p.profileName!=='string'||p.profileName.length>60))return false;
 if(p.goals===undefined)return true;
 return p.goals&&typeof p.goals==='object'&&!Array.isArray(p.goals)&&['saving','invest','spending','income'].every(k=>moneyOk(p.goals[k]));
}
export function progressFor(p,month){
 const record=p.months[month];
 const values=record?.values??zero();
 const totals={saving:(cents(values.personalSaving)+cents(values.sharedSaving))/100,invest:(cents(values.personalInvest)+cents(values.sharedInvest))/100,spending:budgetFields(p).filter(f=>f[2]==='expense').reduce((n,[k])=>n+cents(values[k]??0),0)/100,income:(cents(values.salary)+cents(values.otherIncome))/100};
 totals.spending=(cents(totals.spending)+chequesFor(p,month))/100;
 for(const e of p.expenses){if(e.kind==='expense'&&e.source==='card'&&record?.includesPlannedCard||e.source==='direct'&&record?.includesPlannedDirect)continue;const key=e.kind==='income'?'income':'spending';totals[key]=(cents(totals[key])+cents(paymentFor(e,month)))/100;}
 return{actual:record?.actual===true,totals};
}
// Choose evidence, never forecast defaults, for the initial Expenses period.
export function latestExpenseDataMonth(p,asOf){
 if(!monthOk(asOf))throw Error('חודש לא תקין.');
 const months=new Set(),add=month=>{if(monthOk(month)&&month>=p.startMonth&&month<=asOf)months.add(month);},expenseKeys=new Set(budgetFields(p).filter(([, ,kind])=>kind==='expense').map(([key])=>key));
 for(const row of p.details??[])if(row.status!=='cancelled')add(row.month);
 for(const [month,row]of Object.entries(p.months??{}))if(row.actual||[...expenseKeys].some(key=>(row.values?.[key]??0)!==0))add(month);
 for(const [month,accounts]of Object.entries(p.cashPlanning?.months??{}))if(Object.values(accounts).some(row=>row.actual||[...expenseKeys].some(key=>(row.values?.[key]??0)!==0)))add(month);
 for(const entry of p.bankImport?.entries??[])if(expenseKeys.has(entry.field))add(entry.month);
 for(const report of p.cardBilling?.reports??[])add(report.dueDate.slice(0,7));
 return [...months].sort().at(-1)??defaultBudgetMonth(p,asOf);
}
// Reported monthly payments exclude separate planned additions.
export function reportedMonthlySpending(p,month){
 const values=p.months[month]?.values;
 if(!values)return null;
 return budgetFields(p).filter(([, ,kind])=>kind==='expense').reduce((sum,[key])=>sum+cents(values[key]??0),0)/100;
}
export function monthlySpendingBreakdown(p,month){
 const record=p.months[month],values=monthlyValues(p,month);
 const reported=budgetFields(p).filter(([, ,kind])=>kind==='expense').map(([key,label])=>({key,label,amount:values[key]??0})).filter(row=>cents(row.amount)!==0);
 const planned=p.expenses.filter(item=>item.kind==='expense'&&!(item.source==='card'&&record?.includesPlannedCard||item.source==='direct'&&record?.includesPlannedDirect)).map(item=>({label:item.name,amount:paymentFor(item,month)})).filter(row=>cents(row.amount)!==0);
 const chequeAmount=chequesFor(p,month),cheques=chequeAmount?[{label:'צ׳קים נפרדים',amount:chequeAmount/100}]:[];
 return{reported,planned,cheques,total:(reported.reduce((sum,row)=>sum+cents(row.amount),0)+planned.reduce((sum,row)=>sum+cents(row.amount),0)+chequeAmount)/100};
}
export function monthlyExpenseFieldEvidence(p,month,key){
 if(!budgetFields(p).some(([field,,kind])=>field===key&&kind==='expense')||!monthOk(month))throw Error('שדה הוצאה או חודש לא תקין.');
 const reported=cents(p.months[month]?.values?.[key]??0),accounts=new Map((p.bankImport?.accounts??[]).map(account=>[account.id,account.label]));
 const records=(p.bankImport?.entries??[]).filter(entry=>entry.month===month&&entry.field===key).map(entry=>({date:entry.source?.date??null,description:entry.source?.description||'',beneficiary:entry.source?.beneficiary||'',account:accounts.get(entry.accountId)||'',amount:-entry.cents/100})).sort((a,b)=>Math.abs(cents(b.amount))-Math.abs(cents(a.amount))||(a.date??'').localeCompare(b.date??''));
 const imported=records.reduce((sum,row)=>sum+cents(row.amount),0);
 return{reported:reported/100,imported:imported/100,unlinked:(reported-imported)/100,records};
}
export function yearProgress(p,year,asOf){
 const months=Object.keys(p.months).filter(m=>m.startsWith(year+'-')&&m<=asOf&&p.months[m].actual);
 const totals={saving:0,invest:0,spending:0,income:0};
 for(const m of months){const row=progressFor(p,m);for(const k of Object.keys(totals))totals[k]=(cents(totals[k])+cents(row.totals[k]))/100;}
 return{months:months.sort(),totals};
}
export function achievements(p,month,asOf){
 const row=progressFor(p,month);if(!row.actual||month>asOf||p.demo)return[];
 const goals=p.goals??{};
 return Object.keys(row.totals).filter(k=>goals[k]>0&&(k==='spending'?row.totals[k]<goals[k]:row.totals[k]>=goals[k]));
}

// Preview several new purchases or replacements together without changing saved data.
export function previewScenario(p,drafts){
 const replacements=new Set(drafts.filter(d=>d.originalId).map(d=>d.originalId));
 if(replacements.size!==drafts.filter(d=>d.originalId).length||[...replacements].some(id=>!p.expenses.some(e=>e.id===id)))throw Error('פריט קיים השתנה. יש לפתוח אותו שוב לתכנון.');
 const selected=drafts.filter(d=>d.enabled!==false&&(d.amount!==0||d.originalId)).map((d,i)=>({id:d.originalId||d.id,name:d.name.trim()||`רכישה ${i+1}`,amount:d.amount,fees:d.fees,firstMonth:d.firstMonth,payments:d.payments,source:d.source??'direct',kind:'expense',...(d.cashAccountId?{cashAccountId:d.cashAccountId}:{}),...(d.cardId?{cardId:d.cardId}:{})}));
 const next={...clone(p),expenses:[...p.expenses.filter(e=>!replacements.has(e.id)),...selected]};
 if(cashAccountList(p).length&&selected.some(e=>e.cardId&&e.cashAccountId&&!cashCardsForAccount(p,e.cashAccountId,e.firstMonth).some(c=>c.id===e.cardId)))throw Error('יש לשייך את הכרטיס לחשבון המשלם בהגדרות חשבונות הבנק.');
 if(!validatePlan(next))throw Error('יש לבדוק סכומים, חודשים ומספר תשלומים (1–60). כל פריט צריך להסתיים בתוך עשר שנים מתחילת התחזית.');
 if(cashAccountList(p).length>1&&selected.some(e=>!cashAssignedItem(next,e)))throw Error('בחר חשבון משלם לכל רכישה.');
 const additionalIds=selected.filter(e=>!replacements.has(e.id)).map(e=>e.id);
 const rows=forecast(next,undefined,0,additionalIds),base=forecast(p,undefined,rows.length),length=Math.max(rows.length,base.length);
 return{plan:next,items:selected,accounts:cashAccountList(p).length?cashScenarioForecast(next,additionalIds,length):[],baseAccounts:cashAccountList(p).length?cashScenarioForecast(p,[],length):[],rows:forecast(next,undefined,length,additionalIds),base:forecast(p,undefined,length)};
}
export function scenarioAssessment(rows,asOf){
 const considered=asOf?rows.filter(r=>r.month>=asOf):rows;
 return considered.length?lowest(considered):null;
}
export function applyScenario(p,drafts,newId=()=>crypto.randomUUID()){
 return previewScenario(p,drafts.map(d=>d.originalId?d:{...d,id:newId()}));
}
export function shortestScenarioPayments(p,drafts,id,asOf){
 if(cashAccountList(p).length&&cashScenarioForecast(p).some(a=>a.rows.some(r=>r.month>=asOf&&(r.balance===null||r.issues.length))))return null;
 const target=drafts.find(d=>d.id===id);if(!target||target.enabled===false||target.amount<=0)return null;
 for(let payments=1;payments<=60;payments++){
  try{const result=previewScenario(p,drafts.map(d=>d.id===id?{...d,payments}:d));if(cashAccountList(p).length?cashScenarioSafe(result.plan,result.items.filter(e=>!drafts.some(d=>d.originalId===e.id)).map(e=>e.id),asOf):scenarioAssessment(result.rows,asOf)?.balance>=p.buffer)return payments;}catch{}
 }
 return null;
}

export function validatePlan(p){return validateCorePlan(p)&&sourceAllocationsValid(p)&&bankConsumptionReviewsValid(p)&&merchantRegistryValid(p)&&bankDetailRejectionsValid(p)&&periodReviewsValid(p)&&insightDecisionsValid(p)&&detailAnnotationsValid(p)&&bankDetailLinksValid(p)&&categoryRegistryValid(p)&&dataViewsValid(p)&&recurringDecisionsValid(p)&&periodicCostsValid(p)&&periodicSourceLinksValid(p)&&insightScenariosValid(p)&&familyReviewsValid(p)&&purchaseFamilyReviewsValid(p);}

const purchaseFamilySnapshot=row=>JSON.stringify([row.id,row.name,row.category,cents(row.amount),row.method,row.month,row.date,row.accounting,row.status]);
export function purchaseFamilyReviewsValid(p){if(p.purchaseFamilyReviews===undefined)return true;if(!Array.isArray(p.purchaseFamilyReviews)||p.purchaseFamilyReviews.length>5000)return false;const ids=new Set();return p.purchaseFamilyReviews.every(row=>row&&typeof row.detailId==='string'&&row.detailId.length>0&&row.detailId.length<=100&&!ids.has(row.detailId)&&!!ids.add(row.detailId)&&['worthwhile','review','reduce'].includes(row.status)&&typeof row.snapshot==='string'&&row.snapshot.length<=1000);}
export function purchaseFamilyReviewRows(p,month,asOf){
 if(!monthOk(month)||!monthOk(asOf)||month>=asOf||!p.months[month]?.actual)return [];
 const decisions=new Map((p.purchaseFamilyReviews??[]).map(row=>[row.detailId,row]));
 return (p.details??[]).filter(row=>row.month===month&&row.status==='cleared').map(row=>{const review=decisions.get(row.id),stale=!!review&&review.snapshot!==purchaseFamilySnapshot(row);return{...row,category:categoryRegistryEntry(p,row.category)?.label??row.category,reviewStatus:stale?'':review?.status??'',reviewStale:stale};}).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
}
export function reviewFamilyPurchase(p,id,status,asOf){
 const next=clone(p);next.purchaseFamilyReviews=(next.purchaseFamilyReviews??[]).filter(row=>row.detailId!==id);
 if(status!=='reset'){const source=p.details?.find(row=>row.id===id);if(!source||!['worthwhile','review','reduce'].includes(status)||!purchaseFamilyReviewRows(p,source.month,asOf).some(row=>row.id===id))throw Error('ניתן לסמן רק קנייה שנפרעה בחודש סגור עם דיווח בפועל.');next.purchaseFamilyReviews.push({detailId:id,status,snapshot:purchaseFamilySnapshot(source)});}
 if(!validatePlan(next))throw Error('לא ניתן לשמור את הבחירה.');return next;
}

export function familyReviewsValid(p){
 if(p.familyReviews===undefined)return true;
 if(!Array.isArray(p.familyReviews)||p.familyReviews.length>1200)return false;
 const keys=new Set();
 return p.familyReviews.every(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['month','category','status'].includes(key))||!monthOk(row.month)||row.month<p.startMonth||indexMonth(row.month)-indexMonth(p.startMonth)>=120||typeof row.category!=='string'||!row.category.trim()||row.category.length>60||!['worthwhile','review','reduce'].includes(row.status))return false;
  const key=row.month+'\u0000'+row.category;if(keys.has(key))return false;keys.add(key);return true;
 });
}
export function familyReviewMonth(p,month,asOf,excludeMonth=''){
 if(!monthOk(month)||!monthOk(asOf))throw Error('יש לבחור חודש תקין.');
 if(month<p.startMonth||month>=asOf||month===excludeMonth||p.months[month]?.actual!==true)return{available:false,month,reason:'הסקירה זמינה לחודש סגור עם דיווח בפועל בלבד.'};
 const total=reportedMonthlySpending(p,month),coverage=monthlyDataCoverage(p,month,asOf,excludeMonth);
 const categoryCents=new Map();for(const detail of analyticalExpenseDetails(p))if(detail.month===month&&detail.status==='cleared'){
  const category=categoryParent(detail.category);categoryCents.set(category,(categoryCents.get(category)??0)+cents(detail.amount));
 }
 const decisions=new Map((p.familyReviews??[]).filter(row=>row.month===month).map(row=>[row.category,row.status]));
 const categories=[...categoryCents].map(([category,amountCents])=>({category,amount:amountCents/100,status:decisions.get(category)??''})).sort((a,b)=>cents(b.amount)-cents(a.amount)||a.category.localeCompare(b.category,'he'));
 const detailedCents=categories.reduce((sum,row)=>sum+cents(row.amount),0),unreviewed=(p.familyReviews??[]).filter(row=>row.month===month&&!categoryCents.has(row.category));
 const statusCents={worthwhile:0,review:0,reduce:0,unmarked:0};for(const row of categories)statusCents[row.status||'unmarked']+=cents(row.amount);
 return {available:true,month,total,detailedCents,remainderCents:cents(total)-detailedCents,categories,statusCents,coverage,unreviewed};
}
export function setFamilyReview(p,{month,category,status,asOf,excludeMonth=''}){
 const view=familyReviewMonth(p,month,asOf,excludeMonth);
 const marked=(p.familyReviews??[]).some(row=>row.month===month&&row.category===category);
 if(!view.available||!['worthwhile','review','reduce','reset'].includes(status)||!view.categories.some(row=>row.category===category)&&!(status==='reset'&&marked))throw Error('הקטגוריה או החודש אינם זמינים לסימון.');
 const next=clone(p);next.familyReviews=(p.familyReviews??[]).filter(row=>row.month!==month||row.category!==category);
 if(status!=='reset')next.familyReviews.push({month,category,status});
 if(!validatePlan(next))throw Error('לא ניתן לשמור את הסימון.');return next;
}

function insightScenarioValid(p,row){return row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).every(key=>['id','category','monthlyReduction','startMonth','months','baseline'].includes(key))&&(row.baseline===undefined||row.baseline&&monthOk(row.baseline.month)&&Number.isSafeInteger(row.baseline.cents)&&row.baseline.cents>=0&&row.baseline.cents<=10000000000)&&typeof row.id==='string'&&row.id.length>0&&row.id.length<=100&&typeof row.category==='string'&&row.category.length<=60&&moneyOk(row.monthlyReduction)&&row.monthlyReduction>0&&row.monthlyReduction<=1000000&&cents(row.monthlyReduction)/100===row.monthlyReduction&&monthOk(row.startMonth)&&row.startMonth>=p.startMonth&&Number.isInteger(row.months)&&row.months>=1&&row.months<=24&&indexMonth(row.startMonth)-indexMonth(p.startMonth)+row.months<=120;}
export function insightScenariosValid(p){return p.insightScenarios===undefined||Array.isArray(p.insightScenarios)&&p.insightScenarios.length<=12&&new Set(p.insightScenarios.map(row=>row?.id)).size===p.insightScenarios.length&&p.insightScenarios.every(row=>insightScenarioValid(p,row));}
export function setInsightScenario(p,row){const next=clone(p),previous=p.insightScenarios?.find(saved=>saved.id===row.id),unchanged=previous&&previous.category===row.category&&previous.startMonth===row.startMonth;let saved=clone(row);delete saved.baseline;if(unchanged&&previous.baseline)saved.baseline=clone(previous.baseline);else {const month=monthAt(row.startMonth,-1),coverage=monthlyDataCoverage(p,month,row.startMonth);if(p.months[month]?.actual&&(!row.category||coverage.detail.status==='matched')){const value=row.category?categoryAmount(detailSummary(p,month).categories,row.category):reportedMonthlySpending(p,month);if(cents(value)>=0)saved.baseline={month,cents:cents(value)};}}next.insightScenarios=[...(p.insightScenarios??[]).filter(saved=>saved.id!==row.id),saved];if(!validatePlan(next))throw Error('יש לבדוק סכום, חודש התחלה ומשך בתוך תקופת התכנון.');return next;}
export function simulateInsightScenario(p,row,asOf){
 if(!insightScenarioValid(p,row)||!monthOk(asOf)||row.startMonth<=asOf)throw Error('יש לבחור סכום ותקופה עתידית תקינים.');
 const endMonth=monthAt(row.startMonth,row.months-1),base=forecast(p,undefined,indexMonth(endMonth)-indexMonth(p.startMonth)+1),reduction=cents(row.monthlyReduction),startIndex=indexMonth(row.startMonth),endIndex=indexMonth(endMonth);
 if(base.some(month=>month.month>=row.startMonth&&(month.actual||p.months[month.month]?.cashReport)))throw Error('יש דיווח או יתרת חשבון אחרי תחילת התרחיש. יש לבחור תקופה ללא עוגן חשבון מדווח.');
 let accumulated=0;const simulated=base.map(month=>{const inPeriod=indexMonth(month.month)>=startIndex&&indexMonth(month.month)<=endIndex;if(inPeriod){if(cents(month.spending)<reduction)throw Error('הצמצום גבוה מההוצאה החודשית המתוכננת.');accumulated+=reduction;}return {...month,spending:(cents(month.spending)-(inPeriod?reduction:0))/100,net:(cents(month.net)+(inPeriod?reduction:0))/100,balance:(cents(month.balance)+accumulated)/100};});
 const futureBase=base.filter(month=>month.month>=row.startMonth),futureSimulated=simulated.filter(month=>month.month>=row.startMonth),firstSpending=graphTimeline(p,{startMonth:row.startMonth,endMonth:row.startMonth,asOf,includeEstimates:true})[0].values.spending;
 return {base,simulated,totalPotentialCents:reduction*row.months,baseLow:lowest(futureBase),simulatedLow:lowest(futureSimulated),firstSpending,firstAfter:firstSpending===null?null:(cents(firstSpending)-reduction)/100,goal:p.goals?.spending??0,multipleAccounts:cashAccountList(p).length>1};
}

export function insightScenarioActuals(p,row,asOf,excludeMonth=''){
 if(!insightScenarioValid(p,row)||!monthOk(asOf))throw Error('תרחיש לא תקין.');
 if(!row.baseline)return{available:false,reason:'לא נשמר בסיס השוואה סגור בעת יצירת ההנחה. אין להסיק בדיעבד חיסכון מהתחזית.'};
 const baselineMonth=row.baseline.month,coverage=monthlyDataCoverage(p,baselineMonth,asOf);
 if(!p.months[baselineMonth]?.actual||baselineMonth===excludeMonth||(row.category&&coverage.detail.status!=='matched'))return{available:false,reason:'נתוני חודש הבסיס אינם מתאימים להשוואה.'};
 const current=row.category?categoryAmount(detailSummary(p,baselineMonth).categories,row.category):reportedMonthlySpending(p,baselineMonth);
 if(cents(current)!==row.baseline.cents)return{available:false,reason:'חודש הבסיס השתנה מאז שמירת ההנחה. יש לבדוק מחדש לפני השוואה.'};
 const months=Array.from({length:row.months},(_,i)=>monthAt(row.startMonth,i)),rows=months.filter(month=>month<asOf).map(month=>{
  const coverage=monthlyDataCoverage(p,month,asOf),eligible=p.months[month]?.actual&&month!==excludeMonth&&(!row.category||coverage.detail.status==='matched');
  const actualCents=eligible?cents(row.category?categoryAmount(detailSummary(p,month).categories,row.category):reportedMonthlySpending(p,month)):null;
  return{month,actualCents,differenceCents:actualCents===null?null:row.baseline.cents-actualCents,targetCents:row.baseline.cents-cents(row.monthlyReduction)};
 });
 return{available:true,baseline:row.baseline,rows,measuredMonths:rows.filter(row=>row.actualCents!==null).length};
}

export function periodicCostsValid(p){
 if(p.periodicCosts===undefined)return true;
 if(!Array.isArray(p.periodicCosts)||p.periodicCosts.length>50)return false;
 const ids=new Set();
 return p.periodicCosts.every(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['id','name','amount','dueMonth','repeat','paidMonths'].includes(key)))return false;
  if(typeof item.id!=='string'||!item.id||item.id.length>100||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>80||!moneyOk(item.amount)||item.amount<=0||cents(item.amount)/100!==item.amount||!monthOk(item.dueMonth)||item.dueMonth<p.startMonth||indexMonth(item.dueMonth)-indexMonth(p.startMonth)>=120||!['once','yearly'].includes(item.repeat)||!Array.isArray(item.paidMonths)||item.paidMonths.length>12||new Set(item.paidMonths).size!==item.paidMonths.length)return false;
  ids.add(item.id);
  return item.paidMonths.every(month=>monthOk(month)&&month>=item.dueMonth&&indexMonth(month)-indexMonth(p.startMonth)<120&&(item.repeat==='once'?month===item.dueMonth:(indexMonth(month)-indexMonth(item.dueMonth))%12===0));
 });
}
export function periodicCostOutlook(p,asOf){
 if(!monthOk(asOf))throw Error('יש לבחור חודש תקין.');
 const rows=(p.periodicCosts??[]).map(item=>{
  let due=item.dueMonth;
  if(item.repeat==='yearly')while(due<asOf&&item.paidMonths.includes(due))due=monthAt(due,12);
  const paid=item.paidMonths.includes(due),status=paid?'paid':due<asOf?'overdue':due===asOf?'due':'upcoming';
  const monthsLeft=Math.max(1,indexMonth(due)-indexMonth(asOf)+1);
  return {...item,nextMonth:due,status,monthlyReserveCents:status==='upcoming'||status==='due'?Math.ceil(cents(item.amount)/monthsLeft):0};
 }).sort((a,b)=>a.nextMonth.localeCompare(b.nextMonth)||a.name.localeCompare(b.name,'he'));
 return {rows,monthlyReserveCents:rows.reduce((sum,row)=>sum+row.monthlyReserveCents,0),overdueCents:rows.filter(row=>row.status==='overdue').reduce((sum,row)=>sum+cents(row.amount),0)};
}
export function setPeriodicCost(p,item){const next=clone(p);next.periodicCosts=[...(p.periodicCosts??[]).filter(row=>row.id!==item.id),item];if(!validatePlan(next))throw Error('יש לבדוק שם, סכום ומועד בטווח התכנון.');return next;}
export function markPeriodicCostPaid(p,id,month,paid,asOf){
 const next=clone(p),item=next.periodicCosts?.find(row=>row.id===id);
 if(!item||!monthOk(month)||!monthOk(asOf)||month>asOf||month<item.dueMonth||(item.repeat==='once'?month!==item.dueMonth:(indexMonth(month)-indexMonth(item.dueMonth))%12!==0))throw Error('לא ניתן לסמן תשלום למועד הזה.');
 item.paidMonths=paid?[...new Set([...item.paidMonths,month])]:item.paidMonths.filter(value=>value!==month);
 if(!validatePlan(next))throw Error('לא ניתן לשמור את הסימון.');return next;
}

// Links describe evidence only. They never mark a scheduled cost paid or post a charge.
export function periodicSourceRecord(p,type,id){return type==='detail'?(p.details??[]).find(row=>row.id===id):type==='bank'?(p.bankImport?.entries??[]).find(row=>row.key===id):type==='planned'?(p.expenses??[]).find(row=>row.id===id):null;}
export function periodicSourceSnapshot(row,type){return JSON.stringify(type==='detail'?[row.id,cents(row.amount),row.method,row.month,row.date,row.accounting,row.status]:type==='bank'?[row.key,row.cents,row.field,row.month,row.accountId,row.source?.date]:[row.id,cents(row.amount),row.firstMonth,row.payments,row.source,row.kind,row.included,cents(row.fees??0),row.cashAccountId]);}
export function periodicSourceLinkState(p,link){const cost=p.periodicCosts?.find(row=>row.id===link.costId);if(!cost||link.month<cost.dueMonth||(cost.repeat==='once'?link.month!==cost.dueMonth:(indexMonth(link.month)-indexMonth(cost.dueMonth))%12!==0))return 'stale';const row=periodicSourceRecord(p,link.type,link.sourceId);return row&&periodicSourceSnapshot(row,link.type)===link.snapshot?'confirmed':'stale';}
export function periodicSourceLinksValid(p){
 if(p.periodicSourceLinks===undefined)return true;
 if(!Array.isArray(p.periodicSourceLinks)||p.periodicSourceLinks.length>300)return false;
 const keys=new Set();return p.periodicSourceLinks.every(row=>{if(!row||typeof row.costId!=='string'||!row.costId||row.costId.length>100||!monthOk(row.month)||!['detail','bank','planned'].includes(row.type)||typeof row.sourceId!=='string'||!row.sourceId||row.sourceId.length>100||typeof row.snapshot!=='string'||row.snapshot.length>2000)return false;const key=JSON.stringify([row.costId,row.month,row.type,row.sourceId]);if(keys.has(key))return false;keys.add(key);return true;});
}
export function linkPeriodicSource(p,{costId,month,type,sourceId}){
 const item=p.periodicCosts?.find(row=>row.id===costId),source=periodicSourceRecord(p,type,sourceId);
 if(!item||!monthOk(month)||month<item.dueMonth||(item.repeat==='once'?month!==item.dueMonth:(indexMonth(month)-indexMonth(item.dueMonth))%12!==0)||!source||type==='detail'&&source.status!=='cleared'||type==='bank'&&!source.source)throw Error('יש לבחור מועד של ההוצאה ומקור מתאים. הקישור אינו אישור לתשלום.');
 const next=clone(p),link={costId,month,type,sourceId,snapshot:periodicSourceSnapshot(source,type)};
 next.periodicSourceLinks=[...(next.periodicSourceLinks??[]).filter(row=>!(row.costId===costId&&row.month===month&&row.type===type&&row.sourceId===sourceId)),link];
 if(!validatePlan(next))throw Error('לא ניתן לשמור את הקישור.');return next;
}
export function unlinkPeriodicSource(p,link){const next=clone(p);next.periodicSourceLinks=(next.periodicSourceLinks??[]).filter(row=>!(row.costId===link.costId&&row.month===link.month&&row.type===link.type&&row.sourceId===link.sourceId));return next;}

export const detailMethods=[['card1','כרטיס מזרחי / הפועלים'],['card2','כרטיס וואן זירו'],['transfers','העברה בנקאית'],['checks','צ׳ק'],['variable','הוצאות שלא שולמו בכרטיס']];
export const paymentMethods=p=>[...creditCards(p).map(c=>[c.id,c.name]),...detailMethods.filter(([k])=>!k.startsWith('card'))];
export function merchantRegistryValid(p){
 if(p.merchantRegistry===undefined)return true;
 if(!Array.isArray(p.merchantRegistry)||p.merchantRegistry.length>1000)return false;
 const ids=new Set(),aliases=new Set();return p.merchantRegistry.every(row=>{
  if(!row||typeof row.id!=='string'||!/^merchant_[a-f0-9-]{36}$/.test(row.id)||ids.has(row.id)||typeof row.label!=='string'||!row.label.trim()||row.label.length>100||!Array.isArray(row.aliases)||row.aliases.length>30)return false;ids.add(row.id);
  for(const name of [row.label,...row.aliases]){if(typeof name!=='string'||!name.trim()||name.length>100)return false;const key=recurringMerchantKey(name);if(aliases.has(key))return false;aliases.add(key);}return true;
 });
}
export function merchantDisplayName(p,name){const key=recurringMerchantKey(name);return p.merchantRegistry?.find(row=>[row.label,...row.aliases].some(alias=>recurringMerchantKey(alias)===key))?.label??name;}
export function assignMerchantDisplayName(p,sourceName,label){
 const normalized=String(label).trim();if(!normalized||normalized.length>100)throw Error('שם בית עסק צריך להכיל1–100תווים.');
 const next=clone(p),key=recurringMerchantKey(sourceName);next.merchantRegistry??=[];
 const existing=next.merchantRegistry.find(row=>[row.label,...row.aliases].some(alias=>recurringMerchantKey(alias)===key)),target=next.merchantRegistry.find(row=>recurringMerchantKey(row.label)===recurringMerchantKey(normalized));
 if(existing&&target&&existing.id!==target.id)throw Error('השם המקורי כבר שייך לקבוצה אחרת. יש לבדוק את הקבוצה לפני שינוי.');
 if(existing){if(existing.label!==normalized){existing.aliases=[...new Set([...existing.aliases,existing.label])].filter(alias=>recurringMerchantKey(alias)!==recurringMerchantKey(normalized));existing.label=normalized;}}
 else if(target){if(recurringMerchantKey(sourceName)!==recurringMerchantKey(target.label))target.aliases.push(sourceName);}
 else next.merchantRegistry.push({id:'merchant_'+crypto.randomUUID(),label:normalized,aliases:recurringMerchantKey(normalized)===key?[]:[sourceName]});
 if(!validatePlan(next))throw Error('לא ניתן לשמור את כינוי בית העסק.');return next;
}
export function resetMerchantRegistry(p){const next=clone(p);delete next.merchantRegistry;return next;}

export function periodReviewsValid(p){return p.periodReviews===undefined||Array.isArray(p.periodReviews)&&p.periodReviews.length<=120&&new Set(p.periodReviews.map(row=>row?.month)).size===p.periodReviews.length&&p.periodReviews.every(row=>row&&monthOk(row.month)&&typeof row.signature==='string'&&/^[a-f0-9]{16}$/.test(row.signature));}
// Change detector only, never a cryptographic integrity or authenticity claim.
function periodReviewSignature(p,month){
 const data=JSON.stringify([p.months[month]??null,(p.details??[]).filter(row=>row.month===month),(p.bankImport?.entries??[]).filter(row=>row.month===month),(p.bankImport?.batches??[]).filter(batch=>batch.months?.some(row=>row.month===month)),(p.cardBilling?.reports??[]).filter(row=>row.dueDate?.slice(0,7)===month),p.detailAnnotations??[],p.bankDetailLinks??[]]);
 let a=2166136261,b=2246822519;for(let i=0;i<data.length;i++){a=Math.imul(a^data.charCodeAt(i),16777619)>>>0;b=Math.imul(b^data.charCodeAt(i),3266489917)>>>0;}return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
}
export function periodReviewState(p,month){const row=p.periodReviews?.find(row=>row.month===month);return !row?'open':row.signature===periodReviewSignature(p,month)?'closed':'reopened';}
export function setPeriodReviewed(p,month,closed,asOf,excludeMonth=''){
 if(!monthOk(month)||!monthOk(asOf)||month>=asOf||!p.months[month]?.actual||month===excludeMonth)throw Error('אפשר לסגור בדיקה רק לחודש שהסתיים, דווח בפועל ואין בו עריכה חודשית פתוחה.');
 const next=clone(p);next.periodReviews=(next.periodReviews??[]).filter(row=>row.month!==month);if(closed)next.periodReviews.push({month,signature:periodReviewSignature(p,month)});
 if(!validatePlan(next))throw Error('לא ניתן לשמור את בדיקת החודש.');return next;
}
export function adoptExistingCategories(p){
 let next=clone(p);const labels=[...new Set([...analyticalExpenseDetails(p).map(row=>row.category),...Object.keys(p.categoryGoals??{})])];
 for(const label of labels)next=withRegisteredCategory(next,label);
 if(!validatePlan(next))throw Error('לא ניתן לאמץ את הקטגוריות.');return next;
}

export function insightDecisionsValid(p){return p.insightDecisions===undefined||Array.isArray(p.insightDecisions)&&p.insightDecisions.length<=120&&new Set(p.insightDecisions.map(row=>row?.key)).size===p.insightDecisions.length&&p.insightDecisions.every(row=>row&&typeof row.key==='string'&&row.key.length>0&&row.key.length<=200&&['dismissed','expected'].includes(row.status));}
export function expenseAnomalies(p,{asOf,excludeMonth='',minimum=200}={}){
 if(!monthOk(asOf)||!Number.isFinite(minimum)||minimum<0)throw Error('יש לבחור חודש וסף כספי תקינים.');
 const month=monthAt(asOf,-1),months=[-3,-2,-1].map(i=>monthAt(month,i));
 if([month,...months].some(m=>m<p.startMonth||m===excludeMonth||!p.months[m]?.actual))return{available:false,month,reason:'נדרשים חודש סגור ושלושה חודשי בסיס רצופים עם דיווח בפועל.',items:[]};
 const values=months.map(m=>cents(reportedMonthlySpending(p,m))).sort((a,b)=>a-b),baseline=values[1],actual=cents(reportedMonthlySpending(p,month)),difference=actual-baseline;
 const key=['spending-median-v1',month,baseline,actual].join(':'),decision=p.insightDecisions?.find(row=>row.key===key)?.status??null;
 const items=difference>=cents(minimum)&&difference>0&&actual>=baseline*1.2?[{key,month,baselineCents:baseline,actualCents:actual,differenceCents:difference,decision}]:[];
 return{available:true,month,months,items};
}
export function decideExpenseInsight(p,key,status){
 if(!['dismissed','expected','reset'].includes(status))throw Error('בחירה לא תקינה.');
 const next=clone(p);next.insightDecisions=(next.insightDecisions??[]).filter(row=>row.key!==key);if(status!=='reset')next.insightDecisions.push({key,status});
 if(next.insightDecisions.length>120)next.insightDecisions=next.insightDecisions.slice(-120);
 if(!validatePlan(next))throw Error('לא ניתן לשמור את הבחירה.');return next;
}

export function detailAnnotationsValid(p){
 if(p.detailAnnotations===undefined)return true;
 if(!Array.isArray(p.detailAnnotations)||p.detailAnnotations.length>5000)return false;
 const ids=new Set();return p.detailAnnotations.every(row=>{
  if(!row||typeof row.detailId!=='string'||!row.detailId||row.detailId.length>100||ids.has(row.detailId)||!Number.isSafeInteger(row.sourceCents)||Math.abs(row.sourceCents)>10000000000||!Array.isArray(row.parts)||row.parts.length<1||row.parts.length>20)return false;ids.add(row.detailId);
  return row.parts.every(part=>part&&typeof part.category==='string'&&part.category.trim().length>0&&part.category.length<=60&&Number.isSafeInteger(part.cents)&&part.cents!==0&&Math.sign(part.cents)===Math.sign(row.sourceCents)&&typeof part.person==='string'&&part.person.length<=40&&typeof part.event==='string'&&part.event.length<=60)&&row.parts.reduce((sum,part)=>sum+part.cents,0)===row.sourceCents;
 });
}
export function annotateExpenseDetail(p,detailId,parts){
 const source=p.details?.find(row=>row.id===detailId);if(!source)throw Error('הפירוט המקורי אינו זמין.');
 const next=clone(p);next.detailAnnotations=(next.detailAnnotations??[]).filter(row=>row.detailId!==detailId);
 if(parts?.length)next.detailAnnotations.push({detailId,sourceCents:cents(source.amount),parts:clone(parts)});
 if(!validatePlan(next))throw Error('החלקים חייבים להסתכם בדיוק לסכום המקורי, עם קטגוריה ותגיות תקינות.');return next;
}
// Expand only for analysis. Source purchase/cheque remains one unchanged record.
export function analyticalExpenseDetails(p){
 const annotations=new Map((p.detailAnnotations??[]).map(row=>[row.detailId,row]));
 return (p.details??[]).flatMap(row=>{
  const annotation=annotations.get(row.id);
  if(!annotation||annotation.sourceCents!==cents(row.amount))return [{...row,name:merchantDisplayName(p,row.name),sourceName:row.name,category:categoryRegistryEntry(p,row.category)?.label??row.category,sourceDetailId:row.id,annotationStale:!!annotation}];
  return annotation.parts.map((part,index)=>({...row,name:merchantDisplayName(p,row.name),sourceName:row.name,id:row.id+'#part:'+index,sourceDetailId:row.id,amount:part.cents/100,category:categoryRegistryEntry(p,part.category)?.label??part.category,person:part.person,event:part.event,split:annotation.parts.length>1}));
 });
}
export function dataViewsValid(p){
 if(p.dataViews===undefined)return true;
 if(!Array.isArray(p.dataViews)||p.dataViews.length>12)return false;
 const ids=new Set();
 return p.dataViews.every(view=>{
  if(!view||typeof view!=='object'||Array.isArray(view)||Object.keys(view).some(key=>!['id','name','count','end','category','method','query','account','dateBasis','person','event','metric','metricVersion','grouping'].includes(key)))return false;
  if(typeof view.id!=='string'||!view.id||view.id.length>100||ids.has(view.id)||typeof view.name!=='string'||!view.name.trim()||view.name.length>40)return false;
  ids.add(view.id);
  return (view.metric===undefined||['identified','detail','reported'].includes(view.metric))&&(view.metricVersion===undefined||view.metricVersion===1)&&(view.grouping===undefined||view.grouping==='category')&&(view.person===undefined||typeof view.person==='string'&&view.person.length<=40)&&(view.event===undefined||typeof view.event==='string'&&view.event.length<=60)&&(view.account===undefined||typeof view.account==='string'&&view.account.length<=100)&&(view.dateBasis===undefined||['billing','purchase'].includes(view.dateBasis))&&Number.isInteger(view.count)&&view.count>=1&&view.count<=24&&typeof view.end==='string'&&(!view.end||monthOk(view.end))&&typeof view.category==='string'&&view.category.length<=60&&typeof view.method==='string'&&view.method.length<=100&&typeof view.query==='string'&&view.query.length<=80;
 });
}
export function recurringDecisionsValid(p){
 if(p.recurringDecisions===undefined)return true;
 if(!Array.isArray(p.recurringDecisions)||p.recurringDecisions.length>100)return false;
 const keys=new Set();
 return p.recurringDecisions.every(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['merchant','name','method','status'].includes(key))||typeof row.merchant!=='string'||!row.merchant||row.merchant.length>100||typeof row.name!=='string'||!row.name.trim()||row.name.length>100||typeof row.method!=='string'||!row.method||row.method.length>100||!['confirmed','dismissed'].includes(row.status))return false;
  const key=row.method+'\u0000'+row.merchant;
  if(keys.has(key))return false;keys.add(key);return true;
 });
}
export const categoryTree={
 'מזון':['סופר ומכולת','מסעדות ובתי קפה','משלוחים'],
 'דיור':['שכר דירה ומשכנתה','חשבונות הבית','תחזוקה וריהוט'],
 'תחבורה':['דלק וטעינה','תחבורה ציבורית','מוניות','חניה וכבישי אגרה','טיפולים וביטוח רכב'],
 'בריאות':['רופאים וטיפולים','פארם','ביטוח בריאות','כושר וספורט'],
 'בילויים':['תרבות ופנאי','חופשות וטיולים','מנויים ודיגיטל'],
 'קניות':['ביגוד והנעלה','אלקטרוניקה','טיפוח וקוסמטיקה'],
 'חינוך':['מסגרות וחוגים','לימודים וקורסים','ספרים וציוד'],
 'משפחה':['ילדים ותינוקות','חיות מחמד','מתנות ואירועים'],
 'ילדים ותינוקות':['מזון ותמ״ל','תרופות ובריאות לילדים','גן ומעון','חיתולים ומוצרי טיפוח','ביגוד והנעלה לילדים','צעצועים וציוד','חוגים ופעילויות','אחר לילדים'],
 'כספים':['עמלות וריבית','ביטוחים','מסים ואגרות','תרומות'],
 'אחר':[]
};
export const detailCategories=Object.entries(categoryTree).flatMap(([parent,children])=>[parent,...children.map(child=>parent+' / '+child)]);
const categoryKey=value=>String(value??'').normalize('NFKC').trim();
export function categoryRegistryEntry(p,label){
 const key=categoryKey(label),entries=p.categoryRegistry?.entries??[];let entry=entries.find(entry=>[entry.label,...entry.aliases].some(name=>categoryKey(name)===key))??null;const seen=new Set();while(entry?.mergedInto&&!seen.has(entry.id)){seen.add(entry.id);entry=entries.find(row=>row.id===entry.mergedInto)??null;}return entry;
}
export function categoryRegistryValid(p){
 const registry=p.categoryRegistry;if(registry===undefined)return true;
 if(!registry||registry.version!==1||!Array.isArray(registry.entries)||registry.entries.length>200)return false;
 const ids=new Set(),names=new Set();
 for(const entry of registry.entries){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.id!=='string'||!/^cat_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(entry.id)||ids.has(entry.id)||typeof entry.label!=='string'||!entry.label.trim()||entry.label.length>60||!Array.isArray(entry.aliases)||entry.aliases.length>10)return false;
  if(entry.color!==undefined&&(typeof entry.color!=='string'||!/^(#[0-9a-fA-F]{6}|var\(--(accent|teal|amber|green|red)\))$/.test(entry.color))||entry.archivedAt!==undefined&&!dateOk(entry.archivedAt)||entry.mergedInto!==undefined&&typeof entry.mergedInto!=='string')return false;
  ids.add(entry.id);
  for(const name of [entry.label,...entry.aliases]){if(typeof name!=='string')return false;const key=categoryKey(name);if(!key||name.length>60||names.has(key))return false;names.add(key);}
 }
 const byId=new Map(registry.entries.map(entry=>[entry.id,entry]));
 if(!registry.entries.every(entry=>{const seen=new Set([entry.id]);let target=entry.mergedInto;while(target){if(!byId.has(target)||seen.has(target))return false;seen.add(target);target=byId.get(target).mergedInto;}return true;}))return false;
 return registry.entries.every(entry=>{const seen=new Set([entry.id]);let parent=entry.parentId;while(parent!==undefined&&parent!==null){if(!byId.has(parent)||seen.has(parent))return false;seen.add(parent);parent=byId.get(parent).parentId;}return true;});
}
// Additive registry: existing detail labels stay untouched until the user
// explicitly edits them. Aliases can later retain identity across renames.
export function withRegisteredCategory(p,label,newId=()=>crypto.randomUUID()){
 const name=categoryKey(label);if(!name||name.length>60)throw Error('שם קטגוריה לא תקין.');
 if(categoryRegistryEntry(p,name))return p;
 let next=clone(p),parentId=null;const split=name.indexOf(' / ');
 if(split>0){next=withRegisteredCategory(next,name.slice(0,split),newId);parentId=categoryRegistryEntry(next,name.slice(0,split)).id;}
 next.categoryRegistry??={version:1,entries:[]};
 next.categoryRegistry.entries.push({id:'cat_'+newId(),label:name,aliases:[],color:categoryColor(name,next),...(parentId?{parentId}:{})});
 if(!categoryRegistryValid(next))throw Error('לא ניתן לשמור את הקטגוריה.');
 return next;
}
export function renameRegisteredCategory(p,label,newLabel){
 let next=withRegisteredCategory(adoptExistingCategories(p),label);next=clone(next);
 const original=categoryRegistryEntry(next,label),old=original.label,name=categoryKey(newLabel);
 if(!name||name.length>60||name===old)return next;
 if(categoryRegistryEntry(next,name)&&categoryRegistryEntry(next,name).id!==original.id)throw Error('השם כבר משויך לקטגוריה אחרת. אין מיזוג אוטומטי.');
 // Keep the same parent; moving category trees is a separate reviewed operation.
 const parent=old.includes(' / ')?old.slice(0,old.lastIndexOf(' / ')):'';
 if((name.includes(' / ')?name.slice(0,name.lastIndexOf(' / ')):'')!==parent)throw Error('שינוי שם שומר על קטגוריית האב. יש להזין את אותו נתיב אב.');
 const mapping=new Map();for(const entry of next.categoryRegistry.entries)if(entry.label===old||entry.label.startsWith(old+' / ')){
  const before=entry.label;entry.color??=categoryColor(before,next);entry.label=name+before.slice(old.length);entry.aliases=[...entry.aliases.filter(alias=>alias!==entry.label),before];mapping.set(before,entry.label);
 }
 if(next.categoryGoals)next.categoryGoals=Object.fromEntries(Object.entries(next.categoryGoals).map(([label,value])=>[mapping.get(label)??label,value]));
 // Source labels remain exact historical evidence; analytics resolves their stable aliases.
 if(!validatePlan(next))throw Error('השם מתנגש בכינוי קיים או חורג ממגבלות הקטגוריות.');return next;
}
export function moveRegisteredCategory(p,label,parentLabel){
 let next=clone(withRegisteredCategory(withRegisteredCategory(adoptExistingCategories(p),label),parentLabel));
 const entry=categoryRegistryEntry(next,label),parent=categoryRegistryEntry(next,parentLabel),old=entry.label;
 if(entry.id===parent.id||parent.label.startsWith(old+' / '))throw Error('לא ניתן להעביר קטגוריה לתוך עצמה.');
 const name=parent.label+' / '+old.split(' / ').at(-1),mapping=new Map();
 for(const row of next.categoryRegistry.entries)if(row.label===old||row.label.startsWith(old+' / ')){const before=row.label;row.color??=categoryColor(before,next);row.label=name+before.slice(old.length);row.aliases=[...row.aliases,before];mapping.set(before,row.label);}
 entry.parentId=parent.id;
 if(next.categoryGoals)next.categoryGoals=Object.fromEntries(Object.entries(next.categoryGoals).map(([label,value])=>[mapping.get(label)??label,value]));
 if(!validatePlan(next))throw Error('ההעברה מתנגשת בשם קיים או חורגת ממגבלות הקטגוריות.');return next;
}
export function archiveRegisteredCategory(p,label,archived=true,date=new Date().toISOString().slice(0,10)){
 const next=clone(withRegisteredCategory(adoptExistingCategories(p),label)),entry=categoryRegistryEntry(next,label);
 for(const row of next.categoryRegistry.entries)if(row.id===entry.id||row.label.startsWith(entry.label+' / ')){if(archived)row.archivedAt=date;else delete row.archivedAt;}
 if(!validatePlan(next))throw Error('לא ניתן לעדכן את הארכיון.');return next;
}
export function mergeRegisteredCategories(p,sourceLabel,targetLabel){
 const next=clone(withRegisteredCategory(withRegisteredCategory(adoptExistingCategories(p),sourceLabel),targetLabel)),source=categoryRegistryEntry(next,sourceLabel),target=categoryRegistryEntry(next,targetLabel);
 if(source.id===target.id||next.categoryRegistry.entries.some(row=>row.parentId===source.id)||target.label.startsWith(source.label+' / '))throw Error('אפשר למזג קטגוריה ללא קטגוריות־משנה לתוך קטגוריה אחרת.');
 const goals=next.categoryGoals??{},sourceGoals=Object.keys(goals).filter(label=>categoryRegistryEntry(next,label)?.id===source.id),targetGoals=Object.keys(goals).filter(label=>categoryRegistryEntry(next,label)?.id===target.id);
 if(sourceGoals.length&&targetGoals.length)throw Error('יש להסיר או לאחד במפורש את תקרות הקטגוריות לפני המיזוג.');
 for(const label of sourceGoals){Object.defineProperty(goals,target.label,{value:goals[label],writable:true,enumerable:true,configurable:true});delete goals[label];}
 source.mergedInto=target.id;source.archivedAt=new Date().toISOString().slice(0,10);
 if(!validatePlan(next))throw Error('לא ניתן למזג את הקטגוריות.');return next;
}
// A bank category is source metadata, not another budget charge. Only a
// source-backed direct debit can be classified; card settlement and transfers
// remain outside purchase categories.
export function assignBankMovementCategory(p,key,label){
 const entry=p.bankImport?.entries?.find(row=>row.key===key);
 if(!entry||!entry.source||!['variable','checks'].includes(entry.field)||entry.cents===0)throw Error('אפשר לסווג רק תשלום או זיכוי ישיר מזוהה בדוח הבנק.');
 const category=categoryKey(label);if(category&&!detailCategories.includes(category)&&!categoryRegistryEntry(p,category))throw Error('יש לבחור קטגוריה קיימת.');
 let next=category?withRegisteredCategory(p,category):clone(p);
 const target=next.bankImport.entries.find(row=>row.key===key);
 if(category)target.bankCategoryId=categoryRegistryEntry(next,category).id;else delete target.bankCategoryId;
 if(!validatePlan(next))throw Error('לא ניתן לשמור את שיוך התנועה.');return next;
}
export function bankCategoryCoverage(p,month){
 if(!monthOk(month))throw Error('יש לבחור חודש תקין.');
 const candidates=(p.bankImport?.entries??[]).filter(entry=>entry.month===month&&entry.source&&['variable','checks'].includes(entry.field)&&entry.cents<0);
 const registered=new Map((p.categoryRegistry?.entries??[]).map(entry=>[entry.id,entry.label])),amounts=new Map();let categorizedCents=0;
 for(const entry of candidates)if(entry.bankCategoryId&&registered.has(entry.bankCategoryId)){categorizedCents-=entry.cents;amounts.set(entry.bankCategoryId,(amounts.get(entry.bankCategoryId)??0)-entry.cents);}
 const totalCents=candidates.reduce((sum,entry)=>sum-entry.cents,0);
 return {month,count:candidates.length,categorizedCount:candidates.filter(entry=>entry.bankCategoryId&&registered.has(entry.bankCategoryId)).length,totalCents,categorizedCents,unclassifiedCents:totalCents-categorizedCents,categories:[...amounts].map(([id,cents])=>({id,label:registered.get(id),cents})).sort((a,b)=>b.cents-a.cents)};
}
// Evidence only: amount and nearby dates may match an existing direct detail,
// but cannot establish identity. Never merge or post a charge from this hint.
export function possibleBankDetailMatches(p,entry){
 if(!entry?.source?.date||!['variable','checks'].includes(entry.field)||entry.cents>=0)return [];
 const booked=Date.parse(entry.source.date+'T12:00:00Z');if(!Number.isFinite(booked))return [];
 return (p.details??[]).filter(detail=>detail.status==='cleared'&&detail.accounting==='included'&&detail.method===entry.field&&cents(detail.amount)===-entry.cents&&(!detail.cashAccountId||detail.cashAccountId===entry.accountId)&&Math.abs(Date.parse(detail.date+'T12:00:00Z')-booked)<=7*86400000).filter(detail=>!(p.bankDetailRejections??[]).some(rejected=>rejected.bankKey===entry.key&&rejected.detailId===detail.id&&rejected.bankSnapshot===bankLinkSnapshot(entry)&&rejected.detailSnapshot===detailLinkSnapshot(detail))).map(detail=>({id:detail.id,name:detail.name,date:detail.date,category:detail.category})).slice(0,3);
}
// Explicit evidence links only. Source and detail snapshots invalidate changed matches
// without preventing a user from editing/deleting an original record.
export function bankDetailRejectionsValid(p){
 if(p.bankDetailRejections===undefined)return true;
 const seen=new Set();return Array.isArray(p.bankDetailRejections)&&p.bankDetailRejections.length<=5000&&p.bankDetailRejections.every(row=>{
  const key=JSON.stringify([row?.bankKey,row?.detailId]);if(!row||typeof row.bankKey!=='string'||!/^[a-f0-9]{64}$/.test(row.bankKey)||typeof row.detailId!=='string'||!row.detailId||row.detailId.length>100||typeof row.bankSnapshot!=='string'||row.bankSnapshot.length>1000||typeof row.detailSnapshot!=='string'||row.detailSnapshot.length>1000||seen.has(key))return false;seen.add(key);return true;
 });
}
export function rejectBankDetailMatch(p,key,detailId){
 const entry=p.bankImport?.entries?.find(row=>row.key===key),detail=p.details?.find(row=>row.id===detailId);
 if(!bankDetailLinkEligible(entry,detail))throw Error('המקורות כבר אינם מתאימים למועמדות הזו.');
 const next=clone(p);next.bankDetailRejections=(next.bankDetailRejections??[]).filter(row=>row.bankKey!==key||row.detailId!==detailId);
 next.bankDetailRejections.push({bankKey:key,detailId,bankSnapshot:bankLinkSnapshot(entry),detailSnapshot:detailLinkSnapshot(detail)});
 if(!validatePlan(next))throw Error('לא ניתן לשמור דחיית התאמה.');return next;
}
export function resetBankDetailRejections(p){const next=clone(p);delete next.bankDetailRejections;return next;}
export function bankDetailLinksValid(p){
 if(p.bankDetailLinks===undefined)return true;
 if(!Array.isArray(p.bankDetailLinks)||p.bankDetailLinks.length>5000)return false;
 const banks=new Set(),details=new Set();
 return p.bankDetailLinks.every(link=>link&&typeof link.bankKey==='string'&&/^[a-f0-9]{64}$/.test(link.bankKey)&&typeof link.detailId==='string'&&link.detailId.length>0&&link.detailId.length<=100&&!banks.has(link.bankKey)&&!!banks.add(link.bankKey)&&!details.has(link.detailId)&&!!details.add(link.detailId)&&typeof link.bankSnapshot==='string'&&link.bankSnapshot.length<=1000&&typeof link.detailSnapshot==='string'&&link.detailSnapshot.length<=1000);
}
const bankLinkSnapshot=entry=>JSON.stringify([entry.key,entry.cents,entry.month,entry.field,entry.accountId,entry.source?.date,entry.fingerprint]);
const detailLinkSnapshot=detail=>JSON.stringify([detail.id,cents(detail.amount),detail.month,detail.method,detail.date,detail.cashAccountId??'',detail.accounting,detail.status]);
function bankDetailLinkEligible(entry,detail){
 if(!entry?.source?.date||!detail||!['variable','checks'].includes(entry.field)||entry.cents>=0)return false;
 return detail.status==='cleared'&&detail.accounting==='included'&&detail.month===entry.month&&detail.method===entry.field&&cents(detail.amount)===-entry.cents&&(!detail.cashAccountId||detail.cashAccountId===entry.accountId)&&Math.abs(Date.parse(detail.date+'T12:00:00Z')-Date.parse(entry.source.date+'T12:00:00Z'))<=7*86400000;
}
export function bankDetailLinkState(p,key){
 const link=p.bankDetailLinks?.find(row=>row.bankKey===key);if(!link)return{status:'none'};
 const entry=p.bankImport?.entries?.find(row=>row.key===key),detail=p.details?.find(row=>row.id===link.detailId);
 const current=bankDetailLinkEligible(entry,detail)&&bankLinkSnapshot(entry)===link.bankSnapshot&&detailLinkSnapshot(detail)===link.detailSnapshot;
 return{status:current?'confirmed':'stale',detailId:link.detailId,detailName:detail?.name??'פירוט שנמחק'};
}
export function setBankDetailLink(p,key,detailId){
 const next=clone(p);next.bankDetailLinks=(next.bankDetailLinks??[]).filter(row=>row.bankKey!==key);if(next.bankConsumptionReviews)next.bankConsumptionReviews=next.bankConsumptionReviews.filter(row=>row.key!==key);
 if(detailId){
  const entry=p.bankImport?.entries?.find(row=>row.key===key),detail=p.details?.find(row=>row.id===detailId);
  if(!bankDetailLinkEligible(entry,detail))throw Error('אפשר לאשר רק תשלום בנק ופירוט ישיר שנפרע באותו חודש, באותו סכום ובתאריכים סמוכים.');
  if(next.bankDetailLinks.some(row=>row.detailId===detailId))throw Error('הפירוט כבר מקושר לתשלום בנק אחר. בטלו קודם את ההתאמה הקודמת.');
  next.bankDetailLinks.push({bankKey:key,detailId,bankSnapshot:bankLinkSnapshot(entry),detailSnapshot:detailLinkSnapshot(detail)});
 }
 if(!validatePlan(next))throw Error('לא ניתן לשמור את ההתאמה.');return next;
}
export const categoryParent=category=>category.split(' / ')[0];
// One deterministic palette shared by every category view, independent of rank.
export function categoryColor(category,p=null){
 const registered=p&&categoryRegistryEntry(p,category);if(registered?.color)return registered.color;
 const parent=categoryParent(category),keys=['מזון','דיור','תחבורה','בריאות','בילויים','קניות','חינוך','משפחה','כספים','אחר','ילדים ותינוקות'],palette=['var(--accent)','var(--teal)','var(--amber)','var(--green)','var(--red)','#647acb','#b76b89','#558982','#957348','#81858f','#bd713d'];
 const index=keys.indexOf(parent);let hash=0;for(const char of parent)hash=(hash*31+char.codePointAt(0))>>>0;return palette[index<0?hash%palette.length:index];
}
export const categoryContains=(parent,category)=>category===parent||category.startsWith(parent+' / ');
export function categoryRollup(categories){const result=new Map();for(const row of categories){const parent=categoryParent(row.category);if(!result.has(parent))result.set(parent,{category:parent,amount:0,children:[]});const group=result.get(parent);group.amount+=cents(row.amount);group.children.push(row);}return [...result.values()].map(row=>({...row,amount:row.amount/100})).sort((a,b)=>b.amount-a.amount);}
export const categoryAmount=(categories,category)=>categories.filter(c=>categoryContains(category,c.category)).reduce((n,c)=>n+cents(c.amount),0)/100;
export const additionalCheque=e=>e.method==='checks'&&e.accounting==='additional'&&e.status!=='cancelled';
export const chequesFor=(p,m)=>(p.details??[]).filter(e=>e.month===m&&additionalCheque(e)).reduce((n,e)=>n+cents(e.amount),0);
const dateOk=d=>typeof d==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d)&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
export function detailsValid(p){
 if(p.showDetails!==undefined&&typeof p.showDetails!=='boolean')return false;
 if(p.categoryGoals!==undefined&&(!p.categoryGoals||Array.isArray(p.categoryGoals)||typeof p.categoryGoals!=='object'||Object.keys(p.categoryGoals).length>50||Object.entries(p.categoryGoals).some(([k,v])=>!k.trim()||k.length>60||!moneyOk(v))))return false;
 if(p.details===undefined)return true;
 if(!Array.isArray(p.details)||p.details.length>5000||!monthOk(p.startMonth))return false;
 const ids=new Set();
 for(const e of p.details){
  const statement=e?.statement,statementOk=statement&&['cal','isracard'].includes(statement.issuer)&&dateOk(statement.dueDate)&&statement.dueDate.slice(0,7)===e.month&&typeof statement.key==='string'&&/^[a-f0-9]{64}$/.test(statement.key)&&e.id===statement.issuer+'-'+statement.key&&Number.isSafeInteger(statement.originalCents)&&Math.abs(statement.originalCents)<=10000000000&&creditCards(p).some(c=>c.id===e.method)&&e.accounting==='included'&&e.status==='cleared';
  if(e?.refund===true&&!(e.method==='variable'&&e.accounting==='included'&&e.status==='cleared'&&e.amount<0))return false;
  if(statement!==undefined&&(!statementOk||statement.notes!==undefined&&(typeof statement.notes!=='string'||statement.notes.length>2000)||statement.originalCurrency!==undefined&&!['ILS','EUR','USD','GBP'].includes(statement.originalCurrency)||statement.foreignCents!==undefined&&(!['EUR','USD','GBP'].includes(statement.originalCurrency)||!Number.isSafeInteger(statement.foreignCents)||Math.abs(statement.foreignCents)>10000000000)||statement.page!==undefined&&(!Number.isInteger(statement.page)||statement.page<1||statement.page>20)))return false;
  if(!e||typeof e.id!=='string'||!e.id||e.id.length>100||ids.has(e.id)||typeof e.name!=='string'||!e.name.trim()||e.name.length>100||typeof e.category!=='string'||!e.category.trim()||e.category.length>60||(e.refund!==undefined&&typeof e.refund!=='boolean')||!(statementOk||e.refund===true&&e.method==='variable'&&e.accounting==='included'&&e.status==='cleared'&&e.amount<0?Number.isFinite(e.amount)&&Math.abs(e.amount)<=100000000&&cents(e.amount)/100===e.amount:moneyOk(e.amount)&&e.amount>0)||!monthOk(e.month)||!dateOk(e.date)||!paymentMethods(p).some(([k])=>k===e.method)||!['included','additional'].includes(e.accounting)||!['pending','cleared','cancelled'].includes(e.status)||typeof e.number!=='string'||e.number.length>40)return false;
  const offset=indexMonth(e.month)-indexMonth(p.startMonth);
  if(offset<0||offset>=120||(e.accounting==='additional'&&e.method!=='checks')||(e.method==='checks'&&e.date.slice(0,7)!==e.month))return false;
  ids.add(e.id);
 }
 return true;
}
export function detailSummary(p,m){
 const rows=(p.details??[]).filter(e=>e.month===m&&e.status!=='cancelled'),values=monthlyValues(p,m);
 const groups=paymentMethods(p).filter(([k])=>k!=='transfers').map(([method,label])=>{
  const entries=rows.filter(e=>e.method===method||method==='variable'&&e.method==='transfers'),report=p.cardBilling?.reports.filter(r=>r.cardId===method&&r.dueDate.slice(0,7)===m).sort((a,b)=>b.dueDate.localeCompare(a.dueDate))[0],included=entries.filter(e=>e.accounting==='included').reduce((n,e)=>n+cents(e.amount),0),total=report?cents(report.amount):method==='variable'?cents(offCardTotal(values)):cents(values[method]??0),extra=entries.filter(additionalCheque).reduce((n,e)=>n+cents(e.amount),0);
  return{method,label,total:total/100,included:included/100,extra:extra/100,unexplained:Math.max(0,total-included)/100,over:Math.max(0,included-total)/100,entries};
 });
 const categories=new Map();
 for(const e of analyticalExpenseDetails(p).filter(e=>e.month===m&&e.status!=='cancelled'))categories.set(e.category,(categories.get(e.category)??0)+cents(e.amount));
 const planned=p.expenses.filter(e=>e.kind==='expense'&&!(p.months[m]?.includesPlannedCard&&e.source==='card')).reduce((n,e)=>n+cents(paymentFor(e,m)),0)/100;
 return{groups,categories:[...categories].map(([category,amount])=>({category,amount:amount/100})).sort((a,b)=>b.amount-a.amount),unexplained:(groups.reduce((n,g)=>n+cents(g.unexplained),0)+cents(planned))/100,over:groups.some(g=>g.over>0),recorded:rows.reduce((n,e)=>n+cents(e.amount),0)/100,total:(groups.reduce((n,g)=>n+cents(g.total)+cents(g.extra),0)+cents(planned))/100,planned,hasDetails:rows.length>0};
}

// Category charts explain monthly payment totals; they never feed the forecast.
export function categoryMonths(p,m,category='',count=6,asOf=m){
 const first=Math.max(0,indexMonth(m)-indexMonth(p.startMonth)-count+1);
 const last=indexMonth(m)-indexMonth(p.startMonth);
 return Array.from({length:Math.max(0,last-first+1)},(_,i)=>{
  const month=monthAt(p.startMonth,first+i),summary=detailSummary(p,month);
  const amount=category?(categoryAmount(summary.categories,category)):summary.recorded;
  const actual=p.months[month]?.actual===true&&month<=asOf&&!p.demo;
  const pending=(p.details??[]).some(e=>e.month===month&&e.method==='checks'&&e.status==='pending');
  return{month,amount,hasDetails:summary.hasDetails,actual,complete:actual&&summary.unexplained===0&&!summary.over&&!pending,unexplained:summary.unexplained,over:summary.over};
 });
}
export function categoryGoalProgress(p,m,category,asOf){
 const summary=detailSummary(p,m),amount=categoryAmount(summary.categories,category);
 const target=Object.hasOwn(p.categoryGoals??{},category)?p.categoryGoals[category]:0;
 const pending=(p.details??[]).some(e=>e.month===m&&e.method==='checks'&&e.status==='pending');
 const confirmed=p.demo===false&&m<=asOf&&p.months[m]?.actual===true&&summary.unexplained===0&&!summary.over&&!pending;
 return{amount,target,remaining:Math.max(0,target-amount),exceeded:target>0&&amount>target,confirmed,withinTarget:confirmed&&target>0&&amount<=target};
}

// Savings allocations share the same validated model on the server and client.
export const savingsIllustrations=['house','plane','armchair','baby','trophy','party-popper','car','safety-fund','business'];
const sgCents=n=>Math.round(n*100);
const sgMoney=n=>Number.isFinite(n)&&n>=0&&n<=100000000;
const sgDate=d=>typeof d==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const sgMonth=m=>typeof m==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(m);
export function savingsGoalsValid(p){
 const s=p?.savingsGoals;if(s===undefined)return true;
 if(!s||!sgMoney(s.balance)||!sgMonth(s.snapshotMonth)||!Array.isArray(s.items)||s.items.length>20||!s.deposits||typeof s.deposits!=='object'||Array.isArray(s.deposits)||Object.keys(s.deposits).length>120)return false;
 if(s.accountsAsOf!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(s.accountsAsOf)||s.accountsAsOf.slice(0,7)!==s.accountsMonth||!Number.isFinite(Date.parse(s.accountsAsOf))||new Date(s.accountsAsOf+'T00:00:00Z').toISOString().slice(0,10)!==s.accountsAsOf))return false;
 if(s.accountsCovered!==undefined&&!sgMoney(s.accountsCovered))return false;
 if(s.accounts!==undefined){if(!savingsAccountsValid(s.accounts)||!sgMonth(s.accountsMonth)||s.accountsMonth>s.snapshotMonth||!Number.isFinite(s.accountsAdjustment)||Math.abs(s.accountsAdjustment)>100000000||sgCents(s.balance)!==s.accounts.reduce((n,a)=>n+sgCents(a.balance),0)+sgCents(s.accountsAdjustment))return false;}
 const ids=new Set();let allocated=0;
 for(const g of s.items)if(g?.fundingAccountIds!==undefined){const links=g.fundingAccountIds;if(!Array.isArray(links)||links.length>10||new Set(links).size!==links.length||links.some(id=>typeof id!=='string'||!cashAccountList(p).some(a=>a.id===id)))return false;}
 for(const g of s.items){if(!g||typeof g.id!=='string'||!g.id||g.id.length>100||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>80||!savingsIllustrations.includes(g.icon)||!sgMoney(g.target)||g.target===0||!sgMoney(g.allocated)||!sgMoney(g.monthly)||(g.deadline!==undefined&&!sgDate(g.deadline)))return false;ids.add(g.id);allocated+=sgCents(g.allocated);}
 if(allocated>sgCents(s.balance))return false;
 if(s.covered!==undefined&&(!s.covered||typeof s.covered!=='object'||Array.isArray(s.covered)||Object.entries(s.covered).some(([id,n])=>!ids.has(id)||!sgMoney(n))))return false;
 for(const [m,entries] of Object.entries(s.deposits)){if(!sgMonth(m)||!entries||typeof entries!=='object'||Array.isArray(entries)||Object.keys(entries).length>20)return false;let total=0;for(const [id,n]of Object.entries(entries)){if(!ids.has(id)||!sgMoney(n))return false;total+=sgCents(n);}const v=p.months?.[m]?.values??p.defaults;if(!v||total>sgCents(v.personalSaving)+sgCents(v.sharedSaving))return false;}
 if(s.poolDeposits!==undefined){if(!s.poolDeposits||typeof s.poolDeposits!=='object'||Array.isArray(s.poolDeposits)||Object.keys(s.poolDeposits).length>120)return false;for(const [m,n] of Object.entries(s.poolDeposits)){const v=p.months?.[m]?.values??p.defaults,assigned=Object.values(s.deposits[m]??{}).reduce((a,n)=>a+sgCents(n),0);if(!sgMonth(m)||!sgMoney(n)||sgCents(n)!==sgCents(v.personalSaving)+sgCents(v.sharedSaving)||sgCents(n)<assigned)return false;}}
 if(s.coveredPool!==undefined&&!sgMoney(s.coveredPool))return false;
 const funded=savingsBalances(p,'2099-12');return funded.balance>=0&&funded.free>=0&&funded.items.every(g=>g.current>=0);
}
// Funding intent is metadata within this budget, never an allocation of cash.
export function savingsFundingAccounts(p,goal){
 const selected=new Set(goal?.fundingAccountIds??[]);
 return cashAccountList(p).filter(account=>selected.has(account.id));
}
export function setSavingsGoalFunding(p,goalId,accountIds){
 const next=clone(p),goal=next.savingsGoals?.items.find(item=>item.id===goalId);
 if(!goal)throw Error('המטרה לא נמצאה במרחב הזה.');
 if(!Array.isArray(accountIds)||accountIds.length>10||new Set(accountIds).size!==accountIds.length||accountIds.some(id=>typeof id!=='string'||!cashAccountList(p).some(account=>account.id===id)))throw Error('יש לבחור חשבונות שקיימים במרחב של המטרה.');
 if(accountIds.length)goal.fundingAccountIds=[...accountIds];else delete goal.fundingAccountIds;
 if(!validatePlan(next))throw Error('יש לבדוק את פרטי המטרה לפני השמירה.');
 return next;
}
export function savingsBalances(p,asOf){
 const s=p.savingsGoals;if(!s)return {balance:0,free:0,items:[]};
 let balance=sgCents(s.balance);const items=s.items.map(g=>({...g,current:sgCents(g.allocated)}));
 for(const [m,entries]of Object.entries(s.deposits)){if(m<s.snapshotMonth||m>asOf)continue;for(const g of items){const n=sgCents(entries[g.id]??0)-(m===s.snapshotMonth?sgCents(s.covered?.[g.id]??0):0);g.current+=n;balance+=n;}}
 for(const [m,n] of Object.entries(s.poolDeposits??{})){if(m<s.snapshotMonth||m>asOf)continue;const assigned=Object.values(s.deposits[m]??{}).reduce((a,n)=>a+sgCents(n),0);balance+=sgCents(n)-assigned-(m===s.snapshotMonth?sgCents(s.coveredPool??0):0);}
 const allocated=items.reduce((n,g)=>n+g.current,0);
 return {balance:balance/100,free:(balance-allocated)/100,items:items.map(g=>({...g,current:g.current/100}))};
}
export function savingsProjection(current,target,thisMonth,future,month,alreadyDeposited=false){
 if(current>=target)return {count:0,futureCount:0,month:null};
 const remaining=sgCents(target)-sgCents(current)-sgCents(thisMonth),n=sgCents(future);
 if(remaining<=0)return {count:alreadyDeposited?0:1,futureCount:0,month};
 if(n<=0)return null;
 const futureCount=Math.ceil(remaining/n),offset=futureCount;
 const [year,m]=month.split('-').map(Number),date=new Date(Date.UTC(year,m-1+offset,1));
 return {count:futureCount+(!alreadyDeposited&&thisMonth>0?1:0),futureCount,month:Number.isFinite(date.getTime())&&date.getUTCFullYear()<=2099?date.toISOString().slice(0,7):null};
}
export function applySavingsDeposit(p,id,month,amount,asOf){
 const s=p.savingsGoals,g=s?.items.find(g=>g.id===id);
 if(!g||!sgMoney(amount)||!sgMonth(month)||month>asOf||month<s.snapshotMonth||month<p.startMonth)throw Error('אפשר לאשר רק הפקדה מחודש שהגיע, החל מחודש יתרת החסכון.');
 const next=clone(p);next.savingsGoals.deposits[month]??={};next.savingsGoals.deposits[month][id]=amount;
 const total=Object.values(next.savingsGoals.deposits[month]).reduce((a,n)=>a+sgCents(n),0);
 const record=next.months[month]??={values:clone(next.defaults),actual:false,includesPlannedCard:false};next.months[month]=record;
 // Existing card/cheque and saving totals already include deposits. Only raise
 // the saving total when the sum assigned to goals exceeds that total.
 const budgetTotal=sgCents(record.values.personalSaving)+sgCents(record.values.sharedSaving);
 if(total>budgetTotal)record.values.personalSaving=(sgCents(record.values.personalSaving)+total-budgetTotal)/100;
 if(!savingsGoalsValid(next)||savingsBalances(next,asOf).items.some(g=>g.current<0))throw Error('ההפקדה חורגת מהסכומים האפשריים. יש לעדכן את החלוקה קודם.');
 return next;
}
export function applySavingsRate(p,id,amount,asOf){
 if(!sgMoney(amount))throw Error('יש להזין סכום חודשי תקין.');const next=clone(p),g=next.savingsGoals?.items.find(g=>g.id===id);if(!g)throw Error('המטרה אינה קיימת.');
 const delta=sgCents(amount)-sgCents(g.monthly);g.monthly=amount;
 const adjust=v=>{const total=Math.max(0,sgCents(v.personalSaving)+sgCents(v.sharedSaving)+delta),shared=Math.min(sgCents(v.sharedSaving),total);v.sharedSaving=shared/100;v.personalSaving=(total-shared)/100;};
 adjust(next.defaults);for(const [m,r]of Object.entries(next.months)){if(m>asOf&&!r.actual)adjust(r.values);}
 if(!savingsGoalsValid(next))throw Error('הקצב מתנגש בהפקדות שכבר אושרו.');return next;
}
export function reallocateSavings(p,values,asOf){
 const balances=savingsBalances(p,asOf),next=clone(p);if(values.length!==balances.items.length||values.some(n=>!sgMoney(n))||values.reduce((n,v)=>n+sgCents(v),0)>sgCents(balances.balance))throw Error('החלוקה חורגת מהיתרה בחסכון.');
 // The current-month ledger remains editable; covered amounts are already
 // included in this snapshot, so later confirmations contribute only a delta.
 next.savingsGoals.snapshotMonth=asOf;next.savingsGoals.covered=clone(next.savingsGoals.deposits[asOf]??{});next.savingsGoals.coveredPool=next.savingsGoals.poolDeposits?.[asOf]===undefined?0:Math.max(0,sgCents(next.savingsGoals.poolDeposits[asOf])-Object.values(next.savingsGoals.deposits[asOf]??{}).reduce((a,n)=>a+sgCents(n),0))/100;next.savingsGoals.balance=balances.balance;if(next.savingsGoals.accounts)next.savingsGoals.accountsAdjustment=(sgCents(balances.balance)-next.savingsGoals.accounts.reduce((n,a)=>n+sgCents(a.balance),0))/100;next.savingsGoals.items.forEach((g,i)=>g.allocated=values[i]);return next;
}

export function allocateFreeSavings(p,amounts,asOf){
 const pool=savingsBalances(p,asOf);
 if(Object.keys(amounts).some(id=>!pool.items.some(g=>g.id===id))||Object.values(amounts).some(n=>!sgMoney(n))||Object.values(amounts).reduce((n,v)=>n+sgCents(v),0)>sgCents(pool.free))throw Error('החלוקה חורגת מהכסף הפנוי.');
 return reallocateSavings(p,pool.items.map(g=>(sgCents(g.current)+sgCents(amounts[g.id]??0))/100),asOf);
}
export function newlyAvailableSavings(before,after,asOf){
 if(!before?.savingsGoals||!after.savingsGoals)return 0;
 const confirmed=Object.entries(after.savingsGoals.poolDeposits??{}).filter(([m])=>m<=asOf&&after.months[m]?.actual).reduce((n,[m,v])=>n+Math.max(0,sgCents(v)-sgCents(before.savingsGoals.poolDeposits?.[m]??0)),0);
 return Math.max(0,Math.min(confirmed,sgCents(savingsBalances(after,asOf).free)-sgCents(savingsBalances(before,asOf).free)))/100;
}

// Positive RTL range positions move money to the lower card (left); negative
// positions move money to the upper card (right). Zero is always the midpoint.
export function previewSavingsTransfer(p,topId,bottomId,position,asOf){
 if(!p.savingsGoals||!sgMonth(asOf)||asOf<p.savingsGoals.snapshotMonth||!Number.isInteger(position)||Math.abs(position)>1000||topId===bottomId)throw Error('יש לבחור שתי מטרות שונות וסכום תקין.');
 const pool=savingsBalances(p,asOf),items=[...pool.items,{id:'',name:'כסף ללא שיוך',current:pool.free,target:0,monthly:0,icon:null}],top=items.find(g=>g.id===topId),bottom=items.find(g=>g.id===bottomId);
 if(!top||!bottom)throw Error('המטרה השתנתה. יש לפתוח את החלוקה מחדש.');
 const source=position<0?bottom:top,amount=Math.round(sgCents(source.current)*position/1000);
 return {balance:pool.balance,amount:amount/100,top:{...top,after:(sgCents(top.current)-amount)/100},bottom:{...bottom,after:(sgCents(bottom.current)+amount)/100},items:pool.items};
}
export function applySavingsTransfer(p,topId,bottomId,position,asOf){
 const trial=previewSavingsTransfer(p,topId,bottomId,position,asOf);
 return reallocateSavings(p,trial.items.map(g=>g.id===topId?trial.top.after:g.id===bottomId?trial.bottom.after:g.current),asOf);
}

// Confirm one combined monthly saving amount. Legacy goal deposits explain part
// of it; only the remainder enters unallocated cash. Reconfirmation replaces it.
export function confirmMonthlySavings(p,month,asOf,remove=false){
 const s=p.savingsGoals;if(!s)return clone(p);
 if(!sgMonth(month)||month>asOf||month<p.startMonth)throw Error('אפשר לדווח החל מחודש יתרת החסכון ועד החודש הנוכחי.');
 const next=clone(p);next.months[month]??={values:clone(next.defaults),actual:false,includesPlannedCard:false};const v=next.months[month].values;next.savingsGoals.poolDeposits??={};
 if(remove)delete next.savingsGoals.poolDeposits[month];else next.savingsGoals.poolDeposits[month]=(sgCents(v.personalSaving)+sgCents(v.sharedSaving))/100;
 if(!savingsGoalsValid(next))throw Error('הסכום כבר הוקצה למטרות. יש לשחרר כסף בחלוקה בין המטרות לפני הקטנת החסכון החודשי.');return next;
}

// A confirmed additional transfer reduces cash once and funds the same monthly ledger.
export function reportAdditionalSavings(p,month,personal,shared,asOf){
 if(!monthOk(month)||month>asOf||!p.months[month]?.actual)throw Error('יש לשמור תחילה דיווח בפועל לחודש הזה.');
 if(!p.months[month].cashReport||p.months[month].cashReport.pending)throw Error('יש להזין ולשמור תחילה את יתרת העו״ש בפועל מהבנק.');
 if(!p.savingsGoals||month<p.savingsGoals.snapshotMonth)throw Error('יש להגדיר את יתרת החיסכון לפני דיווח על הפקדה נוספת.');
 if(!moneyOk(personal)||!moneyOk(shared)||cents(personal)/100!==personal||cents(shared)/100!==shared)throw Error('יש להזין סכומים תקינים לחיסכון, עם עד שתי ספרות אחרי הנקודה.');
 const amount=cents(personal)+cents(shared),row=forecast(p,undefined,Math.max(p.horizon,indexMonth(month)-indexMonth(p.startMonth)+1)).find(r=>r.month===month),available=Math.max(0,cents(row?.balance??0)-cents(p.buffer));
 if(!amount||amount>available)throw Error('ההפקדה צריכה להיות גדולה מאפס ובגבול היתרה הפנויה מעבר ליתרת הביטחון.');
 const next=clone(p),values=next.months[month].values;
 values.personalSaving=(cents(values.personalSaving)+cents(personal))/100;
 values.sharedSaving=(cents(values.sharedSaving)+cents(shared))/100;
 // This is a one-time transfer. Retain each later month's existing planned pace,
 // including a changed pace inherited from a later explicitly recorded month.
 for(let i=indexMonth(month)-indexMonth(p.startMonth)+1;i<120;i++){
  const future=monthAt(p.startMonth,i);if(!monthOk(future))break;if(p.months[future])continue;
  const before=monthlyValues(p,future),after=monthlyValues(next,future);
  if(cents(before.personalSaving)!==cents(after.personalSaving)||cents(before.sharedSaving)!==cents(after.sharedSaving)){
   next.savingSchedules=[...(next.savingSchedules??[]),{from:future,personalSaving:before.personalSaving,sharedSaving:before.sharedSaving}].sort((a,b)=>a.from.localeCompare(b.from));
  }
 }
 const confirmed=confirmMonthlySavings(next,month,asOf);
 if(!validatePlan(confirmed))throw Error('לא ניתן לשמור את ההפקדה עם הנתונים האלה.');
 return confirmed;
}

export function isUnconfiguredBudget(p){return !p.setupCompleted&&!p.demo&&p.opening===0&&Object.values(p.defaults).every(n=>n===0)&&!Object.keys(p.months).length&&!p.expenses.length&&!p.savingsGoals&&!(p.details?.length);}
export function createSetupBudget(v,id='first-goal'){
 const p={startMonth:v.month,opening:Number(v.opening||0),buffer:Number(v.buffer||0),horizon:24,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true};
 for(const key of ['salary','card1','card2','variable','transfers','checks','personalSaving','personalInvest'])p.defaults[key]=Number(v[key]||0);
 const accounts=v.accounts; if(accounts!==undefined&&!savingsAccountsValid(accounts))throw Error('יש לבדוק את שמות החסכונות והיתרות.');
 const balance=accounts?accounts.reduce((n,a)=>n+sgCents(a.balance),0)/100:Number(v.balance||0),target=Number(v.target||0),allocated=Number(v.allocated||0),name=String(v.goalName||'').trim();
 if(v.goalEnabled){if(!name||!Number.isFinite(target)||target<=0||allocated>balance)throw Error('יש למלא שם וסכום יעד, ולהקצות עד יתרת החסכון הקיימת.');p.savingsGoals={balance,snapshotMonth:v.month,items:[{id,name,icon:v.icon||'trophy',target,allocated,monthly:p.defaults.personalSaving,...(v.deadline?{deadline:v.deadline}:{})}],deposits:{}};}
 else if(balance>0||accounts)p.savingsGoals={balance,snapshotMonth:v.month,items:[],deposits:{}};
 if(accounts&&p.savingsGoals)Object.assign(p.savingsGoals,{accounts:clone(accounts),accountsMonth:v.month,accountsAsOf:v.month+'-01',accountsCovered:0,accountsAdjustment:0});
 if(!Number.isFinite(balance)||balance<0||balance>100000000||!validatePlan(p))throw Error('יש לבדוק את הסכומים והחודש. סכום שלא ידוע אפשר להשאיר ריק.');return p;
}

// Actual report series: missing/future/edited months are gaps, never inferred zeros.
export function annualGoalReport(p,year,asOf,excludeMonth=''){
 const rows=Array.from({length:12},(_,i)=>{const month=year+'-'+String(i+1).padStart(2,'0'),reported=month<=asOf&&month!==excludeMonth&&p.months[month]?.actual===true;return{month,reported,totals:reported?progressFor(p,month).totals:null};});
 const months=rows.filter(r=>r.reported).map(r=>r.month),totals={saving:0,invest:0,spending:0,income:0};
 for(const r of rows)if(r.reported)for(const k of Object.keys(totals))totals[k]=(cents(totals[k])+cents(r.totals[k]))/100;
 return{rows,months,totals};
}

export function graphWindow(count,unit,endMonth){
 const limits={months:120,years:10};if(!Number.isInteger(count)||count<1||!Object.hasOwn(limits,unit)||count>limits[unit]||!monthOk(endMonth))throw Error('יש לבחור טווח זמן תקין.');
 return{startMonth:monthAt(endMonth,1-count*(unit==='years'?12:1)),endMonth};
}
export function graphTimeline(p,{startMonth,endMonth,asOf,includeEstimates=false,excludeMonth=''}){
 const length=indexMonth(endMonth)-indexMonth(startMonth)+1;if(length<1||length>122)throw Error('טווח הגרף ארוך מדי.');const projections=new Map(forecast(p).map(r=>[r.month,r]));
 return Array.from({length},(_,i)=>{const month=monthAt(startMonth,i),record=p.months[month],actual=record?.actual===true&&month<=asOf&&month!==excludeMonth,estimated=!actual&&includeEstimates&&projections.has(month)&&month!==excludeMonth;
  const empty={income:null,spending:null,reportedSpending:null,saving:null,invest:null,plannedExpense:null,plannedIncome:null,balance:null,net:null};if(!actual&&!estimated)return{month,actual:false,estimated:false,values:empty};
  const resolved=record? p:{...p,months:{...p.months,[month]:{values:monthlyValues(p,month),actual:false,includesPlannedCard:false}}},totals=progressFor(resolved,month).totals;
  const plannedExpense=(p.expenses.reduce((n,e)=>n+(e.kind==='expense'&&!(e.source==='card'&&record?.includesPlannedCard)?cents(paymentFor(e,month)):0),0)+chequesFor(p,month))/100,plannedIncome=p.expenses.reduce((n,e)=>n+(e.kind==='income'?cents(paymentFor(e,month)):0),0)/100;
  return{month,actual,estimated,values:{...totals,reportedSpending:reportedMonthlySpending(resolved,month),plannedExpense,plannedIncome,balance:projections.get(month)?.balance??null,net:(cents(totals.income)+cents(monthlyValues(resolved,month).incomingTransfers??0)-cents(monthlyValues(resolved,month).outgoingTransfers??0)-cents(totals.spending)-cents(totals.saving)-cents(totals.invest))/100}};
 });
}

// Item-level explanations only: monthly totals are never ranked as transactions.
export function graphTopExpenses(p,month,{plannedOnly=false,reportedOnly=false}={}){
 const record=p.months[month],details=(p.details??[]).filter(e=>e.month===month&&e.status!=='cancelled'&&(!plannedOnly||additionalCheque(e))&&(!reportedOnly||e.status==='cleared'&&e.accounting==='included')),entries=details.map(e=>({id:e.id,name:e.name,category:e.category,amount:e.amount}));
 const categoryDetails=analyticalExpenseDetails(p).filter(e=>e.month===month&&e.status!=='cancelled'&&(!plannedOnly||additionalCheque(e))&&(!reportedOnly||e.status==='cleared'&&e.accounting==='included'));
 const amounts=new Map();for(const e of categoryDetails)amounts.set(e.category,(amounts.get(e.category)??0)+cents(e.amount));
 const categories=categoryRollup([...amounts].map(([category,amount])=>({category,amount:amount/100}))).filter(c=>c.amount>0).slice(0,3);
 for(const e of reportedOnly?[]:p.expenses){
  if(e.kind!=='expense'||e.source==='card'&&record?.includesPlannedCard||!plannedOnly&&e.source==='direct'&&record?.includesPlannedDirect)continue;
  const amount=paymentFor(e,month);if(amount>0)entries.push({id:e.id,name:e.name,category:e.payments>1?'תשלום חודשי מתוך '+e.payments+' תשלומים':'הוצאה מתוכננת',amount});
 }
 const explained=entries.reduce((n,e)=>n+cents(e.amount),0);
 return{categories,items:entries.filter(e=>e.amount>0).sort((a,b)=>cents(b.amount)-cents(a.amount)||a.name.localeCompare(b.name,'he')).slice(0,3),explained:explained/100};
}

// Explain the change in reported monthly spending. Category detail is explanatory;
// the signed remainder keeps the comparison equal to the authoritative total.
export function merchantExpenseChange(p,{month,asOf,excludeMonth=''}={}){
 if(!monthOk(month)||!monthOk(asOf))throw Error('יש לבחור חודש תקין.');
 const previousMonth=monthAt(month,-1);
 if(!monthOk(month)||!monthOk(asOf)||month>asOf||[month,previousMonth].some(m=>m===excludeMonth||!p.months[m]?.actual))return{available:false,month,previousMonth,parts:[]};
 const snapshot=m=>{const map=new Map();for(const row of analyticalExpenseDetails(p))if(row.month===m&&row.status==='cleared'&&row.accounting==='included')map.set(row.name,(map.get(row.name)??0)+cents(row.amount));return map;};
 const previous=snapshot(previousMonth),current=snapshot(month),keys=new Set([...previous.keys(),...current.keys()]);
 const parts=[...keys].map(name=>({name,previousCents:previous.get(name)??0,currentCents:current.get(name)??0,differenceCents:(current.get(name)??0)-(previous.get(name)??0)}));
 const changeCents=cents(reportedMonthlySpending(p,month))-cents(reportedMonthlySpending(p,previousMonth)),explainedCents=parts.reduce((sum,row)=>sum+row.differenceCents,0);
 return{available:true,month,previousMonth,parts:parts.sort((a,b)=>Math.abs(b.differenceCents)-Math.abs(a.differenceCents)||a.name.localeCompare(b.name,'he')),changeCents,remainderCents:changeCents-explainedCents};
}
export function expenseChange(p,{month,asOf,excludeMonth=''}={}){
 if(!monthOk(month)||!monthOk(asOf))throw Error('יש לבחור חודש תקין.');
 const previousMonth=monthAt(month,-1);
 if(previousMonth<p.startMonth) return {month,previousMonth,available:false,reason:'אין חודש קודם בתקציב.'};
 const rows=graphTimeline(p,{startMonth:previousMonth,endMonth:month,asOf,excludeMonth});
 if(!rows.every(row=>row.actual))return {month,previousMonth,available:false,reason:'נדרשים דיווחים בפועל בשני חודשים רצופים.'};
 const snapshots=rows.map(row=>{
  const summary=detailSummary(p,row.month),rollup=categoryRollup(summary.categories);
  const totalCents=cents(row.values.reportedSpending),categorizedCents=rollup.reduce((n,category)=>n+cents(category.amount),0);
  const pendingCheque=(p.details??[]).some(detail=>detail.month===row.month&&detail.method==='checks'&&detail.status==='pending');
  return {month:row.month,totalCents,categories:new Map(rollup.map(category=>[category.category,cents(category.amount)])),remainderCents:totalCents-categorizedCents,detailMatched:summary.hasDetails&&summary.unexplained===0&&!summary.over&&!pendingCheque&&row.month<asOf};
 });
 const [previous,current]=snapshots,names=new Set([...previous.categories.keys(),...current.categories.keys()]);
 const parts=[...names].map(category=>({category,previous: (previous.categories.get(category)??0)/100,current:(current.categories.get(category)??0)/100,change:((current.categories.get(category)??0)-(previous.categories.get(category)??0))/100}));
 parts.push({category:'ללא פירוט או התאמה',previous:previous.remainderCents/100,current:current.remainderCents/100,change:(current.remainderCents-previous.remainderCents)/100,remainder:true});
 parts.sort((a,b)=>Math.abs(cents(b.change))-Math.abs(cents(a.change))||a.category.localeCompare(b.category,'he'));
 return {month,previousMonth,available:true,total:current.totalCents/100,previousTotal:previous.totalCents/100,change:(current.totalCents-previous.totalCents)/100,parts,detailMatched:previous.detailMatched&&current.detailMatched&&!p.demo,partialMonth:month>=asOf||previousMonth>=asOf,demo:!!p.demo};
}

// Source evidence is kept separate from monthly totals: a manually reported
// amount is useful, but cannot prove that the underlying bank/card file exists.
export function monthlyDataCoverage(p,month,asOf,excludeMonth=''){
 if(!monthOk(month)||!monthOk(asOf))throw Error('יש לבחור חודש תקין.');
 const record=p.months[month],actual=record?.actual===true&&month<=asOf&&month!==excludeMonth;
 const closed=month<asOf,first=month+'-01',last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const accounts=cashAccountList(p).map(account=>{
  const batches=(p.bankImport?.batches??[]).filter(batch=>batch.accountId===account.id&&batch.months?.some(row=>row.month===month));
  const latest=batches.at(-1)?.months.find(row=>row.month===month)?.after?.bankCoverage;
  const full=latest?.accountId===account.id&&(latest.accountComplete??latest.complete)===true&&latest.from<=first&&latest.to>=last;
  const manuallyReported=p.cashPlanning?.months?.[month]?.[account.id]?.actual===true;
  return {id:account.id,label:account.label,status:full&&closed?'file':batches.length?'partial':manuallyReported?'manual':'missing'};
 });
 const cards=creditCards(p).filter(card=>!card.removedFrom||month<card.removedFrom).map(card=>{
  const reports=(p.cardBilling?.reports??[]).filter(report=>report.cardId===card.id&&report.dueDate.slice(0,7)===month);
  const imported=reports.some(report=>report.source==='file')||(p.details??[]).some(detail=>detail.method===card.id&&detail.month===month&&['cal','isracard'].includes(detail.statement?.issuer));
  const bankCharge=(p.bankImport?.entries??[]).some(entry=>entry.field===card.id&&entry.month===month);
  return {id:card.id,label:card.name,status:imported?'file':cardNoTransactionsConfirmed(p,card.id,month)?'no-transactions':reports.some(report=>report.source==='manual')?'manual':bankCharge?'bank':actual&&!record.bankCoverage&&Object.hasOwn(record.values,card.id)?'manual':'missing'};
 });
 const summary=detailSummary(p,month),spending=actual?reportedMonthlySpending(p,month):null;
 const remainderCents=spending===null?null:cents(spending)-cents(summary.recorded);
 const pendingCheque=(p.details??[]).some(detail=>detail.month===month&&detail.method==='checks'&&detail.status==='pending');
 const detailStatus=!summary.hasDetails?'missing':remainderCents!==null&&remainderCents<0||summary.over?'over':remainderCents===0&&summary.unexplained===0&&!pendingCheque&&closed?'matched':'partial';
 return {month,actual,closed,accounts,cards,detail:{status:detailStatus,remainderCents},bankFiles:accounts.filter(account=>account.status==='file').length,cardFiles:cards.filter(card=>card.status==='file').length};
}

export function reconcileBankMonth(p,month,accountId,asOf){
 if(!monthOk(month)||!monthOk(asOf)||typeof accountId!=='string')throw Error('יש לבחור חודש וחשבון.');
 if(month>=asOf)return{status:'insufficient',month,accountId,reason:'החודש טרם הסתיים; אין לאשר התאמת יתרות של חודש מלא.'};
 const endpoint=m=>{
  let found=null;const end=new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).toISOString().slice(0,10);
  for(const batch of p.bankImport?.batches??[])if(batch.accountId===accountId)for(const row of batch.months??[])if(row.month===m){const c=row.after?.bankCoverage;if(c?.accountId===accountId)found=(c.accountComplete??c.complete)&&c.from<=m+'-01'&&c.to>=end&&Number.isSafeInteger(c.sourceBalanceCents)?c.sourceBalanceCents:null;}
  return found;
 };
 const closingCents=endpoint(month),previous=endpoint(monthAt(month,-1)),account=cashAccountList(p).find(row=>row.id===accountId);
 const openingCents=previous??(account?.openingMonth===month&&Object.hasOwn(account,'opening')?cents(account.opening):null);
 if(closingCents===null||openingCents===null)return{status:'insufficient',month,accountId,reason:'אין מספיק מידע להתאמה: נדרשות יתרות קצה ודוח מקור שמכסה את כל החודש.'};
 const rows=(p.bankImport?.entries??[]).filter(row=>row.accountId===accountId&&row.month===month);
 if(rows.some(row=>!row.source?.date))return{status:'insufficient',month,accountId,reason:'קיימות תנועות ללא שדות מקור. יש לבדוק את הדוח המקורי לפני התאמת יתרות.'};
 const movementCents=rows.reduce((sum,row)=>sum+row.cents,0),expectedClosingCents=openingCents+movementCents,differenceCents=closingCents-expectedClosingCents;
 return{status:differenceCents===0?'matched':'gap',month,accountId,openingCents,movementCents,expectedClosingCents,closingCents,differenceCents,sourceCount:rows.length};
}

// Versioned, source-aware snapshots keep cash movement and purchase detail in
// different metrics. Every value is integer agorot; coverage travels with it.
export function monthlyMetricSnapshot(p,metric,month,{asOf=month,excludeMonth='',accountId=null,scope='current-budget',revision=null}={}){
 if(!monthOk(month)||!monthOk(asOf)||!['reported-spending','categorized-detail','bank-debits'].includes(metric))throw Error('מדד או חודש לא תקין.');
 const coverage=monthlyDataCoverage(p,month,asOf,excludeMonth),base={version:1,metric,scope,revision,month,currency:'ILS',unit:'agorot',coverage};
 if(metric==='reported-spending')return {...base,dateBasis:'budget-month',sign:'positive-outflow',sources:['monthly-expense-fields'],valueCents:p.months[month]?cents(reportedMonthlySpending(p,month)):null,reconciliation:null};
 if(metric==='categorized-detail'){
  const rows=(p.details??[]).filter(row=>row.month===month&&row.month!==excludeMonth&&row.status==='cleared'&&row.accounting==='included');
  const valueCents=rows.reduce((sum,row)=>sum+cents(row.amount),0),reported=reportedMonthlySpending(p,month);
  return {...base,dateBasis:'billing-month',sign:'positive-purchase-negative-refund',sources:['cleared-included-details'],valueCents,sourceCount:rows.length,reconciliation:{reportedSpendingCents:reported===null?null:cents(reported),remainderCents:reported===null?null:cents(reported)-valueCents}};
 }
 if(typeof accountId!=='string'||!accountId||!cashAccountList(p).some(account=>account.id===accountId))throw Error('יש לבחור חשבון בנק למדידת יציאות.');
 const rows=(p.bankImport?.entries??[]).filter(entry=>entry.month===month&&entry.accountId===accountId);
 return {...base,accountId,dateBasis:'bank-booking-month',sign:'gross-positive-debits',sources:['imported-bank-movements'],valueCents:rows.reduce((sum,row)=>sum+Math.max(0,-row.cents),0),creditsCents:rows.reduce((sum,row)=>sum+Math.max(0,row.cents),0),sourceCount:rows.length,coverage:{...coverage,selectedAccountStatus:coverage.accounts.find(account=>account.id===accountId)?.status??'missing'},reconciliation:null};
}

// A reviewed consumption metric is distinct from cash movement and monthly
// reported fields. Details are canonical; only explicitly reviewed, unmatched
// bank remainders are added. Unreviewed/stale evidence remains visible as gaps.
export function consumptionSnapshot(p,{startMonth,endMonth,asOf=endMonth,dateBasis='billing',account='',method='',category='',query='',person='',event='',excludeMonth='',scope='current-budget',revision=null}={}){
 if(!monthOk(startMonth)||!monthOk(endMonth)||!monthOk(asOf)||startMonth>endMonth||endMonth>asOf||indexMonth(endMonth)-indexMonth(startMonth)>119||!['billing','purchase'].includes(dateBasis)||[account,method,category,query,person,event].some(value=>typeof value!=='string'||value.length>100))throw Error('יש לבדוק את טווח ומסנני הצריכה.');
 const selectAccount=row=>row.cashAccountId||p.cashPlanning?.cardAccounts?.[row.method]||(cashAccountList(p).length===1?cashAccountList(p)[0].id:''),needle=query.normalize('NFKC').trim().toLocaleLowerCase('he'),monthFor=row=>dateBasis==='purchase'?row.date.slice(0,7):row.month;
 const rows=[],bankRemainders=bankConsumptionRemainders(p),unresolved=[];
 for(const detail of analyticalExpenseDetails(p))if(detail.status==='cleared'&&detail.month!==excludeMonth){
  const month=monthFor(detail);if(month<startMonth||month>endMonth)continue;
  rows.push({...detail,cents:cents(detail.amount),sourceType:'detail',sourceId:detail.sourceDetailId??detail.id,accountId:selectAccount(detail),basisMonth:month});
 }
 for(const remainder of bankRemainders){
  const {entry,remainingCents,decision}=remainder;if(entry.month===excludeMonth||entry.month<startMonth||entry.month>endMonth||remainingCents===0)continue;
  const row={id:'bank:'+entry.key,sourceId:entry.key,sourceType:'bank',name:merchantDisplayName(p,[entry.source.description,entry.source.beneficiary].filter(Boolean).join(' · ')||'תשלום בנק'),category:categoryRegistryEntry(p,p.categoryRegistry?.entries?.find(row=>row.id===entry.bankCategoryId)?.label)?.label??'ללא קטגוריה',method:entry.field,month:entry.month,basisMonth:entry.month,date:entry.source.date,accountId:entry.accountId,cents:remainingCents,amount:remainingCents/100,decision};
  if(decision==='purchase')rows.push(row);else if(decision!=='not-consumption')unresolved.push(row);
 }
 const selectedCategory=categoryRegistryEntry(p,category)?.label??category;
 const matches=row=>(!person||row.person===person)&&(!event||row.event===event)&&(!account||(account==='unassigned'?!row.accountId:row.accountId===account))&&(!method||row.method===method)&&(!selectedCategory||categoryContains(selectedCategory,row.category))&&(!needle||row.name.normalize('NFKC').toLocaleLowerCase('he').includes(needle));
 const selected=rows.filter(matches).sort((a,b)=>b.basisMonth.localeCompare(a.basisMonth)||b.date.localeCompare(a.date)||a.id.localeCompare(b.id)),gaps=unresolved.filter(matches),categoryCents=new Map();
 for(const row of selected)categoryCents.set(row.category,(categoryCents.get(row.category)??0)+row.cents);
 const purchasesCents=selected.reduce((sum,row)=>sum+Math.max(0,row.cents),0),refundsCents=selected.reduce((sum,row)=>sum+Math.max(0,-row.cents),0);
 return{version:1,metric:'identified-consumption',scope,revision,filters:{account,method,category,query,person,event},currency:'ILS',unit:'agorot',sign:'positive-purchase-negative-refund',dateBasis:dateBasis==='billing'?'billing-month-with-bank-booking':'purchase-date-with-bank-booking',startMonth,endMonth,sources:['cleared-expense-details','explicitly-reviewed-unmatched-direct-bank'],rows:selected,categories:[...categoryCents].map(([category,cents])=>({category,cents})),purchasesCents,refundsCents,valueCents:purchasesCents-refundsCents,coverage:{complete:false,unresolvedBankCount:gaps.length,unresolvedPurchasesCents:gaps.reduce((sum,row)=>sum+Math.max(0,row.cents),0),unresolvedRefundsCents:gaps.reduce((sum,row)=>sum+Math.max(0,-row.cents),0),unknownAccountCount:selected.filter(row=>!row.accountId).length,explanation:'צריכה מזוהה מתוך המקורות שנקלטו ונבדקו. סכומים חודשיים ללא פירוט ומקורות חסרים אינם נחשבים אפס; אין כאן הוכחת כיסוי מלא.'},unresolved:gaps};
}

export function analysisMetricSnapshot(p,{metric='identified',startMonth,endMonth,asOf=endMonth,account='',method='',dateBasis='billing',category='',query='',person='',event='',excludeMonth='',scope='current-budget',revision=null}={}){
 if(!monthOk(startMonth)||!monthOk(endMonth)||!monthOk(asOf)||startMonth>endMonth||endMonth>asOf||indexMonth(endMonth)-indexMonth(startMonth)>23||!['reported','detail','identified'].includes(metric))throw Error('מדד או טווח ניתוח לא תקין.');
 if(metric==='identified')return consumptionSnapshot(p,{startMonth,endMonth,asOf,account,method,dateBasis,category,query,person,event,excludeMonth,scope,revision});
 if(metric==='reported'){
  if(account||method||dateBasis!=='billing'||category||query||person||event)throw Error('סכומי הדיווח החודשיים אינם ניתנים לחיתוך הזה. בחרו פירוט שנפרע או צריכה מזוהה.');
  const months=Array.from({length:indexMonth(endMonth)-indexMonth(startMonth)+1},(_,i)=>monthAt(startMonth,i)),rows=months.filter(month=>p.months[month]?.actual&&month!==excludeMonth).map(month=>({id:'monthly:'+month,sourceId:month,sourceType:'monthly',name:month,month,basisMonth:month,date:month+'-01',category:'דיווח חודשי',amount:reportedMonthlySpending(p,month),cents:cents(reportedMonthlySpending(p,month))})),valueCents=rows.reduce((sum,row)=>sum+row.cents,0);
  return{version:1,metric:'reported-spending',scope,revision,filters:{account,method,category,query,person,event},currency:'ILS',unit:'agorot',sign:'positive-outflow',dateBasis:'budget-month',startMonth,endMonth,sources:['monthly-expense-fields'],rows,categories:[],valueCents:rows.length?valueCents:null,purchasesCents:rows.reduce((sum,row)=>sum+Math.max(0,row.cents),0),refundsCents:rows.reduce((sum,row)=>sum+Math.max(0,-row.cents),0),coverage:{complete:rows.length===months.length,missingMonths:months.filter(month=>!rows.some(row=>row.month===month)),explanation:'דיווחים חודשיים בלבד; סכום יכול לכלול העברות שדורשות בדיקה. חוסר דיווח אינו אפס.'}};
 }
 const result=exploreExpenseDetails(p,{endMonth,count:indexMonth(endMonth)-indexMonth(startMonth)+1,account,method,dateBasis,category,query,person,event,excludeMonth});
 const rows=result.rows.map(row=>({...row,cents:cents(row.amount),sourceType:'detail',sourceId:row.sourceDetailId??row.id,accountId:row.cashAccountId||p.cashPlanning?.cardAccounts?.[row.method]||(cashAccountList(p).length===1?cashAccountList(p)[0].id:''),basisMonth:dateBasis==='purchase'?row.date.slice(0,7):row.month})),categories=new Map();for(const row of rows)categories.set(row.category,(categories.get(row.category)??0)+row.cents);
 return{version:1,metric:'cleared-detail',scope,revision,filters:{account,method,category,query,person,event},currency:'ILS',unit:'agorot',sign:'positive-purchase-negative-refund',dateBasis:dateBasis==='purchase'?'purchase-date':'billing-month',startMonth,endMonth,sources:['cleared-expense-details'],rows,categories:[...categories].map(([category,cents])=>({category,cents})),valueCents:rows.length?result.netCents:null,purchasesCents:result.purchasesCents,refundsCents:result.refundsCents,coverage:{complete:false,pendingCount:result.pendingCount,pendingByMonth:result.pendingByMonth,explanation:'פירוט שנפרע מתוך המקורות שנקלטו, אחרי זיכויים. הדיווח החודשי וסכומים ללא פירוט אינם נוספים אליו.'}};
}
export function metricSnapshotChange(previous,current){
 if(!previous?.rows.length||!current?.rows.length)return{available:false,reason:'אין מספיק מקורות להשוואה.'};
 if(['version','metric','scope','revision','currency','dateBasis'].some(key=>previous[key]!==current[key])||JSON.stringify(previous.filters)!==JSON.stringify(current.filters))throw Error('נדרשים אותו מדד, מסננים וגרסת נתונים להשוואה.');
 const groups=new Map();for(const [snapshot,sign]of [[previous,-1],[current,1]])for(const row of snapshot.rows){const category=row.category||'ללא קטגוריה';groups.set(category,(groups.get(category)??0)+sign*row.cents);}
 const parts=[...groups].map(([category,differenceCents])=>({category,differenceCents})).sort((a,b)=>Math.abs(b.differenceCents)-Math.abs(a.differenceCents)||a.category.localeCompare(b.category,'he'));
 const differenceCents=current.valueCents-previous.valueCents,remainderCents=differenceCents-parts.reduce((sum,row)=>sum+row.differenceCents,0);
 return{available:true,differenceCents,parts,remainderCents};
}
export function analysisMetricSeries(p,{endMonth,count=6,...options}={}){
 if(!Number.isInteger(count)||count<1||count>24||!monthOk(endMonth))throw Error('יש לבחור טווח תקין.');
 const months=Array.from({length:count},(_,i)=>monthAt(endMonth,i-count+1)).filter(month=>month>=p.startMonth);if(!months.length)return [];
 // Calculate sources and allocations once per range; split the same evidence by month.
 const range=analysisMetricSnapshot(p,{...options,startMonth:months[0],endMonth}),byMonth=new Map(months.map(month=>[month,[]])),gaps=new Map(months.map(month=>[month,[]]));
 for(const row of range.rows)byMonth.get(row.basisMonth)?.push(row);
 for(const row of range.unresolved??[])gaps.get(row.basisMonth)?.push(row);
 return months.map(month=>{
  const rows=byMonth.get(month),unresolved=gaps.get(month),categories=new Map();for(const row of rows)categories.set(row.category,(categories.get(row.category)??0)+row.cents);
  const purchasesCents=rows.reduce((sum,row)=>sum+Math.max(0,row.cents),0),refundsCents=rows.reduce((sum,row)=>sum+Math.max(0,-row.cents),0),coverage={...range.coverage};
  if(range.metric==='reported-spending'){coverage.complete=rows.length===1;coverage.missingMonths=rows.length?[]:[month];}
  if(range.metric==='identified-consumption'){Object.assign(coverage,{unresolvedBankCount:unresolved.length,unresolvedPurchasesCents:unresolved.reduce((sum,row)=>sum+Math.max(0,row.cents),0),unresolvedRefundsCents:unresolved.reduce((sum,row)=>sum+Math.max(0,-row.cents),0),unknownAccountCount:rows.filter(row=>!row.accountId).length});}
  if(range.metric==='cleared-detail'){coverage.pendingCount=range.coverage.pendingByMonth[month]??0;coverage.pendingByMonth=coverage.pendingCount?{[month]:coverage.pendingCount}:{};}
  const valueCents=rows.length?purchasesCents-refundsCents:range.metric==='identified-consumption'?0:null,snapshot={...range,startMonth:month,endMonth:month,rows,categories:range.metric==='reported-spending'?[]:[...categories].map(([category,cents])=>({category,cents})),purchasesCents,refundsCents,valueCents,coverage,...(range.unresolved?{unresolved}:{})};
  return{month,snapshot,valueCents:rows.length?valueCents:null};
 });
}

// Explore saved expense detail by billing month. The list and its total use the
// same rows; monthly card settlements and bank entries are never added again.
export function exploreExpenseDetails(p,{endMonth,count=6,category='',method='',query='',account='',dateBasis='billing',person='',event='',excludeMonth=''}={}){
 if(typeof person!=='string'||person.length>40||typeof event!=='string'||event.length>60)throw Error('יש לבדוק את התגיות.');
 if(typeof account!=='string'||account.length>100||!['billing','purchase'].includes(dateBasis))throw Error('יש לבדוק חשבון ובסיס תאריך.');
 if(!monthOk(endMonth)||endMonth<p.startMonth||!Number.isInteger(count)||count<1||count>24||typeof category!=='string'||category.length>60||typeof method!=='string'||method.length>100||typeof query!=='string'||query.length>80)throw Error('יש לבדוק את מסנני החיפוש.');
 const startMonth=monthAt(endMonth,1-count)>p.startMonth?monthAt(endMonth,1-count):p.startMonth,needle=query.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('he');
 const rowMonth=row=>dateBasis==='purchase'?row.date.slice(0,7):row.month;
 const rowAccount=row=>row.cashAccountId||p.cashPlanning?.cardAccounts?.[row.method]||(cashAccountList(p).length===1?cashAccountList(p)[0].id:'');
 const selectedCategory=categoryRegistryEntry(p,category)?.label??category;
 const matched=analyticalExpenseDetails(p).filter(row=>(!person||row.person===person)&&(!event||row.event===event)&&rowMonth(row)>=startMonth&&rowMonth(row)<=endMonth&&(!account||(account==='unassigned'?!rowAccount(row):rowAccount(row)===account))&&row.month!==excludeMonth&&row.status!=='cancelled'&&(!selectedCategory||categoryContains(selectedCategory,row.category))&&(!method||row.method===method)&&(!needle||recurringMerchantKey(row.name).includes(needle)));
 const pending=matched.filter(row=>row.status==='pending'),rows=matched.filter(row=>row.status==='cleared').sort((a,b)=>b.month.localeCompare(a.month)||b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const purchasesCents=rows.reduce((sum,row)=>sum+Math.max(0,cents(row.amount)),0),refundsCents=rows.reduce((sum,row)=>sum+Math.max(0,-cents(row.amount)),0);
 return {startMonth,endMonth,rows,pendingByMonth:Object.fromEntries([...new Set(pending.map(row=>rowMonth(row)))].map(month=>[month,pending.filter(row=>rowMonth(row)===month).length])),pendingCount:pending.length,purchasesCents,refundsCents,netCents:purchasesCents-refundsCents};
}

export const recurringMerchantKey=name=>name.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('he');
// Candidates are evidence only: one positive charge per closed month, on a
// similar billing day. Repeated installments with the same purchase date are
// excluded. A confirmation never adds another charge to the budget forecast.
export function recurringExpenseCandidates(p,{asOf,excludeMonth=''}={}){
 if(!monthOk(asOf))throw Error('יש לבחור חודש תקין.');
 const months=[-3,-2,-1].map(offset=>monthAt(asOf,offset));
 if(months[0]<p.startMonth||months.some(month=>p.months[month]?.actual!==true||month===excludeMonth))return{available:false,months,reason:'נדרשים שלושה חודשים סגורים ורצופים עם דיווח בפועל.',candidates:[]};
 const groups=new Map();
 for(const row of p.details??[]){
  if(!months.includes(row.month)||row.status!=='cleared')continue;
  const merchant=recurringMerchantKey(merchantDisplayName(p,row.name));if(!merchant||merchant.length>100)continue;
  const key=row.method+'\u0000'+merchant;
  if(!groups.has(key))groups.set(key,{merchant,method:row.method,rows:[]});
  groups.get(key).rows.push(row);
 }
 const decisions=new Map((p.recurringDecisions??[]).map(row=>[row.method+'\u0000'+row.merchant,row]));
 const candidates=[];
 for(const [key,group] of groups){
  if(group.rows.length!==3||group.rows.some(row=>row.amount<=0)||new Set(group.rows.map(row=>row.month)).size!==3||new Set(group.rows.map(row=>row.date)).size!==3)continue;
  group.rows.sort((a,b)=>a.month.localeCompare(b.month));
  const days=group.rows.map(row=>Number(row.date.slice(8))),amounts=group.rows.map(row=>cents(row.amount));
  if(Math.max(...days)-Math.min(...days)>7||Math.abs(amounts[1]-amounts[0])>Math.max(2000,Math.round(amounts[0]*.1))||Math.abs(amounts[2]-amounts[1])>Math.max(2500,Math.round(amounts[1]*.3)))continue;
  const latest=group.rows[2],decision=decisions.get(key);
  candidates.push({merchant:group.merchant,method:group.method,name:latest.name,category:latest.category,months:group.rows.map(row=>({month:row.month,amount:row.amount,id:row.id})),latestAmount:latest.amount,previousAmount:group.rows[1].amount,change:(amounts[2]-amounts[1])/100,status:decision?.status??'candidate'});
 }
 candidates.sort((a,b)=>(a.status==='confirmed'?0:a.status==='candidate'?1:2)-(b.status==='confirmed'?0:b.status==='candidate'?1:2)||cents(b.latestAmount)-cents(a.latestAmount)||a.name.localeCompare(b.name,'he'));
 const active=candidates.filter(row=>row.status==='confirmed'),estimatedCents=active.reduce((sum,row)=>sum+cents(row.latestAmount),0);
 return{available:true,months,nextMonth:asOf,candidates,confirmedCount:active.length,estimatedAmount:estimatedCents/100};
}
export function setRecurringExpenseDecision(p,{asOf,merchant,method,status,excludeMonth=''}={}){
 if(!['confirmed','dismissed','reset'].includes(status)||typeof merchant!=='string'||typeof method!=='string')throw Error('יש לבחור חיוב חוזר ופעולה תקינים.');
 const candidate=recurringExpenseCandidates(p,{asOf,excludeMonth}).candidates.find(row=>row.merchant===merchant&&row.method===method),prior=(p.recurringDecisions??[]).find(row=>row.merchant===merchant&&row.method===method);
 if(status!=='reset'&&!candidate||status==='reset'&&!candidate&&!prior)throw Error('החיוב אינו זמין לעדכון. יש לרענן את הנתונים.');
 const decisions=(p.recurringDecisions??[]).filter(row=>row.merchant!==merchant||row.method!==method);
 if(status!=='reset')decisions.push({merchant,method,name:candidate.name,status});
 const next={...p,recurringDecisions:decisions};
 if(!validatePlan(next))throw Error('לא ניתן לשמור את הבחירה. יש לבדוק את נתוני התקציב.');
 return next;
}

export function categoryTrend(p,{category='',endMonth,asOf,count=6,compare='previous',excludeMonth=''}){
 if(!monthOk(endMonth)||!monthOk(asOf)||!Number.isInteger(count)||count<1||count>24||!['previous','next','year'].includes(compare))throw Error('יש לבחור טווח והשוואה תקינים.');
 category=categoryRegistryEntry(p,category)?.label??category;
 const start=monthAt(endMonth,1-count),end=compare==='next'?monthAt(endMonth,1):endMonth;
 const all=categoryMonths(p,end,category,count+(compare==='year'?12:1),asOf).map(r=>r.month===excludeMonth?{...r,hasDetails:false,complete:false}:r),byMonth=new Map(all.map(r=>[r.month,r]));
 return all.filter(r=>r.month>=start&&r.month<=endMonth).map(row=>{
  const baselineMonth=monthAt(row.month,compare==='next'?1:compare==='year'?-12:-1),baseline=byMonth.get(baselineMonth),available=row.hasDetails&&baseline?.hasDetails&&(compare!=='year'||row.actual&&baseline.actual&&row.month<asOf&&baseline.month<asOf);
  const change=available?(cents(row.amount)-cents(baseline.amount))/100:null,percent=available&&baseline.amount>0?Math.round((cents(row.amount)-cents(baseline.amount))/cents(baseline.amount)*1000)/10:available&&row.amount===0&&baseline.amount===0?0:null;
  return{...row,baselineMonth,change,percent,baselineAmount:available?baseline.amount:null,comparisonComplete:available&&row.complete&&baseline.complete};
 });
}

// A trend needs three consecutive, closed, actually reported months. Category
// trends additionally require the detail to reconcile in every month.
export function sustainedExpenseTrend(p,{endMonth,asOf,category='',minimumChange=200,excludeMonth=''}={}){
 if(!monthOk(endMonth)||!monthOk(asOf)||typeof category!=='string'||category.length>60||!Number.isFinite(minimumChange)||minimumChange<0||minimumChange>1000000||cents(minimumChange)/100!==minimumChange)throw Error('יש לבדוק את תקופת המגמה ואת סף השינוי.');
 const first=monthAt(endMonth,-2);
 if(endMonth>=asOf)return{available:false,reason:'המגמה מבוססת על חודשים שהסתיימו; יש לבחור חודש קודם.'};
 if(first<p.startMonth)return{available:false,reason:'נדרשים שלושה חודשים רצופים בתקופת התקציב.'};
 const reported=graphTimeline(p,{startMonth:first,endMonth,asOf,excludeMonth});
 if(!reported.every(row=>row.actual))return{available:false,reason:'נדרשים דיווחים בפועל בשלושה חודשים סגורים ורצופים.'};
 if(category&&reported.some(row=>monthlyDataCoverage(p,row.month,asOf,excludeMonth).detail.status!=='matched'))return{available:false,reason:'כדי לזהות מגמה בקטגוריה, הפירוט חייב להתאים לסך ההוצאות בכל שלושת החודשים.'};
 const months=reported.map(row=>({month:row.month,amount:category?categoryAmount(detailSummary(p,row.month).categories,category):row.values.spending}));
 const amounts=months.map(row=>cents(row.amount)),changeCents=amounts[2]-amounts[0],limit=cents(minimumChange);
 const direction=amounts[0]<amounts[1]&&amounts[1]<amounts[2]&&changeCents>=limit?'increase':amounts[0]>amounts[1]&&amounts[1]>amounts[2]&&-changeCents>=limit?'decrease':'none';
 return{available:true,months,change:changeCents/100,direction,minimumChange,category,source:category?'reconciled-detail':'reported-spending'};
}

export function savingsAccountsValid(accounts){
 if(!Array.isArray(accounts)||!accounts.length||accounts.length>20)return false;
 const ids=new Set();let total=0;
 for(const a of accounts){if(!a||typeof a.id!=='string'||!a.id||a.id.length>100||ids.has(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.length>80||!sgMoney(a.balance)||(a.returnMode!==undefined&&!['none','boi'].includes(a.returnMode)))return false;ids.add(a.id);total+=sgCents(a.balance);}
 return total<=10000000000;
}
export function updateSavingsAccounts(p,accounts,asOf,date=asOf+'-01'){
 if(!p.savingsGoals||!sgMonth(asOf)||asOf<p.savingsGoals.snapshotMonth||!savingsAccountsValid(accounts))throw Error('יש לבדוק את שמות החסכונות, היתרות וחודש העדכון.');
 const pool=savingsBalances(p,asOf),total=accounts.reduce((n,a)=>n+sgCents(a.balance),0);
 if(pool.items.reduce((n,g)=>n+sgCents(g.current),0)>total)throw Error('היתרות נמוכות מהסכום שכבר הוקצה למטרות. יש לשחרר כסף מהמטרות לפני הקטנת החסכון.');
 const next=reallocateSavings(p,pool.items.map(g=>g.current),asOf);
 Object.assign(next.savingsGoals,{accounts:clone(accounts),accountsMonth:asOf,accountsAsOf:date,accountsCovered:(sgCents(next.savingsGoals.coveredPool??0)+Object.values(next.savingsGoals.covered??{}).reduce((n,v)=>n+sgCents(v),0))/100,accountsAdjustment:0,balance:total/100});
 if(!validatePlan(next))throw Error('לא ניתן לעדכן את יתרות החסכונות.');return next;
}

export function updateSavingsReturnModes(p,modes){
 const next=clone(p),s=next.savingsGoals;if(!s)throw Error('יש להגדיר חסכון תחילה.');
 if(!s.accounts)Object.assign(s,{accounts:[{id:'existing-savings',name:'חסכון קיים',balance:s.balance}],accountsMonth:s.snapshotMonth,accountsAdjustment:0});
 if(Object.keys(modes).some(id=>!s.accounts.some(a=>a.id===id))||s.accounts.some(a=>!['none','boi'].includes(modes[a.id])))throw Error('יש לבחור אופן חישוב לכל חסכון.');
 s.accountsAsOf??=s.accountsMonth+'-01';s.accountsCovered??=s.accountsMonth===s.snapshotMonth&&s.accountsAdjustment===0?(sgCents(s.coveredPool??0)+Object.values(s.covered??{}).reduce((n,v)=>n+sgCents(v),0))/100:0;
 for(const a of s.accounts)a.returnMode=modes[a.id];if(!validatePlan(next))throw Error('לא ניתן לשמור את אופן חישוב הצמיחה.');return next;
}

// Deposits follow the existing goal forecast: end of each month, starting next month.
export function savingsDeadlineStatus(g,monthly,asOf){
 if(!g.deadline||!sgDate(g.deadline)||!sgDate(asOf)||!sgMoney(monthly))return null;
 const lastDay=new Date(Date.UTC(Number(g.deadline.slice(0,4)),Number(g.deadline.slice(5,7)),0)).getUTCDate();
 const months=Math.max(0,indexMonth(g.deadline.slice(0,7))-indexMonth(asOf.slice(0,7))-(Number(g.deadline.slice(8))<lastDay?1:0));
 const remaining=Math.max(0,sgCents(g.target)-sgCents(g.current)),shortfall=Math.max(0,remaining-months*sgCents(monthly))/100;
 return{late:shortfall>0,expired:g.deadline<asOf,months,shortfall,requiredMonthly:months?Math.ceil(remaining/months)/100:null,reached:remaining===0,forecastMonth:savingsProjection(g.current,g.target,0,monthly,asOf.slice(0,7))?.month??null};
}

export function bankImportsValid(p){
 const b=p.bankImport;if(b===undefined)return true;
 const str=(s,n)=>typeof s==='string'&&s.length>0&&s.length<=n,hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s),date=s=>dateOk(s);
 const source=r=>r===undefined||r&&(r.line===undefined||Number.isInteger(r.line)&&r.line>0&&r.line<=30000)&&(r.parserVersion===undefined||r.parserVersion===1)&&dateOk(r.date)&&(r.valueDate===undefined||r.valueDate===null||dateOk(r.valueDate))&&['description','details','beneficiary','purpose','reference'].every(k=>typeof r[k]==='string'&&r[k].length<=2000)&&r.currency==='ILS'&&(r.balanceCents===undefined||Number.isSafeInteger(r.balanceCents));
 const monthly=r=>r===null||r&&valuesOk(r.values)&&typeof r.actual==='boolean'&&typeof r.includesPlannedCard==='boolean';
 if(!b||b.version!==1||!Array.isArray(b.accounts)||b.accounts.length>10||!Array.isArray(b.entries)||b.entries.length>10000||!Array.isArray(b.batches)||b.batches.length>1000)return false;
 const ids=new Set(),batchIds=new Set(),keys=new Set();
 if(!b.accounts.every(a=>a&&str(a.id,100)&&!ids.has(a.id)&&!!ids.add(a.id)&&str(a.label,80)&&Array.isArray(a.rules)&&a.rules.length<=100&&(a.bankName===undefined||['hapoalim','one-zero'].includes(a.bankName))&&a.rules.every(r=>r&&str(r.text,160)&&['in','out'].includes(r.direction)&&str(r.destination,80)&&(r.action===undefined||typeof r.action==='string'&&r.action.length<=160)&&(r.beneficiary===undefined||typeof r.beneficiary==='string'&&r.beneficiary.length<=160)&&(r.refund===undefined||typeof r.refund==='boolean'))))return false;
 if(!b.batches.every(t=>t&&str(t.id,100)&&!batchIds.has(t.id)&&!!batchIds.add(t.id)&&ids.has(t.accountId)&&str(t.file,255)&&date(t.from)&&date(t.to)&&Array.isArray(t.months)&&t.months.length<=120&&t.months.every(h=>h&&monthOk(h.month)&&h.after&&monthly(h.after)&&monthly(h.before))))return false;
 return b.entries.every(e=>e&&source(e.source)&&hash(e.key)&&hash(e.fingerprint)&&!keys.has(e.key)&&!!keys.add(e.key)&&monthOk(e.month)&&ids.has(e.accountId)&&batchIds.has(e.batchId)&&(e.field==='exclude'||budgetFields(p).some(f=>f[0]===e.field))&&Number.isSafeInteger(e.cents)&&(e.field!=='incomingTransfers'||e.cents>0)&&(e.field!=='outgoingTransfers'||e.cents<0)&&(['salary','otherIncome','incomingTransfers'].includes(e.field)?e.cents:-e.cents)<=10000000000&&(e.bankCategoryId===undefined||e.source&&['variable','checks'].includes(e.field)&&e.cents!==0&&p.categoryRegistry?.entries?.some(category=>category.id===e.bankCategoryId)));
}

// Account cash flow is an additive breakdown. Legacy aggregate records remain intact.
export const accountColors=[['lavender','לבנדר'],['blue','כחול'],['mint','מנטה'],['peach','אפרסק'],['rose','ורוד']];
export function cashAccountColor(p,id){
 const account=cashAccountList(p).find(account=>account.id===id);if(accountColors.some(([color])=>color===account?.color))return account.color;
 return ['blue','lavender','mint','peach'][[...String(id)].reduce((sum,char)=>sum+char.charCodeAt(0),0)%4];
}
export function cashAccountList(p){
 const map=new Map((Array.isArray(p.bankImport?.accounts)?p.bankImport.accounts:[]).map(a=>[a.id,{id:a.id,label:a.label,bankName:a.bankName}]));
 for(const a of Array.isArray(p.cashPlanning?.accounts)?p.cashPlanning.accounts:[])map.set(a.id,{...map.get(a.id),...a});return [...map.values()];
}
export function cashPlanningValid(p){
 const c=p.cashPlanning;if(c===undefined)return true;
 if(!c||typeof c!=='object'||Array.isArray(c)||!Array.isArray(c.accounts)||c.accounts.length>10||!c.months||typeof c.months!=='object'||Array.isArray(c.months)||Object.keys(c.months).length>120)return false;
 if(cashAccountList(p).length>10)return false;
 const ids=new Set(cashAccountList(p).map(a=>a.id)),own=new Set(),valueOK=v=>valuesOk(v)&&Object.keys(v).every(k=>budgetFields(p).some(f=>f[0]===k));
 for(const a of c.accounts){if(!a||typeof a.id!=='string'||!a.id||a.id.length>100||own.has(a.id)||a.color!==undefined&&!accountColors.some(([color])=>color===a.color)||typeof a.label!=='string'||!a.label.trim()||a.label.length>80||a.opening!==undefined&&(!Number.isFinite(a.opening)||Math.abs(a.opening)>100000000||cents(a.opening)/100!==a.opening)||!moneyOk(a.buffer)||a.openingMonth!==undefined&&(!monthOk(a.openingMonth)||a.openingMonth<p.startMonth)||a.defaults!==undefined&&!valueOK(a.defaults))return false;own.add(a.id);}
 for(const [m,records]of Object.entries(c.months)){if(!monthOk(m)||m<p.startMonth||!records||typeof records!=='object'||Array.isArray(records)||Object.keys(records).length>10)return false;for(const [id,r]of Object.entries(records)){if(!ids.has(id)||!r||!valueOK(r.values)||typeof r.actual!=='boolean'||typeof r.includesPlannedCard!=='boolean'||typeof r.includesPlannedDirect!=='boolean'||r.date!==undefined&&!dateOk(r.date)||r.bankImported!==undefined&&typeof r.bankImported!=='boolean'||r.balance!==undefined&&(!Number.isFinite(r.balance)||Math.abs(r.balance)>100000000||cents(r.balance)/100!==r.balance))return false;}}
 if(!c.cardAccounts||typeof c.cardAccounts!=='object'||Array.isArray(c.cardAccounts)||Object.entries(c.cardAccounts).some(([id,a])=>!creditCards(p).some(k=>k.id===id)||!ids.has(a)))return false;
 if(!Array.isArray(c.transfers)||c.transfers.length>120||new Set(c.transfers.map(t=>t?.id)).size!==c.transfers.length||c.transfers.some(t=>!t||typeof t.id!=='string'||!t.id||t.id.length>100||!monthOk(t.month)||t.month<p.startMonth||!ids.has(t.from)||!ids.has(t.to)||t.from===t.to||!moneyOk(t.amount)||!t.amount||cents(t.amount)/100!==t.amount||!['planned','included'].includes(t.status)))return false;
 return true;
}
export function cashPlanningBase(p){return clone(p.cashPlanning??{accounts:[],months:{},cardAccounts:{},transfers:[]});}
export function cashSourceRecords(p,id){
 const result={};
 for(const batch of p.bankImport?.batches??[])if(batch.accountId===id)for(const h of batch.months){const c=h.after?.bankCoverage;if(!c)continue;
 const balance=Object.hasOwn(c,'sourceBalanceCents')?c.sourceBalanceCents:h.after.cashReport?cents(h.after.cashReport.balance):null;
 result[h.month]={values:zero(),actual:c.accountComplete??c.complete,includesPlannedCard:h.after.includesPlannedCard,includesPlannedDirect:h.after.includesPlannedDirect??false,...(balance!==null?{balance:balance/100,date:c.date}:{}),fromBank:true};}
 for(const e of p.bankImport?.entries??[])if(e.accountId===id&&e.field!=='exclude'&&result[e.month]){const v=result[e.month].values;v[e.field]=(cents(v[e.field]??0)+(['salary','otherIncome','incomingTransfers'].includes(e.field)?e.cents:-e.cents))/100;}
 for(const [m,records]of Object.entries(p.cashPlanning?.months??{}))if(records[id])result[m]={...clone(records[id]),date:records[id].date??monthAt(m,1)+'-01',fromBank:records[id].bankImported===true};
 return result;
}
// Resolve saved identity evidence, never display names or the sole visible bank.
// Legacy imports recorded a payer on the source without filling cardAccounts.
export function cashCardAccount(p,cardId){
 const explicit=p.cashPlanning?.cardAccounts?.[cardId];if(explicit)return explicit;
 const payers=new Set([...(p.cardBilling?.reports??[]).filter(r=>r.cardId===cardId).map(r=>r.accountId),...(p.bankImport?.entries??[]).filter(r=>r.field===cardId).map(r=>r.accountId)].filter(Boolean));
 if(payers.size!==1)return null;
 const id=[...payers][0];return cashAccountList(p).some(a=>a.id===id)?id:null;
}
// Account IDs and saved card links are authoritative; issuer names are not.
export function cashCardsForAccount(p,accountId='',month=''){
 const cards=creditCards(p).filter(c=>!month||!c.removedFrom||month<c.removedFrom);
 if(!accountId)return cards;
 if(!cashAccountList(p).some(a=>a.id===accountId))return [];
 return cards.filter(c=>cashCardAccount(p,c.id)===accountId);
}
export function cashPaymentSelection(p,draft,key,value){
 const next={...draft};if(value)next[key]=value;else delete next[key];
 if(key==='cashAccountId'&&next.cardId&&(!next.cashAccountId||!cashCardsForAccount(p,next.cashAccountId,next.firstMonth).some(c=>c.id===next.cardId)))delete next.cardId;
 if(key==='cardId'&&value){
  const mapped=cashCardAccount(p,value);
  if(next.cashAccountId&&!cashCardsForAccount(p,next.cashAccountId,next.firstMonth).some(c=>c.id===value))throw Error('הכרטיס אינו משויך לחשבון שנבחר. בחרו כרטיס של החשבון או שנו את החשבון המשלם.');
  if(mapped&&!next.cashAccountId)next.cashAccountId=mapped;
 }
 return next;
}
export function cashPurchaseAlternatives(p,drafts,asOf){
 const active=drafts.filter(d=>d.enabled!==false&&d.amount>0);if(active.length!==1||active[0].originalId)return [];
 const purchase=active[0],paying=cashAssignedItem(p,purchase);if(!paying)return [];
 let baseline;try{baseline=previewScenario(p,drafts);}catch{return [];}
 const assess=result=>{const rows=result.accounts.flatMap(a=>a.rows.filter(r=>r.month>=asOf));if(!rows.length||rows.some(r=>r.balance===null||!Number.isFinite(r.balance)||r.issues.length))return null;return Math.min(...rows.map(r=>cents(r.balance)-cents(r.buffer)));};
 const before=assess(baseline),unit=Math.max(...Array.from({length:purchase.payments},(_,i)=>cents(paymentFor(purchase,monthAt(purchase.firstMonth,i)))));
 if(before===null||before>=unit)return [];
 const choices=[];
 for(const account of cashAccountList(p).filter(a=>a.id!==paying))for(const card of cashCardsForAccount(p,account.id,purchase.firstMonth)){
  try{
   const result=previewScenario(p,drafts.map(d=>d.id===purchase.id?{...d,cashAccountId:account.id,cardId:card.id}:d)),after=assess(result);
   if(after===null||after<0||after<=before||(before>=0&&after-before<unit))continue;
   const rows=result.accounts.find(a=>a.account.id===account.id).rows.filter(r=>r.month>=asOf),low=rows.reduce((a,b)=>cents(a.balance)-cents(a.buffer)<=cents(b.balance)-cents(b.buffer)?a:b);
   choices.push({purchaseId:purchase.id,accountId:account.id,accountLabel:account.label,cardId:card.id,cardName:card.name,beforeMargin:before/100,afterMargin:after/100,improvement:(after-before)/100,lowBalance:low.balance,lowMonth:low.month});
  }catch{}
 }
 return choices.sort((a,b)=>b.afterMargin-a.afterMargin||a.accountId.localeCompare(b.accountId)||a.cardId.localeCompare(b.cardId)).slice(0,3);
}
export function cashAssignedItem(p,e){return e.cashAccountId||(e.cardId?cashCardAccount(p,e.cardId):null)||(cashAccountList(p).length===1?cashAccountList(p)[0].id:null);}
export function cashAccountValues(p,id,month,sourceRecords=null){
 const a=cashAccountList(p).find(a=>a.id===id),records=sourceRecords??cashSourceRecords(p,id),record=records[month];
 const prior=Object.keys(records).filter(m=>m<month&&records[m].actual).sort().at(-1);
 const values=clone(record?.values??(prior?records[prior].values:a?.defaults??zero()));
 for(const k of ['incomingTransfers','outgoingTransfers'])values[k]=record?values[k]??0:a?.defaults?.[k]??0;
 for(const c of creditCards(p))values[c.id]??=0;
 if(!record&&p.loans!==undefined)values.loanRepayment=(p.loans??[]).filter(l=>cashAssignedItem(p,l)===id&&month>=l.from&&indexMonth(month)<indexMonth(l.from)+l.months).reduce((n,l)=>n+cents(l.monthly),0)/100;
 return {values,record};
}
export function cashUnassigned(p,month){
 const sums=Object.fromEntries(budgetFields(p).map(([k])=>[k,0]));for(const a of cashAccountList(p)){const {values}=cashAccountValues(p,a.id,month);for(const k of Object.keys(sums))sums[k]+=cents(values[k]??0);}
 const totals=monthlyValues(p,month);return Object.fromEntries(Object.keys(sums).map(k=>[k,(cents(totals[k]??0)-sums[k])/100]).filter(([,v])=>v!==0));
}
export function cashAccountForecast(p,id,additionalIds=[],minHorizon=0){
 const a=cashAccountList(p).find(a=>a.id===id);if(!a)throw Error('בחר חשבון בנק לתכנון.');
 const length=Math.max(p.horizon,minHorizon,...p.expenses.map(e=>indexMonth(e.firstMonth)-indexMonth(p.startMonth)+e.payments)),records=cashSourceRecords(p,id);
 const proxy={...p,_cashAccountProjection:true,opening:a.opening??0,months:{},defaults:zero(),expenses:p.expenses.filter(e=>cashAssignedItem(p,e)===id),loans:[],details:(p.details??[]).filter(e=>cashAssignedItem(p,e)===id),savingTransfers:(p.savingTransfers??[]).filter(e=>cashAssignedItem(p,e)===id)};
 let anchored=a.opening!==undefined&&(!a.openingMonth||a.openingMonth===p.startMonth);
 const anchorState=[];
 for(let i=0;i<length;i++){const month=monthAt(p.startMonth,i),{values,record}=cashAccountValues(p,id,month,records);proxy.months[month]={values,actual:record?.actual??false,includesPlannedCard:record?.includesPlannedCard??false,includesPlannedDirect:record?.includesPlannedDirect??false};
 if(a.opening!==undefined&&a.openingMonth===month){anchored=true;proxy.months[month].cashReport={balance:a.opening,net:0};proxy.months[month].bankCoverage={complete:true};}
 if(record?.balance!==undefined){anchored=true;proxy.months[month].cashReport={balance:record.balance,net:0};proxy.months[month].bankCoverage={complete:record.actual};}
 anchorState.push(anchored);}
 // A balance at the start of a month includes that month's future net; an end-of-month reading already includes its report net.
 const preliminary=forecast({...proxy,expenses:proxy.expenses.filter(e=>!additionalIds.includes(e.id)),months:Object.fromEntries(Object.entries(proxy.months).map(([m,r])=>[m,{...r,cashReport:undefined}]))},undefined,length,additionalIds);
 for(let i=0;i<length;i++){const month=monthAt(p.startMonth,i),r=proxy.months[month];if(r.cashReport)r.cashReport.net=records[month]?.balance!==undefined?preliminary[i].net:0;}
 const rows=forecast(proxy,undefined,length,additionalIds);let transferDelta=0,billingDelta=0;
 return rows.map((row,i)=>{const month=row.month;if(proxy.months[month].cashReport){transferDelta=0;billingDelta=0;}const billingAdjustment=billingForecastAdjustment(p,id,month,records[month],proxy.months[month].values);billingDelta-=cents(billingAdjustment);let transferNet=0;
 for(const t of p.cashPlanning?.transfers??[])if(t.month===month&&t.status==='planned')transferNet+=(t.to===id?cents(t.amount):0)-(t.from===id?cents(t.amount):0);transferDelta+=transferNet;
 const issues=[];if(!anchorState[i])issues.push('חסרה יתרת עו״ש לחשבון');
 if(Object.keys(cashUnassigned(p,month)).length)issues.push('יש סכומים חודשיים ללא שיוך או שאינם תואמים לסיכום');
 if(p.expenses.some(e=>!cashAssignedItem(p,e)&&paymentFor(e,month)>0)||(p.loans??[]).some(l=>!cashAssignedItem(p,l)&&month>=l.from&&indexMonth(month)<indexMonth(l.from)+l.months)||(p.details??[]).some(e=>additionalCheque(e)&&e.month===month&&!cashAssignedItem(p,e))||(p.savingTransfers??[]).some(t=>t.month===month&&t.status==='pending'&&!cashAssignedItem(p,t)))issues.push('יש התחייבויות ללא חשבון משלם');
 if(creditCards(p).some(c=>cents(proxy.months[month].values[c.id]??0)>0&&p.cashPlanning?.cardAccounts[c.id]&&p.cashPlanning.cardAccounts[c.id]!==id))issues.push('יש חיוב כרטיס המשויך לחשבון אחר');
 const latestRecord=records[month]??records[Object.keys(records).filter(m=>m<month).sort().at(-1)];if(latestRecord?.fromBank&&!latestRecord.actual)issues.push('דוח הבנק לחודש זה חלקי');
 return {...row,net:(cents(row.net)+transferNet-cents(billingAdjustment))/100,internalTransfer:transferNet/100,balance:anchorState[i]?(cents(row.balance)+transferDelta+billingDelta)/100:null,accountId:id,label:a.label,buffer:a.buffer??0,issues};});
}
export function cashScenarioForecast(p,additionalIds=[],minHorizon=0){return cashAccountList(p).map(a=>({account:a,rows:cashAccountForecast(p,a.id,additionalIds,minHorizon)}));}
// The multi-account overview must use the same projections as the account tabs.
export function cashOverview(p,month){
 const accounts=cashAccountList(p).map(a=>{const row=cashAccountForecast(p,a.id,[],Math.max(p.horizon,indexMonth(month)-indexMonth(p.startMonth)+1)).find(r=>r.month===month);return {id:a.id,row};});
 const known=accounts.length>0&&accounts.every(a=>a.row&&a.row.balance!==null);
 return {balance:known?accounts.reduce((n,a)=>n+cents(a.row.balance),0)/100:null,partial:accounts.some(a=>!a.row||a.row.balance===null||a.row.issues.length>0),count:accounts.length};
}
export function cashScenarioSafe(p,additionalIds,asOf){const accounts=cashScenarioForecast(p,additionalIds);return accounts.length>0&&accounts.every(a=>a.rows.filter(r=>r.month>=asOf).length>0&&a.rows.filter(r=>r.month>=asOf).every(r=>r.balance!==null&&!r.issues.length&&r.balance>=r.buffer));}
export function saveCashAccount(p,account){const next=clone(p);next.cashPlanning=cashPlanningBase(p);next.cashPlanning.accounts=[...next.cashPlanning.accounts.filter(a=>a.id!==account.id),account];if(!validatePlan(next))throw Error('פרטי החשבון אינם תקינים.');return next;}
export function saveCashMonth(p,id,month,record,asOf){
 if(record.actual&&month>asOf)throw Error('חודש עתידי נשמר כהערכה בלבד.');const next=clone(p),before=cashAccountValues(p,id,month).values;next.cashPlanning=cashPlanningBase(p);next.cashPlanning.months[month]??={};next.cashPlanning.months[month][id]=record;
 const combined=clone(monthlyValues(p,month));for(const [k]of budgetFields(p)){const n=cents(combined[k]??0)-cents(before[k]??0)+cents(record.values[k]??0);if(n<0)throw Error('הסיכום הקיים קטן מסכומי החשבון. יש לשייך תחילה את הנתונים ללא חשבון.');combined[k]=n/100;}
 next.months[month]={...(next.months[month]??{}),values:combined,actual:cashAccountList(next).every(a=>cashAccountValues(next,a.id,month).record?.actual)&&!Object.keys(cashUnassigned(next,month)).length,includesPlannedCard:false};
 // A manual account update invalidates only a combined anchor; individual source readings remain available.
 delete next.months[month].cashReport;
 if(next.savingsGoals)Object.assign(next,confirmMonthlySavings(next,month,asOf,!next.months[month].actual));
 if(!validatePlan(next))throw Error('הדיווח לחשבון אינו תקין.');return next;
}
export function assignCashRemainder(p,id,month){const next=clone(p),rest=cashUnassigned(p,month);if(Object.values(rest).some(v=>v<0))throw Error('יש פער בין החשבונות לסיכום; בדוק את הסכומים לפני שיוך.');const current=cashAccountValues(p,id,month);next.cashPlanning=cashPlanningBase(p);next.cashPlanning.months[month]??={};const values=clone(current.values);for(const [k,v]of Object.entries(rest))values[k]=(cents(values[k]??0)+cents(v))/100;next.cashPlanning.months[month][id]={values,actual:current.record?.actual??p.months[month]?.actual??false,includesPlannedCard:current.record?.includesPlannedCard??false,includesPlannedDirect:current.record?.includesPlannedDirect??false,...(current.record?.balance!==undefined?{balance:current.record.balance}:{})};if(!validatePlan(next))throw Error('לא ניתן לשייך את הנתונים.');return next;}

export function cashLinksValid(p){if(['expenses','loans','details','savingTransfers'].some(k=>p[k]!==undefined&&!Array.isArray(p[k])))return false;const ids=new Set(cashAccountList(p).map(a=>a.id));return [...(p.expenses??[]),...(p.loans??[]),...(p.details??[]),...(p.savingTransfers??[])].every(e=>(e.cashAccountId===undefined||ids.has(e.cashAccountId))&&(e.cardId===undefined||creditCards(p).some(c=>c.id===e.cardId))&&(!e.cashAccountId||!e.cardId||!p.cashPlanning?.cardAccounts[e.cardId]||p.cashPlanning.cardAccounts[e.cardId]===e.cashAccountId));}

function cashPlanIncludes(p,e,month,record){const id=!p._cashAccountProjection&&cashAccountList(p).length>1?cashAssignedItem(p,e):null;const r=id?cashSourceRecords(p,id)[month]:record;return !!(r?.includesPlannedCard&&e.source==='card'&&e.kind==='expense'||r?.includesPlannedDirect&&e.source==='direct');}

export function reportInboxValid(p){
 const b=p.reportInbox;if(b===undefined)return true;
 const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s),id=s=>typeof s==='string'&&s.length>0&&s.length<=100;
 return !!b&&b.version===1&&Array.isArray(b.bindings)&&b.bindings.length<=100&&Array.isArray(b.receipts)&&b.receipts.length<=2000&&new Set(b.bindings.map(r=>r?.key)).size===b.bindings.length&&new Set(b.receipts.map(r=>r?.hash)).size===b.receipts.length&&b.bindings.every(r=>r&&hash(r.key)&&['bank','card'].includes(r.kind)&&id(r.target))&&b.receipts.every(r=>r&&hash(r.hash)&&['bank','card'].includes(r.kind)&&id(r.target)&&id(r.reference)&&(r.proof===undefined||hash(r.proof)));
}
