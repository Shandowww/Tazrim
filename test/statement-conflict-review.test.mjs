import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,generateKeyPairSync,randomUUID} from 'node:crypto';
import {zero,clone,validatePlan} from '../src/budget.js';
import {prepareCardStatement,applyCardStatement} from '../src/card-statement-model.js';
import {applyReportInbox} from '../src/report-inbox-model.js';
import {buildReportInbox,changeReportInbox,reportInboxDraftForWrite} from '../src/report-inbox-controller.js';
import {calPDFFixture} from '../tools/bank-csv/cal-pdf-fixture.mjs';
import {readReportPDF} from '../tools/bank-csv/pdf-reader.mjs';
import {openDatabase} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {loadBudgetSnapshot} from '../frontend/src/app/budget-api.ts';
import {storeReportSource} from '../frontend/src/app/report-library-api.ts';
import {loadReportGroup} from '../frontend/src/app/report-group-loader.ts';
import {saveStoredReportGroupDraft,commitStoredReportGroup} from '../frontend/src/app/report-review-api.ts';
import * as classifier from '../tools/bank-csv/classifier.mjs';
const origin='https://statement-review.test',hash=v=>createHash('sha256').update(v).digest('hex');
const base=()=>({startMonth:'2026-01',opening:1000,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],demo:false,setupCompleted:true,creditCards:[{id:'card1',name:'בדיקה',alias:'1234',provider:'cal'}],cashPlanning:{accounts:[{id:'bank-a',label:'חשבון בדיקה',bankName:'hapoalim',buffer:0}],months:{},cardAccounts:{card1:'bank-a'},transfers:[]}});
async function fixture(){
 const bytes=calPDFFixture(),{intake:parsed}=await readReportPDF(bytes.slice(),{includeAccountIdentity:true}),incoming={...parsed,hash:hash(bytes),identityKey:hash(parsed.identity)},old=clone(parsed.report);old.entries[0].merchant='שם בית העסק בפירוט הישן';
 const p=base(),preview=await prepareCardStatement(p,old,'card1'),saved=await applyReportInbox(p,[],[{cardId:'card1',accountId:'bank-a',dueDate:old.dueDate,amount:old.amount,statement:preview,choices:{},deferCategories:true}],[{hash:'c'.repeat(64),kind:'card',target:'card1',reference:old.dueDate}],[],'2026-11-07');
 saved.details.find(d=>d.id===preview.rows[1].id).category='מזון';
 const ui={groupId:randomUUID(),blank:false,startMonth:saved.startMonth,items:[{...incoming,id:randomUUID(),name:'cal.pdf',size:bytes.length,target:'card1',payer:'bank-a',decisions:{},directIncluded:{},monthDecisions:{},bankOptions:{scope:'complete'},skip:false}],newAccounts:[],newCards:[],categoryChoices:new Map(),bankChoices:new Map(),duplicates:0,merchantRules:[]};
 return {bytes,incoming,saved,ui};
}
const build=(p,ui)=>buildReportInbox(p,ui,{month:'2026-11',today:'2026-11-07',classifier});
test('Changed statement exposes exact removed/added evidence and blocks until its current comparison is explicitly selected',async()=>{
 const {saved,ui}=await fixture();saved.creditCards.push({id:'card2',name:'כרטיס אחר',alias:'9876',provider:'cal'});saved.cashPlanning.cardAccounts.card2='bank-a';const unrelated={...clone(saved.details[1]),id:'cal-'+hash('unrelated-card-detail'),method:'card2',statement:{...clone(saved.details[1].statement),key:hash('unrelated-card-detail')}};saved.details.push(unrelated);const before=clone(saved);await build(saved,ui);assert.equal(ui.issues,1);assert.equal(ui.build,null);const item=ui.items[0],diff=item.statementConflict;
 assert.equal(diff.savedOnly.length,1);assert.equal(diff.incomingOnly.length,1);assert.equal(diff.unchanged,1);assert.match(diff.savedOnly[0].name,/הישן/);assert.equal(diff.savedTotal,50);assert.equal(diff.incomingTotal,50);assert.equal(item.questions[0].type,'statement-conflict');assert.deepEqual(saved,before);
 await changeReportInbox(saved,ui,{dataset:{inboxReplacement:'0'},value:diff.token});await build(saved,ui);assert.equal(ui.issues,0,JSON.stringify({error:ui.error,warning:ui.items[0].warning}));assert.ok(ui.build);assert.equal(validatePlan(ui.build),true);assert.equal(ui.build.details.length,saved.details.length);const common=saved.details.find(r=>!diff.savedOnly.some(o=>o.id===r.id));assert.deepEqual(ui.build.details.find(r=>r.id===common.id),common);assert.equal(ui.build.details.some(r=>r.id===diff.savedOnly[0].id),false);assert.deepEqual(ui.build.reportInbox.receipts.slice(0,1),saved.reportInbox.receipts.slice(0,1));assert.deepEqual(saved,before);assert.deepEqual(ui.build.details.find(r=>r.id===unrelated.id),unrelated);
 const changed=clone(saved);changed.details[0].category='משפחה';await build(changed,ui);assert.equal(ui.issues,1);assert.notEqual(ui.items[0].statementConflict.token,diff.token);assert.equal(ui.build,null);
});
test('Keeping saved data and canceling replacement are reversible local choices; changed rows cannot be deleted with a stale preview',async()=>{
 const {saved,ui}=await fixture();await build(saved,ui);const diff=ui.items[0].statementConflict;
 const preview=await prepareCardStatement(saved,ui.items[0].report,'card1',[],{replacementToken:diff.token});const changed=clone(saved);changed.details.find(d=>d.id===diff.savedOnly[0].id).category='משפחה';assert.throws(()=>applyCardStatement(changed,preview,{}, {deferCategories:true}),/הפירוט השתנה/);
 await changeReportInbox(saved,ui,{dataset:{inboxSkip:'0'},value:'',checked:true});await build(saved,ui);assert.equal(ui.issues,0);assert.equal(ui.items[0].skip,true);assert.equal(ui.build,null);
 await changeReportInbox(saved,ui,{dataset:{inboxSkip:'0'},value:'',checked:false});await build(saved,ui);assert.equal(ui.issues,1);
 await changeReportInbox(saved,ui,{dataset:{inboxReplacement:'0'},value:diff.token});await build(saved,ui);assert.ok(ui.build);
 await changeReportInbox(saved,ui,{dataset:{inboxReplacement:'0'},value:''});await build(saved,ui);assert.equal(ui.issues,1);assert.equal(ui.build,null);
});
test('Replacement decisions survive original draft save/reload and one atomic financial import, including a lost successful response',async()=>{
 const f=await fixture(),{db,DB}=openDatabase(':memory:'),pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 try{for(const user of ['alice','bob']){db.prepare('INSERT INTO auth_users VALUES(?,?,?,?)').run(user,user,user+'@example.test',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hash(user),user,Date.now()+3600000)}
 const app=createApp({db,DB,origin,allowedEmails:['alice@example.test','bob@example.test'],reportOptions:{key:randomBytes(32),recoveryPublicKey:pair.publicKey}}),fetcher=(path,init={})=>app(new Request(origin+path,{...init,headers:{origin,cookie:'__Host-mf_session=alice',...Object.fromEntries(new Headers(init.headers))}}));
 assert.equal((await fetcher('/api/plan',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:f.saved,revision:0})})).status,200);
 const current=(await loadBudgetSnapshot('personal',new AbortController().signal,fetcher)).value,receipt=await storeReportSource('personal',current,'cal.pdf',f.bytes,fetcher),source={id:receipt.receiptId,revision:1,state:'received',sourceHash:hash(f.bytes)};
 f.ui.items[0].id=source.id;f.ui.items[0].storedId=source.id;f.ui.items[0].storedRevision=source.revision;await build(f.saved,f.ui);const token=f.ui.items[0].statementConflict.token;await changeReportInbox(f.saved,f.ui,{dataset:{inboxReplacement:'0'},value:token});await build(f.saved,f.ui);
 const before=JSON.stringify(db.prepare('SELECT * FROM plans').all()),draft=reportInboxDraftForWrite(f.ui,f.ui.items,'conflict-review-test');await saveStoredReportGroupDraft('personal',current,[source],draft,'ready',fetcher);assert.equal(JSON.stringify(db.prepare('SELECT * FROM plans').all()),before);
 const loaded=await loadReportGroup('personal',current,[source.id],new AbortController().signal,fetcher);await build(f.saved,loaded.ui);assert.equal(loaded.ui.items[0].decisions.statementReplacement,token);assert.equal(loaded.ui.issues,0);
 const commitDraft=reportInboxDraftForWrite(loaded.ui,loaded.ui.items,'conflict-review-test'),actionId=randomUUID();let lost=false;
 const unreliable=async(path,init={})=>{const result=await fetcher(path,init);if(!lost&&init.method==='POST'&&JSON.parse(init.body).action==='commit'){lost=true;assert.equal(result.status,200);throw Error('synthetic lost commit')}return result};
 await assert.rejects(commitStoredReportGroup('personal',current,loaded.sources,commitDraft,loaded.ui.build,actionId,unreliable));
 const result=await commitStoredReportGroup('personal',current,loaded.sources,commitDraft,loaded.ui.build,actionId,unreliable);assert.equal(result.value.revision,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM report_commits').get().n,1);assert.equal(result.value.plan.details.length,f.saved.details.length);assert.deepEqual(result.value.plan,loaded.ui.build);
 }finally{db.close()}
});
