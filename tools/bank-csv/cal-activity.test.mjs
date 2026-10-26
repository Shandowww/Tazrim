import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {parseCalActivity,calActivityReport} from './cal-activity.mjs';import {inspectIntake} from './intake-reader.mjs';import {readExcel,inspectSheet} from './xlsx-reader.mjs';
const require=createRequire(import.meta.url),XLSX=require('./vendor/xlsx-mini.cjs');
import {activityFixture} from './cal-activity-fixture.mjs';
test('Cal activity is recognized before generic bank mapping; cross-cycle total never becomes a monthly bill',()=>{
 const input=activityFixture(),before=JSON.stringify(input),r=inspectIntake([input]);assert.equal(r.kind,'card');assert.equal(r.provider,'cal');assert.equal(r.identity,'cal:1111');assert.equal(r.report,null);assert.equal(r.activity.entries.length,5);assert.equal(r.activity.sheetTotalCents,43000);assert.equal(r.activity.entries[3].pending,true);assert.equal(r.activity.entries[4].installment,true);assert.equal(JSON.stringify(input),before);
 assert.equal(parseCalActivity([{rows:[{cells:['תאריך','סכום','יתרה']}]}]),null);
});
test('Only a selected cycle with a matching explicit final charge and acknowledgement yields a bill',()=>{
 const {activity}=parseCalActivity([activityFixture()]);assert.throws(()=>calActivityReport(activity,'','90',true),/בחרו מועד/);assert.throws(()=>calActivityReport(activity,'2026-10-15','',true),/הזינו/);assert.throws(()=>calActivityReport(activity,'2026-10-15','430',true),/אינן תואמות/);assert.throws(()=>calActivityReport(activity,'2026-10-15','90',false),/אשרו/);
 const r=calActivityReport(activity,'2026-10-15','90',true);assert.equal(r.amount,90);assert.equal(r.count,2);assert.deepEqual(r.entries.map(r=>r.amountCents),[10000,-1000]);assert.ok(!r.entries.some(r=>/ממתינה|תשלומים/.test(r.merchant)));assert.equal(calActivityReport(activity,'2026-11-15','40',true).entries[0].notes,'סכום העסקה הוא 10 €');
});
test('A dated installment cannot be mistaken for a billed monthly payment',()=>{
 const {activity}=parseCalActivity([activityFixture()]);activity.entries[4].dueDate='2026-10-15';assert.throws(()=>calActivityReport(activity,'2026-10-15','390',true),/תשלום חודשי/);
});
test('Changed totals, incomplete rows, ambiguous headings, formulas, invalid dates and foreign billed amounts fail closed',()=>{
 for(const edit of [s=>s.rows[7].cells[2]='431',s=>s.rows.splice(3,1),s=>s.rows[2].cellIssues.push({column:2,message:'formula'}),s=>s.rows[2].cells[0]='99/99/2026',s=>s.rows[2].cells[3]='99/99/2026',s=>s.rows[2].sourceCells=['','','100 USD'],s=>s.rows[1].cells.push('סכום בש"ח'),s=>s.rows.push({cells:['unexpected']}),s=>s.rows[7].cells[3]='סיכום אחר']){const s=activityFixture();edit(s);assert.throws(()=>parseCalActivity([s]));}
 assert.throws(()=>parseCalActivity([activityFixture(),activityFixture()]),/גיליון/);
});
test('Real XLSX container with multiline headers dispatches to Cal activity and retains numeric cents',()=>{
 const source=activityFixture(),sheet=XLSX.utils.aoa_to_sheet(source.rows.map(r=>r.cells)),workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,'פעילות');const bytes=XLSX.write(workbook,{type:'array',bookType:'xlsx'}),read=readExcel(new Uint8Array(bytes),XLSX),result=inspectIntake(read.SheetNames.map(name=>inspectSheet(read,name,XLSX)));assert.equal(result.provider,'cal');assert.equal(result.report,null);assert.equal(calActivityReport(result.activity,'2026-10-15','90',true).amount,90);
});
