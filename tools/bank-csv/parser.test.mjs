import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeCSV,parseCSV,inspectCSV,normalizeRows,parseMoney,parseDate,guessMapping,LIMITS} from './parser.mjs';
import {createLabServer} from './serve.mjs';
test('Quoted CSV supports BOM, embedded delimiters/newlines, escaped quotes and physical source lines',()=>{
 const rows=parseCSV('\ufeffDate,Description,Amount\r\n01/10/2026,"a, b\n""quoted""",-10.25\r\n02/10/2026,test,4');
 assert.equal(rows[1].cells[1],'a, b\n"quoted"');assert.equal(rows[2].line,4);
 assert.throws(()=>parseCSV('date,amount\n"unterminated,1'));assert.throws(()=>parseCSV('a,b\n"x"oops,1'));
});
test('Detects bank preamble, semicolon/tab separators and Hebrew/English headers',()=>{
 for(const delimiter of [';','\t',',']){
  const data=['Account export',['תאריך','תיאור','חובה','זכות','יתרה'].join(delimiter),['12/10/2026','משכורת','','18500','25000'].join(delimiter)].join('\n');
  const inspected=inspectCSV(data),result=normalizeRows(inspected);
  assert.equal(inspected.delimiter,delimiter);assert.equal(inspected.headerIndex,1);assert.equal(result.records[0].amountCents,1850000);assert.equal(result.skippedPreamble,1);
 }
 assert.equal(guessMapping(['Booking Date','Description','Amount']).amount,2);
 assert.equal(guessMapping(['Date','Date','Amount']).date,-1);
});
test('Sample preserves invalid rows, duplicate candidates and foreign currency without hiding them in totals',async()=>{
 const result=normalizeRows(inspectCSV(await readFile(new URL('sample.csv',import.meta.url),'utf8')));
 assert.equal(result.records.length,11);assert.equal(result.summary.invalid,2);assert.equal(result.summary.count,8);
 assert.equal(result.summary.creditCents,3725025);assert.equal(result.summary.debitCents,1410050);
 assert.equal(result.records.filter(r=>r.warnings.some(w=>w.includes('כפילות'))).length,1);
 assert.equal(result.summary.months.length,2);assert.deepEqual(result.summary.balanceCandidate,{date:'2026-09-09',balanceCents:3594975});
 assert.equal(result.records[8].currency,'USD');assert.equal(result.records[9].valid,false);
});
test('Exact cents supports grouping, comma decimals, parentheses, trailing minus and overdrafts',()=>{
 for(const [input,result]of [['₪ 1,234.56',123456],['(1,234.50)',-123450],['123.45-',-12345],['0',0],['',null],['—',null],['-42',-4200]])assert.equal(parseMoney(input),result);
 assert.equal(parseMoney('1.234,56','comma'),123456);
 for(const input of ['1,23','1.001','1.2.3','1e4','Infinity','123garbage','--1','100000001','1,234,56'])assert.throws(()=>parseMoney(input,'dot'));
});
test('Dates reject rollover and distinguish day-first/month-first and ISO',()=>{
 assert.equal(parseDate('12/10/26'),'2026-10-12');assert.equal(parseDate('12/10/26','month-first'),'2026-12-10');assert.equal(parseDate('2026-10-12'),'2026-10-12');assert.equal(parseDate('29.02.2024'),'2024-02-29');
 for(const date of ['31/02/2026','29/02/2025','12/13/2026','unknown','2026-10-12T00:00'])assert.throws(()=>parseDate(date));
});
test('Hapoalim screenshot headers and Hebrew weekday prefix preserve action and separate details',()=>{
 const input='תאריך,הפעולה,פרטים,אסמכתא,חובה,זכות,יתרה בש״ח\nב׳ 12/10/26,החזר הלוואה,פירוט לבדיקה,000123,100.25,,900.75\nהודעת הבנק על יתרות משוערות,,,,,,';
 const inspected=inspectCSV(input),result=normalizeRows(inspected),r=result.records[0];
 assert.equal(inspected.mapping.description,1);assert.equal(inspected.mapping.details,2);assert.equal(inspected.mapping.balance,6);
 assert.equal(r.date,'2026-10-12');assert.equal(r.description,'החזר הלוואה');assert.equal(r.details,'פירוט לבדיקה');assert.equal(r.reference,'000123');assert.equal(r.amountCents,-10025);assert.equal(r.balanceCents,90075);
 assert.equal(result.summary.invalid,1);assert.equal(result.summary.count,1);
 assert.equal(normalizeRows(inspected,{period:{from:'2026-01',to:'2026-09'}}).summary.outsidePeriod,1);
 assert.equal(parseDate("ב'12/10/26"),'2026-10-12');
 assert.equal(guessMapping(['תאריך','פרטים','סכום']).description,1);
});
test('Full ten-column Hapoalim export preserves value date and beneficiaries, using transaction date for period and summaries',()=>{
 const input="תאריך,הפעולה,פרטים,אסמכתא,חובה,זכות,יתרה בש''ח,תאריך ערך,לטובת,עבור\n29/01/2026,העברה,פרטי בדיקה,000123,100.25,,900.75,28/01/2026,מוטב לדוגמה,תשלום לדוגמה\n12/10/2026,זיכוי,,000124,,200,1100.75,13/10/2026,,\n12/10/2026,זיכוי,,000125,,10,1110.75,31/02/2026,,";
 const inspection=inspectCSV(input),result=normalizeRows(inspection,{period:{from:'2026-01-29',to:'2026-10-12'}}),r=result.records[0];
 assert.equal(inspection.mapping.balance,6);assert.equal(inspection.mapping.valueDate,7);assert.equal(inspection.mapping.beneficiary,8);assert.equal(inspection.mapping.purpose,9);
 assert.equal(r.valueDate,'2026-01-28');assert.equal(r.beneficiary,'מוטב לדוגמה');assert.equal(r.purpose,'תשלום לדוגמה');assert.equal(r.debitCents,10025);assert.equal(r.creditCents,null);
 assert.equal(result.summary.count,3);assert.equal(result.summary.outsidePeriod,0);assert.equal(result.summary.netCents,10975);
 assert.equal(result.records[1].valueDate,'2026-10-13');assert.equal(result.records[2].valueDate,null);assert.match(result.records[2].warnings.join(' '),/תאריך ערך/);
 assert.equal(JSON.parse(JSON.stringify(result)).records[0].purpose,r.purpose);
});
test('Signed amounts, inversion and explicit debit/credit direction normalize without classifying budget fields',()=>{
 const inspected=inspectCSV('date,description,amount,balance,direction\n01/10/2026,salary,10.25,100,credit\n02/10/2026,card,20,80,debit');
 const result=normalizeRows(inspected,{mode:'signed'});
 assert.deepEqual(result.records.map(r=>r.amountCents),[1025,-2000]);
 const noDirection={...inspected.mapping,direction:-1};
 assert.deepEqual(normalizeRows(inspected,{mapping:noDirection,invertSign:true}).records.map(r=>r.amountCents),[-1025,-2000]);
 const unknown=normalizeRows(inspectCSV('date,amount,direction\n01/10/2026,10,unknown'));
 assert.equal(unknown.records[0].valid,false);
});
test('Invalid mapping, conflicting sides, missing money and currency mismatches are explicit',()=>{
 const p=inspectCSV('תאריך,חובה,זכות,יתרה\n01/10/2026,10,20,100\n02/10/2026,-10,,90\n03/10/2026,,,90\n04/10/2026,$10,,80');
 const r=normalizeRows(p);assert.equal(r.summary.invalid,4);assert.equal(r.summary.count,0);
 assert.throws(()=>normalizeRows(p,{mapping:{...p.mapping,date:-1}}));
 assert.throws(()=>normalizeRows(p,{mapping:{...p.mapping,balance:p.mapping.date}}));
 assert.throws(()=>normalizeRows(p,{mapping:{...p.mapping,balance:500}}));
 const mismatch=normalizeRows(inspectCSV('date,amount\n01/10/2026,10,extra'));assert.equal(mismatch.records[0].valid,false);
});
test('Multiple last-day balances are ambiguous; they are not guessed from source row order',()=>{
 const r=normalizeRows(inspectCSV('date,amount,balance\n02/10/2026,-10,90\n02/10/2026,-20,70\n01/10/2026,100,100'));
 assert.equal(r.summary.balanceCandidate,null);assert.equal(r.summary.balanceAmbiguous,true);
});
test('Hapoalim January–September inspection retains out-of-period rows but excludes them from summaries',()=>{
 const inspected=inspectCSV('date,amount,balance\n31/12/2025,10,10\n01/01/2026,20,30\n30/09/2026,-5,25\n01/10/2026,40,65');
 const result=normalizeRows(inspected,{period:{from:'2026-01',to:'2026-09'}});
 assert.equal(result.records.length,4);assert.equal(result.summary.count,2);assert.equal(result.summary.outsidePeriod,2);assert.equal(result.summary.netCents,1500);
 assert.deepEqual(result.summary.balanceCandidate,{date:'2026-09-30',balanceCents:2500});
 assert.throws(()=>normalizeRows(inspected,{period:{from:'2026-09',to:'2026-01'}}));
});
test('Exact report period includes January 29 and October 12 but excludes the adjacent days',()=>{
 const p=inspectCSV('תאריך,הפעולה,חובה,זכות\n28/01/26,לפני הטווח,10,\n29/01/26,תחילת הטווח,,100\nב׳ 12/10/26,סוף הטווח,25,\n13/10/26,אחרי הטווח,,50');
 const result=normalizeRows(p,{period:{from:'2026-01-29',to:'2026-10-12'}});
 assert.equal(result.summary.count,2);assert.equal(result.summary.outsidePeriod,2);assert.equal(result.summary.netCents,7500);
 assert.deepEqual(result.records.map(r=>r.inPeriod),[false,true,true,false]);
 for(const period of [{from:'2026-02-30',to:'2026-10-12'},{from:'2026-10-13',to:'2026-10-12'},{from:'',to:'2026-10-12'}])assert.throws(()=>normalizeRows(p,{period}));
});
test('Encoding handles UTF-8 and UTF-16 BOM plus explicit Hebrew Windows-1255',()=>{
 const utf8=new TextEncoder().encode('תאריך,סכום');assert.equal(decodeCSV(utf8).encoding,'utf-8');assert.equal(decodeCSV(utf8).text,'תאריך,סכום');
 const utf16=new Uint8Array(Buffer.concat([Buffer.from([255,254]),Buffer.from('תאריך,סכום','utf16le')]));assert.equal(decodeCSV(utf16).text,'תאריך,סכום');
 assert.equal(decodeCSV(new Uint8Array([0xe0,0xe1])).text,'אב');assert.equal(decodeCSV(new Uint8Array([0xe0,0xe1])).encoding,'windows-1255');
 assert.throws(()=>decodeCSV(new Uint8Array(LIMITS.bytes+1)));assert.throws(()=>decodeCSV(new Uint8Array([0,0])));
});
test('CSV content stays literal and bounded; parsing never changes input inspection',()=>{
 const p=inspectCSV('date,description,amount\n01/10/2026,<script>alert(1)</script>,10'),before=JSON.stringify(p);
 assert.equal(normalizeRows(p).records[0].description,'<script>alert(1)</script>');assert.equal(JSON.stringify(p),before);
 assert.throws(()=>parseCSV('x'.repeat(LIMITS.cell+1)));assert.throws(()=>parseCSV(Array(LIMITS.columns+1).fill('a').join(',')));
 assert.throws(()=>parseCSV('a\n'.repeat(LIMITS.rows+1)));
});
test('Isolated local server has no upload, budget API or filesystem browsing endpoints',async()=>{
 const server=createLabServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base=`http://127.0.0.1:${server.address().port}`;
  const page=await fetch(base);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/form-action 'none'/);assert.equal(page.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(base+'/api/budget')).status,404);assert.equal((await fetch(base+'/sample.csv',{method:'POST',body:'test'})).status,405);
  assert.equal((await fetch(base+'/README.md')).status,404);assert.equal((await fetch(base+'/parser.mjs')).status,200);
  const library=await fetch(base+'/vendor/xlsx-mini.js');assert.equal(library.status,200);assert.match(library.headers.get('content-type'),/javascript/);assert.match(page.headers.get('content-security-policy'),/worker-src 'self'/);
  assert.equal((await fetch(base+'/xlsx-worker.js')).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('Automatic money parsing preserves exact signed cents across export locales and validates grouping',()=>{
 for(const [text,expected] of [
  ['1000',100000],['1,000',100000],['1.000',100000],
  ['1,000.00',100000],['1.000,00',100000],['1000.25',100025],['1000,25',100025],
  ['-1,000.25',-100025],['-1.000,25',-100025],['(1.000,25)',-100025],['1.000,25-',-100025],
  ['+1,000.25',100025],['0.01',1],['-0,01',-1],
  ['12,345,678.90',1234567890],['12.345.678,90',1234567890],['100,000,000.00',10000000000]
 ])assert.equal(parseMoney(text),expected,text);
 for(const text of ['12,34,567.89','12.34.567,89','1,234,56','1.234.56','1,000.0000','--1','(-1)','100,000,000.01'])assert.throws(()=>parseMoney(text),text);
 // Numeric workbook cells are locale-independent and must reject sub-cent values.
 assert.throws(()=>parseMoney('1.001','dot'));
 assert.equal(parseMoney('1.234,56','comma'),123456);
});

test('CSV decoding and delimiter detection retain mixed locale debit/credit amounts and signed balances',()=>{
 for(const delimiter of [',',';','\t']){
  const quote=s=>'"'+s+'"';
  const csv=[['תאריך','הפעולה','חובה','זכות','יתרה בש״ח'],
   ['12/02/2026','החזר הלוואה','1,000.00','','-1.000,25'],
   ['13/02/2026','משכורת','','12.345,67','11,345.42']].map(r=>r.map(quote).join(delimiter)).join('\r\n');
  const decoded=decodeCSV(new TextEncoder().encode(csv)),inspection=inspectCSV(decoded.text),result=normalizeRows(inspection);
  assert.equal(inspection.delimiter,delimiter);assert.equal(result.summary.invalid,0);
  assert.deepEqual(result.records.map(r=>r.amountCents),[-100000,1234567]);
  assert.deepEqual(result.records.map(r=>r.balanceCents),[-100025,1134542]);
 }
});
