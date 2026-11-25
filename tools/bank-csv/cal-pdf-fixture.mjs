// Synthetic digital Cal monthly layout; no customer content.
import {pdfFixture} from './pdf-fixture.mjs';
export const item=(str,x,y,width=str.length*3,dir=/[א-ת]/.test(str)?'rtl':'ltr')=>({str,dir,width,transform:[7,0,0,7,x,y]});
export function glyphs(str,right,y,rtl=false){return [...str].map((s,i)=>item(s,rtl?right-(i+1)*3:right-str.length*3+i*3,y,3,rtl?'rtl':'ltr'));}
export function calTextFixture(){return [0,1].map((index)=>{const h=index?763:517,items=[item('www.cal-online.co.il',130,790),...glyphs(`עמוד${index+1}מתוך2`,535,819,true),item('המסתיים ב-',450,780,60),...glyphs('1234',448,780)];
 if(!index)items.push(item('דף חיוב חודשי ל-15/10/26',400,800,135));
 for(const [s,x]of [['תאריך',515],['שם בית העסק',440],['ענף',390],['פירוט',350],['כרטיס',255],['סכום',225],['סכום',165]])items.push(item(s,x,h,s==='שם בית העסק'?58:20));
 for(const [s,x]of [['העסקה',515],['הוצג',255],['העסקה',225],['חיוב',165]])items.push(item(s,x,h-6,20));
 const row=h-17;items.push(...glyphs(index?'02/10/2026':'01/09/2026',538,row),...glyphs(index?'חנות':'עסק לדוגמה',498,row,true),item('תשלום 1 מ-10',300,row,70),item(index?'₪ 50.00':'₪ 1,000.00',200,row,46),item(index?'₪ -50.00':'₪ 100.00',140,row,42));
 if(index)items.push(item('סה"כ לתאריך 15/10/26',350,row-15,140),item('₪ 50.00',145,row-15,37));
 if(index)items.push(item('הודעה לכרטיס המסתיים ב-1234',300,560,230),item('• עדכון יתרת ההטבה בתכנית הבדיקה: 0 ש״ח.',280,540,255),item('• לידיעתך, מסגרת הכרטיס מתעדכנת מדי רבעון.',280,515,255));
 return{width:555.59,height:833.39,items};});}

export function calLowContinuationTextFixture(){
 const pages=calTextFixture(),bottom=193.74;
 pages[0].items.push(...glyphs('02/09/2026',538,bottom),item('חנות נוספת',450,bottom,48),
  item('₪ 12.34',200,bottom,46),item('₪ 12.34',140,bottom,42),
  item('ט.ל.ח | מידע נוסף',400,173.92,136));
 pages[1].items.find(entry=>entry.str==='₪ 50.00'&&entry.transform[5]<740).str='₪ 62.34';
 return pages;
}

export function calFutureTextFixture(){
 const [monthly,appendix]=calTextFixture();
 monthly.items.push(item('סה"כ לתאריך 15/10/26',350,485,140),item('₪ 100.00',145,485,37));
 appendix.items=appendix.items.filter(entry=>entry.transform[5]>=780||entry.transform[5]<=560);
 appendix.items.push(item('פירוט עסקות לחיוב עתידי',450,746,86),item('ריביות אשראי לכרטיס',230,689,74));
 for(const [label,left,width] of [['תאריך',515,20],['שם בית העסק',440,58],['ענף',390,20],['פירוט',355,20],['כרטיס',282,20],['סכום',255,20],['תאריך',195,20],['סכום',160,20]])appendix.items.push(item(label,left,735,width));
 for(const [label,left] of [['העסקה',515],['הוצג',282],['העסקה',255],['חיוב',195],['חיוב',160]])appendix.items.push(item(label,left,729,20));
 appendix.items.push(...glyphs('10/10/2026',538,718),item('חנות עתידית',450,718,48),item('₪ 90.00',240,718,34),...glyphs('15/11/26',216,718),item('₪ 90.00',145,718,36),item('המשך',395,709,20));
 return [monthly,appendix];
}

export function calPDFFixture(pages=calTextFixture()){for(const page of pages)for(const row of page.items){row.transform[0]=row.width*2/row.str.length;if(/[א-ת]/.test(row.str))row.str=row.str.replace(/\d+(?:[./]\d+)*/g,value=>[...value].reverse().join(''));}return pdfFixture(pages);}
