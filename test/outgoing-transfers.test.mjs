import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {zero,clone,validatePlan,monthlyValues,forecast,progressFor,graphTimeline,cashAccountValues,cashAccountForecast,bankMovementAudit} from '../src/budget.js';
import {bankIdentity,bankPreview,applyBankImport,undoBankImport,bankRememberedRules,excludeInternalBankTransfers} from '../src/bank-import-model.js';
import {suggest,compatible} from '../tools/bank-csv/classifier.mjs';
const base=()=>({startMonth:'2026-01',opening:10000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false});
const row=(line,amountCents=-125050,date='2026-02-20')=>({line,date,reference:'ref-'+line,amountCents,description:'העברה',beneficiary:'חשבון אחר',details:'',purpose:'',currency:'ILS',valid:true,balanceCents:null});
const records=rows=>Promise.all(rows.map(r=>bankIdentity(r,'source')));
const options=(rs,extra={})=>({id:'outgoing-report',accountId:'source',label:'מקור',fileName:'source.csv',from:'2026-02-01',to:'2026-02-28',asOf:'2026-10',coverageConfirmed:true,monthsConfirmed:true,rules:[],modes:{'2026-02':'full'},choices:Object.fromEntries(rs.map(r=>[r.line,{field:'outgoingTransfers',reviewed:true,manual:true}])),...extra});
test('Explicit outgoing internal transfers reduce cash once and never count as consumption, income or savings',async()=>{
 const p=base(),before=clone(p),rs=await records([row(1),row(2,-50025),row(3,-199)]),o=options(rs);o.choices[3].field='variable';
 const next=applyBankImport(p,rs,o),r=forecast(next)[1];assert.ok(validatePlan(next));assert.deepEqual(p,before);
 assert.equal(r.outgoingTransfers,1750.75);assert.equal(r.net,-1752.74);assert.equal(r.balance,8247.26);assert.equal(r.spending,1.99);assert.equal(r.income,0);assert.equal(r.saving,0);
 assert.deepEqual(progressFor(next,'2026-02').totals,{saving:0,invest:0,spending:1.99,income:0});
 const graph=graphTimeline(next,{startMonth:'2026-02',endMonth:'2026-02',asOf:'2026-10'})[0].values;
 assert.equal(graph.net,-1752.74);assert.equal(graph.spending,1.99);
 const audit=bankMovementAudit(next,'2026-02');assert.equal(audit.groups.transfers.debitCents,175075);assert.equal(audit.groups.direct.debitCents,199);
 const undo=undoBankImport(next,o.id);delete undo.bankImport;assert.deepEqual(undo,p);
});
test('Separate spaces cancel only their own observed legs; missing and cross-month legs are never invented',async()=>{
 const out=await records([row(1)]),inc=await records([row(2,125050)]),privatePlan=applyBankImport(base(),out,options(out));
 const sharedPlan=applyBankImport(base(),inc,options(inc,{choices:{2:{field:'incomingTransfers',reviewed:true}}}));
 assert.equal(forecast(privatePlan)[1].net,-1250.5);assert.equal(forecast(sharedPlan)[1].net,1250.5);
 assert.equal(Math.round((forecast(privatePlan)[1].net+forecast(sharedPlan)[1].net)*100),0);
 assert.equal(forecast(privatePlan)[2].outgoingTransfers,0);assert.equal(forecast(sharedPlan)[2].incomingTransfers,0);
 assert.equal(privatePlan.bankImport.entries.length,1);assert.equal(sharedPlan.bankImport.entries.length,1);
 const later=await records([row(2,125050,'2026-03-01')]),delayed=applyBankImport(base(),later,options(later,{from:'2026-03-01',to:'2026-03-31',modes:{'2026-03':'full'},choices:{2:{field:'incomingTransfers',reviewed:true}}}));
 assert.equal(forecast(delayed)[1].net,0);assert.equal(forecast(delayed)[2].net,1250.5);
 assert.equal(JSON.stringify(sharedPlan).includes('personal:'),false);
});
test('Outgoing imports preserve bank anchors, duplicate guards and partial overlapping source amounts',async()=>{
 const rs=await records([{...row(1),balanceCents:874950}]),p=base();
 p.cashPlanning={accounts:[{id:'source',label:'מקור',opening:10000,buffer:0},{id:'other',label:'אחר',opening:2000,buffer:0}],months:{},cardAccounts:{},transfers:[]};
 const before=cashAccountForecast(p,'other'),next=applyBankImport(p,rs,options(rs));
 assert.equal(cashAccountForecast(next,'source')[1].balance,8749.5);assert.equal(cashAccountForecast(next,'source')[1].net,-1250.5);
 assert.deepEqual(cashAccountForecast(next,'other').map(r=>[r.balance,r.net]),before.map(r=>[r.balance,r.net]));
 assert.throws(()=>applyBankImport(next,rs,options(rs,{id:'repeat'})),/בלי תנועות חדשות/);
 const partial=applyBankImport(p,rs,options(rs,{to:'2026-02-20',modes:{'2026-02':'partial'}})),overlap=await records([row(1),row(2,-50025)]);
 const extended=applyBankImport(partial,overlap,options(overlap,{id:'extend',to:'2026-02-20',modes:{'2026-02':'partial'}}));
 assert.equal(extended.months['2026-02'].values.outgoingTransfers,1750.75);assert.equal(extended.bankImport.entries.length,2);
 assert.equal(extended.months['2026-02'].actual,false);
 assert.equal(cashAccountValues(next,'source','2026-03').values.outgoingTransfers,0);
});
test('Internal transfers are explicit, direction-checked and optional for legacy budgets; ordinary outgoing payments stay expenses',async()=>{
 const p=base();delete p.defaults.outgoingTransfers;assert.ok(validatePlan(p));
 const rs=await records([row(1),{...row(2,50000),reversal:true}]);assert.equal(suggest(rs[0]).destination,'transfers');assert.equal(suggest(rs[0]).strength,'review');
 assert.equal(compatible(rs[1],'outgoingTransfers'),false);
 const o=options(rs);o.choices[2].refund=true;assert.equal(bankPreview(p,rs,o).rows[1].reviewed,false);assert.throws(()=>applyBankImport(p,rs,o),/בדיקת/);
 const ordinary=applyBankImport(p,rs.slice(0,1),options(rs,{choices:{1:{field:'transfers',reviewed:true}}}));assert.equal(forecast(ordinary)[1].spending,1250.5);assert.equal(forecast(ordinary)[1].outgoingTransfers,0);
 const next=applyBankImport(p,rs.slice(0,1),options(rs));assert.equal(monthlyValues(next,'2026-03').outgoingTransfers,0);next.defaults.outgoingTransfers=10;assert.equal(monthlyValues(next,'2026-03').outgoingTransfers,10);
 for(const amount of [-1,Infinity,NaN]){const bad=clone(next);bad.defaults.outgoingTransfers=amount;assert.equal(validatePlan(bad),false);}
 const forged=clone(next);forged.bankImport.entries[0].cents=500;assert.equal(validatePlan(forged),false);
 const rules=bankRememberedRules([],rs.slice(0,1),options(rs).choices);assert.equal(suggest(rs[0],rules).destination,'outgoingTransfers');assert.notEqual(suggest(rs[1],rules).destination,'outgoingTransfers');
 const c=vm.createContext({app:{addEventListener(){}} ,compatible});vm.runInContext(readFileSync('src/bank-import-client.js','utf8'),c);vm.runInContext('bankApi=[null,{compatible}]',c);
 assert.equal(c.bankRowCompatible(rs[1],'outgoingTransfers'),false);assert.equal(c.bankIsRefund(rs[1],'outgoingTransfers'),false);
});
test('Reviewed legacy correction preserves actual cash net and existing outgoing totals without silently reclassifying other months',async()=>{
 const rs=await records([row(1),row(2,-20000)]),o=options(rs,{choices:{1:{field:'transfers',reviewed:true},2:{field:'outgoingTransfers',reviewed:true}}}),p=applyBankImport(base(),rs,o);
 const next=excludeInternalBankTransfers(p,'2026-02');assert.equal(forecast(next)[1].net,forecast(p)[1].net);assert.equal(next.months['2026-02'].values.outgoingTransfers,1450.5);assert.equal(next.months['2026-02'].values.transfers,0);
 assert.equal(p.months['2026-02'].values.transfers,1250.5);assert.equal(next.bankImport.entries.length,2);
 assert.throws(()=>excludeInternalBankTransfers(next,'2026-02'),/חודש/);
});
