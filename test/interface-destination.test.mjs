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

function unlockDestinationHarness({dirtyDraft=false,failed=false,device=false}={}){
 const source=fs.readFileSync('src/security.js','utf8'),calls=[];
 const context=vm.createContext({calls,dirty:false,monthlyPending:'',vaultKey:null,securityBusy:false,securityError:'',vaultOperationMessage:e=>e.message,render:()=>calls.push('render'),notify:()=>{},restoreDraft:async()=>{},applyLegacyInterfaceDestination:async()=>{calls.push('destination');if(context.dirty||context.monthlyPending)return;context.tab='monthly';context.selectedMonth='2026-09'},unlockVault:async()=>{if(failed)throw Error('wrong secret');return{plan:{},key:{},rawKey:new Uint8Array(32)}},openVaultDevice:async()=>{if(failed)throw Error('device canceled');return{plan:{},key:{},rawKey:new Uint8Array(32)}},deviceRecordName:()=> 'device',FormData:class{* [Symbol.iterator](){yield ['secret','test']}},app:{addEventListener(){}},...{vaultEnvelope:{}}});
 const operation=source.slice(source.indexOf('async function securityOperation'),source.indexOf('function downloadJSON'));
 vm.runInContext(operation,context);
 context.acceptDecrypted=async()=>{calls.push('restored');context.vaultKey={};if(dirtyDraft){context.dirty=true;context.monthlyPending='2026-08';context.tab='monthly';context.selectedMonth='2026-08'}};
 const deviceCode=source.slice(source.indexOf('async function unlockDevice()'),source.indexOf('function securityAction'));
 vm.runInContext(deviceCode,context);
 return{context,calls,run:async()=>context.securityOperation(async()=>{if(device)await context.unlockDevice();else{const r=await context.unlockVault();await context.acceptDecrypted(r.plan,r.key,r.rawKey)}},true)};
}
test('Original password and device unlock continue the exact destination only after local restoration and final render',async()=>{for(const device of [false,true]){const h=unlockDestinationHarness({device});await h.run();assert.deepEqual(h.calls,['render','restored','render','destination']);assert.equal(h.context.selectedMonth,'2026-09');assert.equal(h.context.securityBusy,false)}});
test('Unlock continuation preserves recovered monthly drafts and never dispatches on failure or for other security operations',async()=>{const h=unlockDestinationHarness({dirtyDraft:true});await h.run();assert.equal(h.context.selectedMonth,'2026-08');assert.equal(h.context.monthlyPending,'2026-08');assert.equal(h.context.dirty,true);for(const device of [false,true]){const f=unlockDestinationHarness({failed:true,device});await f.run();assert.deepEqual(f.calls,['render','render']);assert.ok(f.context.securityError)}const other=unlockDestinationHarness();other.context.vaultKey={};await other.context.securityOperation(async()=>{});assert.deepEqual(other.calls,['render','render'])});
test('Password and device UI both request post-unlock destination continuation, retaining the original destination guards',()=>{const s=fs.readFileSync('src/security.js','utf8');assert.match(s,/notify\('התקציב נפתח\.'\);\},true\)/);assert.match(s,/securityOperation\(unlockDevice,true\)/)});
test('A failed destination after unlock retains the unlocked view and reports the error without replaying unlock',async()=>{const h=unlockDestinationHarness();let notices=[];h.context.notify=message=>notices.push(message);h.context.applyLegacyInterfaceDestination=async()=>{throw Error('המסך אינו זמין כרגע.')};await h.run();assert.equal(h.context.securityBusy,false);assert.ok(h.context.vaultKey);assert.deepEqual(h.calls,['render','restored','render']);assert.deepEqual(notices,['המסך אינו זמין כרגע.'])});

test('Migration action bridge opens the existing guarded review directly and preserves space/period without financial URL inputs',async()=>{
 const href=legacyInterfaceHref('?budget=house&year=2026&month=9&operation=apply&sourceRevision=1&token=secret','migration');assert.equal(href,'/?budget=house&mf-view=migration&year=2026&month=9');assert.equal(readLegacyInterfaceDestination(href.slice(2)).view,'migration');
 const h=harness({location:{search:href.slice(1)},forecast:()=>[{month:'2026-09'}]});h.context.openSpaceMigrationReview=()=>h.calls.push('migration');await h.context.applyLegacyInterfaceDestination();assert.deepEqual(h.calls,['render','migration']);assert.equal(h.context.selectedMonth,'2026-09');assert.equal(h.context.activeBudget,'house');await h.context.applyLegacyInterfaceDestination();assert.deepEqual(h.calls,['render','migration']);
 for(const guard of [{dirty:true},{monthlyPending:'2026-08'},{hasMonthlyInputDraft:()=>true},{activeBudget:'other'}]){const blocked=harness({...guard,location:{search:href.slice(1)}});blocked.context.openSpaceMigrationReview=()=>blocked.calls.push('migration');await blocked.context.applyLegacyInterfaceDestination();assert.deepEqual(blocked.calls,[])}
})
