import test from 'node:test';import assert from 'node:assert/strict';
import {inspectIsracardPDF} from './isracard-pdf.mjs';import {readReportPDF} from './pdf-reader.mjs';import {isracardTextFixture,isracardDomesticFixture} from './isracard-fixture.mjs';import {pdfFixture,pdfTextFixture} from './pdf-fixture.mjs';
test('Isracard PDF uses billed ILS and the printed cycle total, preserving foreign amounts, refunds and wrapped merchants',()=>{
 const pages=isracardTextFixture(),before=JSON.stringify(pages),report=inspectIsracardPDF(pages);assert.equal(report.issuer,'isracard');assert.equal(report.dueDate,'2026-10-15');assert.equal(report.last4,'1111');assert.equal(report.amount,56);assert.equal(report.count,3);assert.deepEqual(report.entries.map(row=>row.amountCents),[4000,2000,-400]);assert.deepEqual(report.entries.map(row=>row.foreignCents),[1000,500,-100]);assert.deepEqual(report.entries.map(row=>row.originalCurrency),['EUR','USD','EUR']);assert.equal(report.entries[0].merchant,'MERCHANT EXAMPLE CITY');assert.equal(report.entries[0].originalCents,4000);assert.doesNotMatch(report.entries[0].merchant,/עמלה|הנחה/);assert.equal(JSON.stringify(pages),before);assert.equal(inspectIsracardPDF(pdfTextFixture()),null);
});
test('Partial, ambiguous, changed or foreign-amount substitutions fail closed before intake',()=>{
 for(const edit of [p=>p[0].items.find(i=>i.str==='56.00').str='56.01',p=>p[0].items=p[0].items.filter(i=>i.str!=='20.00'),p=>p[0].items.find(i=>i.str==='16/09/26').str='99/09/26',p=>p[0].items.push({...p[0].items.find(i=>i.str==='40.00'),transform:[8,0,0,8,181-p[0].items.find(i=>i.str==='40.00').width,540]}),p=>p[0].items.find(i=>i.str==='40.00').str='10.00']){const p=isracardTextFixture();edit(p);assert.throws(()=>inspectIsracardPDF(p));}
 const duplicate=isracardTextFixture();duplicate[0].items.push({str:'כרטיס שמסתיים בספרות: 2222',transform:[8,0,0,8,300,650],width:220,height:8});assert.throws(()=>inspectIsracardPDF(duplicate),/כרטיס/);
});
test('Isracard actual synthetic PDF binary dispatches to card intake; One Zero still dispatches to bank inspection',async()=>{
 globalThis.DOMMatrix??=class{};const result=await readReportPDF(pdfFixture(isracardTextFixture()));assert.equal(result.intake.kind,'card');assert.equal(result.intake.provider,'isracard');assert.equal(result.intake.identity,'isracard:1111');assert.equal(result.intake.report.amount,56);assert.equal((await readReportPDF(pdfFixture())).inspection.pdfReconciliation.verified,true);
});

test('A bank statement mentioning Isracard remains a bank document when its verified table headers match',async()=>{globalThis.DOMMatrix??=class{};const pages=pdfTextFixture();pages[0].items.find(i=>i.str==='עמלה לדוגמה').str='חיוב ישראכרט';const result=await readReportPDF(pdfFixture(pages));assert.equal(result.intake,undefined);assert.equal(result.inspection.pdfReconciliation.verified,true);});

test('Domestic and overseas sections reconcile separately, retaining billed installments, original amounts and refunds',()=>{
 const pages=isracardDomesticFixture(),before=JSON.stringify(pages),r=inspectIsracardPDF(pages);
 assert.equal(r.amount,496);assert.equal(r.count,5);assert.equal(r.entries[3].amountCents,45000);assert.equal(r.entries[3].originalCents,270000);assert.equal(r.entries[3].merchant,'חנות לדוגמה');assert.equal(r.entries[3].notes,'תשלום 3 מתוך 6');assert.equal(r.entries[4].amountCents,-1000);assert.equal(r.entries[3].originalCurrency,undefined);assert.equal(JSON.stringify(pages),before);
});
test('Domestic-only reports and explicitly informational fee pages do not depend on a bank or card brand',async()=>{
 globalThis.DOMMatrix??=class{};
 for(const information of ['terms','fees']){const result=await readReportPDF(pdfFixture(isracardDomesticFixture({mixed:false,information})));assert.equal(result.intake.provider,'isracard');assert.equal(result.intake.report.amount,440);assert.equal(result.intake.report.count,2);}
});
test('Conflicting or absent section subtotals fail even when the combined amount is unchanged',()=>{
 for(const edit of [
  p=>p[0].items.find(i=>i.str==='440.00').str='439.00',
  p=>{p[0].items.find(i=>i.str==='56.00').str='57.00';p[0].items.find(i=>i.str==='440.00').str='439.00';},
  p=>p[0].items=p[0].items.filter(i=>i.transform[5]!==320),
  p=>p[0].items.push({...p[0].items.find(i=>i.str==='440.00')}),
  p=>p[0].items=p[0].items.filter(i=>i.str!=='2,700.00'),
  p=>p[0].items=p[0].items.filter(i=>i.str!=='450.00')
 ]){const p=isracardDomesticFixture();edit(p);assert.throws(()=>inspectIsracardPDF(p));}
});
test('Missing, reordered and unrecognized pages or an additional billing table cannot silently become an informational page',()=>{
 const full=isracardDomesticFixture();assert.throws(()=>inspectIsracardPDF(full.slice(0,1)),/עמודים/);assert.throws(()=>inspectIsracardPDF([...full].reverse()),/עמודים/);
 for(const marker of ['מידע כללי','מסגרת הכרטיס ותנאי האשראי תאריך שם בית עסק','דיווח עמלות חצי שנתי לתשלום']){const p=isracardDomesticFixture();p[1].items[0].str=marker;assert.throws(()=>inspectIsracardPDF(p),/טבלת/);}
 const dated=isracardDomesticFixture();dated[1].items.push({str:'01/10/26',transform:[8,0,0,8,490,650],width:35,height:8});assert.throws(()=>inspectIsracardPDF(dated),/טבלת/);
});
test('The printed debit date may follow the cycle caption, but must agree across every section',()=>{
 const shifted=isracardDomesticFixture();for(const i of shifted[0].items)if(i.str==='15/10/26'&&i.transform[5]<500)i.str='16/10/26';assert.equal(inspectIsracardPDF(shifted).dueDate,'2026-10-16');
 for(const date of ['14/10/26','23/10/26','15/11/26']){const p=structuredClone(shifted);for(const i of p[0].items)if(i.str==='16/10/26')i.str=date;assert.throws(()=>inspectIsracardPDF(p),/מועדי/);}
 shifted[0].items.find(i=>i.str==='16/10/26').str='15/10/26';assert.throws(()=>inspectIsracardPDF(shifted),/מועדי/);
});
