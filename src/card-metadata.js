// Optional card identity and fee reminders. These facts never generate budget charges.
export const CARD_ISSUERS=[['isracard','ישראכרט'],['cal','כאל'],['max','Max'],['bank','כרטיס בנקאי']];
export const CARD_CLUBS=[['hitechzone','הייטקזון'],['hot','הוט'],['shufersal','שופרסל'],['w','W (של ישראכרט)'],['lifestyle','לייף סטייל']];
export const CARD_METADATA_FIELDS=['issuer','club','network','discountEndsOn','feeAfterDiscount','issuerPhone'];
export function cardDateValid(value){return typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function cardMetadataValid(card){
 return (card.issuer===undefined||CARD_ISSUERS.some(([key])=>key===card.issuer))
  &&(card.club===undefined||CARD_CLUBS.some(([key])=>key===card.club))
  &&(card.discountEndsOn===undefined||cardDateValid(card.discountEndsOn))
  &&(card.feeAfterDiscount===undefined||typeof card.feeAfterDiscount==='number'&&Number.isFinite(card.feeAfterDiscount)&&card.feeAfterDiscount>=0&&card.feeAfterDiscount<=100000&&Math.abs(card.feeAfterDiscount*100-Math.round(card.feeAfterDiscount*100))<.000001)
  &&(card.issuerPhone===undefined||typeof card.issuerPhone==='string'&&card.issuerPhone.length<=30&&/^(?:\+?[\d ()-]{3,30}|\*\d{3,8})$/.test(card.issuerPhone));
}
export function cardMetadataDraft(card={}){return Object.fromEntries(CARD_METADATA_FIELDS.map(key=>[key,card[key]===undefined?'':String(card[key])]));}
export function applyCardMetadata(card,draft){
 const next={...card};
 for(const key of CARD_METADATA_FIELDS){
  if(draft[key]===undefined)continue;
  const value=draft[key].trim();
  if(!value)delete next[key];
  else next[key]=key==='feeAfterDiscount'?Number(value):value;
 }
 if(draft.feeAfterDiscount?.trim()&&!/^\d{1,6}(?:\.\d{1,2})?$/.test(draft.feeAfterDiscount.trim()))throw Error('יש להזין עלות בשקלים, עם עד שתי ספרות אחרי הנקודה.');
 if(draft.network&&!['visa','mastercard','amex','diners','isracard'].includes(draft.network))throw Error('יש לבחור רשת תשלום תקינה.');
 if(!cardMetadataValid(next))throw Error('יש לבדוק את המנפיק, המועדון, תאריך ההנחה, העלות ומספר הטלפון.');
 return next;
}
/** A calendar month, clamped for February and shorter months (not 30 days). */
export function cardDiscountReminderOn(end){
 if(!cardDateValid(end))return null;
 const [year,month,day]=end.split('-').map(Number),prior=new Date(Date.UTC(year,month-2,1,12)),last=new Date(Date.UTC(prior.getUTCFullYear(),prior.getUTCMonth()+1,0,12)).getUTCDate();
 prior.setUTCDate(Math.min(day,last));return prior.toISOString().slice(0,10);
}
