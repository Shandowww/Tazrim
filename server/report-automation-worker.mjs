import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {decodeCSV,inspectCSV} from '../dist/import-readers/parser.mjs';
import {inspectIntake} from '../dist/import-readers/intake-reader.mjs';
import {mapReportSource,parseMappingChoice} from '../dist/import-readers/manual-report-mapping.mjs';
import {readReportPDF,readPDFPages} from '../dist/import-readers/pdf-reader.mjs';
import {extractStatementNotices,pdfNoticePages} from '../dist/import-readers/statement-notices.mjs';
try{
 const {name,bytes,noticeIdentityOnly,manualMapping}=workerData,source=new Uint8Array(bytes);let parsed,pages=[];
 const choice=manualMapping===undefined?null:parseMappingChoice(manualMapping);
 if(manualMapping!==undefined&&(!choice||noticeIdentityOnly||!/\.(csv|xlsx?)$/i.test(name)))throw Error('מיפוי הדוח השמור אינו מתאים לקובץ.');
 const inspect=inspections=>choice?mapReportSource(inspections[0],choice):inspectIntake(inspections);
 if(/\.csv$/i.test(name)){const decoded=decodeCSV(source).text;if(!noticeIdentityOnly)parsed=inspect([inspectCSV(decoded)]);pages=[{page:1,text:decoded}];}
 else if(/\.pdf$/i.test(name)){
  if(!noticeIdentityOnly){const result=await readReportPDF(source.slice(),{includeAccountIdentity:true});parsed=result.intake??inspectIntake([result.inspection]);}
  pages=pdfNoticePages(await readPDFPages(source.slice()));
 }
 else{
  const XLSX=createRequire(import.meta.url)('../dist/import-readers/vendor/xlsx-full.cjs'),api=await import('../dist/import-readers/xlsx-reader.mjs'),book=api.readExcel(source,XLSX,/\.xls$/i.test(name)?'xls':'xlsx'),sheets=api.listSheets(book).filter(s=>!s.empty);
  if(choice&&(sheets.length!==1||sheets[0].hidden))throw Error('מיפוי נתמך בגיליון גלוי יחיד.');
  if(!noticeIdentityOnly)parsed=inspect(sheets.map(s=>({...api.inspectSheet(book,s.name,XLSX),sheetName:s.name})));
  pages=sheets.filter(s=>!noticeIdentityOnly||!s.hidden).map((s,index)=>({page:index+1,text:XLSX.utils.sheet_to_csv(book.Sheets[s.name],{FS:' ',RS:'\n'})}));
 }
 // The original notice validator applies its own page/text bounds.
 const notices=extractStatementNotices(pages);
 parentPort.postMessage(noticeIdentityOnly?{cardLastFour:notices.cardLastFour??''}:{parsed,pages});
}catch(error){parentPort.postMessage({error:error.message});}
