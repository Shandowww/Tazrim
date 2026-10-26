// Tiny independent OOXML fixture generator for importer tests, not an application export.
import {deflateRawSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function zipFixture(files){
 const entries=[],central=[];let offset=0;
 for(const [name,text]of Object.entries(files)){
  const data=Buffer.from(text),compressed=deflateRawSync(data),label=Buffer.from(name),crc=crc32(data),local=Buffer.alloc(30),dir=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(label.length,26);
  dir.writeUInt32LE(0x02014b50);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(8,10);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(compressed.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(label.length,28);dir.writeUInt32LE(offset,42);
  entries.push(local,label,compressed);central.push(dir,label);offset+=local.length+label.length+compressed.length;
 }
 const end=Buffer.alloc(22),dir=Buffer.concat(central);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return new Uint8Array(Buffer.concat([...entries,dir,end]));
}
export function makeFixture({date1904=false,formula=false,hapoalim=false}={}){
 const serial=date=>(Date.parse(date+'T00:00:00Z')-Date.parse((date1904?'1904-01-01':'1899-12-30')+'T00:00:00Z'))/86400000;
 const str=(address,value)=>`<c r="${address}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
 const number=(address,value,style=0)=>`<c r="${address}" s="${style}"><v>${value}</v></c>`;
 const values=[['2026-01-15','משכורת',1001,null,18500.25,28500.25],['2026-09-20','העברה לחיסכון',1002,100.25,null,28400]];
 const sheet=`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${hapoalim?'J':'F'}5"/><sheetData><row r="1">${str('A1','דוח בדיקה בלבד')}</row><row r="3">${(hapoalim?['תאריך','הפעולה','פרטים','אסמכתא','חובה','זכות','יתרה בש״ח','תאריך ערך','לטובת','עבור']:['תאריך','תיאור','אסמכתא','חובה','זכות','יתרה']).map((s,i)=>str(String.fromCharCode(65+i)+'3',s)).join('')}</row>${values.map((v,i)=>`<row r="${i+4}">${hapoalim&&i===1?str('A5','א׳ 20/09/26'):number('A'+(i+4),serial(v[0]),1)}${str('B'+(i+4),v[1])}${hapoalim?str('C'+(i+4),'פרטים לדוגמה'):''}${number((hapoalim?'D':'C')+(i+4),v[2],2)}${v[3]!==null?number((hapoalim?'E':'D')+(i+4),v[3],3):''}${v[4]!==null?number((hapoalim?'F':'E')+(i+4),v[4],3):''}${formula&&i===1?`<c r="F5"><f>F4-D5</f><v>28400</v></c>`:number((hapoalim?'G':'F')+(i+4),v[5],3)}${hapoalim?number('H'+(i+4),serial(v[0]),1)+str('I'+(i+4),'מוטב לדוגמה')+str('J'+(i+4),'תשלום לדוגמה'):''}</row>`).join('')}</sheetData></worksheet>`;
 return zipFixture({
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="${date1904?1:0}"/><sheets><sheet name="תנועות" sheetId="1" r:id="rId1"/><sheet name="גיליון ריק" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  'xl/styles.xml':'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="000000"/><numFmt numFmtId="166" formatCode="#,##0.00"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf numFmtId="166" applyNumberFormat="1"/></cellXfs></styleSheet>',
  'xl/worksheets/sheet1.xml':sheet,
  'xl/worksheets/sheet2.xml':'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)&&process.argv[2])await writeFile(process.argv[2],makeFixture({hapoalim:process.argv.includes('--hapoalim')}));
