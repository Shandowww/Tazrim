import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from './vendor/xlsx-full.cjs';
import {readExcel,inspectSheet,checkXlsContainer} from './xlsx-reader.mjs';
import {normalizeRows} from './parser.mjs';
import {xlsFixture} from './xls-fixture.mjs';
test('Real BIFF8 XLS preserves Hebrew, numeric signs/cents and leading-zero references',()=>{
 const bytes=xlsFixture();assert.deepEqual(Array.from(bytes.slice(0,8)),[208,207,17,224,161,177,26,225]);
 const w=readExcel(bytes,XLSX,'xls'),inspection=inspectSheet(w,'תנועות',XLSX),r=normalizeRows(inspection);
 assert.equal(inspection.format,'xls');assert.equal(r.summary.invalid,0);assert.deepEqual(r.records.map(r=>r.amountCents),[-100025,200050]);assert.equal(r.records[0].balanceCents,-10050);assert.equal(r.records[0].reference,'000123');assert.equal(r.records[0].beneficiary,'מוטב לדוגמה');
});
test('HTML-based XLS is parsed as literal text without converting European separators incorrectly',()=>{
 const html='<html><table><tr><th>תאריך</th><th>הפעולה</th><th>סכום</th><th>יתרה</th></tr><tr><td>12/03/2026</td><td>החזר הלוואה</td><td>-1.000,25</td><td>9,000.75</td></tr><tr><td>13/03/2026</td><td>משכורת</td><td>2,000.50</td><td>11.001,25</td></tr></table></html>';
 const w=readExcel(new TextEncoder().encode(html),XLSX,'xls'),inspection=inspectSheet(w,w.SheetNames[0],XLSX),r=normalizeRows(inspection);
 assert.equal(r.summary.invalid,0);assert.deepEqual(r.records.map(r=>r.amountCents),[-100025,200050]);assert.deepEqual(r.records.map(r=>r.balanceCents),[900075,1100125]);
});
test('XLS rejects truncated/wrong/encrypted/macro/script files and mapped formulas never enter totals',()=>{
 assert.throws(()=>checkXlsContainer(new TextEncoder().encode('not an excel file'),XLSX));assert.throws(()=>readExcel(xlsFixture().slice(0,600),XLSX,'xls'));
 assert.throws(()=>readExcel(new TextEncoder().encode('<table></table><script>alert(1)</script>'),XLSX,'xls'));
 const cfb=XLSX.CFB.read(xlsFixture(),{type:'array'});XLSX.CFB.utils.cfb_add(cfb,'EncryptionInfo',new Uint8Array([1,2,3]));assert.throws(()=>readExcel(new Uint8Array(XLSX.CFB.write(cfb,{type:'buffer'})),XLSX,'xls'),/סיסמה/);
 const macro=XLSX.CFB.read(xlsFixture(),{type:'array'});XLSX.CFB.utils.cfb_add(macro,'VBA/Module1',new Uint8Array([1,2,3]));assert.throws(()=>readExcel(new Uint8Array(XLSX.CFB.write(macro,{type:'buffer'})),XLSX,'xls'),/מאקרו/);
 const w=readExcel(xlsFixture(),XLSX,'xls');w.Sheets['תנועות'].D2.f='1+2';assert.equal(normalizeRows(inspectSheet(w,'תנועות',XLSX)).records[0].valid,false);
});

test('One Zero screenshot schema maps booking/value dates and positive amounts with explicit debit/credit',()=>{
 const w=XLSX.utils.book_new(),s=XLSX.utils.aoa_to_sheet([
 ['תאריך תנועה','תאריך ערך','סוג פעולה','תיאור','סכום פעולה','מטבע','חיוב/זיכוי','יתרה','אסמכתא'],
 ['01/10/2026','01/10/2026','העברות','תיאור לדוגמה',0.24,'ILS','זיכוי',2226.14,'25-23516040'],
 ['02/10/2026','03/10/2026','העברות','העברה לחיסכון',1000.25,'ILS','חיוב',1225.89,'25-23516041']]);
 XLSX.utils.book_append_sheet(w,s,'2026-07-13_2026-10-13_ALL');
 const bytes=new Uint8Array(XLSX.write(w,{type:'buffer',bookType:'biff8'})),read=readExcel(bytes,XLSX,'xls'),r=normalizeRows(inspectSheet(read,read.SheetNames[0],XLSX));
 assert.equal(r.summary.invalid,0);assert.deepEqual(r.records.map(r=>r.amountCents),[24,-100025]);assert.equal(r.records[1].date,'2026-10-02');assert.equal(r.records[1].valueDate,'2026-10-03');assert.equal(r.records[0].balanceCents,222614);assert.equal(r.records[0].reference,'25-23516040');
});
test('One Zero full statement headers separate debit/credit and retain value date without inventing a reference',()=>{
 const w=XLSX.utils.book_new(),s=XLSX.utils.aoa_to_sheet([['תאריך תנועה','תאריך ערך','פרטי הפעולה','חיובים','זיכויים','יתרה'],['01/01/2026','01/01/2026','פעולה לדוגמה','0 ש״ח','2.43 ש״ח','797.29 ש״ח'],['15/01/2026','15/01/2026','פעולה אחרת','90.4 ש״ח','0 ש״ח','706.89 ש״ח']]);XLSX.utils.book_append_sheet(w,s,'תנועות');
 const read=readExcel(new Uint8Array(XLSX.write(w,{type:'buffer',bookType:'biff8'})),XLSX,'xls'),r=normalizeRows(inspectSheet(read,'תנועות',XLSX));assert.equal(r.summary.invalid,0);assert.deepEqual(r.records.map(r=>r.amountCents),[243,-9040]);assert.equal(r.records[0].reference,'');assert.equal(r.records[1].balanceCents,70689);
});
