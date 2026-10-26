import test from 'node:test';
import assert from 'node:assert/strict';
import {zero,clone,validatePlan,forecast,cashAccountForecast,cashUnassigned,assignCashRemainder,saveCashMonth,saveCashAccount,cashScenarioSafe,previewScenario,shortestScenarioPayments,cashSourceRecords,savingsBalances,cashOverview} from '../src/budget.js';
import {bankIdentity,applyBankImport,undoBankImport} from '../src/bank-import-model.js';
const month='2026-10';
const record=values=>({values:{...zero(),...values},actual:true,includesPlannedCard:false,includesPlannedDirect:false});
function fixture(){return {startMonth:month,opening:9100,buffer:0,horizon:12,defaults:{...zero(),salary:2000},months:{},expenses:[],demo:false,cashPlanning:{accounts:[{id:'a',label:'הפועלים',opening:100,openingMonth:month,buffer:0,defaults:{...zero(),salary:1000}},{id:'b',label:'וואן זירו',opening:9000,openingMonth:month,buffer:0,defaults:{...zero(),salary:1000}}],months:{},cardAccounts:{card1:'a',card2:'b'},transfers:[]}};}
const purchase={id:'new',name:'מחשב',amount:1500,fees:0,firstMonth:month,payments:1,source:'card',cashAccountId:'a',cardId:'card1',kind:'expense'};
test('A positive combined balance cannot hide an overdraft in the paying bank or approve its installments',()=>{
 const p=fixture(),before=JSON.stringify(p);assert(validatePlan(p));assert(forecast(p,purchase)[0].balance>0);
 const result=previewScenario(p,[purchase]);assert.equal(result.accounts[0].rows[0].balance,-400);assert.equal(result.accounts[1].rows[0].balance,10000);assert.equal(cashScenarioSafe(result.plan,['new'],month),false);
 assert.equal(shortestScenarioPayments(p,[purchase],'new',month),2);assert.equal(JSON.stringify(p),before);
 assert.throws(()=>previewScenario(p,[{...purchase,cashAccountId:undefined,cardId:undefined}]),/חשבון משלם/);
});
test('Missing balance, unassigned monthly figures, commitments or a mismatched card block safe recommendations',()=>{
 const p=fixture();delete p.cashPlanning.accounts[0].opening;assert.equal(cashAccountForecast(p,'a')[0].balance,null);assert.equal(shortestScenarioPayments(p,[purchase],'new',month),null);
 const manual=fixture();manual.defaults.variable=200;assert(cashAccountForecast(manual,'a')[0].issues.some(x=>x.includes('סכומים')));assert.equal(shortestScenarioPayments(manual,[purchase],'new',month),null);
 const debts=fixture();debts.expenses.push({...purchase,id:'legacy',cashAccountId:undefined,cardId:undefined});assert(cashAccountForecast(debts,'a')[0].issues.some(x=>x.includes('התחייבויות')));
 assert.equal(validatePlan({...fixture(),expenses:[{...purchase,cashAccountId:'b'}]}),false);
});
test('An explicit inter-bank transfer changes both accounts once and leaves aggregate income/spending and savings unchanged',()=>{
 const p=fixture(),before=forecast(p);p.cashPlanning.transfers.push({id:'transfer',from:'b',to:'a',month,amount:500,status:'planned'});
 assert.equal(cashAccountForecast(p,'a')[0].balance,1600);assert.equal(cashAccountForecast(p,'b')[0].balance,9500);assert.deepEqual(forecast(p),before);assert.equal(cashAccountForecast(p,'a')[1].balance,2600);
 assert.equal(cashScenarioSafe(previewScenario(p,[purchase]).plan,['new'],month),true);p.cashPlanning.transfers[0].status='included';assert.equal(cashAccountForecast(p,'a')[0].balance,1100);
 assert.equal(validatePlan({...p,cashPlanning:{...p.cashPlanning,transfers:[{...p.cashPlanning.transfers[0],to:'b'}]}}),false);
});
test('Account reports retain their own planned inclusion flags and finite loan payments',()=>{
 const p=fixture();p.months[month]=record({salary:2000,card1:500});p.cashPlanning.months[month]={a:{...record({salary:1000,card1:500}),includesPlannedCard:true},b:record({salary:1000})};p.expenses=[{...purchase,amount:500}];
 assert.equal(cashAccountForecast(p,'a')[0].balance,600);assert.equal(cashAccountForecast(p,'b')[0].balance,10000);assert.equal(forecast(p)[0].planned,0);
 p.loans=[{id:'loan',name:'הלוואה',monthly:100,from:month,months:2,cashAccountId:'a'}];assert.equal(cashAccountForecast(p,'a')[1].spending,600);assert.equal(cashAccountForecast(p,'a')[2].spending,500);assert.equal(cashAccountForecast(p,'b')[1].spending,0);
});
test('Assigning legacy monthly amounts preserves aggregate records and all money, then per-account edits update only their delta',()=>{
 const p=fixture();p.months[month]=record({salary:2000,variable:300});p.cashPlanning.months[month]={a:record({salary:1000}),b:record({salary:1000})};
 const original=JSON.stringify(p),n=assignCashRemainder(p,'b',month);assert.deepEqual(n.months,p.months);assert.equal(n.cashPlanning.months[month].b.values.variable,300);assert.deepEqual(cashUnassigned(n,month),{});assert.equal(JSON.stringify(p),original);
 const edited=saveCashMonth(n,'a',month,{...record({salary:1000,variable:100}),balance:-50},month);assert.equal(edited.months[month].values.variable,400);assert.equal(edited.cashPlanning.months[month].b.values.variable,300);assert.equal(cashAccountForecast(edited,'a')[0].balance,-50);assert.deepEqual(cashUnassigned(edited,month),{});
 assert.throws(()=>saveCashMonth(n,'a','2026-11',record({salary:1000}),month),/עתידי/);
});
async function imported(p,id,batch,amount,balance,date='2026-10-31'){
 const r=await bankIdentity({line:1,date,description:'משכורת',details:'',beneficiary:'',purpose:'',reference:batch,amountCents:amount,balanceCents:balance,valid:true,currency:'ILS'},id);
 const rows=[r];if(id==='a'&&batch==='second')rows.push(await bankIdentity({line:2,date:'2026-10-31',description:'משכורת',details:'',beneficiary:'',purpose:'',reference:'first',amountCents:100000,balanceCents:null,valid:true,currency:'ILS'},id));
 return applyBankImport(p,rows,{id:batch,accountId:id,label:id,rules:[],fileName:'synthetic.csv',from:'2026-10-01',to:'2026-10-31',asOf:month,coverageConfirmed:true,monthsConfirmed:true,choices:{1:{field:'salary',reviewed:true},2:{field:'salary',reviewed:true}},modes:{[month]:'full'}});
}
test('Existing imported ledgers reconstruct separate bank figures and independent balance dates without migrating data',async()=>{
 const p=fixture();delete p.cashPlanning;p.defaults=zero();const one=await imported(p,'a','first',100000,10000,'2026-10-30'),two=await imported(one,'b','second',200000,900000);
 const before=JSON.stringify(two);assert.equal(cashSourceRecords(two,'a')[month].balance,100);assert.equal(cashSourceRecords(two,'b')[month].balance,9000);assert.equal(cashAccountForecast(two,'a')[0].balance,100);assert.equal(cashAccountForecast(two,'b')[0].balance,9000);assert.equal(two.months[month].cashReport,undefined);assert.equal(JSON.stringify(two),before);
 const result=previewScenario(two,[{...purchase,source:'direct',cardId:undefined}]);assert.equal(result.accounts[0].rows[0].balance,-1400);assert.equal(result.accounts[1].rows[0].balance,9000);
});
test('Reviewed reimport replaces only its manual account override and exact undo protects later account edits',async()=>{
 const p=fixture();delete p.cashPlanning;p.defaults=zero();let one=await imported(p,'a','first',100000,10000);one=saveCashAccount(one,{id:'a',label:'אישי',buffer:0});
 one=saveCashMonth(one,'a',month,{...record({salary:1500}),balance:500},month);
 const next=await imported(one,'a','second',50000,60000);assert.equal(next.cashPlanning.months[month].a.values.salary,1500);assert.equal(cashSourceRecords(next,'a')[month].values.salary,1500);assert.deepEqual(undoBankImport(next,'second'),one);
 const edited=saveCashMonth(next,'a',month,record({salary:1600}),month);assert.throws(()=>undoBankImport(edited,'second'),/הנתונים השתנו/);
});
test('Malformed account storage is rejected and old budgets with pooled goals are untouched',()=>{
 const p=fixture();p.savingsGoals={balance:1000,snapshotMonth:month,items:[{id:'goal',name:'חופשה',allocated:200,target:3000,monthly:0,icon:'plane'}],deposits:{}};const original=savingsBalances(p,month);assert(validatePlan(p));assert.deepEqual(savingsBalances(saveCashAccount(p,{...p.cashPlanning.accounts[0],opening:-50}),month),original);
 const bad=clone(p);bad.cashPlanning.accounts[0].opening=1.001;assert.equal(validatePlan(bad),false);bad.cashPlanning.accounts[0].opening=100;bad.cashPlanning.cardAccounts.card1='unknown';assert.equal(validatePlan(bad),false);delete p.cashPlanning;assert(validatePlan(p));
});
test('Account storage validation handles malformed arrays without exceptions and partial sources cannot certify future months',async()=>{
 for(const cashPlanning of [{accounts:{},months:{}},{accounts:[],months:[],transfers:[]}])assert.equal(validatePlan({...fixture(),cashPlanning}),false);
 assert.equal(validatePlan({...fixture(),expenses:{}}),false);
 const p=fixture();delete p.cashPlanning;p.defaults=zero();let one=await imported(p,'a','partial',100000,10000);one.bankImport.batches[0].months[0].after.bankCoverage.accountComplete=false;assert(cashAccountForecast(one,'a')[1].issues.some(x=>x.includes('חלקי')));
});
test('Importing one account preserves edited amounts of another account and keeps unimported manual fields',async()=>{
 let p=fixture();delete p.cashPlanning;p.defaults=zero();p=await imported(p,'a','first',100000,10000);p=await imported(p,'b','other',200000,900000);
 p=saveCashMonth(p,'b',month,record({salary:2500,variable:100}),month);p=saveCashMonth(p,'a',month,record({salary:1200,variable:50}),month);
 const next=await imported(p,'a','second',50000,60000);assert.equal(next.months[month].values.salary,4000);assert.equal(next.months[month].values.variable,150);assert.equal(cashSourceRecords(next,'b')[month].values.salary,2500);assert.equal(cashSourceRecords(next,'a')[month].values.variable,50);assert.deepEqual(cashUnassigned(next,month),{});assert.deepEqual(undoBankImport(next,'second'),p);
});
test('A future pooled saving change must be assigned before the account calculator can certify affordability',()=>{
 const p=fixture();p.months[month]=record({salary:2000});p.cashPlanning.months[month]={a:record({salary:1000}),b:record({salary:1000})};p.savingSchedules=[{from:'2026-11',personalSaving:500,sharedSaving:0}];assert.equal(cashUnassigned(p,'2026-11').personalSaving,500);assert.equal(shortestScenarioPayments(p,[purchase],'new',month),null);
});

test('Account overview agrees with each tab, preserves missing balances and does not mutate the plan',()=>{const p=fixture(),before=JSON.stringify(p);assert.equal(cashOverview(p,month).balance,11100);assert.equal(JSON.stringify(p),before);p.cashPlanning.transfers.push({id:'t',from:'b',to:'a',month,amount:300,status:'planned'});assert.equal(cashOverview(p,month).balance,11100);delete p.cashPlanning.accounts[0].opening;assert.equal(cashOverview(p,month).balance,null);assert.equal(cashOverview(p,month).partial,true);});
