import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from './vendor/xlsx-mini.cjs';
import {checkXlsxContainer,readXlsx,listSheets,inspectSheet} from './xlsx-reader.mjs';
import {normalizeRows} from './parser.mjs';
import {inspectIntake} from './intake-reader.mjs';
import {makeFixture,zipFixture} from './xlsx-fixture.mjs';
test('Actual compressed XLSX preserves Hebrew, sheet selection, physical row numbers, typed dates and cents',()=>{
 const workbook=readXlsx(makeFixture(),XLSX);assert.equal(listSheets(workbook).length,2);assert.equal(listSheets(workbook)[1].empty,true);
 const inspection=inspectSheet(workbook,'תנועות',XLSX),result=normalizeRows(inspection);
 assert.equal(result.headerLine,3);assert.equal(result.records[0].line,4);
 assert.equal(result.records[0].date,'2026-01-15');assert.equal(result.records[0].reference,'001001');
 assert.equal(result.records[0].raw[0],'15/01/2026');assert.equal(result.records[0].amountCents,1850025);
 assert.equal(result.records[1].amountCents,-10025);assert.equal(result.summary.netCents,1840000);
 assert.deepEqual(result.summary.balanceCandidate,{date:'2026-09-20',balanceCents:2840000});
 assert.equal(normalizeRows(inspection,{decimal:'comma'}).summary.netCents,1840000);
 assert.throws(()=>inspectSheet(workbook,'גיליון ריק',XLSX),/ריק/);assert.throws(()=>inspectSheet(workbook,'missing',XLSX));
});
test('Excel 1904 date system returns the same calendar dates without timezone shifts',()=>{
 const normal=inspectSheet(readXlsx(makeFixture(),XLSX),'תנועות',XLSX),mac=inspectSheet(readXlsx(makeFixture({date1904:true}),XLSX),'תנועות',XLSX);
 assert.deepEqual(normalizeRows(mac).records.map(r=>r.date),normalizeRows(normal).records.map(r=>r.date));
});
test('Hapoalim-style XLSX maps all ten columns and mixes Excel dates with Hebrew weekday text dates',()=>{
 const inspection=inspectSheet(readXlsx(makeFixture({hapoalim:true}),XLSX),'תנועות',XLSX),result=normalizeRows(inspection);
 assert.equal(inspection.mapping.description,1);assert.equal(inspection.mapping.details,2);assert.equal(inspection.mapping.balance,6);
 assert.equal(result.records[1].date,'2026-09-20');assert.equal(result.records[1].details,'פרטים לדוגמה');
 assert.equal(result.records[1].valueDate,'2026-09-20');assert.equal(result.records[1].beneficiary,'מוטב לדוגמה');assert.equal(result.records[1].purpose,'תשלום לדוגמה');assert.equal(result.records[1].reference,'001002');assert.equal(result.records[1].amountCents,-10025);assert.equal(result.summary.netCents,1840000);
});
test('Excel negative debits become reviewable reversals only with an unambiguous ILS balance trail',()=>{
 const workbook=readXlsx(makeFixture({hapoalim:true}),XLSX),sheet=workbook.Sheets['תנועות'];
 sheet.E5={t:'n',v:-100.25,w:'-100.25'};
 sheet.G5={t:'n',v:28600.5,w:'28,600.50'};
 const inspection=inspectSheet(workbook,'תנועות',XLSX);
 const inspect=rows=>inspectIntake([{...inspection,rows}]);
 const [opening,reversal]=inspection.rows.slice(-2),header=inspection.rows.slice(0,-2);
 for(const rows of [[opening,reversal],[reversal,opening]]){
  const result=inspect([...header,...rows]);assert.equal(result.kind,'bank');assert.equal(result.records.filter(row=>row.valid).length,2);
  const verified=result.records.find(row=>row.reversal);assert.equal(verified.amountCents,10025);assert.equal(verified.debitCents,-10025);
 }
 for(const cells of [reversal.cells.map((value,index)=>index===6?'28400':value),reversal.cells.map((value,index)=>index===6?'':value),reversal.cells.map((value,index)=>index===5?'1':value)]){
  const result=inspect([...header,opening,{...reversal,cells}]);assert.equal(result.records[1].valid,false);assert.equal(result.records[1].amountCents,null);
 }
 assert.equal(inspect([...header,reversal]).records[0].valid,false);
 const negativeCredit={...reversal,cells:reversal.cells.map((value,index)=>index===4?'':index===5?'-100.25':value)};
 assert.equal(inspect([...header,opening,negativeCredit]).records[1].valid,false);
 assert.equal(normalizeRows({...inspection,format:'csv'}).records[1].valid,false);
});
test('Cached formulas are visible as source evidence but not evaluated or included in financial totals',()=>{
 const inspection=inspectSheet(readXlsx(makeFixture({formula:true}),XLSX),'תנועות',XLSX),result=normalizeRows(inspection);
 assert.equal(result.summary.invalid,1);assert.equal(result.summary.count,1);assert.match(result.records[1].raw[5],/^=F4-D5/);
 assert.match(result.records[1].issues[0],/נוסחה/);assert.match(inspection.notices.join(' '),/נוסחאות/);
});
test('Hidden rows are retained, merged blanks not filled and Excel errors invalidate affected records',()=>{
 const workbook=readXlsx(makeFixture(),XLSX),sheet=workbook.Sheets['תנועות'];sheet['!rows']=[];sheet['!rows'][3]={hidden:true};sheet['!merges']=[{s:{r:0,c:0},e:{r:0,c:2}}];sheet.E4={t:'e',v:7,w:'#DIV/0!'};
 const inspection=inspectSheet(workbook,'תנועות',XLSX),result=normalizeRows(inspection);assert.equal(result.records.length,2);assert.equal(result.summary.invalid,1);assert.match(inspection.notices.join(' '),/מוסתרות/);
});
test('Numeric cells do not lose genuine fractions of a cent or foreign currency markers',()=>{
 const workbook=readXlsx(makeFixture(),XLSX),sheet=workbook.Sheets['תנועות'];sheet.E4.v=1.001;sheet.E4.w='1.00';
 assert.equal(normalizeRows(inspectSheet(workbook,'תנועות',XLSX)).records[0].valid,false);
 sheet.E4.v=10.25;sheet.E4.w='$10.25';assert.equal(normalizeRows(inspectSheet(workbook,'תנועות',XLSX)).records[0].valid,false);
});
test('Rejects wrong formats, encrypted files, macros, oversized expansion, corruption and huge sheet ranges',()=>{
 assert.throws(()=>readXlsx(new TextEncoder().encode('date,amount'),XLSX));assert.throws(()=>checkXlsxContainer(new Uint8Array([0xd0,0xcf])),/מוצפן/);
 assert.throws(()=>checkXlsxContainer(zipFixture({'[Content_Types].xml':'x','xl/workbook.xml':'x','xl/vbaProject.bin':'x'})),/מאקרו/);
 const bytes=makeFixture(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let central=0;while(view.getUint32(central,true)!==0x02014b50)central++;view.setUint32(central+24,40*1024*1024,true);view.setUint32(22,40*1024*1024,true);assert.throws(()=>checkXlsxContainer(bytes),/גדול מדי/);
 assert.throws(()=>checkXlsxContainer(makeFixture().slice(0,-5)));
 const workbook=readXlsx(makeFixture(),XLSX);workbook.Sheets['תנועות']['!ref']='A1:A30001';assert.throws(()=>inspectSheet(workbook,'תנועות',XLSX),/חורג/);
});
