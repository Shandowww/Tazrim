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

export function calPDFFixture(){const p=calTextFixture();for(const page of p)for(const i of page.items){i.transform[0]=i.width*2/i.str.length;if(/[א-ת]/.test(i.str))i.str=i.str.replace(/\d+(?:[./]\d+)*/g,v=>[...v].reverse().join(''));}return pdfFixture(p);}
