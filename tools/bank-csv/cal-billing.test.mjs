import {cashCardsForAccount} from '../../src/budget.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {parseCalBilling} from './cal-billing.mjs';
const fixture=(charges=['106.66','148','360.50'],total='615.16')=>({rows:[
 {cells:['פירוט עסקאות לכרטיס לדוגמה']},
 {cells:[`עסקאות לחיוב ב-15/11/2026: ${total} ₪`]},
 {cells:['תאריך\nעסקה','שם בית עסק','סכום\nעסקה','סכום\nחיוב','סוג\nעסקה','ענף','הערות']},
 ...charges.map((c,i)=>({cells:['2026-10-13','בית עסק לדוגמה','99999',c,'תשלומים','כללי',`תשלום ${i+1} מתוך 10`],numericColumns:[]})),
 {cells:['את המידע המלא על כל עסקה אפשר למצוא באתר ובאפליקציית כאל. מידע נוסף']}
]});
test('Cal uses billed installments, reconciles exact cents, keeps credits, grouped amounts and duplicates',()=>{
 const input=fixture(),before=JSON.stringify(input);
 const parsed=parseCalBilling([input]);assert.deepEqual({...parsed,entries:undefined},{issuer:'cal',dueDate:'2026-11-15',amount:615.16,count:3,entries:undefined});assert.equal(parsed.entries[0].amountCents,10666);assert.equal(parsed.entries[0].originalCents,9999900);
 assert.equal(JSON.stringify(input),before);
 for(const [charges,total,amount] of [
  [['1000','1000'],'2,000.00',2000],
  [['1,000.00','-100.25'],'899.75',899.75],
  [['1.000,00','-100,25'],'899,75',899.75],
  [['99,999,999.99'],'99,999,999.99',99999999.99],
  [['0'],'0',0]
 ])assert.equal(parseCalBilling([fixture(charges,total)]).amount,amount);
});
test('Cal rejects incomplete, ambiguous, foreign-currency, formula and malformed rows',()=>{
 assert.throws(()=>parseCalBilling([fixture(['100'],'101')]),/תואמים/);
 assert.throws(()=>parseCalBilling([fixture(),fixture()]),/גיליונות/);
 for(const change of [
  f=>f.rows[3].cellIssues=[{column:3,message:'formula'}],
  f=>f.rows[3].cells[3]='106.66 USD',
  f=>f.rows[3].sourceCells=['','','','$106.66'],
  f=>f.rows[3].cells[3]='',
  f=>f.rows[3].cells[0]='31/02/2026',
  f=>f.rows[3].cells[3]='106.666',
  f=>f.rows.push({cells:['unrecognized footer']}),
  f=>f.rows.splice(2,0,{cells:['עסקאות לחיוב ב-15/12/2026: 10 ₪']}),
  f=>f.rows[2].cells.push('סכום חיוב')
 ]){const f=fixture();change(f);assert.throws(()=>parseCalBilling([f]));}
 assert.equal(parseCalBilling([{rows:[{cells:['תאריך','תיאור','סכום']}]}]),null);
});
test('Cal typed numeric amounts preserve real fractions of a cent rejection',()=>{
 const f=fixture(['1.001'],'1,001');f.rows[3].numericColumns=[3];assert.throws(()=>parseCalBilling([f]));
});
function billingUI(){
 const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',textContent:'',innerHTML:'',disabled:false,hidden:true,querySelector:node,querySelectorAll:()=>[]});return nodes.get(selector);};
 const dialog={querySelector:node,querySelectorAll:()=>[],showModal(){},close(){},remove(){}};let applied=null,saves=0;
 const c=vm.createContext({window:{addEventListener(){}},app:{addEventListener(){}},document:{createElement:()=>dialog,body:{append(){}}},plan:{cashPlanning:{cardAccounts:{card1:'a'}}},creditCards:()=>[{id:'card1',name:'כרטיס לדוגמה'}],cashAccountList:()=>[{id:'a',label:'חשבון'}],cashCardsForAccount,billingReport:()=>null,esc:String,currency:String,money:String,knownCategories:()=>[],validatePlan:()=>true,mutate:n=>{applied=n;c.plan=n;saves++;},demoPreview:true,render(){},notify(){},dirty:false,FormData:class{get(k){return k.startsWith('batch-date-')?(k.endsWith('0')?'2026-11-15':'2026-12-15'):k.startsWith('batch-account-')?'a':null;}},applyBillingBatch:(p,entries)=>({entries})});
 vm.runInContext(fs.readFileSync('src/card-billing-client.js','utf8'),c);
 vm.runInContext("billingCanEdit=()=>true;readBillingFile=async file=>({issuer:'cal',dueDate:file.name==='a.xlsx'?'2026-11-15':'2026-12-15',amount:615.16,count:3});openBillingEditor('card1','2026-10-15');",c);
 return {c,node,dialog,getApplied:()=>applied,getSaves:()=>saves};
}
test('Billing UI previews multiple dates and performs one mutation only after explicit approval',async()=>{
 const {c,node,dialog,getApplied,getSaves}=billingUI();assert.match(dialog.innerHTML,/type="file" multiple/);
 await node('[data-billing-file]').onchange({target:{files:[{name:'a.xlsx',size:100},{name:'b.xlsx',size:100}]}});
 assert.match(node('[data-billing-statement]').innerHTML,/value="2026-11-15"/);assert.match(node('[data-billing-statement]').innerHTML,/value="2026-12-15"/);assert.equal(getApplied(),null);
 await node('form').onsubmit({preventDefault(){}});
 assert.equal(getSaves(),1);assert.equal(getApplied().entries.length,2);assert.equal(getApplied().entries[0].dueDate,'2026-11-15');assert.equal(getApplied().entries[1].dueDate,'2026-12-15');assert.equal(getApplied().entries[0].amount,615.16);
});
test('A bad file in the UI batch prevents partial/manual saving and retains an actionable error',async()=>{
 const {c,node,getApplied}=billingUI();vm.runInContext("readBillingFile=async file=>{if(file.name==='bad.xlsx')throw Error('דוח לא ברור');return {dueDate:'2026-11-15',amount:1};}",c);
 await node('[data-billing-file]').onchange({target:{files:[{name:'a.xlsx',size:100},{name:'bad.xlsx',size:100}]}});
 assert.match(node('[data-billing-file-result]').textContent,/bad.xlsx.*דוח לא ברור/);assert.equal(node('[type=submit]').disabled,true);
 await node('form').onsubmit({preventDefault(){}});assert.equal(getApplied(),null);
 await node('[data-billing-file]').onchange({target:{files:[{name:'a.xlsx',size:100}]}});assert.equal(node('[type=submit]').disabled,false);
});

test('Cal XLSX goes through bounded application reader, retaining purchase and charged amounts separately',async()=>{
 const {calFixture}=await import('./cal-fixture.mjs'),{default:XLSX}=await import('./vendor/xlsx-mini.cjs'),{readXlsx,inspectSheet}=await import('./xlsx-reader.mjs');
 const wb=readXlsx(calFixture(),XLSX),r=parseCalBilling(wb.SheetNames.map(n=>inspectSheet(wb,n,XLSX)));
 assert.equal(r.amount,125.25);assert.equal(r.entries.length,2);assert.equal(r.entries[0].originalCents,30075);assert.equal(r.entries[0].amountCents,10025);
});

test('Batch UI keeps one applied draft when persistence fails, and retries without duplicating the mutation',async()=>{
 const {c,node,getSaves}=billingUI();c.demoPreview=false;c.saveAttempts=0;c.save=async()=>{c.saveAttempts++;c.dirty=c.saveAttempts===1;};
 await node('[data-billing-file]').onchange({target:{files:[{name:'a.xlsx',size:100},{name:'b.xlsx',size:100}]}});
 await node('form').onsubmit({preventDefault(){}});assert.equal(getSaves(),1);assert.equal(node('[data-billing-error]').hidden,false);assert.match(node('[data-billing-error]').textContent,/טרם נשמרו/);
 await node('form').onsubmit({preventDefault(){}});assert.equal(getSaves(),1);assert.equal(c.saveAttempts,2);assert.equal(c.dirty,false);
});
