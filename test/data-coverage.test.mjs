import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoPlan,monthlyDataCoverage,clone,zero,validatePlan} from '../src/budget.js';

const detail=(amount,month='2026-09')=>({id:'detail',name:'חנות',category:'מזון',method:'card1',amount,month,date:month+'-10',number:'',status:'cleared',accounting:'included'});
const sample=()=>{const p=createDemoPlan('2026-10');p.demo=false;p.expenses=[];p.details=[detail(60)];p.months['2026-09'].values={...zero(),card1:100};return p;};

test('Manual totals remain distinct from bank and card source files',()=>{
 const p=sample(),before=clone(p),result=monthlyDataCoverage(p,'2026-09','2026-10');
 assert.equal(result.actual,true);assert.equal(result.closed,true);assert.equal(result.bankFiles,0);assert.deepEqual(result.accounts,[]);
 assert.equal(result.cardFiles,0);assert.ok(result.cards.every(card=>card.status==='manual'));
 assert.equal(result.detail.status,'partial');assert.equal(result.detail.remainderCents,4000);assert.deepEqual(p,before);
});

test('A full bank file requires explicit account coverage and an elapsed month; card files are independent evidence',()=>{
 const p=sample();p.bankImport={version:1,accounts:[{id:'bank',label:'חשבון אישי',rules:[]}],entries:[],batches:[{id:'batch',accountId:'bank',file:'statement.csv',from:'2026-09-01',to:'2026-09-30',months:[{month:'2026-09',after:{bankCoverage:{accountId:'bank',from:'2026-09-01',to:'2026-09-30',date:'2026-09-30',complete:true,accountComplete:true}}}]}]};
 p.cardBilling={version:1,reports:[{cardId:'card1',accountId:'bank',dueDate:'2026-09-15',updatedOn:'2026-09-15',amount:100,status:'included',source:'file'},{cardId:'card2',accountId:'bank',dueDate:'2026-09-15',updatedOn:'2026-09-15',amount:0,status:'pending',source:'manual'}]};
 const result=monthlyDataCoverage(p,'2026-09','2026-10');assert.equal(result.bankFiles,1);assert.equal(result.cardFiles,1);assert.equal(result.accounts[0].status,'file');assert.deepEqual(result.cards.map(card=>card.status),['file','manual']);
 assert.equal(monthlyDataCoverage(p,'2026-09','2026-09').accounts[0].status,'partial');
 p.bankImport.batches[0].months[0].after.bankCoverage.accountComplete=false;
 assert.equal(monthlyDataCoverage(p,'2026-09','2026-10').accounts[0].status,'partial');
 p.bankImport.batches[0].months[0].after.bankCoverage.accountComplete=true;
 p.bankImport.batches.push({id:'later',accountId:'bank',months:[{month:'2026-09',after:{bankCoverage:{accountId:'bank',from:'2026-09-15',to:'2026-09-30',complete:false,accountComplete:false}}}]});
 assert.equal(monthlyDataCoverage(p,'2026-09','2026-10').accounts[0].status,'partial');
});

test('A bank-imported zero card total is not mistaken for a manually checked card statement',()=>{
 const p=sample();p.months['2026-09'].bankCoverage={accountId:'bank',from:'2026-09-01',to:'2026-09-30',date:'2026-09-30',complete:true,accountComplete:true};
 p.bankImport={version:1,accounts:[{id:'bank',label:'חשבון',rules:[]}],entries:[{field:'card1',month:'2026-09',accountId:'bank'}],batches:[]};
 assert.deepEqual(monthlyDataCoverage(p,'2026-09','2026-10').cards.map(card=>card.status),['bank','missing']);
});

test('Detail reconciliation distinguishes exact match, excess, and a pending edit',()=>{
 const p=sample();p.details=[detail(100)];
 let result=monthlyDataCoverage(p,'2026-09','2026-10');assert.equal(result.detail.status,'matched');assert.equal(result.detail.remainderCents,0);
 p.details[0].amount=120;result=monthlyDataCoverage(p,'2026-09','2026-10');assert.equal(result.detail.status,'over');assert.equal(result.detail.remainderCents,-2000);
 p.details=[];assert.equal(monthlyDataCoverage(p,'2026-09','2026-10').detail.status,'missing');
 p.details=[detail(100)];assert.equal(monthlyDataCoverage(p,'2026-09','2026-09').detail.status,'partial');
 assert.equal(monthlyDataCoverage(p,'2026-09','2026-10','2026-09').actual,false);
 assert.equal(validatePlan(sample()),true);
});
