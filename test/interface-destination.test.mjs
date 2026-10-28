import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {legacyInterfaceHref,readLegacyInterfaceDestination} from '../src/interface-destination.js';
const id='12345678-1234-1234-1234-123456789abc';
test('Existing-interface links preserve only the selected budget, valid period and allowlisted report action',()=>{
 const href=legacyInterfaceHref('?budget=house&year=2026&month=10&token=private&demo=1','reports',id);
 assert.equal(href,'/?budget=house&mf-view=reports&year=2026&month=10&mf-report='+id);
 assert.deepEqual(readLegacyInterfaceDestination(href.slice(2)),{budget:'house',view:'reports',reportId:id,selectedMonth:'2026-10'});
 assert.throws(()=>legacyInterfaceHref('','commit',id));assert.throws(()=>legacyInterfaceHref('','reports','../other'));
 assert.equal(readLegacyInterfaceDestination('?mf-view=delete'),null);
 assert.equal(readLegacyInterfaceDestination('?mf-view=reports&mf-report=invalid'),null);
 assert.equal(readLegacyInterfaceDestination('?mf-view=reports&year=2026&month=13').selectedMonth,null);
});
function harness(overrides={}){
 const text=fs.readFileSync('src/client.js','utf8'),start=text.indexOf('let legacyDestinationConsumed=false;'),end=text.indexOf('async function load(',start),calls=[];
 const context=vm.createContext({readLegacyInterfaceDestination,loaded:true,loading:false,saving:false,joinToken:'',activeBudget:'house',dirty:false,monthlyPending:'',hasSecurityDraft:()=>false,hasSavingsDraft:()=>false,hasScenarioDraft:()=>false,hasDetailDraft:()=>false,hasMonthlyInputDraft:()=>false,forecast:()=>[{month:'2026-10'}],plan:{},location:{search:legacyInterfaceHref('?budget=house&year=2026&month=10','reports',id).slice(1)},render:()=>calls.push('render'),openStoredReport:async id=>calls.push(id),openReportInbox:()=>calls.push('inbox'),openSpaceOverview:()=>calls.push('overview'),budgetMeta:()=>({role:'editor'}),...overrides});
 vm.runInContext(text.slice(start,end),context);return{context,calls};
}
test('Authenticated existing entry point opens the exact report once in its selected space and period',async()=>{const {context,calls}=harness();await context.applyLegacyInterfaceDestination();assert.deepEqual(calls,['render',id]);assert.equal(context.selectedMonth,'2026-10');assert.equal(context.tab,'settings');assert.equal(context.settingsSection,'connections');await context.applyLegacyInterfaceDestination();assert.equal(calls.length,2)});
test('Restored edits, wrong space, loading and viewer role cannot open an editable report from a URL',async()=>{
 for(const overrides of [{dirty:true},{activeBudget:'personal'},{loading:true},{hasSecurityDraft:()=>true}]){const {context,calls}=harness(overrides);await context.applyLegacyInterfaceDestination();assert.deepEqual(calls,[])}
 const {context,calls}=harness({budgetMeta:()=>({role:'viewer'})});await context.applyLegacyInterfaceDestination();assert.deepEqual(calls,['render']);assert.equal(context.settingsSection,'connections');
});
