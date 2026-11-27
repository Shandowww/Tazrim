import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from './vendor/xlsx-mini.cjs';
import {readXlsx,inspectSheet} from './xlsx-reader.mjs';
import {inspectIntake} from './intake-reader.mjs';
import {isracardWorkbookFixture} from './isracard-xlsx-fixture.mjs';
import {zero} from '../../src/budget.js';
import {applyBillingBatch,prepareCardStatement} from '../../src/card-statement-model.js';

function inspection(options){
 const workbook=readXlsx(isracardWorkbookFixture(options),XLSX);
 return inspectSheet(workbook,workbook.SheetNames[0],XLSX);
}

test('American Express XLSX uses the printed card and billing date and reconciles signed ILS charges',async()=>{
 const source=inspection(),before=JSON.stringify(source),parsed=inspectIntake([source]);
 const {report}=parsed;
 assert.equal(parsed.kind,'card');
 assert.equal(parsed.provider,'isracard');
 assert.equal(parsed.identity,'isracard:7234');
 assert.equal(report.dueDate,'2026-10-10');
 assert.equal(report.cardName,'אמריקן אקספרס זהב');
 assert.equal(report.network,'amex');
 assert.equal(report.amount,137.25);
 assert.deepEqual(report.entries.map(row=>row.amountCents),[10025,4500,-800]);
 assert.equal(report.entries[0].originalCents,30075);
 assert.equal(report.entries[0].notes,'תשלום 1 מתוך 3');
 assert.equal(report.entries[1].originalCurrency,'USD');
 assert.equal(report.entries[1].foreignCents,1250);
 assert.equal(JSON.stringify(source),before);

 const cardId='card1',accountId='bank-demo';
 const plan={startMonth:'2026-01',opening:0,horizon:12,buffer:0,defaults:zero(),demo:false,months:{},expenses:[],
  cashPlanning:{accounts:[{id:accountId,label:'בנק לדוגמה',buffer:0}],months:{},cardAccounts:{card1:accountId},transfers:[]}};
 const statement=await prepareCardStatement(plan,report,cardId);
 const saved=applyBillingBatch(plan,[{cardId,accountId,dueDate:report.dueDate,amount:report.amount,statement,deferCategories:true}],'2026-11-10');
 assert.deepEqual(saved.details.map(row=>[row.month,row.amount]),[['2026-10',100.25],['2026-10',45],['2026-10',-8]]);
 assert.equal(saved.cardBilling.reports[0].amount,137.25);
 const repeat=await prepareCardStatement(saved,report,cardId);
 assert.ok(repeat.rows.every(row=>row.existing));
 assert.equal(plan.details,undefined);
});

test('American Express detection refuses incomplete, ambiguous and inconsistent workbooks',()=>{
 for(const edit of [
  rows=>rows.find(row=>row.line===4).cells[7]='לחיוב ב-10.11',
  rows=>rows.find(row=>row.line===3).cells[7]='₪ 136.25',
  rows=>rows.find(row=>row.line===11).cells[4]='136.25',
  rows=>rows.splice(rows.findIndex(row=>row.line===8),1),
  rows=>rows.find(row=>row.line===8).cells[5]='USD',
  rows=>rows.find(row=>row.line===8).cells[4]='100.25 USD',
  rows=>rows.find(row=>row.line===8).cellIssues=[{column:4,message:'formula'}],
  rows=>rows.find(row=>row.line===7).cells[8]='סכום חיוב',
  rows=>rows.push({cells:['04/10/2026','פעולה נוספת']}),
 ]){
  const source=inspection();
  edit(source.rows);
  assert.throws(()=>inspectIntake([source]));
 }
 const source=inspection();
 assert.throws(()=>inspectIntake([source,source]),/כרטיס ומועד חיוב אחד/);
});

test('ONE ZERO Platinum Mastercard reads only the printed card suffix in the issuer workbook',()=>{
 const cardHeader='\u202bפלטינה מסטרקארד\u202c - 4567';
 const source=inspection({cardHeader}),parsed=inspectIntake([source]);
 assert.equal(parsed.identity,'isracard:4567');
 assert.equal(parsed.report.cardName,'פלטינה מסטרקארד');
 assert.equal(parsed.report.network,'mastercard');
 assert.equal(parsed.report.dueDate,'2026-10-10');
 assert.equal(parsed.report.amount,137.25);
 assert.deepEqual(parsed.report.entries.map(row=>row.amountCents),[10025,4500,-800]);

 const duplicate=inspection({cardHeader});
 duplicate.rows.find(row=>row.line===4).cells[0]='פלטינה מסטרקארד - 1234';
 assert.throws(()=>inspectIntake([duplicate]),/ארבע ספרות של כרטיס אחד/);
 assert.throws(()=>inspectIntake([inspection({cardHeader:'מספר חשבון - 4567'})]),/ארבע ספרות של כרטיס אחד/);
});
