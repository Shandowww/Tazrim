import test from 'node:test';
import assert from 'node:assert/strict';
import {zero,clone,validatePlan,forecast} from '../src/budget.js';
import {bankClassificationOptions} from '../frontend/src/app/report-classification-model.ts';
import {initialAccountDraft,prepareManualAccount,accountDraftFingerprint} from '../frontend/src/app/account-command.ts';
import {reportClassificationRows} from '../frontend/src/app/report-classification-model.ts';
import {buildReportInbox,inboxBankGroupKey,reportInboxDraft} from '../src/report-inbox-controller.js';
import * as classifier from '../tools/bank-csv/classifier.mjs';

const plan=()=>({startMonth:'2026-01',opening:1000,buffer:100,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,creditCards:[{id:'card1',name:'פרטי',alias:''},{id:'card2',name:'משותף',alias:''},{id:'card_extra',name:'לא משויך',alias:''}],cashPlanning:{accounts:[{id:'private',label:'אותו בנק',buffer:0,classificationScope:'personal'},{id:'joint',label:'אותו בנק',buffer:0,classificationScope:'shared'},{id:'unknown',label:'חשבון פרטי משותף',buffer:0}],months:{},cardAccounts:{card1:'private',card2:'joint'},transfers:[]}});
const keys=(value,accountId,rows=[{accountId,amountCents:-10000}])=>bankClassificationOptions(value,rows,accountId).map(([key])=>key);

test('Each bank account filters savings, investments and cards independently inside the same budget',()=>{
 const value=plan(),before=clone(value),personal=keys(value,'private'),shared=keys(value,'joint');
 for(const key of ['variable','transfers','checks','loanRepayment','exclude'])assert.ok(personal.includes(key)&&shared.includes(key));
 for(const key of ['rent','houseCommittee'])assert.ok(shared.includes(key)&&!personal.includes(key));
 for(const key of ['personalSaving','personalInvest','card1'])assert.ok(personal.includes(key)&&!shared.includes(key));
 for(const key of ['sharedSaving','sharedInvest','card2'])assert.ok(shared.includes(key)&&!personal.includes(key));
 assert.ok(!personal.includes('card_extra')&&!shared.includes('card_extra'));
 assert.deepEqual(value,before);
 assert.deepEqual(bankClassificationOptions(value,[{accountId:'joint',amountCents:-10000}]).map(([key])=>key),shared);
});

test('Unknown ownership is never inferred from bank names, account labels, IDs or private-classifier flags',()=>{
 const value=plan();value.bankImport={version:1,accounts:[{id:'unknown',label:'פרטי',personal:true,rules:[]}],entries:[],batches:[]};
 for(const id of ['unknown','missing']){
  const options=keys(value,id);
  for(const key of ['personalSaving','personalInvest','sharedSaving','sharedInvest'])assert.ok(options.includes(key));
  assert.ok(!options.includes('rent')&&!options.includes('houseCommittee'));
  assert.ok(!options.some(key=>key.startsWith('card')));
 }
 assert.ok(!keys(value,'private',[{accountId:'joint',amountCents:-100}]).includes('card1'));
 assert.ok(!keys(value,'private',[{accountId:'private',amountCents:-100},{accountId:'joint',amountCents:-100}]).some(key=>key.startsWith('card')));
 assert.ok(!keys(value,'joint',[{accountId:'private',amountCents:-100}]).includes('rent'));
 assert.ok(!keys(value,'joint',[{accountId:'private',amountCents:-100},{accountId:'joint',amountCents:-100}]).includes('houseCommittee'));
});

test('Saved card payer evidence is honored without assuming same-bank or unassigned cards belong to the receiving account',()=>{
 const value=plan();delete value.cashPlanning.cardAccounts.card1;
 value.cardBilling={reports:[{cardId:'card1',accountId:'private'}]};
 assert.ok(keys(value,'private').includes('card1'));assert.ok(!keys(value,'joint').includes('card1'));
 value.cardBilling.reports.push({cardId:'card1',accountId:'joint'});
 assert.ok(!keys(value,'private').includes('card1'));
});

test('Sign restrictions survive filtering, while refunds retain the original explicit-review path',()=>{
 const value=plan();
 assert.ok(!keys(value,'private').includes('salary'));
 const incoming=keys(value,'joint',[{accountId:'joint',amountCents:10000}]);
 assert.ok(incoming.includes('salary')&&incoming.includes('incomingTransfers'));
 assert.ok(!incoming.includes('outgoingTransfers')&&!incoming.includes('personalInvest'));
 assert.ok(incoming.includes('sharedInvest'));
});

test('Setting and clearing account scope uses the original guarded account command without financial changes',()=>{
 const value=plan(),before=clone(value),draft=initialAccountDraft(value,'unknown','2026-11');
 assert.equal(draft.classificationScope,'');
 const changed=prepareManualAccount(value,'unknown',{...draft,classificationScope:'shared'},{asOf:'2026-11'});
 assert.equal(changed.cashPlanning.accounts[2].classificationScope,'shared');
 assert.deepEqual(forecast(changed),forecast(value));assert.deepEqual(value,before);
 assert.notEqual(accountDraftFingerprint(draft),accountDraftFingerprint({...draft,classificationScope:'shared'}));
 const legacyDraft=initialAccountDraft(changed,'unknown','2026-11');delete legacyDraft.classificationScope;
 assert.equal(prepareManualAccount(changed,'unknown',legacyDraft,{asOf:'2026-11'}).cashPlanning.accounts[2].classificationScope,'shared');
 const cleared=prepareManualAccount(changed,'unknown',{...draft,classificationScope:''},{asOf:'2026-11'});
 assert.equal(cleared.cashPlanning.accounts[2].classificationScope,undefined);assert.ok(validatePlan(cleared));
 for(const invalid of ['both',null,true,{}]){
  const malformed=clone(value);malformed.cashPlanning.accounts[0].classificationScope=invalid;assert.equal(validatePlan(malformed),false);
  assert.throws(()=>prepareManualAccount(value,'unknown',{...draft,classificationScope:invalid},{asOf:'2026-11'}));
 }
});

test('Filtering preserves a prior cross-scope choice in the original review and resumable draft',async()=>{
 for(const field of ['sharedInvest','rent','houseCommittee']){
 const value=plan(),before=clone(value),record={line:1,date:'2026-02-10',reference:'ref-1',description:'העברה להשקעה',amountCents:-10000,valid:true,currency:'ILS',balanceCents:null,details:'',beneficiary:'',purpose:''};
 const item={id:'bank-source',name:'file.csv',kind:'bank',target:'private',from:'2026-02-01',to:'2026-02-28',records:[record],hash:'a'.repeat(64),decisions:{},directIncluded:{},monthDecisions:{},bankOptions:{scope:'complete'}};
 const review={items:[item],newAccounts:[],newCards:[],categoryChoices:new Map(),bankChoices:new Map([[inboxBankGroupKey(item,record),{field,refund:false}]]),startMonth:'2026-01',duplicates:0,merchantRules:[],groupId:'classification-group'};
 await buildReportInbox(value,review,{month:'2026-11',today:'2026-11-22',classifier,activityAPI:null});
 assert.equal(reportClassificationRows(review)[0].rows[0].current,field);
 assert.ok(!bankClassificationOptions(value,review.bankReviewGroups[0].rows,'private').some(([key])=>key===field));
 assert.equal(reportInboxDraft(review,'test').bankChoices[0][1].field,field);
 assert.deepEqual(value,before);
 }
});
