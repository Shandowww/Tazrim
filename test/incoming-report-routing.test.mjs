import test from 'node:test'
import assert from 'node:assert/strict'
import {zero} from '../src/budget.js'
import {matchIncomingReport} from '../frontend/src/app/incoming-report-routing.ts'
import {readReportContent} from '../frontend/src/app/report-reader.ts'
const key='a'.repeat(64)
const plan=(alias='1234',provider='cal')=>({startMonth:'2026-01',opening:0,buffer:0,horizon:12,defaults:zero(),months:{},expenses:[],creditCards:[{id:'card1',name:'כרטיס',alias,provider}],cashPlanning:{accounts:[{id:'bank',label:'חשבון',bankName:'hapoalim',buffer:0}],months:{},cardAccounts:{},transfers:[]}})
const budget=(id,extra={})=>({id,name:id,role:'owner',locked:false,plan:plan(),...extra})
test('A unique issuer and card digits match across personal/shared spaces, while collisions and contradictions require review',()=>{
 const item={kind:'card',identity:'cal:1234',identityKey:key,provider:'cal'}
 assert.equal(matchIncomingReport(item,[budget('personal'),budget('shared',{plan:plan('5678')})],[]).candidates[0].budget,'personal')
 assert.equal(matchIncomingReport(item,[budget('personal'),budget('shared')],[]).state,'ambiguous')
 assert.equal(matchIncomingReport(item,[budget('personal',{plan:plan('1234','isracard')})],[]).state,'unknown')
 assert.equal(matchIncomingReport({...item,identity:''},[budget('personal')],[]).state,'unknown')
})
test('Bank names and a single visible account never replace exact identifier mappings',()=>{
 const item={kind:'bank',identity:'bank:hapoalim:123456',identityKey:key,provider:'hapoalim'}
 assert.equal(matchIncomingReport(item,[budget('personal')],[]).state,'unknown')
 const bound=budget('shared');bound.plan.reportInbox={version:1,bindings:[{key,kind:'bank',target:'bank'}],receipts:[]}
 assert.equal(matchIncomingReport(item,[budget('personal'),bound],[]).candidates[0].budget,'shared')
 assert.equal(matchIncomingReport(item,[budget('personal'),bound],[]).state,'matched')
})
test('Confirmed mappings stay actor-local and require a currently available target; locked budgets and viewers are explicit',()=>{
 const item={kind:'card',identity:'cal:1234',identityKey:key,provider:'cal'},binding={identityKey:key,kind:'card',budget:'shared',target:'card1',revision:3}
 assert.equal(matchIncomingReport(item,[budget('personal'),budget('shared')],[binding]).candidates[0].budget,'shared')
 assert.equal(matchIncomingReport(item,[budget('personal'),budget('shared')],[binding]).candidates[0].bindingRevision,3)
 assert.equal(matchIncomingReport(item,[budget('personal')],[binding]).state,'unknown')
 assert.equal(matchIncomingReport(item,[budget('personal'),budget('locked',{locked:true,plan:null})],[]).state,'locked')
 assert.equal(matchIncomingReport(item,[budget('shared',{role:'viewer'})],[binding]).state,'unknown')
})
test('The shared reader extracts a bank identifier only when called after the intake approval gate',async()=>{
 const bytes=new TextEncoder().encode('הפועלים\nמספר חשבון 123456\nתאריך,תיאור,סכום,יתרה\n01/05/2026,בדיקה,-10,990')
 const result=await readReportContent('report.csv',bytes,new AbortController().signal)
 assert.equal(result.kind,'bank');assert.equal(result.identity,'bank:hapoalim:123456');assert.match(result.identityKey,/^[a-f0-9]{64}$/)
 assert.equal(result.records[0].amountCents,-1000)
})

test('New card routing requires both issuer and digits; missing issuer metadata never guesses a destination',()=>{
 const item={kind:'card',identity:'cal:1234',identityKey:key,provider:'cal'}
 assert.equal(matchIncomingReport(item,[budget('personal',{plan:plan('1234','')})],[]).state,'unknown')
 assert.equal(matchIncomingReport({...item,provider:''},[budget('personal')],[]).state,'unknown')
 // An explicit previously confirmed identity association remains usable.
 const binding={identityKey:key,kind:'card',budget:'personal',target:'card1',revision:1}
 assert.equal(matchIncomingReport(item,[budget('personal',{plan:plan('1234','')})],[binding]).state,'matched')
 assert.equal(matchIncomingReport(item,[budget('personal',{plan:plan('9999')})],[binding]).state,'unknown')
})

test('Bank account identifiers distinguish branches and refuse ambiguous or unidentified banks',async()=>{
 const read=async heading=>readReportContent('source.csv',new TextEncoder().encode(heading+'\nתאריך,תיאור,סכום,יתרה\n01/05/2026,בדיקה,-10,990'),new AbortController().signal);
 const a=await read('הפועלים\nמספר חשבון 123456\nסניף 12'),b=await read('הפועלים\nמספר חשבון 123456\nסניף 013');
 assert.equal(a.identity,'bank:hapoalim:012:123456');assert.equal(b.identity,'bank:hapoalim:013:123456');assert.notEqual(a.identityKey,b.identityKey);
 for(const header of ['הפועלים\nמספר חשבון 123456\nסניף 012\nסניף 013','הפועלים\nמספר חשבון 123456\nסניף לא קריא','הפועלים\nמספר חשבון 123456\nמספר חשבון 654321','מספר חשבון 123456']){
  const item=await read(header);assert.equal(item.identity,'');assert.equal(item.identityKey,'');
 }
 const saved={identityKey:a.identityKey,kind:'bank',budget:'personal',target:'bank',revision:1};
 assert.equal(matchIncomingReport(a,[budget('personal')],[saved]).state,'matched');
 assert.equal(matchIncomingReport(b,[budget('personal')],[saved]).state,'unknown');
})
