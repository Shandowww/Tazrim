// Purchase context only. This module never builds or changes a financial plan.
export const purchaseNoteColumns=['id','purchase_date','merchant','amount','currency','purpose','category','payment_card','created_at'];
const required=purchaseNoteColumns.slice(0,6),dayMs=86400000;
const text=(value,max,field)=>{if(value===undefined||value===null)return '';if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw Error('שדה '+field+' אינו תקין.');return value.trim();};
export function purchaseNoteDate(value){
 if(typeof value==='number'&&Number.isInteger(value)&&value>=36526&&value<=73050)value=new Date(Date.UTC(1899,11,30)+value*dayMs).toISOString().slice(0,10);
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('תאריך הקנייה צריך להיות תאריך תקין בפורמט YYYY-MM-DD.');
 return value;
}
export function purchaseNoteCents(value){
 if(typeof value==='string'&&/^-?\d{1,9}(?:\.\d{1,2})?$/.test(value.trim()))value=Number(value);
 if(typeof value!=='number'||!Number.isFinite(value)||value===0||Math.abs(value)>100000000||Math.abs(value*100-Math.round(value*100))>0.00001)throw Error('הסכום צריך להיות מספר בשקלים, עד שתי ספרות אחרי הנקודה.');
 return Math.round(value*100);
}
export function parsePurchaseNoteSheet(values){
 if(!Array.isArray(values)||!values.length||!Array.isArray(values[0]))throw Error('הגיליון ריק. יש להוסיף את כותרות פתקי הקנייה.');
 if(values.length>10001)throw Error('הגיליון מכיל יותר מ־10,000 פתקים. הקריאה לא הושלמה.');
 const headers=values[0].map(value=>String(value).trim()),seen=new Set(),notes=[];
 if(new Set(headers).size!==headers.length||required.some(key=>!headers.includes(key)))throw Error('כותרות הגיליון אינן תואמות. נדרשות: '+required.join(', '));
 for(let index=1;index<values.length;index++){
  const row=values[index];if(!Array.isArray(row))throw Error('שורה '+(index+1)+' אינה תקינה.');
  if(row.every(value=>value===''||value===null||value===undefined))continue;
  try{
   const get=key=>row[headers.indexOf(key)],id=text(get('id'),100,'id');
   if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,99}$/.test(id)||seen.has(id))throw Error('נדרש מזהה קבוע וייחודי לכל קנייה.');
   const merchant=text(get('merchant'),200,'merchant'),purpose=text(get('purpose'),1000,'purpose'),currency=text(get('currency'),3,'currency')||'ILS',paymentCard=text(get('payment_card'),4,'payment_card');
   if(!merchant||!purpose)throw Error('יש למלא בית עסק ומה נקנה.');
   if(currency!=='ILS')throw Error('חיבור הפתקים תומך כרגע בסכומים ששולמו בשקלים בלבד.');
   if(paymentCard&&!/^\d{4}$/.test(paymentCard))throw Error('כרטיס הוא שדה אופציונלי של ארבע ספרות אחרונות בלבד.');
   notes.push({id,date:purchaseNoteDate(get('purchase_date')),merchant,amountCents:purchaseNoteCents(get('amount')),currency,purpose,category:text(get('category'),160,'category'),paymentCard,createdAt:text(get('created_at'),40,'created_at')});seen.add(id);
  }catch(error){throw Error('שורה '+(index+1)+': '+error.message);}
 }
 return notes;
}
export function purchaseNoteSource(value,tab='Purchases'){
 if(typeof value!=='string'||value.length>2048||typeof tab!=='string'||!tab.trim()||tab.length>80||/[\u0000-\u001f]/.test(tab))throw Error('יש לבחור קישור לגיליון ושם לשונית תקינים.');
 let id=value.trim();
 if(id.startsWith('https://')){const url=new URL(id);if(url.origin!=='https://docs.google.com'||url.username||url.password||!/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/.test(url.pathname))throw Error('יש להשתמש בקישור Google Sheets המקורי.');id=url.pathname.split('/')[3];}
 if(!/^[a-zA-Z0-9_-]{20,120}$/.test(id))throw Error('מזהה הגיליון אינו תקין.');
 return{spreadsheetId:id,tab:tab.trim()};
}
const normalized=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
function merchantKey(value){const key=normalized(value);for(const [name,aliases]of [['ksp',['ksp','קייאספי','קספ']],['superpharm',['superpharm','סופרפארם']],['pais',['pais','paisplus','פיספלוס','מפעלהפיס']],['htzone',['htzone','hitechzone','הייטקזון','הייטקזוןבעמ']]])if(aliases.includes(key))return name;return key;}
/** Exact signed ILS cents, purchase-date window, and optional card boundary.
 * Installments match only the original total on the original purchase date.
 * Results remain suggestions and never produce a merchant-wide category rule.
 */
export function purchaseNoteMatches(notes,transaction){
 const date=transaction.date;if(!/^20\d{2}-\d{2}-\d{2}$/.test(date??''))return [];
 const cents=transaction.amountCents,installment=transaction.installment||/תשלום\s*\d+\s*(?:מתוך|מ)[\s-]*\d+/.test(transaction.notes??'');
 if(!Number.isSafeInteger(cents)||transaction.currency&&transaction.currency!=='ILS')return [];
 if(installment&&(!Number.isSafeInteger(transaction.originalCents)||transaction.originalCurrency&&transaction.originalCurrency!=='ILS'))return [];
 const signed=transaction.kind==='bank'?-cents:cents,amount=installment?Math.sign(signed)*Math.abs(transaction.originalCents):signed;
 return notes.filter(note=>!note.done&&note.present!==false&&note.currency==='ILS'&&note.amountCents===amount&&Math.abs(Date.parse(note.date)-Date.parse(date))<=3*dayMs&&(!note.paymentCard||!transaction.paymentCard||note.paymentCard===transaction.paymentCard)).map(note=>({note,merchantMatches:merchantKey(note.merchant)===merchantKey(transaction.merchant),dateExact:note.date===date,cardChecked:!!note.paymentCard&&!!transaction.paymentCard,installment:!!installment})).sort((a,b)=>Number(b.merchantMatches)-Number(a.merchantMatches)||Number(b.dateExact)-Number(a.dateExact));
}
