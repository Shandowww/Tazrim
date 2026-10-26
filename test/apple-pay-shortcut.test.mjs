import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import worker from '../dist/server/index.js';
const workflow=JSON.parse(execFileSync('python3',['-c',"import plistlib,json;print(json.dumps(plistlib.load(open('shortcuts/budgit-apple-pay.wflow','rb'))))"],{encoding:'utf8'}));
test('Download serves signed, secret-free shortcut bytes and HEAD without exposing records',async()=>{
 const bytes=readFileSync('public/shortcuts/budgit-apple-pay.shortcut');assert.equal(bytes.subarray(0,4).toString(),'AEA1');
 const r=await worker.fetch(new Request('https://example.test/shortcuts/budgit-apple-pay.shortcut'),{});
 assert.equal(r.status,200);assert.equal(r.headers.get('content-disposition'),'attachment; filename="budgit-apple-pay.shortcut"');assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);
 const head=await worker.fetch(new Request('https://example.test/shortcuts/budgit-apple-pay.shortcut',{method:'HEAD'}),{});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.equal((await worker.fetch(new Request('https://example.test/shortcuts/unknown.shortcut'),{})).status,404);
});
test('Sender binds setup secret separately, guards missing fields and sends only actual mapped data',()=>{
 const actions=workflow.WFWorkflowActions,params=a=>a.WFWorkflowActionParameters;
 assert.equal(params(actions[0]).WFTextActionText,'');assert.equal(workflow.WFWorkflowImportQuestions[0].ActionIndex,0);
 const http=actions.filter(a=>a.WFWorkflowActionIdentifier==='is.workflow.actions.downloadurl');assert.equal(http.length,1);
 const request=params(http[0]);assert.equal(request.WFURL,'https://budgit.duckdns.org/api/imports/apple-pay');assert.equal(request.WFHTTPMethod,'POST');
 const json=request.WFJSONValues.Value.WFDictionaryFieldValueItems;
 assert.deepEqual(json.map(f=>f.WFKey.Value.string),['eventId','merchant','amount','currency']);
 assert.ok(json.every(f=>Object.keys(f.WFValue.Value.attachmentsByRange).length===1));
 assert.equal(request.WFHTTPHeaders.Value.WFDictionaryFieldValueItems[0].WFValue.Value.string,'Bearer \ufffc');
 const before=actions.slice(0,actions.indexOf(http[0]));assert.equal(before.filter(a=>a.WFWorkflowActionIdentifier==='is.workflow.actions.conditional'&&params(a).WFCondition===101).length,4);
 assert.equal(before.filter(a=>a.WFWorkflowActionIdentifier==='is.workflow.actions.number.random').length,4);
 // Every magic output references an existing earlier action, never an invented output or future node.
 const seen=new Set();for(const a of actions){const walk=x=>{if(!x||typeof x!=='object')return;if(x.Type==='ActionOutput')assert.ok(seen.has(x.OutputUUID),x.OutputUUID);for(const v of Object.values(x))walk(v);};walk(params(a));seen.add(params(a).UUID);}
});

test('iOS27 combined automation binds native Wallet properties, leaving card and currency to device setup',async()=>{
 const w=JSON.parse(execFileSync('python3',['-c',"import plistlib,json;print(json.dumps(plistlib.load(open('shortcuts/budgit-apple-pay-ios27.wflow','rb'))))"],{encoding:'utf8'}));
 assert.equal(w.WFWorkflowTriggers.length,1);const trigger=w.WFWorkflowTriggers[0];assert.equal(trigger.WFTriggerIdentifier,'WFWalletTransactionTrigger');assert.deepEqual(trigger.WFTriggerSerializedParameters,{});assert.match(trigger.WFTriggerUUID,/^[0-9A-F-]{36}$/);
 const a=w.WFWorkflowActions;assert.equal(a[0].WFWorkflowActionParameters.WFTextActionText,'');assert.equal(a[4].WFWorkflowActionParameters.WFTextActionText,'');
 for(const [index,property] of [[2,'Merchant'],[3,'Amount']]){const v=a[index].WFWorkflowActionParameters.WFTextActionText.Value.attachmentsByRange['{0, 1}'];assert.equal(v.Type,'TriggerOutput');assert.equal(v.TriggerIdentifier,trigger.WFTriggerIdentifier);assert.equal(v.Aggrandizements[0].PropertyName,property);}
 assert.deepEqual(w.WFWorkflowImportQuestions.map(q=>q.ActionIndex),[0,4]);assert.ok(!JSON.stringify(w).includes('ExtensionInput'));assert.ok(!JSON.stringify(w).includes('$placeholder'));
 const guards=a.filter(x=>x.WFWorkflowActionParameters.WFCondition===101);assert.equal(guards.length,4);
 const r=await worker.fetch(new Request('https://example.test/shortcuts/budgit-apple-pay-ios27.shortcut'),{});assert.equal(r.status,200);assert.equal(r.headers.get('content-disposition'),'attachment; filename="budgit-apple-pay-ios27.shortcut"');const bytes=readFileSync('public/shortcuts/budgit-apple-pay-ios27.shortcut');assert.equal(bytes.subarray(0,4).toString(),'AEA1');assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);
});
