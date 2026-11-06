import {normalizeRows} from './parser.mjs';
import {parseCalActivity} from './cal-activity.mjs';
import {parseCalBilling} from './cal-billing.mjs';
// Only header evidence participates in routing, never merchant text or filenames.
export function bankIdentityHints(text){
 const value=String(text??'').normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
 const accounts=[...value.matchAll(/(?:מספר\s+חשבון|מס[׳']?\.?\s*חשבון)[:\s]*(\d{3,16})(?!\d)/g)].map(m=>m[1]);
 const branches=[...value.matchAll(/(?:מספר\s+סניף|מס[׳']?\.?\s*סניף|סניף(?:\s*(?:מספר|מס[׳']?\.?))?)[:\s]*(\d{1,3})(?!\d)/g)].map(m=>m[1].padStart(3,'0'));
 return {accountHint:new Set(accounts).size===1?accounts[0]:'',branchHint:new Set(branches).size===1?branches[0]:'',identityAmbiguous:new Set(accounts).size>1||/סניף/.test(value)&&new Set(branches).size!==1};
}
export function inspectIntake(inspections){
 const cal=parseCalBilling(inspections);
 if(cal){const text=inspections[0].rows.slice(0,Math.max(1,inspections[0].rows.findIndex(r=>r.cells.some(c=>/^עסקאות לחיוב ב-/.test(String(c).trim()))))).flatMap(r=>r.cells).join(' '),ids=[...text.matchAll(/(?:מאסטרקארד|מאסטרקארד|ויזה|כרטיס)[^\d]{0,35}(\d{4})(?!\d)/g)].map(m=>m[1]);return {kind:'card',provider:'cal',identity:new Set(ids).size===1?'cal:'+ids[0]:'',report:cal};}
 const activity=parseCalActivity(inspections);if(activity)return activity;
 if(inspections.length!==1)return {kind:'sheets',sheets:inspections};
 const inspection=inspections[0],parsed=normalizeRows(inspection,{defaultCurrency:'ILS'}),dates=parsed.records.map(r=>r.date).filter(Boolean).sort();
 if(!dates.length||!parsed.records.length)throw Error('לא נמצאו תנועות מתוארכות בקובץ.');
 const text=inspection.rows.slice(0,inspection.headerIndex+1).flatMap(r=>r.cells).join(' '),provider=inspection.pdfReconciliation?.provider??(inspection.pdfReconciliation||/one\s*zero|וואן\s*זירו/i.test(text)?'one-zero':/הפועלים/.test(text)?'hapoalim':''),hints=bankIdentityHints(text),hint=inspection.pdfReconciliation?.accountHint??hints.accountHint,branch=inspection.pdfReconciliation?.branchHint??hints.branchHint,ambiguous=inspection.pdfReconciliation?.identityAmbiguous||hints.identityAmbiguous;
 return {kind:inspection.pdfReconciliation||inspection.mapping?.balance>=0?'bank':'ambiguous',provider,identity:hint&&provider&&!ambiguous?'bank:'+provider+':'+(branch?branch+':':'')+hint:'',inspection,records:parsed.records,from:inspection.pdfReconciliation?.from??dates[0],to:inspection.pdfReconciliation?.to??dates.at(-1)};
}
