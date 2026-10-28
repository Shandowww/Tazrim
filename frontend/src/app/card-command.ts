import {creditCards,cardsValid,clone,validatePlan,cashAccountList,cashPlanningBase,cashCardAccount,assignCashPayers} from '../../../src/budget.js'
export interface CardDraft {name:string;alias:string;billingDay:string;payer:string}
export function cardConfigEligibility(plan:any,id:string,create=false){
 if(!validatePlan(plan))return 'התקציב אינו זמין לעריכת כרטיסים.'
 if(!create&&!creditCards(plan).some((card:any)=>card.id===id))return 'הכרטיס אינו זמין במרחב הזה.'
 return null
}
export function initialCardDraft(plan:any,id:string):CardDraft{const card=creditCards(plan).find((row:any)=>row.id===id);return{name:card?.name??'',alias:card?.alias??'',billingDay:String(card?.billingDay??15),payer:card?cashCardAccount(plan,id)??'':''}}
export function cardDraftFingerprint(d:CardDraft){return JSON.stringify({name:d.name.trim(),alias:d.alias.trim(),billingDay:/^\d{1,2}$/.test(d.billingDay)?Number(d.billingDay):d.billingDay,payer:d.payer})}
/** Original card-manager metadata transition; payer creation is explicit and applies only to a brand-new zero-total card. */
export function prepareCardConfig(plan:any,id:string,draft:CardDraft,create=false){
 const reason=cardConfigEligibility(plan,id,create);if(reason)throw Error(reason)
 if(typeof id!=='string'||!/^card(?:[12]|_[a-zA-Z0-9-]{1,70})$/.test(id)||!draft||Object.keys(draft).length!==4||Object.keys(draft).some(key=>!['name','alias','billingDay','payer'].includes(key))||Object.values(draft).some(value=>typeof value!=='string'))throw Error('פרטי הכרטיס אינם תקינים.')
 if(!/^\d{1,2}$/.test(draft.billingDay)||Number(draft.billingDay)<1||Number(draft.billingDay)>31)throw Error('יום החיוב צריך להיות בין 1 ל־31.')
 const existing=creditCards(plan).find((row:any)=>row.id===id)
 if(create&&existing)throw Error('מזהה הכרטיס כבר קיים; אין לדרוס אותו.')
 const accounts=cashAccountList(plan)
 if(create&&(accounts.length&&!accounts.some((a:any)=>a.id===draft.payer)||!accounts.length&&draft.payer))throw Error('יש לבחור חשבון משלם מפורש לכרטיס החדש.')
 if(!create&&draft.payer!==(cashCardAccount(plan,id)??''))throw Error('שינוי חשבון משלם לכרטיס קיים דורש סקירת דיווחים ושיוכים בממשק הקיים.')
 const next=clone(plan);next.creditCards=clone(creditCards(plan));const card={id,name:draft.name.trim(),alias:draft.alias.trim(),billingDay:Number(draft.billingDay)},index=next.creditCards.findIndex((row:any)=>row.id===id)
 if(index<0)next.creditCards.push(card);else next.creditCards[index]={...next.creditCards[index],...card}
 next.defaults[id]??=0
 if(create&&draft.payer){next.cashPlanning=cashPlanningBase(next);next.cashPlanning.cardAccounts[id]=draft.payer}
 if(!cardsValid(next)||!validatePlan(next))throw Error('יש להזין שם וכינוי ייחודי ותקין; אין להזין מספר כרטיס מלא. אפשר לנהל עד 30 כרטיסים.')
 return next
}

export function prepareCardPayer(plan:any,id:string,payer:string){
 const reason=cardConfigEligibility(plan,id);if(reason)throw Error(reason)
 if(typeof payer!=='string'||payer.length>100||payer&&!cashAccountList(plan).some((a:any)=>a.id===payer))throw Error('יש לבחור חשבון שקיים במרחב הזה.')
 return assignCashPayers(plan,{cards:{[id]:payer}})
}
