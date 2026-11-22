import test from 'node:test';
import assert from 'node:assert/strict';
import {readReportPDF} from '../tools/bank-csv/pdf-reader.mjs';
import {calTextFixture as fixture,calFutureTextFixture,calPDFFixture,item,glyphs} from '../tools/bank-csv/cal-pdf-fixture.mjs';
import {extractStatementNotices,pdfNoticePages} from '../tools/bank-csv/statement-notices.mjs';
import {readPDFPages} from '../tools/bank-csv/pdf-reader.mjs';
import {inspectCalPDF} from '../tools/bank-csv/cal-pdf.mjs';
test('Cal monthly PDF reconciles every page, suffix, billed installments and signed refunds with RTL glyphs',()=>{const p=fixture(),before=structuredClone(p),r=inspectCalPDF(p);assert.equal(r.amount,50);assert.equal(r.count,2);assert.equal(r.last4,'1234');assert.equal(r.dueDate,'2026-10-15');assert.equal(r.entries[0].date,'2026-09-01');assert.equal(r.entries[0].merchant,'עסק לדוגמה');assert.equal(r.entries[0].amountCents,10000);assert.equal(r.entries[0].originalCents,100000);assert.equal(r.entries[1].amountCents,-5000);assert.deepEqual(p,before);});
test('Foreign purchases retain original currency but only reconciled ILS becomes a charge',()=>{const p=fixture();p[0].items.find(i=>i.str==='₪ 1,000.00').str='EU 25.00';const r=inspectCalPDF(p);assert.equal(r.entries[0].originalCurrency,'EUR');assert.equal(r.entries[0].foreignCents,2500);assert.equal(r.entries[0].originalCents,10000);assert.equal(r.amount,50);});
test('Cal PDF refuses missing/reordered pages, mismatched suffixes, totals, extra charge/date rows and unknown geometry',()=>{const changes=[p=>p.pop(),p=>p.reverse(),p=>p[1].items.push(item('המסתיים ב-9999',300,790,180)),p=>p[1].items.find(i=>i.str==='₪ 50.00'&&i.transform[5]<740).str='₪ 51.00',p=>p[0].items.push(item('₪ 4.00',145,300,30)),p=>p[0].items.push(item('לא תאריך',510,300,28)),p=>p[0].width=600,p=>p[0].items.find(i=>i.str==='₪ 100.00').str='EU 100.00',p=>p[0].items.find(i=>i.str==='₪ 100.00').transform[4]=120];for(const change of changes){const p=fixture();change(p);assert.throws(()=>inspectCalPDF(p),/אין קליטה חלקית/);}});
test('Unrelated PDF remains available to existing bank/Isracard readers',()=>{const p=fixture();for(const page of p)page.items=page.items.filter(i=>!i.str.includes('cal-online'));assert.equal(inspectCalPDF(p),null);});

test('Actual synthetic Cal PDF bytes pass the shared reader with a card routing identity',async()=>{const result=await readReportPDF(calPDFFixture());assert.equal(result.intake.kind,'card');assert.equal(result.intake.identity,'cal:1234');assert.equal(result.intake.report.amount,50);assert.equal(result.intake.report.count,2);});

test('Cal PDF with a future-charge appendix imports only the complete reconciled monthly bill',async()=>{
 const bytes=calPDFFixture(calFutureTextFixture());
 const {intake}=await readReportPDF(bytes.slice());
 assert.equal(intake.identity,'cal:1234');
 assert.equal(intake.report.dueDate,'2026-10-15');
 assert.equal(intake.report.amount,100);
 assert.deepEqual(intake.report.entries.map(entry=>[entry.page,entry.amountCents]),[[1,10000]]);
 assert.equal(extractStatementNotices(pdfNoticePages(await readPDFPages(bytes))).notices.length,2);
});

test('Cal PDF rejects ambiguous appendix rows, bills marked due now, and monthly data after totals',()=>{
 const changes=[
  pages=>{pages[1].items.find(entry=>entry.str==='פירוט עסקות לחיוב עתידי').str='פירוט עסקות';},
  pages=>{pages[1].items.find(entry=>entry.str==='ריביות אשראי לכרטיס').str='סיכום אחר';},
  pages=>{pages[1].items=pages[1].items.filter(entry=>entry.transform[4]<185||entry.transform[4]>216||entry.transform[5]!==718);},
  pages=>{const billing=pages[1].items.filter(entry=>entry.transform[4]>=185&&entry.transform[4]<216&&entry.transform[5]===718);pages[1].items=pages[1].items.filter(entry=>!billing.includes(entry)).concat(glyphs('15/10/26',216,718));},
  pages=>{pages[1].items.push(...glyphs('12/10/2026',538,645),item('₪ 100.00',145,645,36));},
  pages=>{pages[1].items.push(item('₪ 100.00',145,709,36));},
  pages=>{pages[0].items.push(...glyphs('12/10/2026',538,465));},
  pages=>{pages[0].items.find(entry=>entry.str==='₪ 100.00'&&entry.transform[5]===485).str='₪ 99.00';},
  pages=>{pages[1].items.find(entry=>entry.str.includes('הודעה לכרטיס')).str='הודעה לכרטיס המסתיים ב-9999';},
 ];
 for(const change of changes){const pages=calFutureTextFixture();change(pages);assert.throws(()=>inspectCalPDF(pages),/אין קליטה חלקית/);}
});

test('Cal PDF keeps a slightly overhanging Hebrew glyph in its note instead of dropping the transaction',async()=>{
 const pages=fixture();
 pages[0].items.push(item('ב',281.7,494,3.2),item('א',278.5,494,3.2));
 const {intake}=await readReportPDF(calPDFFixture(structuredClone(pages)));
 assert.equal(intake.report.entries[0].notes,'תשלום 1 מ-10 בא');
 assert.equal(intake.report.amount,50);
 const ambiguous=structuredClone(pages);ambiguous[0].items.push(item('כן',260,494,9));
 assert.throws(()=>inspectCalPDF(ambiguous),/אין קליטה חלקית/);
 const detached=structuredClone(pages);detached[0].items.find(entry=>entry.str==='ב').transform[4]+=1;
 assert.throws(()=>inspectCalPDF(detached),/אין קליטה חלקית/);
});

test('Cal notice scan preserves two page-two bullets and excludes ads and financial table content',async()=>{const notices=extractStatementNotices(pdfNoticePages(await readPDFPages(calPDFFixture()))).notices;assert.equal(notices.length,2);assert.deepEqual(notices.map(n=>n.category),['promotion','limit']);assert.ok(notices.every(n=>n.issuer==='cal'&&n.page===2&&n.needsReview));assert.match(notices[0].text,/יתרת ההטבה/);assert.match(notices[1].text,/מסגרת הכרטיס/);assert.ok(!notices.some(n=>/עסק לדוגמה|50.00/.test(n.text)));});

test('Latin merchant words and their numeric identifiers keep their visual order',()=>{const p=fixture(),page=p[0];page.items=page.items.filter(i=>!(i.transform[5]===500&&i.transform[4]>=420&&i.transform[4]<500));page.items.push(...glyphs('SHOP EXAMPLE 42',498,500));assert.equal(inspectCalPDF(p).entries[0].merchant,'SHOP EXAMPLE 42');});

test('Actual Cal PDF message area classifies limit, rate, points and club notices without reading transaction rows as notices',async()=>{
 const pages=fixture();pages[1].items=pages[1].items.filter(row=>!row.str.startsWith('•'))
 const messages=['• מסגרת האשראי שלך הוגדלה לסך 30000 ₪.','• הריבית על האשראי תעודכן החל מתאריך 01.01.2027.','• החודש צברת 120 נקודות למימוש בהמשך.','• חברי מועדון זכאים להטבות ולקופון אישי.']
 pages[1].items.push(...messages.map((text,index)=>item(text,160,540-index*25,360)))
 assert.deepEqual(extractStatementNotices(pdfNoticePages(pages)).notices.map(n=>n.category),['limit','interest','points','club'])
 const {pdfFixture}=await import('../tools/bank-csv/pdf-fixture.mjs')
 for(const page of pages)for(const row of page.items){row.transform[0]=row.width*2/row.str.length;if(/[א-ת]/.test(row.str))row.str=row.str.replace(/\d+(?:[./]\d+)*/g,value=>[...value].reverse().join(''))}
 const bytes=pdfFixture(pages),read=await readPDFPages(bytes.slice()),notices=extractStatementNotices(pdfNoticePages(read)).notices
 assert.deepEqual(notices.map(n=>n.category),['limit','interest','points','club']);assert.ok(notices.every(n=>n.page===2&&n.issuer==='cal'))
 const report=await readReportPDF(bytes);assert.equal(report.intake.report.amount,50);assert.equal(report.intake.report.count,2)
})
