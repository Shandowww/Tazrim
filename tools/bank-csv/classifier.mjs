// Suggestions only. Monthly proposals contain reviewed amounts, never budget writes.
export const destinations={salary:'הכנסה נטו · משכורת',otherIncome:'הכנסות נוספות',incomingTransfers:'העברה נכנסת',outgoingTransfers:'העברה יוצאת פנימית',personalSaving:'חיסכון אישי',sharedSaving:'החלק שלי בחיסכון המשותף',personalInvest:'חשבון פרטי · השקעות',sharedInvest:'חשבון משותף · השקעות (החלק שלי)',transfers:'העברות יוצאות',checks:'צ׳קים · סך חודשי',loanRepayment:'החזר הלוואות',card1:'כרטיס מזרחי / הפועלים',card2:'כרטיס וואן זירו',variable:'הוצאות אחרות',exclude:'ללא השפעה על הסיכום החודשי'};
const incoming=new Set(['salary','otherIncome','incomingTransfers']);
export const normalizedText=value=>String(value??'').normalize('NFKC').replace(/[״׳"']/g,'').replace(/\s+/g,' ').trim().toLowerCase();
export function eligible(record){return !record.duplicateState&&record.valid&&record.inPeriod!==false&&record.currency==='ILS'&&Number.isSafeInteger(record.amountCents);}
export function compatible(record,destination){return destination==='exclude'||(incoming.has(destination)?record.amountCents>0:record.amountCents<0);}
export function suggest(record,rules=[]){
 if(record.duplicateState)return {category:record.duplicateState==='duplicate'?'כבר נקלט':'אסמכתא עם פרטים סותרים',destination:'',reason:record.duplicateState==='duplicate'?'אסמכתא ותנועה שכבר נרשמו; לא יתווסף שוב':'אותה אסמכתא ותאריך עם נתונים שונים; אינו נקלט אוטומטית',strength:'review'};
 if(!eligible(record))return {category:'לא בסיכום',destination:'',reason:'שורה לא תקינה, מחוץ לתקופה או במטבע אחר',strength:'review'};
 const text=normalizedText([record.description,record.details,record.beneficiary,record.purpose].join(' ')),out=record.amountCents<0;
 const match=rules.filter(r=>(r.action!==undefined?normalizedText(record.description)===normalizedText(r.action)&&normalizedText(record.beneficiary)===normalizedText(r.beneficiary):normalizedText(r.text)&&text.includes(normalizedText(r.text)))&&(r.direction==='out'?out:!out)&&(Object.hasOwn(destinations,r.destination)||r.action!==undefined&&/^card/.test(r.destination))&&(compatible(record,r.destination)||r.action!==undefined&&r.refund===true&&r.destination!=='outgoingTransfers'&&record.amountCents>0&&!incoming.has(r.destination)));
 if(new Set(match.map(r=>r.destination)).size>1)return {category:'כללים סותרים',destination:'',reason:'יותר מכלל אישי אחד מתאים; יש לבחור יעד',strength:'review'};
 if(match.length)return {category:'לפי כלל אישי',destination:match[0].destination,reason:'הטקסט תואם לכלל שהגדרת: '+match[0].text,strength:'explicit',refund:match[0].refund===true};
 const proposal=(category,destination,reason,strength='review')=>({category,destination,reason,strength});
 // Loan funding and repayments precede saving/investment words in descriptions.
 if(/הלואה|הלוואה/.test(text))return out?proposal('החזר הלוואה','loanRepayment','החיוב מציין הלוואה; אינו הפקדה לחיסכון','clear'):proposal('קבלת הלוואה','exclude','כספי הלוואה אינם משכורת; בדוק אם נדרשת התאמה חד־פעמית');
 if(/משכורת|שכר עבודה/.test(text))return out?proposal('פעולת שכר יוצאת','','משכורת מסומנת כחובה; יש לבדוק'):proposal('משכורת','salary','זיכוי עם תיאור משכורת','clear');
 if(/שיק|שיקים|צק|צקים/.test(text))return out?proposal('צ׳ק ששולם','checks','חיוב שיק; נכלל פעם אחת בסך הצ׳קים','clear'):proposal('הפקדת צ׳ק','otherIncome','זיכוי צ׳ק; ייתכן החזר או העברה ולא הכנסה');
 if(out&&normalizedText(record.beneficiary).includes(normalizedText('שרותי בורסה והשקעות בישר')))return proposal('הפקדה לתיק ההשקעות','personalInvest','מוטב שהגדרת לתיק ההשקעות האישי','clear');
 if(out&&/ני\s*ע.*קני/.test(normalizedText(record.description)))return proposal('הפקדה לחיסכון','personalSaving','כלל אישי שהגדרת: ני״ע-קניה היא חיסכון','clear');
 if(/ני\s*ע.*קני|ניירות ערך.*קני|השקע/.test(text))return out?proposal('השקעה','personalInvest','תיאור רכישה או השקעה; יש לוודא אישי מול משותף'):proposal('כסף מהשקעה','exclude','מימוש או החזר מהשקעה דורשים בדיקה; אינם משכורת');
 if(/חסכון|חיסכון|פיקדון|פקדון/.test(text))return out?proposal('הפקדה לחיסכון',/משותף/.test(text)?'sharedSaving':'personalSaving','יש לוודא לאיזה חיסכון הופקד הכסף'):proposal('משיכת חיסכון','exclude','משיכת חיסכון אינה משכורת; נדרשת התאמה ליתרות');
 if(/כאל|ישראכרט|מקס|max|ויזה|מאסטרקארד|כרטיס אשראי/.test(text))return proposal(out?'חיוב כרטיס':'זיכוי כרטיס',out?'':'otherIncome','יש לזהות את הכרטיס; פירוט רכישות לא יתווסף שוב לסך הכרטיס');
 if(/העבר|העב(?:\s|$)|זיכוי|ניוד|bit|ביט/.test(text))return out?proposal('העברה יוצאת','transfers','ייתכן תשלום, חיסכון או העברה בין חשבונות שלך; בדוק את המוטב'):proposal('העברה נכנסת','incomingTransfers','כסף שהועבר לחשבון, למשל מהחשבון הפרטי למשותף; יש לאשר שזו העברה ולא הכנסה או החזר תשלום');
 if(/עמלה|עמ\s|עמ\S*הקצאת/.test(text)&&out)return proposal('עמלת בנק','variable','חיוב עמלה מהבנק','clear');
 return proposal(out?'חיוב לבדיקה':'זיכוי לבדיקה',out?'variable':'otherIncome','תיאור הפעולה אינו מספיק לסיווג ודאי');
}
export function classify(records,{rules=[],overrides={}}={}){
 return records.map(record=>{
  const proposed=suggest(record,rules),override=overrides[record.line],destination=override?.destination??proposed.destination;
  return {line:record.line,...proposed,destination,confirmed:!!override?.confirmed&&eligible(record)&&Object.hasOwn(destinations,destination)&&compatible(record,destination)};
 });
}
export function monthlyProposal(records,classification){
 const byLine=new Map(classification.map(c=>[c.line,c])),months=new Map();let pending=0,excluded=0,included=0;
 for(const r of records){if(!eligible(r))continue;const c=byLine.get(r.line);
  if(!c?.confirmed||!Object.hasOwn(destinations,c.destination)||!compatible(r,c.destination)){pending++;continue;}
  if(c.destination==='exclude'){excluded++;continue;}
  included++;const month=r.date.slice(0,7);if(!months.has(month))months.set(month,{month,valuesCents:{},lines:[]});
  const m=months.get(month);m.valuesCents[c.destination]=(m.valuesCents[c.destination]??0)+Math.abs(r.amountCents);m.lines.push(r.line);
 }
 return {months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)),pending,excluded,included};
}
