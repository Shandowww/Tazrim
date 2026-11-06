import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {startIncomingShortcutQA,qaModes} from '../scripts/incoming-shortcut-qa.mjs';
const workflow=()=>JSON.parse(execFileSync('python3',['-B','-c',"import importlib.util,json;s=importlib.util.spec_from_file_location('builder','scripts/build-incoming-shortcut.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.build()))"],{encoding:'utf8'}));
test('Incoming folder workflow keeps originals, has no embedded bookmark/token, and resolves only earlier action outputs',()=>{
 const w=workflow(),seen=new Set(),stack=[],short=a=>a.WFWorkflowActionIdentifier.replace('is.workflow.actions.','');assert.deepEqual(w,workflow());assert.equal(short(w.WFWorkflowActions[0]),'comment');assert.equal(short(w.WFWorkflowActions[1]),'file');assert.equal(w.WFWorkflowImportQuestions.length,2);for(const q of w.WFWorkflowImportQuestions)assert.equal(w.WFWorkflowActions[q.ActionIndex].WFWorkflowActionParameters[q.ParameterKey]??'','');assert.ok(w.WFWorkflowImportQuestions.every(q=>q.ActionIndex<6));assert.ok(w.WFWorkflowActions.slice(0,7).some(a=>a.WFWorkflowActionParameters.WFTextActionText==='retain'));
 for(const action of w.WFWorkflowActions){assert.ok(!['file.move','runworkflow','runscript'].includes(short(action)));const p=action.WFWorkflowActionParameters;const walk=v=>{if(!v||typeof v!=='object')return;if(v.Type==='ActionOutput')assert.ok(seen.has(v.OutputUUID));Object.values(v).forEach(walk)};walk(p);if(p.WFControlFlowMode===0)stack.push(p.GroupingIdentifier);if(p.WFControlFlowMode===1)assert.equal(stack.at(-1),p.GroupingIdentifier);if(p.WFControlFlowMode===2)assert.equal(stack.pop(),p.GroupingIdentifier);seen.add(p.UUID)}assert.equal(stack.length,0);
 assert.ok(!w.WFWorkflowActions.some(a=>short(a)==='file.delete'));assert.equal(w.WFWorkflowActions.filter(a=>short(a)==='gettext'&&a.WFWorkflowActionParameters.WFTextActionText==='retain').length,1);
 const qa=JSON.parse(execFileSync('python3',['-B','-c',"import importlib.util,json;s=importlib.util.spec_from_file_location('builder','scripts/build-incoming-shortcut.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.build({'endpoint':'http://127.0.0.1:54321/api/imports/incoming','token':'x'*43,'qaName':'Budgit-Incoming-QA-test'})))"],{encoding:'utf8'}));
 const deletion=qa.WFWorkflowActions.find(a=>short(a)==='file.delete');assert.equal(deletion.WFWorkflowActionParameters.WFDeleteFileConfirm,true);assert.equal(deletion.WFWorkflowActionParameters.WFInput.Value.VariableName,'BudgitFreshMatches');
 assert.ok(!w.WFWorkflowActions.some(a=>short(a)==='text.changecase'));
 const filters=w.WFWorkflowActions.filter(a=>short(a)==='conditional').map(a=>a.WFWorkflowActionParameters.WFConditionalActionString);
 for(const extension of ['csv','xlsx','pdf','PDF','.XLSX'])assert.ok(filters.includes(extension));
 assert.ok(JSON.stringify(w).includes('BudgitSkipped'));assert.ok(JSON.stringify(w).includes('BudgitExamined'));
 assert.equal(w.WFWorkflowActions.filter(a=>short(a)==='file.getfoldercontents').length,1);assert.equal(w.WFWorkflowActions.filter(a=>short(a)==='downloadurl').length,2);assert.ok(!JSON.stringify(w).includes('/Users/'));assert.ok(!JSON.stringify(w).includes('http://127.0.0.1'));
})
test('Incoming native QA accepts only its synthetic bytes and returns a connection-local receipt catalog',async()=>{
 const qa=await startIncomingShortcutQA();try{
 const headers={authorization:'Bearer '+qa.token},catalog=await(await fetch(qa.endpoint+'?catalog=1',{headers})).json();assert.deepEqual(catalog,{version:1,receipts:{}});
 assert.equal((await fetch(qa.endpoint+'?name=a.csv',{method:'POST',headers,body:'actual report forbidden'})).status,422);
 const bytes=readFileSync(join(qa.input,qa.filenames[0])),receipt=await(await fetch(qa.endpoint+'?name='+encodeURIComponent(qa.filenames[0]),{method:'POST',headers,body:bytes})).json();assert.equal(receipt.stored,true);assert.equal(receipt.processingState,'awaiting_verification');
 const saved=await(await fetch(qa.endpoint+'?catalog=1',{headers})).json();assert.equal(saved.receipts[qa.sourceHash].receiptId,receipt.receiptId);assert.equal(qa.stats().budgets,0);
 }finally{await qa.close()}
})
test('Incoming native QA exposes every receipt and transport failure without changing a budget',async()=>{
 for(const mode of qaModes.filter(mode=>mode!=='success')){const qa=await startIncomingShortcutQA({mode});try{const request=()=>fetch(qa.endpoint+'?name='+encodeURIComponent(qa.filenames[0]),{method:'POST',headers:{authorization:'Bearer '+qa.token},body:readFileSync(join(qa.input,qa.filenames[0]))});if(mode==='disconnect')await assert.rejects(request());else{const response=await request();if(mode==='malformed-json')await assert.rejects(response.json());else{const r=await response.json();if(mode==='stored-string')assert.equal(typeof r.stored,'string');if(mode==='stored-false')assert.equal(r.stored,false);if(mode==='missing-stored')assert.equal(r.stored,undefined);if(mode==='wrong-hash')assert.notEqual(r.sourceHash,qa.sourceHash);if(mode==='missing-receipt')assert.equal(r.receiptId,undefined);if(mode==='unauthorized')assert.equal(response.status,401);if(mode==='unavailable')assert.equal(response.status,503)}}assert.equal(qa.stats().budgets,0)}finally{await qa.close()}}
})
test('Native QA cleanup receipt requires the actual isolated original import and retains both encrypted originals',async()=>{
 const qa=await startIncomingShortcutQA();try{
  await assert.rejects(qa.completeSavedImport(),/Upload the generated fixture first/);
  const headers={authorization:'Bearer '+qa.token},bytes=readFileSync(join(qa.input,qa.filenames[0]));
  const receipt=await(await fetch(qa.endpoint+'?name='+encodeURIComponent(qa.filenames[0]),{method:'POST',headers,body:bytes})).json();
  assert.equal(receipt.cleanupEligible,false);assert.equal(qa.stats().budgets,0);
  const complete=await qa.completeSavedImport();assert.equal(complete.cleanupEligible,true);assert.equal(complete.fullImportComplete,true);
  assert.equal(qa.stats().sources,2);assert.equal(qa.stats().budgets,1);
  assert.deepEqual(readFileSync(join(qa.input,qa.filenames[0])),bytes);
  const duplicate=await(await fetch(qa.endpoint+'?name='+encodeURIComponent(qa.filenames[0]),{method:'POST',headers,body:bytes})).json();
  assert.equal(duplicate.receiptId,receipt.receiptId);assert.equal(duplicate.cleanupEligible,true);assert.equal(qa.stats().sources,2);
  qa.setMode('stored-string');const faulty=await(await fetch(qa.endpoint+'?name='+encodeURIComponent(qa.filenames[0]),{method:'POST',headers,body:bytes})).json();assert.equal(typeof faulty.stored,'string');
  await fetch(qa.endpoint,{headers:{authorization:'Bearer stale'}});assert.equal(qa.stats().unauthorizedRequests,1);
 }finally{await qa.close()}
});

test('Share-sheet input retains originals because it cannot re-enumerate a native folder',()=>{
 const w=JSON.parse(execFileSync('python3',['-B','-c',"import importlib.util,json;s=importlib.util.spec_from_file_location('builder','scripts/build-incoming-shortcut.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.build(folder_input=False)))"],{encoding:'utf8'}));
 assert.ok(!w.WFWorkflowActions.some(a=>['is.workflow.actions.file.delete','is.workflow.actions.file.getfoldercontents'].includes(a.WFWorkflowActionIdentifier)));
});
