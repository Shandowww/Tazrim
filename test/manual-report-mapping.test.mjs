import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCSV} from '../tools/bank-csv/parser.mjs';
import XLSX from '../tools/bank-csv/vendor/xlsx-mini.cjs';
import {readXlsx,inspectSheet} from '../tools/bank-csv/xlsx-reader.mjs';
import {isracardWorkbookFixture} from '../tools/bank-csv/isracard-xlsx-fixture.mjs';
import {inspectIntake} from '../tools/bank-csv/intake-reader.mjs';
import {mapReportSource,mappingOptions,parseMappingChoice} from '../tools/bank-csv/manual-report-mapping.mjs';
import {readAutomaticSource} from '../server/report-automation.mjs';
import {inspectReportSource} from '../frontend/src/app/report-reader.ts';
import {zero} from '../src/budget.js';

const csv='יום בדוח,הערה,תנועה,יתרה\n04/11/2026,משכורת,7800,9050\n08/11/2026,חשבון,-235,8815\n10/11/2026,תשלום,-1250,7565';
const bankChoice={kind:'bank',fields:{mode:'signed',date:'0',description:'1',amount:'2',balance:'3'}};
const fixture=()=>isracardWorkbookFixture({cardHeader:'כרטיס פלטינום לדוגמה - 4567'});
function cardSource(){
 const book=readXlsx(fixture(),XLSX);
 return inspectSheet(book,book.SheetNames[0],XLSX);
}
test('Manual bank mapping reads and reconciles every source row as partial coverage',async()=>{
 const source=inspectCSV(csv);
 assert.throws(()=>inspectIntake([source]));
 assert.equal(mappingOptions(source).kind,'bank');
 const result=mapReportSource(source,bankChoice);
 assert.deepEqual(result.records.map(row=>row.amountCents),[780000,-23500,-125000]);
 assert.equal(result.from,'2026-11-04');
 assert.equal(result.to,'2026-11-10');
 assert.equal(result.bankOptions.scope,'partial');
 const {parsed}=await readAutomaticSource('sample.csv',Buffer.from(csv),{manualMapping:JSON.stringify(bankChoice)});
 assert.deepEqual(parsed,result);
 const bad=structuredClone(source);
 bad.rows[2].cells[3]='9000';
 assert.throws(()=>mapReportSource(bad,bankChoice),/רצף היתרות/);
 assert.throws(()=>mapReportSource(source,{...bankChoice,fields:{...bankChoice.fields,amount:'3'}}),/שני שדות/);
 assert.throws(()=>mapReportSource(source,{...bankChoice,fields:{...bankChoice.fields,balance:''}}),/עמודת יתרה/);
 assert.equal(parseMappingChoice('{"kind":"bank","fields":{"date":"arbitrary input"}}'),null);
});
test('Manual card mapping reuses the original rows and totals and refuses a wrong card header or amount',async()=>{
 const source=cardSource();
 assert.throws(()=>inspectIntake([source]),/ארבע ספרות/);
 const {card}=mappingOptions(source),choice={kind:'card',fields:Object.fromEntries(Object.entries(card).map(([key,values])=>[key,values[0].value]))};
 const parsed=mapReportSource(source,choice);
 assert.equal(parsed.identity,'isracard:4567');
 assert.equal(parsed.report.amount,137.25);
 assert.equal(parsed.report.dueDate,'2026-10-10');
 assert.deepEqual(parsed.report.entries.map(row=>row.amountCents),[10025,4500,-800]);
 const replay=await readAutomaticSource('sample.xlsx',fixture(),{manualMapping:JSON.stringify(choice)});
 assert.deepEqual(replay.parsed,parsed);
 const altered=cardSource();
 altered.rows.find(row=>row.line===3).cells[7]='₪ 199.00';
 assert.throws(()=>mapReportSource(altered,choice),/סכומי החיוב המודפסים/);
 const duplicate=cardSource();
 duplicate.rows.find(row=>row.line===4).cells[0]='כרטיס נוסף - 9999';
 duplicate.rows.find(row=>row.line===4).cells[1]='₪ 137.25';
 assert.throws(()=>mapReportSource(duplicate,choice),/כותרת יחידה/);
 assert.equal(mappingOptions({...source,format:'pdf'}),null);
});

test('Manual and automatic bank intake preserve explicit foreign-currency evidence and reject conflicts',async()=>{
 const foreign='Date,Description,Amount (USD),Balance (USD)\n04/11/2026,Example,-25,75';
 const source=inspectCSV(foreign);
 const automatic=inspectIntake([source]);
 assert.equal(automatic.kind,'bank');
 assert.equal(automatic.records[0].currency,'USD');
 assert.throws(()=>mapReportSource(source,bankChoice),/שורת מקור 2.*USD/);
 await assert.rejects(readAutomaticSource('foreign.csv',Buffer.from(foreign),{manualMapping:JSON.stringify(bankChoice)}),/שורת מקור 2.*USD/);

 const conflict=foreign.replace('Balance (USD)','Balance (EUR)');
 assert.equal(inspectIntake([inspectCSV(conflict)]).records[0].valid,false);
 assert.throws(()=>mapReportSource(inspectCSV(conflict),bankChoice),/המטבע.*אינו תואם/);
});

test('Mapping evidence identifies header and sample lines for sparse debit and credit columns',()=>{
 const source=inspectCSV('Bank statement\nDate,Description,Debit,Credit,Balance\n04/11/2026,Example,25,,75\n05/11/2026,Example,,30,105');
 const {headerLine,columns}=mappingOptions(source);
 assert.equal(headerLine,2);
 assert.deepEqual(columns.slice(2,4).map(({sample,sampleLine})=>[sample,sampleLine]),[['25',3],['30',4]]);
});

test('An explicit field mapping takes precedence over a successful automatic interpretation',async()=>{
 const plan={startMonth:'2026-01',opening:0,horizon:12,buffer:0,defaults:zero(),demo:false,months:{},expenses:[]};
 const bytes=Buffer.from('Date,Description,Amount,Balance\n04/11/2026,Example,-25,75\n05/11/2026,Example,-20,55');
 const signal=new AbortController().signal;
 const automatic=await inspectReportSource(plan,'sample.csv',bytes,signal);
 assert.equal(automatic.kind,'bank');
 assert.equal(automatic.bankOptions,undefined);
 const mapped=await inspectReportSource(plan,'sample.csv',bytes,signal,{manualMapping:bankChoice});
 assert.equal(mapped.kind,'bank');
 assert.equal(mapped.hash,automatic.hash);
 assert.equal(mapped.bankOptions.scope,'partial');
 assert.deepEqual(mapped.records.map(row=>row.amountCents),[-2500,-2000]);
 await assert.rejects(inspectReportSource(plan,'sample.csv',bytes,signal,{manualMapping:{...bankChoice,fields:{...bankChoice.fields,amount:'3'}}}));
});
