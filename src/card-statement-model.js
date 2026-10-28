import {saveBillingReport} from './card-billing-model.js';
import {cents,clone,validatePlan,detailCategories,creditCards,analyticalExpenseDetails} from './budget.js';
export const statementMerchant=s=>String(s??'').normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim().toLocaleLowerCase();
async function statementDigest(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function statementCycleExists(p,cardId,month){return (p.details??[]).some(e=>e.method===cardId&&e.month===month&&['cal','isracard'].includes(e.statement?.issuer));}
export async function prepareCardStatement(p,report,cardId,merchantRules=[]){
 if(!['cal','isracard'].includes(report?.issuer)||!Array.isArray(report.entries)||!report.entries.length||report.entries.length>5000||report.entries.reduce((n,r)=>n+r.amountCents,0)!==cents(report.amount)||!creditCards(p).some(c=>c.id===cardId))throw Error('פירוט הדוח אינו תקין.');
 const seen=new Map(),rows=[],categories=new Map(),add=(name,category)=>{if(!category||category==='לסיווג')return;const k=statementMerchant(name);if(!categories.has(k))categories.set(k,new Set());categories.get(k).add(category);};
 for(const e of analyticalExpenseDetails(p))add(e.name,e.category);
 for(const r of merchantRules)add(r.merchant,r.category);
 for(const entry of report.entries){
  const identity=JSON.stringify([cardId,report.dueDate,entry.date,statementMerchant(entry.merchant),entry.amountCents,entry.originalCents,entry.notes,...(report.issuer==='isracard'?[entry.originalCurrency??'',entry.foreignCents??null]:[])]),occurrence=(seen.get(identity)??0)+1;seen.set(identity,occurrence);
  const key=await statementDigest(identity+'#'+occurrence),id=report.issuer+'-'+key,existing=(p.details??[]).find(e=>e.id===id);
  const candidates=existing?[]:(p.details??[]).filter(e=>!e.statement&&e.accounting==='included'&&e.status!=='cancelled'&&e.method===cardId&&e.month===report.dueDate.slice(0,7)&&e.date===entry.date&&statementMerchant(e.name)===statementMerchant(entry.merchant));
  const known=categories.get(statementMerchant(entry.merchant)),category=existing?.category??(known?.size===1?[...known][0]:'');
  rows.push({id,key,entry,category,existing:existing?clone(existing):null,candidates:clone(candidates)});
 }
 const ids=new Set(rows.map(r=>r.id));
 if((p.details??[]).some(e=>e.method===cardId&&e.statement?.dueDate===report.dueDate&&!ids.has(e.id)))throw Error('הדוח שונה מפירוט שכבר נשמר לאותו חיוב. הנתונים נשמרו ללא שינוי; יש לבדוק את ההבדלים לפני החלפה.');
 return {cardId,dueDate:report.dueDate,amount:report.amount,rows,issuer:report.issuer};
}
export function applyCardStatement(p,preview,choices,{deferCategories=false}={}){
 const next=clone(p),used=new Set(),allowed=new Set([...(deferCategories?['לסיווג']:[]),...detailCategories,...(p.details??[]).map(e=>e.category),...Object.keys(p.categoryGoals??{}),...preview.rows.map(r=>r.category).filter(c=>typeof c==='string'&&c.trim()&&c.length<=60)]);next.details??=[];
 for(const row of preview.rows){
  const choice=choices[row.id],category=(choice?.category??row.category)||(deferCategories?'לסיווג':'');
  if(row.existing){const existing=next.details.find(e=>e.id===row.id);if(JSON.stringify(existing)!==JSON.stringify(row.existing))throw Error('הפירוט השתנה בזמן הבדיקה. יש לטעון את הדוח מחדש.');continue;}
  if(!allowed.has(category))throw Error('יש לבחור קטגוריה לכל בית עסק חדש.');
  if(row.candidates.length&&!['new',...row.candidates.map(e=>e.id)].includes(choice?.match))throw Error('יש לבדוק את הפעולות הדומות לפני שמירה.');
  const match=choice?.match&&choice.match!=='new'?row.candidates.find(e=>e.id===choice.match):null;
  if(match){if(used.has(match.id))throw Error('אין לקשר שתי שורות לאותו פירוט קיים.');used.add(match.id);const current=next.details.find(e=>e.id===match.id);if(JSON.stringify(current)!==JSON.stringify(match))throw Error('הפירוט השתנה. יש לטעון מחדש.');next.details=next.details.filter(e=>e.id!==match.id);}
  next.details.push({id:row.id,name:row.entry.merchant,amount:row.entry.amountCents/100,category,method:preview.cardId,month:preview.dueDate.slice(0,7),date:row.entry.date,number:'',status:'cleared',accounting:'included',statement:{issuer:preview.issuer??'cal',dueDate:preview.dueDate,key:row.key,originalCents:row.entry.originalCents,notes:row.entry.notes??'',...(row.entry.originalCurrency?{originalCurrency:row.entry.originalCurrency}:{}),...(row.entry.foreignCents!==undefined?{foreignCents:row.entry.foreignCents}:{}),...(row.entry.page?{page:row.entry.page}:{})}});
 }
 next.showDetails=true;
 if(!validatePlan(next))throw Error('לא ניתן לקלוט את הפירוט. יש לבדוק את תקופת התקציב ואת מגבלת הפירוט.');
 if(JSON.stringify(next).length>2000000)throw Error('התקציב גדול מדי לקליטה. הנתונים הקיימים לא שונו.');
 return next;
}
// Wallet stays a separate inbox: matching is informational, never another expense.
export function statementWalletMatch(p,event){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.occurred_at));
 const rows=(p.details??[]).filter(e=>e.statement&&(!e.statement.originalCurrency||e.statement.originalCurrency==='ILS')&&e.method===event.card_id&&e.date===date&&statementMerchant(e.name)===statementMerchant(event.merchant)&&e.statement.originalCents===event.cents*(event.kind==='refund'?-1:1)&&event.currency==='ILS');
 return rows.length===1?rows[0]:null;
}

// Construct the entire import before mutating the live plan or persisting anything.
export function applyBillingBatch(p,entries,today){
 if(!Array.isArray(entries)||!entries.length||entries.length>10)throw Error('יש לבחור בין דוח אחד לעשרה דוחות.');
 const cycles=new Set();let next=clone(p);
 for(const entry of entries){
  const cycle=entry.cardId+':'+entry.dueDate.slice(0,7);
  if(cycles.has(cycle))throw Error('נבחר יותר מדוח אחד לאותו כרטיס וחודש חיוב. השאירו את הדוח המעודכן בלבד ובדקו את בחירת הכרטיסים.');
  cycles.add(cycle);
  if(!entry.statement&&statementCycleExists(p,entry.cardId,entry.dueDate.slice(0,7)))throw Error('כבר נשמר פירוט דוח לכרטיס ולחודש הזה. יש להעלות דוח מפורט כדי לשמור על ההתאמה.');
  if(entry.statement&&(entry.statement.cardId!==entry.cardId||entry.statement.dueDate!==entry.dueDate||entry.statement.amount!==entry.amount))throw Error('פרטי הדוח השתנו. יש לטעון אותו מחדש.');
  next=saveBillingReport(next,{cardId:entry.cardId,accountId:entry.accountId,dueDate:entry.dueDate,amount:entry.amount,source:'file'},today);
  if(entry.statement)next=applyCardStatement(next,entry.statement,entry.choices??{},{deferCategories:entry.deferCategories===true});
 }
 if(!validatePlan(next)||JSON.stringify(next).length>2000000)throw Error('לא ניתן לשמור את כל הדוחות; בדקו את תקופת התקציב ומגבלת הפירוט.');
 return next;
}

// Shared original inbox grouping, independent of either presentation.
export function statementGroups(preview){const groups=new Map();for(const row of preview.rows){if(row.existing)continue;const key=statementMerchant(row.entry.merchant);if(!groups.has(key))groups.set(key,{merchant:row.entry.merchant,rows:[]});groups.get(key).rows.push(row);}return [...groups.values()].map(g=>({...g,category:new Set(g.rows.map(r=>r.category)).size===1?g.rows[0].category:''}));}
export function statementBatchGroups(batch){const groups=new Map();batch.forEach((item,fileIndex)=>{for(const row of item.statement?.rows??[]){if(row.existing)continue;const key=statementMerchant(row.entry.merchant);if(!groups.has(key))groups.set(key,{key,merchant:row.entry.merchant,rows:[],files:new Set()});const group=groups.get(key);group.rows.push({...row,fileIndex});group.files.add(fileIndex);}});return [...groups.values()].map(g=>({...g,category:new Set(g.rows.map(r=>r.category)).size===1?g.rows[0].category:''}));}
