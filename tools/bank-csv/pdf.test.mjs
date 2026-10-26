import test from 'node:test';import assert from 'node:assert/strict';
import {inspectOneZeroPDF,readOneZeroPDF} from './pdf-reader.mjs';import {normalizeRows} from './parser.mjs';import {pdfTextFixture,pdfFixture} from './pdf-fixture.mjs';
test('PDF table reconciliation preserves signs, cancellation, exact cents and complete stated period',()=>{
 const p=pdfTextFixture(),before=JSON.stringify(p),i=inspectOneZeroPDF(p),r=normalizeRows(i);assert.equal(r.summary.invalid,0);assert.deepEqual(r.records.map(r=>r.amountCents),[-1000,1000,120025]);assert.equal(r.records[1].reversal,true);assert.equal(i.pdfReconciliation.from,'2026-01-01');assert.equal(i.pdfReconciliation.to,'2026-01-31');assert.equal(i.pdfReconciliation.closingCents,130025);assert.equal(JSON.stringify(p),before);
});
test('PDF multi-page table repeats headers without losing rows and wrapped descriptions remain in their row',()=>{
 const p=pdfTextFixture({pages:2}),i=inspectOneZeroPDF(p);assert.equal(i.pdfReconciliation.count,3);assert.equal(i.rows.at(-1).page,2);
 const one=pdfTextFixture();one[0].items.push({str:'פרטים נוספים',dir:'rtl',transform:[10,0,0,10,320,500],width:60,height:10});assert.match(inspectOneZeroPDF(one).rows[1].cells[2],/פרטים נוספים/);
});
test('PDF mismatched summaries, missing/changed rows, corrupt dates, unsupported or scanned layouts cannot enter intake',()=>{
 const summary=pdfTextFixture();summary[0].items.find(i=>i.str==='1200.25').str='1200.26';assert.throws(()=>inspectOneZeroPDF(summary),/תואמים/);
 const row=pdfTextFixture();row[0].items.find(i=>i.str==='90.00').str='90.01';assert.throws(()=>inspectOneZeroPDF(row),/יתרת שורה/);
 const date=pdfTextFixture();date[0].items.find(i=>i.str==='03/01/2026'&&i.transform[4]>459).str='99/01/2026';assert.throws(()=>inspectOneZeroPDF(date),/תאריך/);
 assert.throws(()=>inspectOneZeroPDF([{items:[],width:595,height:842}]),/סרוק/);assert.throws(()=>inspectOneZeroPDF(Array(21).fill(pdfTextFixture()[0])),/20/);
});
test('PDF reading uses the same local library on an actual synthetic PDF binary and rejects wrong files',async()=>{
 globalThis.DOMMatrix??=class{};const i=await readOneZeroPDF(pdfFixture());assert.equal(i.pdfReconciliation.count,3);assert.equal(normalizeRows(i).records[1].amountCents,1000);await assert.rejects(()=>readOneZeroPDF(new TextEncoder().encode('not a PDF')),/תקין/);await assert.rejects(()=>readOneZeroPDF(new Uint8Array(5*1024*1024+1)),/5MB/);
});
test('Headerless continuation pages exclude address/header and closing footer text while keeping every dated transaction',()=>{
 const p=pdfTextFixture({pages:2});p[1].items=p[1].items.filter(i=>i.transform[5]!==520);
 p[1].items.push({str:'פרטי חשבון לדוגמה — טקסט רחב מחוץ לטבלה',dir:'rtl',transform:[10,0,0,10,370,790],width:160,height:10},{str:'חתימת הבנק — מחוץ לטבלה',dir:'rtl',transform:[10,0,0,10,410,420],width:120,height:10});
 const i=inspectOneZeroPDF(p);assert.equal(i.pdfReconciliation.count,3);assert.equal(i.pdfReconciliation.verified,true);assert.equal(i.rows[2].page,2);assert.equal(i.rows[2].cells[2],'ביטול עמלה לדוגמה');assert.equal(normalizeRows(i).records[1].amountCents,1000);assert.doesNotMatch(i.rows.map(r=>r.cells.join(' ')).join(' '),/מחוץ לטבלה/);
});
test('One-row headerless continuation remains readable, but a genuine in-table column crossing is still rejected',()=>{
 const p=pdfTextFixture({pages:2}),last=p[1].items.filter(i=>i.transform[5]===470);p[0].items.push(...p[1].items.filter(i=>i.transform[5]===495).map(i=>({...i,transform:[...i.transform.slice(0,5),470]})));p[1].items=last;
 const i=inspectOneZeroPDF(p);assert.equal(i.pdfReconciliation.count,3);assert.equal(i.rows.at(-1).page,2);
 const bad=pdfTextFixture({pages:2});bad[1].items=bad[1].items.filter(i=>i.transform[5]!==520);bad[1].items.push({str:'טקסט שחוצה באמת את העמודות',dir:'rtl',transform:[10,0,0,10,310,495],width:140,height:10});assert.throws(()=>inspectOneZeroPDF(bad),/חוצה עמודות/);
});
