import test from 'node:test';
import assert from 'node:assert/strict';
import {zero, validatePlan} from '../src/budget.js';
import {billingForecastAdjustment, saveBillingReport} from '../src/card-billing-model.js';
import {bankCardDebit} from '../src/bank-card-settlement.js';
import {buildReportInbox, changeReportInbox, inboxLegacyBankGroupKey, reportInboxDraft} from '../src/report-inbox-controller.js';
import {bankClassificationOptions, reportReviewChecks} from '../frontend/src/app/report-classification-model.ts';
import {prepareNativeBankReport} from '../frontend/src/app/bank-report-command.ts';
import * as classifier from '../tools/bank-csv/classifier.mjs';

const asOf = '2026-05';
const today = asOf + '-29';
const date = asOf + '-10';
const payer = 'bank-a';
const plan = () => ({
 startMonth: '2026-01', opening: 0, buffer: 0, horizon: 12, defaults: zero(), months: {}, expenses: [], demo: false,
 creditCards: [{id: 'card1', name: 'כרטיס ראשון', alias: '1234', issuer: 'cal'}, {id: 'card2', name: 'כרטיס שני', alias: '5678', issuer: 'cal'}],
 cashPlanning: {accounts: [{id: payer, label: 'חשבון א', buffer: 0}, {id: 'bank-b', label: 'חשבון ב', buffer: 0}], months: {}, cardAccounts: {card1: payer, card2: payer}, transfers: []}
});
const bill = (p, cardId, amount, evidence = {}) => saveBillingReport(p, {cardId, accountId: payer, dueDate: date, amount, source: 'file', ...evidence}, today);
const record = (line, amountCents, extra = {}) => ({
 line, date, amountCents, description: 'כאל', details: '', beneficiary: '', purpose: '', reference: 'ref-' + line, valid: true, currency: 'ILS', balanceCents: null, ...extra
});
const bank = records => ({
 id: 'bank-source', name: 'bank.csv', kind: 'bank', target: payer, hash: 'a'.repeat(64), from: '2026-05-01', to: '2026-05-31', records,
 decisions: {}, directIncluded: {}, monthDecisions: {}, bankOptions: {scope: 'complete'}
});
const review = items => ({
 items, newAccounts: [], newCards: [], categoryChoices: new Map(), bankChoices: new Map(), startMonth: '2026-01', duplicates: 0, merchantRules: []
});
const build = (p, ui) => buildReportInbox(p, ui, {month: asOf, today, classifier, activityAPI: null});

test('Unique exact card debits from one issuer automatically go to different cards and each is counted once', async () => {
 const p = bill(bill(plan(),'card1',124.56),'card2',46.10), before = structuredClone(p);
 const item = bank([record(1,-12456),record(2,-4610,{date: asOf+'-12',valueDate:date})]), ui = review([item]);
 await build(p,ui);
 assert.deepEqual(item.preview.rows.map(row => [row.field,row.reviewed,row.cardSettlement.matched]), [['card1',true,true],['card2',true,true]]);
 assert.equal(ui.issues,0);
 assert.equal(reportReviewChecks(ui).length,0);
 assert.deepEqual(ui.build.bankImport.entries.map(row => [row.field,row.cents]), [['card1',-12456],['card2',-4610]]);
 assert.equal(ui.build.months[asOf].values.card1,124.56);
 assert.equal(ui.build.months[asOf].values.card2,46.10);
 assert.equal(billingForecastAdjustment(ui.build,payer,asOf,{date:asOf+'-31',fromBank:true},ui.build.months[asOf].values),0);
 assert.deepEqual(p,before);
});

test('Equal amounts show the candidate cards and an explicit choice affects only that bank row', async () => {
 const p = bill(bill(plan(),'card1',120),'card2',120);
 const item = bank([record(1,-12000),record(2,-9900)]), ui = review([item]);
 await build(p,ui);
 assert.deepEqual(item.preview.rows[0].cardSettlement.candidates.map(row => row.cardId), ['card1','card2']);
 assert.equal(item.preview.rows[0].reviewed,false);
 assert.equal(item.preview.rows[1].cardSettlement.candidates.length,0);
 assert.equal(ui.build,null);
 assert.deepEqual(reportReviewChecks(ui).map(check => check.label), ['בחירת כרטיס לחיוב הבנק','בחירת כרטיס לחיוב הבנק']);
 await changeReportInbox(p,ui,{dataset:{inboxBankReviewGroup:'0'},value:'card2'});
 await build(p,ui);
 assert.deepEqual(item.preview.rows.map(row => [row.field,row.reviewed]), [['card2',true],['',false]]);
 await changeReportInbox(p,ui,{dataset:{inboxBankReviewGroup:'1'},value:'card1'});
 await build(p,ui);
 assert.equal(ui.issues,0);
 assert.deepEqual(ui.build.bankImport.accounts[0].rules,[]);
 const saved = reportInboxDraft(ui,'test'), next = {...review(structuredClone(saved.items)),bankChoices:new Map(saved.bankChoices)};
 await build(p,next);
 assert.deepEqual(next.build,ui.build);
});

test('Missing, inconsistent or informal bank and statement evidence remains manual', async () => {
 let p = plan();
 p.cashPlanning.cardAccounts.card1 = 'bank-b';
 p = bill(bill(p,'card1',123,{accountId:'bank-b'}),'card2',456,{source:'manual'});
 const item = bank([
  record(1,-12300),record(2,-45600),record(3,-12300,{description:'עמלה הקצאת אשראי'}),
  record(4,-12300,{description:'תשלום לספק',details:'max'}),record(5,12300),record(6,-12300,{reversal:true})
 ]);
 await build(p,review([item]));
 assert.ok(item.preview.rows.slice(0,2).every(row=>!row.reviewed && row.cardSettlement.candidates.length===0));
 assert.ok(item.preview.rows.slice(2).every(row=>!row.cardSettlement));
 assert.equal(bankCardDebit(record(7,-100,{description:'מקס סטוק'})),null);
 assert.equal(bankCardDebit(record(8,-100,{description:'מזרחי-כאל (תאריך ערך: 10/05)'})).issuer,'cal');

 const mismatched = bill(plan(),'card1',123);
 const invalid = bank([record(1,-12300,{date:asOf+'-09',valueDate:date}),record(2,-12300,{description:'ישראכרט'})]);
 await build(mismatched,review([invalid]));
 assert.ok(invalid.preview.rows.every(row=>!row.reviewed));
});

test('Two distinct bank rows or an existing debit cannot claim the same charge automatically', async () => {
 const p = bill(plan(),'card1',120);
 const double = bank([record(1,-12000),record(2,-12000)]);
 await build(p,review([double]));
 assert.ok(double.preview.rows.every(row=>!row.reviewed && row.cardSettlement.candidates.length===1));

 const first = review([bank([record(1,-12000)])]);
 await build(p,first);
 const second = bank([record(2,-12000)]);
 second.id = 'second-bank';
 second.hash = 'b'.repeat(64);
 await build(first.build,review([second]));
 assert.ok(!second.preview.rows[0].reviewed);
 assert.equal(second.preview.rows[0].cardSettlement.candidates.length,1);
});

test('A parsed card statement in the same group supplies evidence in either file order', async () => {
 const p = plan();
 delete p.cashPlanning.cardAccounts.card2;
 const item = bank([record(1,-12000)]), card = {
  id:'card-file', name:'card.pdf', kind:'card', target:'card2', payer, hash:'c'.repeat(64), decisions:{},
  report:{issuer:'cal',dueDate:date,amount:120,entries:[{merchant:'בית עסק לדוגמה',date:asOf+'-01',amountCents:12000,originalCents:12000,notes:''}]}
 };
 const ui = review([item,card]);
 await build(p,ui);
 assert.equal(item.preview.rows[0].field,'card2');
 assert.ok(bankClassificationOptions(p,item.preview.rows,payer).some(([key])=>key==='card2'));
 assert.equal(ui.issues,0);
 assert.ok(validatePlan(ui.build));
 assert.equal(ui.build.bankImport.entries[0].cents,-12000);
 assert.equal(ui.build.details.length,1);
 assert.equal(ui.build.cardBilling.reports[0].amount,120);
 const reverse = review([structuredClone(card),bank([record(1,-12000)])]);
 await build(p,reverse);
 assert.deepEqual(reverse.build.bankImport,ui.build.bankImport);

 const summaryOnly = structuredClone(card);
 delete summaryOnly.report.entries;
 const unresolved = review([bank([record(1,-12000)]),summaryOnly]);
 await build(p,unresolved);
 assert.equal(unresolved.items[0].preview.rows[0].reviewed,false);
});

test('Saved manual choices keep precedence and the single-bank review uses the same matcher', async () => {
 const p = bill(plan(),'card1',120), item = bank([record(1,-12000)]), ui = review([item]);
 ui.bankChoices.set(inboxLegacyBankGroupKey(item,item.records[0]),{field:'card2',refund:false});
 await build(p,ui);
 assert.equal(ui.build.bankImport.entries[0].field,'card2');
 assert.equal(item.preview.rows[0].manualClassification,true);

 const source = {id:'2'.repeat(36),sourceHash:item.hash,name:'bank.csv',revision:1,state:'ready'};
 const selection = {accountId:payer,scope:'complete',choices:{},duplicates:{},skipMonths:[],directIncluded:{}};
 const single = await prepareNativeBankReport(p,item,source,selection,asOf);
 assert.equal(single.plan.bankImport.entries[0].field,'card1');
 assert.equal(single.preview.rows[0].cardSettlement.matched,true);
});
