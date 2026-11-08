import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {startIncomingShortcutQA,qaModes} from '../scripts/incoming-shortcut-qa.mjs';
const workflow=()=>JSON.parse(execFileSync('python3',['-B','-c',"import importlib.util,json;s=importlib.util.spec_from_file_location('builder','scripts/build-incoming-shortcut.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.build()))"],{encoding:'utf8'}));
test('Incoming folder workflow defaults to retain, offers verified-upload cleanup, has no embedded bookmark/token, and resolves only earlier action outputs',()=>{
 const w=workflow(),seen=new Set(),stack=[],short=a=>a.WFWorkflowActionIdentifier.replace('is.workflow.actions.','');assert.deepEqual(w,workflow());assert.equal(short(w.WFWorkflowActions[0]),'comment');assert.equal(short(w.WFWorkflowActions[1]),'file');assert.equal(w.WFWorkflowImportQuestions.length,3);for(const q of w.WFWorkflowImportQuestions)assert.equal(w.WFWorkflowActions[q.ActionIndex].WFWorkflowActionParameters[q.ParameterKey]??'',q.DefaultValue??'');assert.ok(w.WFWorkflowImportQuestions.every(q=>q.ActionIndex<9));assert.ok(w.WFWorkflowActions.slice(0,7).some(a=>a.WFWorkflowActionParameters.WFTextActionText==='retain'));
 for(const action of w.WFWorkflowActions){assert.ok(!['file.move','runworkflow','runscript'].includes(short(action)));const p=action.WFWorkflowActionParameters;const walk=v=>{if(!v||typeof v!=='object')return;if(v.Type==='ActionOutput')assert.ok(seen.has(v.OutputUUID));Object.values(v).forEach(walk)};walk(p);if(p.WFControlFlowMode===0)stack.push(p.GroupingIdentifier);if(p.WFControlFlowMode===1)assert.equal(stack.at(-1),p.GroupingIdentifier);if(p.WFControlFlowMode===2)assert.equal(stack.pop(),p.GroupingIdentifier);seen.add(p.UUID)}assert.equal(stack.length,0);
 assert.equal(w.WFWorkflowActions.filter(a=>short(a)==='file.delete').length,1);assert.equal(w.WFWorkflowActions.filter(a=>short(a)==='gettext'&&a.WFWorkflowActionParameters.WFTextActionText==='retain').length,1);
 const qa=JSON.parse(execFileSync('python3',['-B','-c',"import importlib.util,json;s=importlib.util.spec_from_file_location('builder','scripts/build-incoming-shortcut.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.build({'endpoint':'http://127.0.0.1:54321/api/imports/incoming','token':'x'*43,'qaName':'Budgit-Incoming-QA-test'})))"],{encoding:'utf8'}));
 const deletion=qa.WFWorkflowActions.find(a=>short(a)==='file.delete');assert.equal(deletion.WFWorkflowActionParameters.WFDeleteImmediatelyDelete,false);assert.equal(deletion.WFWorkflowActionParameters.WFInput.Value.VariableName,'BudgitFreshMatches');
 assert.ok(!w.WFWorkflowActions.some(a=>short(a)==='text.changecase'));
 const filters=w.WFWorkflowActions.filter(a=>short(a)==='conditional').map(a=>a.WFWorkflowActionParameters.WFConditionalActionString);
 for(const extension of ['csv','xlsx','pdf','PDF','.XLSX'])assert.ok(filters.includes(extension));
 assert.ok(w.WFWorkflowActions.some(a=>short(a)==='urlencode'&&a.WFWorkflowActionParameters.WFEncodeMode==='Encode'));assert.ok(w.WFWorkflowActions.some(a=>short(a)==='getvalueforkey'&&a.WFWorkflowActionParameters.WFDictionaryKey==='error')); assert.ok(JSON.stringify(w).includes('BudgitSkipped'));assert.ok(JSON.stringify(w).includes('BudgitExamined'));
 assert.equal(w.WFWorkflowActions.filter(a=>short(a)==='file.getfoldercontents').length,2);assert.equal(w.WFWorkflowActions.filter(a=>short(a)==='downloadurl').length,3);assert.ok(!JSON.stringify(w).includes('/Users/'));assert.ok(!JSON.stringify(w).includes('http://127.0.0.1'));
})
test('Native receipt conditions use concrete Text inputs and a receipt ID for catalog presence',()=>{
 const w=workflow(),actions=w.WFWorkflowActions,byId=new Map(actions.map(a=>[a.WFWorkflowActionParameters.UUID,a]));
 const output=p=>byId.get(p?.Value?.OutputUUID);
 let dynamic=0;
 for(const a of actions){
  const p=a.WFWorkflowActionParameters;
  if(a.WFWorkflowActionIdentifier!=='is.workflow.actions.conditional'||p.WFControlFlowMode!==0||p.WFCondition!==4)continue;
  assert.equal(output(p.WFInput.Variable)?.WFWorkflowActionIdentifier,'is.workflow.actions.gettext','Native equality must receive unambiguous Text');
  assert.ok(p.WFConditionalActionString,'Native equality requires a populated RHS');
  if(typeof p.WFConditionalActionString==='object'){
   dynamic++;
   const t=p.WFConditionalActionString;
   assert.equal(t.WFSerializationType,'WFTextTokenString');
   assert.equal(t.Value.string,'\ufffc');
   assert.equal(Object.keys(t.Value.attachmentsByRange).length,1);
  }
 }
 assert.ok(dynamic>=6,'Boolean type/value and both receipt hashes remain guarded');
 const receiptLookup=actions.find(a=>a.WFWorkflowActionIdentifier==='is.workflow.actions.getvalueforkey'&&a.WFWorkflowActionParameters.WFDictionaryKey==='receiptId');
 const index=actions.indexOf(receiptLookup),presence=actions[index+4].WFWorkflowActionParameters;
 assert.equal(actions[index+1].WFWorkflowActionIdentifier,'is.workflow.actions.gettext');
 assert.equal(actions[index+2].WFWorkflowActionIdentifier,'is.workflow.actions.count');
 assert.equal(actions[index+2].WFWorkflowActionParameters.WFCountType,'Characters');
 assert.equal(output(actions[index+2].WFWorkflowActionParameters.Input),actions[index+1]);
 assert.equal(presence.WFCondition,4);
 assert.equal(presence.WFConditionalActionString,'0');
 assert.equal(output(presence.WFInput.Variable),actions[index+3]);
 // Native Text emits one item even for an empty string. No existence condition
 // may mistake that item for a nonempty key, receipt ID or server error.
 assert.ok(!actions.some(a=>a.WFWorkflowActionParameters.WFCondition===101));
});
test('Count actions bind the native Input parameter, including setup guards and final counters',()=>{
 const w=workflow(),counts=w.WFWorkflowActions.filter(a=>a.WFWorkflowActionIdentifier==='is.workflow.actions.count');
 assert.ok(counts.length>=9);
 for(const {WFWorkflowActionParameters:p} of counts){assert.ok(p.Input,'Count reads Input');assert.equal(p.WFInput,undefined,'WFInput is ignored by native Count');}
 const folder=w.WFWorkflowActions.find(a=>a.WFWorkflowActionIdentifier==='is.workflow.actions.file.getfoldercontents').WFWorkflowActionParameters;
 assert.equal(folder.Recursive,false);
 assert.equal(folder.WFGetFolderContentsRecursive,undefined);
});
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

test('Generated receipt graph accepts truthful removed acknowledgments and refuses forged or mismatched receipts',async()=>{
 const {runIncomingWorkflow}=await import('./helpers/incoming-workflow-runner.mjs'),w=workflow();
 // Setup token is synthetic and never written to the public installer.
 const tokenQuestion=w.WFWorkflowImportQuestions.find(q=>q.ParameterKey==='WFTextActionText');w.WFWorkflowActions[tokenQuestion.ActionIndex].WFWorkflowActionParameters.WFTextActionText='x'.repeat(43);
 const connectionId='synthetic-connection',sourceHash='a'.repeat(64),removed={receiptId:'synthetic-receipt',sourceHash,connectionId,stored:false,completed:true,completionAcknowledged:true,originalRemoved:true,cleanupEligible:false,processingState:'completed-original-removed'};
 for(const cached of [false,true]){
  const run=r=>runIncomingWorkflow(w,{catalog:{version:2,connectionId,receipts:cached?{[sourceHash]:r}:{}},receipt:r});
  assert.equal(run(removed).exited,false);assert.equal(run({...removed,stored:true,originalRemoved:false}).exited,false);
  for(const patch of [{stored:'false'},{stored:undefined},{completed:'true'},{completed:false},{completionAcknowledged:false},{originalRemoved:false},{cleanupEligible:true},{connectionId:'another'},{sourceHash:'b'.repeat(64)},{receiptId:''},{processingState:'received'}])assert.equal(run({...removed,...patch}).exited,true,JSON.stringify({cached,patch}));
 }
 assert.equal(runIncomingWorkflow(w,{catalog:{version:1,receipts:{}},receipt:removed}).exited,true);
});

function configuredWorkflow(cleanup='delete-after-upload'){
 const w=workflow();
 const settings=w.WFWorkflowImportQuestions.filter(q=>q.ParameterKey==='WFTextActionText');
 w.WFWorkflowActions[settings[0].ActionIndex].WFWorkflowActionParameters.WFTextActionText='x'.repeat(43);
 w.WFWorkflowActions[settings[1].ActionIndex].WFWorkflowActionParameters.WFTextActionText=cleanup;
 return w;
}
test('Day-0 native graph deletes only fresh exact files after independently verified storage, including retry',async()=>{
 const {runIncomingWorkflow}=await import('./helpers/incoming-workflow-runner.mjs'),w=configuredWorkflow();
 const connectionId='synthetic-connection',sourceHash='a'.repeat(64),receipt={receiptId:'synthetic-receipt',sourceHash,connectionId,stored:true,cleanupEligible:false,fullImportComplete:false,processingState:'awaiting_verification',budgetState:'not-committed'},proof={...receipt,deviceCleanupVersion:1,storageVerified:true,deviceCopyRemovable:true,originalRemoved:false};
 for(const cached of [false,true]){
  const options={catalog:{version:2,connectionId,receipts:cached?{[sourceHash]:receipt}:{}},receipt,freshReceipt:proof};
  const result=runIncomingWorkflow(w,options);assert.equal(result.exited,false);assert.equal(result.deleted.length,1);assert.equal(result.requests.filter(r=>r.method==='POST').length,cached?0:1);assert.match(result.requests.at(-1).url,/verifyStorage=1/);
  assert.equal(runIncomingWorkflow(configuredWorkflow('retain'),options).deleted.length,0);
  for(const patch of [{stored:false},{stored:'true'},{deviceCleanupVersion:undefined},{deviceCleanupVersion:2},{storageVerified:undefined},{storageVerified:false},{storageVerified:'true'},{deviceCopyRemovable:false},{deviceCopyRemovable:'true'},{originalRemoved:true},{connectionId:'other'},{sourceHash:'b'.repeat(64)},{receiptId:'other'}]){
   const rejected=runIncomingWorkflow(w,{...options,freshReceipt:{...proof,...patch}});assert.equal(rejected.deleted.length,0,JSON.stringify({cached,patch}));
  }
  const changed=runIncomingWorkflow(w,{...options,hashFile:f=>f.changed?'b'.repeat(64):sourceHash,freshFiles:[{name:'synthetic.csv',extension:'csv',changed:true}]});assert.equal(changed.deleted.length,0);assert.equal(changed.exited,true);
  for(const freshFiles of [[],[{name:'synthetic.csv',extension:'csv'},{name:'synthetic.csv',extension:'csv'}],[{name:'synthetic.csv',extension:'pdf'}]])assert.equal(runIncomingWorkflow(w,{...options,freshFiles}).deleted.length,0);
  let attempts=0;assert.throws(()=>runIncomingWorkflow(w,{...options,deleteFile:()=>{attempts++;throw Error('Synthetic Files denial')}}),/denial/);assert.equal(attempts,1);
  // A removed-original acknowledgment is truthful, but cannot transfer a copy.
  const removed={...proof,stored:false,completed:true,completionAcknowledged:true,originalRemoved:true,cleanupEligible:false,processingState:'completed-original-removed'};
  const expired=runIncomingWorkflow(w,{...options,receipt:removed,freshReceipt:removed,catalog:{version:2,connectionId,receipts:cached?{[sourceHash]:removed}:{}}});assert.equal(expired.exited,false);assert.equal(expired.deleted.length,0);
 }
});
test('The tenth new file is verified and cleaned before the batch bound stops the native graph',async()=>{
 const {runIncomingWorkflow}=await import('./helpers/incoming-workflow-runner.mjs'),sourceHash='a'.repeat(64),connectionId='synthetic-connection';
 const receipt={receiptId:'synthetic-receipt',sourceHash,connectionId,stored:true,deviceCleanupVersion:1,storageVerified:true,deviceCopyRemovable:true,originalRemoved:false};
 const files=Array.from({length:11},(_,i)=>({name:'synthetic-'+i+'.csv',extension:'csv'}));
 const result=runIncomingWorkflow(configuredWorkflow(),{catalog:{version:2,connectionId,receipts:{}},receipt,files});
 assert.equal(result.exited,true);assert.equal(result.uploaded.length,10);assert.equal(result.deleted.length,10);assert.ok(!result.deleted.includes(files[10]));
});

test('Actual loopback storage proofs verify originals without importing and expose fresh-proof faults',async()=>{
 for(const mode of ['success',...qaModes.filter(m=>m.startsWith('proof-'))]){
  const qa=await startIncomingShortcutQA({mode});try{
   const headers={authorization:'Bearer '+qa.token},bytes=readFileSync(join(qa.input,qa.filenames[0]));
   const receipt=await(await fetch(qa.endpoint+'?name='+encodeURIComponent(qa.filenames[0]),{method:'POST',headers,body:bytes})).json();
   assert.equal(receipt.deviceCopyRemovable,false);
   const request=()=>fetch(qa.endpoint+'?verifyStorage=1&receipt='+receipt.receiptId+'&hash='+receipt.sourceHash,{headers});
   if(mode==='proof-disconnect')await assert.rejects(request());
   else{
    const response=await request(),proof=await response.json();
    if(mode==='success'){assert.equal(response.status,200);assert.equal(proof.storageVerified,true);assert.equal(proof.deviceCopyRemovable,true);assert.equal(proof.cleanupEligible,false);assert.deepEqual(await qa.verifyStoredOriginal(),{verified:true,sourceHashMatches:true,financialCommits:0,budgets:0});}
    if(mode==='proof-missing')assert.equal(proof.deviceCopyRemovable,undefined);
    if(mode==='proof-false')assert.equal(proof.storageVerified,false);
    if(mode==='proof-string')assert.equal(proof.deviceCopyRemovable,'true');
    if(mode==='proof-wrong-hash')assert.notEqual(proof.sourceHash,qa.sourceHash);
    if(mode==='proof-unavailable')assert.equal(response.status,503);
   }
   assert.equal(qa.stats().budgets,0);
   if(mode==='proof-local-changed'){assert.notDeepEqual(readFileSync(join(qa.input,qa.filenames[0])),bytes);assert.equal((await qa.verifyStoredOriginal()).verified,true);qa.resetFixtures();}
   assert.deepEqual(readFileSync(join(qa.input,qa.filenames[0])),bytes);
  }finally{await qa.close()}
 }
});

test('Phone QA endpoints require explicit synthetic HTTPS opt-in and never accept arbitrary or production origins',()=>{
 const build=config=>execFileSync('python3',['-B','-c',"import importlib.util,json;s=importlib.util.spec_from_file_location('builder','scripts/build-incoming-shortcut.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.build(json.loads(__import__('sys').argv[1]))))",JSON.stringify(config)],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const config={endpoint:'https://budgit-synthetic-test.trycloudflare.com/api/imports/incoming',token:'x'.repeat(43),qaName:'Budgit-Incoming-QA-iphone-test',syntheticHttps:true};
 assert.ok(JSON.parse(build(config)).WFWorkflowActions.length>0);
 for(const patch of [{syntheticHttps:false},{endpoint:'https://budgit.duckdns.org/api/imports/incoming'},{endpoint:'https://example.test/api/imports/incoming'},{endpoint:'https://budgit-synthetic-test.trycloudflare.com:444/api/imports/incoming'},{endpoint:'https://budgit-synthetic-test.trycloudflare.com/api/imports/incoming?redirect=1'},{endpoint:'https://user@budgit-synthetic-test.trycloudflare.com/api/imports/incoming'},{endpoint:'http://budgit-synthetic-test.trycloudflare.com/api/imports/incoming'}])assert.throws(()=>build({...config,...patch}));
});
