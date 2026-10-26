// Synthetic OOXML fixture, no user or merchant data.
import {zipFixture} from './xlsx-fixture.mjs';
export function calFixture(){
 const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
 const data=[['פירוט כרטיס בדיקה'],['עסקאות לחיוב ב-15/11/2026: 125.25 ₪'],['תאריך עסקה','שם בית עסק','סכום עסקה','סכום חיוב','סוג עסקה','ענף','הערות'],['13/10/2026','חנות מוכרת לדוגמה',300.75,100.25,'תשלומים','כללי','תשלום 1 מתוך 3'],['14/10/2026','חנות חדשה לדוגמה',25,25,'רגילה','כללי',''],['את המידע המלא על כל עסקה אפשר למצוא באתר ובאפליקציית כאל.']];
 const sheet=`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:G6"/><sheetData>${data.map((row,r)=>`<row r="${r+1}">${row.map((v,c)=>typeof v==='number'?`<c r="${String.fromCharCode(65+c)}${r+1}"><v>${v}</v></c>`:`<c r="${String.fromCharCode(65+c)}${r+1}" t="inlineStr"><is><t>${escape(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
 return zipFixture({
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="בדיקה" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml':sheet
 });
}
