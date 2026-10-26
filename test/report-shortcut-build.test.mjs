import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const workflow=()=>JSON.parse(execFileSync('python3',['-B','-c',"import importlib.util,json; s=importlib.util.spec_from_file_location('builder','scripts/build-report-shortcut.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.build()))"],{encoding:'utf8'}));
const short=a=>a.WFWorkflowActionIdentifier.replace('is.workflow.actions.','');
test('report workflow draft is reproducible and has no embedded key, local folder, bank login or deletion action',()=>{
 const w=workflow();assert.deepEqual(w,workflow());
 const actions=w.WFWorkflowActions;
 assert.equal(actions[0].WFWorkflowActionParameters.WFTextActionText,'');
 assert.deepEqual(w.WFWorkflowImportQuestions.map(q=>q.ParameterKey),['WFTextActionText','WFFile','WFFile']);
 assert.ok(actions.filter(a=>short(a)==='file').every(a=>!a.WFWorkflowActionParameters.WFFile));
 const serialized=JSON.stringify(w);assert.ok(!serialized.includes('127.0.0.1'));assert.ok(!serialized.includes('/Users/'));assert.ok(!serialized.includes('/tmp/'));
 assert.ok(!actions.some(a=>/delete|remove|runworkflow|runscript|javascript|openurl/.test(short(a))));
 assert.equal(actions.filter(a=>short(a)==='downloadurl').length,1);
 const http=actions.find(a=>short(a)==='downloadurl').WFWorkflowActionParameters;
 assert.equal(http.WFHTTPMethod,'POST');assert.equal(http.WFHTTPBodyType,'File');
 assert.equal(http.WFRequestVariable.Value.VariableName,'BudgitSource');
 assert.ok(http.WFURL.Value.string.startsWith('https://budgit.duckdns.org/api/imports/reports?name='));
});
test('every output reference precedes use and every move is behind source lookup and hash comparison branches',()=>{
 const w=workflow(),seen=new Map(),stack=[];let moves=0;
 for(const a of w.WFWorkflowActions){const p=a.WFWorkflowActionParameters;
  const walk=v=>{if(!v||typeof v!=='object')return;if(v.Type==='ActionOutput')assert.ok(seen.has(v.OutputUUID),'Unknown/future output '+v.OutputUUID);Object.values(v).forEach(walk);};walk(p);
  if(p.WFControlFlowMode===0)stack.push(a);
  else if(p.WFControlFlowMode===1)assert.equal(stack.at(-1).WFWorkflowActionParameters.GroupingIdentifier,p.GroupingIdentifier);
  else if(p.WFControlFlowMode===2)assert.equal(stack.pop().WFWorkflowActionParameters.GroupingIdentifier,p.GroupingIdentifier);
  if(short(a)==='file.move'){
   moves++;assert.equal(p.WFFile.Value.VariableName,'BudgitConfirmedSource');
   const conditions=stack.filter(a=>short(a)==='conditional').map(a=>a.WFWorkflowActionParameters);
   // A candidate is supported and has been found again by name after upload.
   assert.ok(conditions.some(c=>c.WFInput.Variable.Value.VariableName==='BudgitSupported'));
   assert.ok(conditions.some(c=>seen.get(c.WFInput.Variable.Value.OutputUUID)&&short(seen.get(c.WFInput.Variable.Value.OutputUUID))==='properties.files'));
   const before=[...seen.values()];
   const hashes=before.filter(a=>short(a)==='hash');assert.equal(hashes.length,2);
   assert.equal(hashes[1].WFWorkflowActionParameters.WFInput.Value.VariableName,'BudgitConfirmedSource');
   const exits=before.filter(a=>short(a)==='exit');assert.ok(exits.length>=8,'Fail-closed branches before any move');
   assert.equal(before.filter(a=>short(a)==='file.getfoldercontents').length,4,'Source read, fresh source read, and two destination checks');
  }
  seen.set(p.UUID,a);
 }
 assert.equal(moves,1);assert.equal(stack.length,0);
});
test('QA generator rejects a production endpoint before embedding a supplied token',()=>{
 const command="import importlib.util; s=importlib.util.spec_from_file_location('builder','scripts/build-report-shortcut.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); m.build({'endpoint':'https://budgit.duckdns.org/api/imports/reports','token':'X'*43,'input':'/tmp','uploaded':'/tmp'})";
 assert.throws(()=>execFileSync('python3',['-B','-c',command],{stdio:'pipe'}),e=>e.stderr.toString().includes('QA accepts only the local synthetic endpoint'));
});
