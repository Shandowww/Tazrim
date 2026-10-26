import test from 'node:test';import assert from 'node:assert/strict';
import {inspectHapoalimPDF,readReportPDF} from './pdf-reader.mjs';
import {inspectIsracardPDF} from './isracard-pdf.mjs';
import {inspectIntake} from './intake-reader.mjs';
import {pdfFixture} from './pdf-fixture.mjs';
// Entirely synthetic, including dates, balances, merchants and document chrome.
function fixture({multi=false}={}){
 const item=(str,end,y)=>({str,transform:[8,0,0,8,end-str.length*4,y],width:str.length*4,height:8});
 const data=[['20/06/2026','חיוב ישראכרט','100.00','', '1100.00'],['15/06/2026','ביטול חיוב','-50.00','','1200.00'],['15/06/2026','חיוב לדוגמה','50.00','','1150.00'],['01/06/2026','זיכוי לדוגמה','','200.00','1200.00']];
 const groups=multi?[data.slice(0,2),data.slice(2)]:[data];
 return groups.map((rows,index)=>({width:595,height:842,items:[item('חשבון',143,738),item('123456',143,724),item('בנק',35,738),item('12',35,724),item('תנועות בחשבון',576,666),item('01/06/2026',576,631),item('30/06/2026',504,631),...['תאריך','פעולה','חובה','זכות','יתרה בש"ח'].map((s,i)=>item(s,[576,494,271,209,146][i],608)),...rows.flatMap((r,j)=>r.flatMap((s,i)=>s?[item(s,[576,494,271,209,146][i],585-j*25)]:[])),item(String(index+1),563,20),item('מתוך:',555,20),item(String(groups.length),533,20)]}));
}
test('Hapoalim PDF reconciles refunds and same-day order, excludes metadata and emits chronological bank intake',()=>{
 for(const multi of [false,true]){const pages=fixture({multi}),before=JSON.stringify(pages),inspection=inspectHapoalimPDF(pages),intake=inspectIntake([inspection]);assert.equal(JSON.stringify(pages),before);assert.equal(intake.kind,'bank');assert.equal(intake.provider,'hapoalim');assert.equal(intake.identity,'');assert.equal(intake.records.length,4);assert.ok(intake.records.every(r=>r.valid));assert.deepEqual(intake.records.map(r=>r.amountCents),[20000,-5000,5000,-10000]);assert.deepEqual(intake.records.map(r=>r.pdfOrder),[2,3,4,5]);assert.equal(intake.records.at(-1).balanceCents,110000);assert.equal(inspection.pdfReconciliation.openingCents,100000);assert.equal(inspection.pdfReconciliation.reversals,1);assert.equal(intake.from,'2026-06-01');assert.equal(intake.to,'2026-06-30');}
});
test('Hapoalim original-shaped PDF binary dispatches before merchant Isracard mention',async()=>{globalThis.DOMMatrix??=class{};const result=await readReportPDF(pdfFixture(fixture()));assert.equal(result.intake,undefined);assert.equal(inspectIntake([result.inspection]).provider,'hapoalim');});
test('Hapoalim rejects changed amounts, balances, missing rows/pages, duplicate or crossing cells and unknown layouts',()=>{
 for(const edit of [
 p=>p[0].items.find(i=>i.str==='100.00').str='100.01',
 p=>p[0].items.find(i=>i.str==='1100.00').str='1100.01',
 p=>p[0].items=p[0].items.filter(i=>i.transform[5]!==560),
 p=>p[0].items.find(i=>i.str==='12').str='10',
 p=>p[0].items.find(i=>i.str==='20/06/2026').str='31/02/2026',
 p=>p[0].items.find(i=>i.str==='20/06/2026').str='20/07/2026',
 p=>p[0].items.push({...p[0].items.find(i=>i.str==='100.00')}),
 p=>p[0].items.find(i=>i.str==='100.00').transform[4]-=20,
 p=>p[0].items.find(i=>i.str==='פעולה').str='תיאור אחר',
 p=>p[0].items.find(i=>i.str==='100.00').transform[1]=1,
 p=>p[0].items.find(i=>i.str==='מתוך:').str='אחר',
 ]){const p=fixture();edit(p);assert.throws(()=>inspectHapoalimPDF(p));}
 assert.throws(()=>inspectHapoalimPDF(fixture({multi:true}).slice(0,1)));
 assert.throws(()=>inspectHapoalimPDF(fixture({multi:true}).reverse()));
});

test('An unsupported bank PDF mentioning Isracard does not claim it is a card bill',async()=>{const p=fixture();p[0].items.find(i=>i.str==='פעולה').str='מבנה אחר';assert.equal(inspectIsracardPDF(p),null);globalThis.DOMMatrix??=class{};await assert.rejects(()=>readReportPDF(pdfFixture(p)),/מבנה דוח PDF לא נתמך/);});
