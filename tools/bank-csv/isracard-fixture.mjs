// Synthetic geometry only; never commit customer statements or extracted text.
const item=(str,end,y,size=8)=>({str,dir:/[א-ת]/.test(str)?'rtl':'ltr',transform:[size,0,0,size,end-str.length*size/2,y],width:str.length*size/2,height:size});
export function isracardTextFixture(){
 const header=[item('תאריך',525,595),item('סוג',490,595),item('שם',479,595),item('בית',465,595),item('העסק',450,595),item('סכום',378,595),item('מקורי',359,595),item('תאריך',289,595),item('המרה',271,595),item('סכום',220,595),item('עמלה',206,595),item('סכום',181,595),item('החיוב',165,595)];
 const page={width:595,height:842,items:[item('ישראכרט',480,770),item('פרוט פעולותיך לתאריך:',525,690),item('15/10/26',420,690),item('כרטיס שמסתיים בספרות: 1111',525,670),item('רכישות בחו״ל',525,610),...header]};
 const rows=[{date:'16/09/26',name:'MERCHANT EXAMPLE',city:'CITY',foreign:'10.00',currency:'€',billed:'40.00'},{date:'18/09/26',name:'SECOND MERCHANT',city:'CITY TWO',foreign:'5.00',currency:'$',billed:'20.00'},{date:'20/09/26',name:'REFUND EXAMPLE',city:'CITY THREE',foreign:'-1.00',currency:'€',billed:'-4.00'}];
 rows.forEach((r,i)=>{const y=565-i*35;page.items.push(item(r.date,525,y),item('א',487,y),item(r.name,478,y),item(r.city,478,y-9),item(r.currency,378,y),item(r.foreign,370,y),item('21/09/26',289,y),item('3.0000',249,y),item('0.00',220,y),item(r.billed,181,y),item('עמלה: 0.00 ₪ הנחה: 0.00 ₪',525,y-18));});
 page.items.push(item('סה״כ חיוב לתאריך',525,440),item('15/10/26',435,440),item('56.00',181,440),item('מסגרת כרטיס האשראי',525,405),item('15000.00',350,390));return[page];
}

export function isracardDomesticFixture({mixed=true,information='terms'}={}){
 const pages=isracardTextFixture(),page=pages[0];
 if(!mixed)page.items=page.items.filter(i=>i.transform[5]>610||i.transform[5]<420);
 page.items.push(item('עסקות שחויבו / זוכו - בארץ',525,420),
  item('תאריך',525,400),item('כרטיס',478,400),item('שם',442,400),item('בית',429,400),item('עסק',414,400),item('ענף',356,400),item('סכום',305,400),item('סכום',262,400),item('פירוט',218,400),item('נוסף',198,400),
  item('עסקה',525,392),item('בעסקה',478,392),item('עסקה',305,392),item('החיוב',262,392),item('בש״ח',262,384),
  item('04/09/26',525,368),item('לא הוצג',478,368),item('חנות לדוגמה',442,368),item('שונות',356,368),item('2,700.00',305,368),item('450.00',262,368),item('תשלום 3 מתוך 6',218,368),
  item('07/09/26',525,345),item('לא הוצג',478,345),item('זיכוי לדוגמה',442,345),item('שונות',356,345),item('-10.00',305,345),item('-10.00',262,345),
  item('סה״כ חיוב לתאריך',525,320),item('15/10/26',435,320),item('440.00',262,320),item('עמוד 1 מתוך 2',100,15));
 pages.push({width:595,height:842,items:[item(information==='fees'?'דיווח עמלות חצי שנתי (לידיעה בלבד - לא לתשלום)':'מסגרת הכרטיס ותנאי האשראי',525,780),item('סכום לחיוב (בש״ח)',260,740),item('10.79',260,720),item('עמוד 2 מתוך 2',100,15)]});return pages;
}
