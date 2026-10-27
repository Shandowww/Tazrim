import test from 'node:test'
import assert from 'node:assert/strict'
import {zero,clone,saveCashAccount,forecast,cashAssignedItem,cashUnassigned,cashAccountForecast,validatePlan} from '../src/budget.js'
import {initialAccountDraft,accountDraftFingerprint,prepareManualAccount,manualAccountEligibility} from '../frontend/src/app/account-command.ts'
const base=()=>({startMonth:'2026-01',opening:1000,buffer:100,horizon:24,defaults:{...zero(),salary:1000},months:{},expenses:[],demo:false,setupCompleted:true})
const options={create:true,asOf:'2026-10'}
test('Creating a manual account reuses the original command and leaves aggregate money and unassigned reports untouched',()=>{
 const p=base(),before=JSON.stringify(p),draft={...initialAccountDraft(p,'','2026-10'),label:'חשבון ידני',buffer:'100.25',color:'blue',opening:'-1,000.01',openingMonth:'2026-01'},next=prepareManualAccount(p,'new-account',draft,options)
 assert.deepEqual(next,saveCashAccount(p,{id:'new-account',label:'חשבון ידני',buffer:100.25,color:'blue',opening:-1000.01,openingMonth:'2026-01'}));assert.deepEqual(forecast(next),forecast(p));assert.equal(next.opening,1000);assert.equal(cashUnassigned(next,'2026-10').salary,1000);assert.equal(next.cashPlanning.cardAccounts.card1,undefined);assert.equal(JSON.stringify(p),before);assert.ok(validatePlan(next))
})
test('Unknown and explicit zero opening balances remain different; names/amount formatting do not invent a dirty draft',()=>{
 const p=base(),d={...initialAccountDraft(p,'','2026-10'),label:'א'},unknown=prepareManualAccount(p,'a',d,options),known=prepareManualAccount(p,'a',{...d,opening:'0'},options)
 assert.equal(unknown.cashPlanning.accounts[0].opening,undefined);assert.equal(known.cashPlanning.accounts[0].opening,0);assert.equal(cashAccountForecast(unknown,'a')[0].balance,null);assert.equal(cashAccountForecast(known,'a')[0].balance,0)
 assert.equal(accountDraftFingerprint({...d,buffer:'1000'}),accountDraftFingerprint({...d,label:' א ',buffer:'1,000.00'}));assert.notEqual(accountDraftFingerprint(d),accountDraftFingerprint({...d,opening:'0'}))
})
test('Editing preserves IDs, defaults, metadata, monthly records, mappings, commitments and other accounts',()=>{
 const p=base();p.cashPlanning={accounts:[{id:'a',label:'מקורי',buffer:10,opening:500,openingMonth:'2026-01',defaults:{...zero(),salary:500},bankName:'manual'},{id:'b',label:'נשאר',buffer:0}],months:{},cardAccounts:{card1:'a'},transfers:[]};p.expenses=[{id:'item',name:'תשלום',amount:100,fees:0,firstMonth:'2026-10',payments:2,source:'card',kind:'expense',cardId:'card1',cashAccountId:'a'}]
 const d={...initialAccountDraft(p,'a','2026-10'),label:'שם חדש',color:'mint',buffer:'25.01'},before=JSON.stringify(p),next=prepareManualAccount(p,'a',d,{asOf:'2026-10'}),a=next.cashPlanning.accounts.find(a=>a.id==='a')
 assert.equal(a.bankName,'manual');assert.deepEqual(a.defaults,p.cashPlanning.accounts[0].defaults);assert.deepEqual(next.expenses,p.expenses);assert.deepEqual(next.cashPlanning.cardAccounts,p.cashPlanning.cardAccounts);assert.equal(cashAssignedItem(next,next.expenses[0]),'a');assert.deepEqual(next.cashPlanning.accounts.find(a=>a.id==='b'),p.cashPlanning.accounts[1]);assert.equal(JSON.stringify(p),before);assert.deepEqual(forecast(next),forecast(p))
})
test('New accounts cannot silently change sole-account fallback assignments for commitments or charged cards',()=>{
 const p=base(),d={...initialAccountDraft(p,'','2026-10'),label:'חדש'};p.expenses=[{id:'x',name:'תשלום',amount:10,fees:0,firstMonth:'2026-10',payments:1,source:'direct',kind:'expense'}];assert.throws(()=>prepareManualAccount(p,'a',d,options),/שיוך/)
 delete p.expenses[0];p.expenses=[];p.defaults.card1=10;assert.equal(prepareManualAccount(p,'a',d,options).cashPlanning.cardAccounts.card1,undefined)
 p.defaults.card1=0;p.cashPlanning={accounts:[{id:'a',label:'קיים',buffer:0}],months:{},cardAccounts:{},transfers:[]};p.expenses=[{id:'x',name:'תשלום',amount:10,fees:0,firstMonth:'2026-10',payments:1,source:'direct',kind:'expense'}];assert.throws(()=>prepareManualAccount(p,'b',d,options),/שיוך/);p.expenses[0].cashAccountId='a';assert.ok(validatePlan(prepareManualAccount(p,'b',d,options)))
})
test('Unsupported/missing accounts, collisions, invalid amounts/colors/dates and implicit balance deletion fail before mutation',()=>{
 const p=base(),d={...initialAccountDraft(p,'','2026-10'),label:'א'};for(const change of [v=>v.color='red',v=>v.buffer='-1',v=>v.opening='1.001',v=>{v.opening='1';v.openingMonth='2027-01'},v=>v.label=' ',v=>v.injected='1']){const draft=clone(d);change(draft);assert.throws(()=>prepareManualAccount(p,'a',draft,options))}
 const next=prepareManualAccount(p,'a',{...d,opening:'100'},options);assert.throws(()=>prepareManualAccount(next,'a',d,options),/דרוס/);assert.throws(()=>prepareManualAccount(next,'a',{...initialAccountDraft(next,'a','2026-10'),opening:''},{asOf:'2026-10'}),/קיימת/);assert.match(manualAccountEligibility(next,'foreign'),/אינו/);assert.equal(p.cashPlanning,undefined)
})
