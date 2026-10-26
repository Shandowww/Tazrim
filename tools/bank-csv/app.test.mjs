import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as parser from './parser.mjs';
import * as classifier from './classifier.mjs';
import * as dedupe from './dedupe.mjs';

// Exercise the actual UI controller with an in-memory DOM and real CSV parser.
async function harness(fetch=()=>{throw Error('Unexpected sample request');}){
 const elements=new Map();
 const element=id=>{
  if(!elements.has(id))elements.set(id,{value:'',hidden:true,disabled:false,checked:false,innerHTML:'',textContent:'',selectedOptions:[{textContent:'שקלים'}],listeners:{},addEventListener(type,callback){this.listeners[type]=callback;}});
  return elements.get(id);
 };
 for(const [id,value]of Object.entries({from:'2026-01-29',to:'2026-10-12',encoding:'auto',delimiter:'auto',decimal:'dot',dateFormat:'day-first',currency:'ILS',filter:'all',header:'0'}))element(id).value=value;
 element('raw').checked=true;
 const context=vm.createContext({...parser,...classifier,...dedupe,Uint8Array,Intl,File,Blob,setTimeout,clearTimeout,fetch,document:{getElementById:element,documentElement:{dataset:{}}},localStorage:{getItem(){return null;}},window:{addEventListener(){}}});
 const source=await readFile(new URL('app.mjs',import.meta.url),'utf8');
 vm.runInContext(source.replace(/^import .*\n/gm,''),context);
 return {element,load:(file,options)=>{context.inputFile=file;context.inputOptions=options;return vm.runInContext('loadFile(inputFile,inputOptions)',context);},reset:()=>vm.runInContext('reset()',context),result:()=>vm.runInContext('result',context)};
}
const report=()=>new File(['תאריך,הפעולה,חובה,זכות,יתרה\n12/10/2026,תנועת בדיקה סינתטית,1000,,8765.58'],'excelNewTransactions.csv');

test('Selected report retains its own source and cannot be replaced by demo',async()=>{
 const h=await harness();await h.load(report());
 assert.equal(h.element('results').hidden,false);
 assert.equal(h.result().summary.debitCents,100000);
 assert.match(h.element('source-banner').innerHTML,/excelNewTransactions.csv/);
 assert.equal(h.element('example').disabled,true);
 await h.load(new File(['Date,Amount\n12/10/2026,99999'],'דוח-דוגמה.csv'),{example:true});
 assert.equal(h.result().summary.debitCents,100000);
 assert.match(h.element('error').textContent,/נקה/);
});

test('Failed new report hides old demo amounts and names the failed attempt',async()=>{
 const h=await harness();await h.load(report(),{example:true});
 assert.match(h.element('source-banner').innerHTML,/מומצאים/);
 await h.load({name:'excelNewTransactions.xlsx',size:100,arrayBuffer(){throw Error('Read failure');}});
 assert.equal(h.element('results').hidden,true);
 assert.match(h.element('status').textContent,/excelNewTransactions.xlsx לא נטען/);
 assert.equal(h.element('file').disabled,false);
});

test('Delayed demo response after reset cannot replace a newer selected report',async()=>{
 let complete;
 const h=await harness(()=>new Promise(resolve=>{complete=resolve;}));
 const pending=h.element('example').listeners.click();
 h.reset();await h.load(report());
 complete({ok:true,text:async()=> 'Date,Amount\n12/10/2026,99999'});await pending;
 assert.equal(h.result().summary.debitCents,100000);
 assert.match(h.element('source-banner').innerHTML,/excelNewTransactions.csv/);
 assert.equal(h.element('example').disabled,true);
});
test('Reviewed registry blocks overlapping rows in the next report without hiding original bank data',async()=>{
 const h=await harness(),csv=ref=>`תאריך,הפעולה,אסמכתא,חובה,זכות,יתרה\n12/10/2026,משכורת,${ref},,100,1000`;
 await h.load(new File([csv('001')],'first.csv'));
 h.element('confirm-clear').listeners.click();h.element('registry-accept').listeners.click();
 assert.match(h.element('registry-status').textContent,/נוספו 1/);
 await h.load(new File([csv('001')+'\n12/10/2026,משכורת,002,,200,1200'],'overlap.csv'));
 assert.equal(h.result().records[0].duplicateState,'duplicate');assert.equal(h.result().records[1].duplicateState,null);
 assert.equal(h.result().summary.creditCents,30000); // Source total remains faithful.
 h.element('confirm-clear').listeners.click();assert.match(h.element('classification-status').textContent,/1 תנועות אושרו/);
});
