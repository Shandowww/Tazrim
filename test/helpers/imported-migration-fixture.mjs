import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {zero,validatePlan} from '../../src/budget.js';
import {bankIdentity,applyBankImport} from '../../src/bank-import-model.js';
const hash=s=>createHash('sha256').update(s).digest('hex'),base=()=>({startMonth:'2026-01',opening:0,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true});
export async function fixture(){
 const p=base();p.opening=300;p.cashPlanning={accounts:[{id:'a',label:'נבחר',opening:100,buffer:0,defaults:zero(),bankName:'hapoalim'},{id:'b',label:'SECRET-OTHER-ACCOUNT',opening:200,buffer:0,defaults:zero()}],months:{'2026-02':{a:{values:zero(),actual:true,includesPlannedCard:false,includesPlannedDirect:false},b:{values:zero(),actual:true,includesPlannedCard:false,includesPlannedDirect:false}}},cardAccounts:{},transfers:[]};
 const rows=await Promise.all([{line:1,date:'2026-02-10',amountCents:12345,description:'משכורת נבחרת',beneficiary:'מוטב נבחר',details:'פרטים',purpose:'',reference:'salary-ref',currency:'ILS',valid:true,balanceCents:null},{line:2,date:'2026-02-11',amountCents:-2345,description:'הוצאה נבחרת',beneficiary:'מוטב שני',details:'',purpose:'',reference:'expense-ref',currency:'ILS',valid:true,balanceCents:null}].map(r=>bankIdentity(r,'a')));
 const plan=applyBankImport(p,rows,{id:'report-a',accountId:'a',label:'SECRET-IMPORT-LABEL',bankName:'hapoalim',fileName:'SECRET-PRIVATE-FILENAME.csv',from:'2026-02-01',to:'2026-02-28',asOf:'2026-10',coverageConfirmed:true,monthsConfirmed:true,modes:{'2026-02':'full'},choices:{1:{field:'salary',reviewed:true},2:{field:'variable',reviewed:true}},rules:[{text:'SECRET-PRIVATE-RULE',direction:'in',destination:'salary'}]});
 plan.reportInbox={version:1,bindings:[{key:hash('SECRET-BINDING'),kind:'bank',target:'a'}],receipts:[{hash:hash('source-file'),kind:'bank',target:'a',reference:'report-a'}]};plan.bankImport.batches[0].months[0].before={values:zero(),actual:false,includesPlannedCard:false,note:'SECRET-MIXED-SNAPSHOT'};plan.bankImport.batches[0].months[0].beforeCash.b.note='SECRET-OTHER-SNAPSHOT';assert.ok(validatePlan(plan));return{plan,rows};
}
