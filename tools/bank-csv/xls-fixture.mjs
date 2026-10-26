import XLSX from './vendor/xlsx-full.cjs';
export function xlsFixture(){
 const w=XLSX.utils.book_new(),s=XLSX.utils.aoa_to_sheet([['תאריך','הפעולה','אסמכתא','סכום','יתרה בש״ח','לטובת'],['12/03/2026','העברה לחיסכון',123,-1000.25,-100.5,'מוטב לדוגמה'],['13/03/2026','משכורת',124,2000.5,1900,'']]);s.C2.z='000000';s.C3.z='000000';XLSX.utils.book_append_sheet(w,s,'תנועות');return new Uint8Array(XLSX.write(w,{type:'buffer',bookType:'biff8'}));
}
