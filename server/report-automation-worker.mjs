import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {decodeCSV,inspectCSV} from '../dist/import-readers/parser.mjs';
import {inspectIntake} from '../dist/import-readers/intake-reader.mjs';
import {readReportPDF,readPDFPages} from '../dist/import-readers/pdf-reader.mjs';
import {extractStatementNotices,pdfNoticePages} from '../dist/import-readers/statement-notices.mjs';
try{
 const {name,bytes,noticeIdentityOnly}=workerData,source=new Uint8Array(bytes);let parsed,pages=[];
 if(/\.csv$/i.test(name)){const decoded=decodeCSV(source).text;if(!noticeIdentityOnly)parsed=inspectIntake([inspectCSV(decoded)]);pages=[{page:1,text:decoded}];}
 else if(/\.pdf$/i.test(name)){
  if(!noticeIdentityOnly){const result=await readReportPDF(source.slice(),{includeAccountIdentity:true});parsed=result.intake??inspectIntake([result.inspection]);}
  pages=pdfNoticePages(await readPDFPages(source.slice()));
 }
 else{
  const XLSX=createRequire(import.meta.url)('../dist/import-readers/vendor/xlsx-full.cjs'),api=await import('../dist/import-readers/xlsx-reader.mjs'),book=api.readExcel(source,XLSX,/\.xls$/i.test(name)?'xls':'xlsx'),sheets=api.listSheets(book).filter(s=>!s.empty);
  if(!noticeIdentityOnly)parsed=inspectIntake(sheets.map(s=>({...api.inspectSheet(book,s.name,XLSX),sheetName:s.name})));
  pages=sheets.filter(s=>!noticeIdentityOnly||!s.hidden).map((s,index)=>({page:index+1,text:XLSX.utils.sheet_to_csv(book.Sheets[s.name],{FS:' ',RS:'\n'})}));
 }
 // The original notice validator applies its own page/text bounds.
 const notices=extractStatementNotices(pages);
 parentPort.postMessage(noticeIdentityOnly?{cardLastFour:notices.cardLastFour??''}:{parsed,pages});
}catch(error){parentPort.postMessage({error:error.message});}
