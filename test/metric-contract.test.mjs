import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoPlan,monthlyMetricSnapshot,zero,clone,validatePlan} from '../src/budget.js';

test('monthly metrics keep bank card settlement and internal transfers out of purchase detail',()=>{
 const p=createDemoPlan('2026-10');p.demo=false;p.expenses=[];
 p.months['2026-04']={values:{...zero(),card1:3000,variable:200},actual:true,includesPlannedCard:false};
 p.details=[
  {id:'purchase',name:'קנייה',category:'מזון',method:'card1',amount:3000,month:'2026-04',date:'2026-04-10',number:'',status:'cleared',accounting:'included'},
  {id:'direct',name:'תשלום ישיר',category:'חינוך',method:'variable',amount:200,month:'2026-04',date:'2026-04-12',number:'',status:'cleared',accounting:'included'},
  {id:'pending',name:'צ׳ק ממתין',category:'דיור',method:'checks',amount:500,month:'2026-04',date:'2026-04-20',number:'',status:'pending',accounting:'additional'}
 ];
 p.bankImport={version:1,accounts:[{id:'own',label:'חשבון אישי',rules:[]}],batches:[{id:'batch',accountId:'own',file:'test.csv',from:'2026-04-01',to:'2026-04-30',months:[]}],entries:[
  {key:'a'.repeat(64),fingerprint:'1'.repeat(64),month:'2026-04',field:'card1',cents:-300000,accountId:'own',batchId:'batch'},
  {key:'b'.repeat(64),fingerprint:'2'.repeat(64),month:'2026-04',field:'variable',cents:-20000,accountId:'own',batchId:'batch'},
  {key:'c'.repeat(64),fingerprint:'3'.repeat(64),month:'2026-04',field:'exclude',cents:-4000000,accountId:'own',batchId:'batch'},
  {key:'d'.repeat(64),fingerprint:'4'.repeat(64),month:'2026-04',field:'exclude',cents:4000000,accountId:'own',batchId:'batch'}
 ]};
 assert.equal(validatePlan(p),true);const before=clone(p),options={asOf:'2026-05',scope:'personal:synthetic',revision:7};
 const reported=monthlyMetricSnapshot(p,'reported-spending','2026-04',options),detail=monthlyMetricSnapshot(p,'categorized-detail','2026-04',options),bank=monthlyMetricSnapshot(p,'bank-debits','2026-04',{...options,accountId:'own'});
 assert.equal(reported.valueCents,320000);assert.equal(detail.valueCents,320000);assert.equal(detail.reconciliation.remainderCents,0);
 assert.equal(bank.valueCents,4320000);assert.equal(bank.creditsCents,4000000);
 assert.deepEqual(reported.sources,['monthly-expense-fields']);assert.deepEqual(detail.sources,['cleared-included-details']);assert.deepEqual(bank.sources,['imported-bank-movements']);
 assert.equal(reported.currency,'ILS');assert.equal(reported.unit,'agorot');assert.equal(reported.version,1);assert.equal(reported.revision,7);assert.deepEqual(p,before);
});

test('missing months and partial bank sources carry coverage rather than a false complete zero',()=>{
 const p=createDemoPlan('2026-10');p.demo=false;p.details=[];p.months={};p.bankImport={version:1,accounts:[{id:'own',label:'חשבון',rules:[]}],batches:[],entries:[]};
 const reported=monthlyMetricSnapshot(p,'reported-spending','2026-09',{asOf:'2026-10'}),bank=monthlyMetricSnapshot(p,'bank-debits','2026-09',{asOf:'2026-10',accountId:'own'});
 assert.equal(reported.valueCents,null);assert.equal(reported.coverage.actual,false);
 assert.equal(bank.valueCents,0);assert.equal(bank.coverage.selectedAccountStatus,'missing');assert.equal(bank.sourceCount,0);
 assert.throws(()=>monthlyMetricSnapshot(p,'bank-debits','2026-09',{accountId:'unknown'}));
});
