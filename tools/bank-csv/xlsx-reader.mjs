import {LIMITS,guessMapping,parseDate,decodeCSV} from './parser.mjs';
const MAX_EXPANDED=32*1024*1024;
export function checkXlsxContainer(bytes){
 if(bytes.byteLength>LIMITS.bytes)throw Error('הקובץ גדול מדי. אפשר לבדוק קובץ עד 5MB.');
 if(bytes[0]===0xd0&&bytes[1]===0xcf)throw Error('קובץ מוצפן או בפורמט XLS ישן. שמור עותק XLSX ללא סיסמה ונסה שוב.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),end=bytes.byteLength;
 if(end<22||v.getUint32(0,true)!==0x04034b50)throw Error('זה אינו קובץ XLSX תקין. יש לבחור קובץ Excel עם סיומת .xlsx.');
 let eocd=-1;
 for(let i=end-22;i>=Math.max(0,end-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===end){eocd=i;break;}
 if(eocd<0)throw Error('קובץ XLSX חסר או פגום.');
 const count=v.getUint16(eocd+10,true),size=v.getUint32(eocd+12,true),start=v.getUint32(eocd+16,true);
 if(v.getUint16(eocd+4,true)||v.getUint16(eocd+6,true)||count!==v.getUint16(eocd+8,true)||count>1500||start+size!==eocd)throw Error('מבנה XLSX זה אינו נתמך.');
 let offset=start,expanded=0;const names=new Set();
 for(let i=0;i<count;i++){
  if(offset+46>eocd||v.getUint32(offset,true)!==0x02014b50)throw Error('מבנה XLSX פגום.');
  const flags=v.getUint16(offset+8,true),method=v.getUint16(offset+10,true),packed=v.getUint32(offset+20,true),unpacked=v.getUint32(offset+24,true),nameLen=v.getUint16(offset+28,true),extra=v.getUint16(offset+30,true),comment=v.getUint16(offset+32,true),local=v.getUint32(offset+42,true);
  const next=offset+46+nameLen+extra+comment;
  if(next>eocd||local+30>start)throw Error('מבנה XLSX פגום.');
  const name=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nameLen));
  if(names.has(name)||name.includes('..')||name.startsWith('/')||name.includes('\\'))throw Error('מבנה XLSX לא תקין.');names.add(name);
  if(flags&1)throw Error('קובץ XLSX מוגן בסיסמה אינו נתמך.');
  if(![0,8].includes(method)||v.getUint32(local,true)!==0x04034b50)throw Error('דחיסת XLSX זו אינה נתמכת.');
  const dataStart=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
  if(dataStart+packed>start||v.getUint32(local+22,true)&&v.getUint32(local+22,true)!==unpacked)throw Error('מבנה XLSX פגום.');
  expanded+=unpacked;if(expanded>MAX_EXPANDED||unpacked>MAX_EXPANDED)throw Error('הקובץ גדול מדי לאחר פתיחה. נסה דוח קטן יותר.');
  if(/vbaProject|macrosheets/i.test(name))throw Error('קבצים עם מאקרו אינם נתמכים; יש לבחור דוח XLSX רגיל.');
  offset=next;
 }
 if(offset!==eocd||!names.has('[Content_Types].xml')||!names.has('xl/workbook.xml'))throw Error('זה אינו דוח XLSX נתמך.');
 return {expanded};
}
export function checkXlsContainer(bytes,XLSX){
 if(bytes.byteLength>LIMITS.bytes)throw Error('הקובץ גדול מדי. אפשר לבדוק קובץ עד 5MB.');
 const signature=[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
 if(signature.every((n,i)=>bytes[i]===n)){
  if(bytes.length<512)throw Error('מבנה XLS חסר או פגום.');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),shift=v.getUint16(30,true);
  if(![9,12].includes(shift)||v.getUint16(28,true)!==0xfffe||bytes.length%(2**shift))throw Error('מבנה XLS פגום.');
  let cfb;try{cfb=XLSX.CFB.read(bytes,{type:'array'});}catch{throw Error('לא ניתן לקרוא את מבנה קובץ ה־XLS.');}
  if(cfb.FullPaths.some(p=>/EncryptedPackage|EncryptionInfo/i.test(p)))throw Error('קובץ מוגן בסיסמה אינו נתמך.');
  if(cfb.FullPaths.some(p=>/(?:\/VBA\/|_VBA_PROJECT|Macros|ObjectPool)/i.test(p)))throw Error('קבצים עם מאקרו או אובייקטים מוטמעים אינם נתמכים.');
  if(!cfb.FileIndex.some(f=>/^(Workbook|Book)$/i.test(f.name)))throw Error('זה אינו קובץ Excel XLS נתמך.');
  return {data:bytes,type:'array'};
 }
 const view=bytes.length>=4?new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength):null;
 if(view&&[0x0009,0x0209,0x0409,0x0809].includes(view.getUint16(0,true))){
  for(let i=0;i<bytes.length;){if(i+4>bytes.length)throw Error('מבנה XLS פגום.');const id=view.getUint16(i,true),size=view.getUint16(i+2,true);if(i+4+size>bytes.length)throw Error('מבנה XLS פגום.');if(id===0x002f)throw Error('קובץ מוגן בסיסמה אינו נתמך.');i+=4+size;}
  return {data:bytes,type:'array'};
 }
 let text;try{text=decodeCSV(bytes).text;}catch{throw Error('זה אינו קובץ XLS קריא.');}
 if(!/<table\b/i.test(text)&&!/<Workbook\b[^>]*urn:schemas-microsoft-com:office:spreadsheet/i.test(text))throw Error('זה אינו קובץ XLS נתמך.');
 if(/<script\b|<!ENTITY\b|<!DOCTYPE\b[^>]*\bSYSTEM\b|\b(?:ss:Formula|x:fmla)\s*=/i.test(text))throw Error('קובץ עם קוד, נוסחאות או הפניות חיצוניות אינו נתמך.');
 return {data:text,type:'string'};
}
export function readXlsx(bytes,XLSX){return readExcel(bytes,XLSX,'xlsx');}
export function readExcel(bytes,XLSX,format='xlsx'){
 if(!['xls','xlsx'].includes(format))throw Error('פורמט Excel אינו נתמך.');
 const input=format==='xls'?checkXlsContainer(bytes,XLSX):(checkXlsxContainer(bytes),{data:bytes,type:'array'});let workbook;
 try{workbook=XLSX.read(input.data,{type:input.type,raw:true,cellNF:true,cellText:true,cellFormula:true,cellDates:false,cellStyles:true,bookVBA:false});}catch{throw Error('לא ניתן לקרוא את קובץ ה־Excel. ודא שהקובץ תקין וללא סיסמה.');}
 if(!workbook.SheetNames.length||workbook.SheetNames.length>50)throw Error('אפשר לבדוק קובץ עם 1–50 גיליונות.');
 if(workbook.SheetNames.some(name=>['macro','dialog'].includes(workbook.Sheets[name]?.['!type'])))throw Error('קובץ עם גיליון מאקרו אינו נתמך.');
 workbook.bankSourceFormat=format;
 return workbook;
}
export function listSheets(workbook){return workbook.SheetNames.map((name,index)=>({name,hidden:!!workbook.Workbook?.Sheets?.[index]?.Hidden,empty:!workbook.Sheets[name]?.['!ref']}));}
export function inspectSheet(workbook,name,XLSX){
 if(!workbook.SheetNames.includes(name))throw Error('הגיליון אינו קיים בקובץ.');
 const sheet=workbook.Sheets[name];if(!sheet?.['!ref'])throw Error('הגיליון ריק. בחר גיליון אחר.');
 const range=XLSX.utils.decode_range(sheet['!ref']),width=range.e.c+1;
 if(width>LIMITS.columns||range.e.r+1>LIMITS.rows)throw Error('הגיליון חורג מ־30,000 שורות או 100 עמודות. נסה דוח קטן יותר.');
 const rows=[];let hiddenRows=0,formulaCells=0;
 for(let r=range.s.r;r<=range.e.r;r++){
  const cells=[],sourceCells=[],numericColumns=[],cellIssues=[];let hasValue=false;
  for(let c=0;c<width;c++){
   const cell=sheet[XLSX.utils.encode_cell({r,c})];let text='',source='';
   if(cell){
    source=String(cell.w??cell.v??'');text=String(cell.v??'');
    if(cell.f){formulaCells++;cellIssues.push({column:c,message:'תא עם נוסחה; השורה לא נכללת בסיכום, יש לבדוק ערך מקורי'});source='='+cell.f+(cell.v!==undefined?' → '+source:'');}
    if(cell.t==='e')cellIssues.push({column:c,message:'שגיאת Excel בתא'});
    if(cell.t==='n'&&XLSX.SSF.is_date(cell.z??'')){
     const d=XLSX.SSF.parse_date_code(cell.v,{date1904:!!workbook.Workbook?.WBProps?.date1904});
     try{text=parseDate(`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`);}catch{cellIssues.push({column:c,message:'תאריך Excel לא תקין'});}
    }else if(cell.t==='n'){
     numericColumns.push(c);
     // Remove floating-point noise only; genuine fractions of a cent remain invalid.
     const cents=Math.round(cell.v*100);if(Number.isFinite(cell.v)&&Math.abs(cell.v*100-cents)<0.000001)text=String(cents/100);
    }else if(cell.t==='d'){
     const d=new Date(cell.v);text=Number.isNaN(d.valueOf())?text:d.toISOString().slice(0,10);
    }
    if(text||source||cell.f)hasValue=true;
    if(text.length>LIMITS.cell||source.length>LIMITS.cell)throw Error('תא בגיליון ארוך מדי.');
   }
   cells.push(text);sourceCells.push(source);
  }
  if(hasValue){if(sheet['!rows']?.[r]?.hidden)hiddenRows++;rows.push({line:r+1,cells,sourceCells,numericColumns,cellIssues});}
 }
 if(!rows.length)throw Error('אין נתונים בגיליון הזה. בחר גיליון אחר.');
 let headerIndex=0,best=-1;
 rows.slice(0,35).forEach((row,i)=>{const mapping=guessMapping(row.cells),score=Object.values(mapping).filter(n=>n>=0).length*10+(mapping.date>=0?5:0);if(score>best){best=score;headerIndex=i;}});
 const notices=[];
 if(hiddenRows)notices.push(`${hiddenRows} שורות מוסתרות נכללו בבדיקה`);
 if(sheet['!cols']?.some(c=>c?.hidden))notices.push('עמודות מוסתרות נכללו בבדיקה');
 if(formulaCells)notices.push(`${formulaCells} תאים עם נוסחאות; אין חישוב נוסחאות בבדיקה`);
 if(sheet['!merges']?.length)notices.push('תאים ממוזגים נשמרו כפי שהם, ללא השלמת ערכים לתאים ריקים');
 return {rows,headerIndex,mapping:guessMapping(rows[headerIndex].cells),delimiter:null,format:workbook.bankSourceFormat??'xlsx',sheetName:name,notices};
}
