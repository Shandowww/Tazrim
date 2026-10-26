import {normalizeRows} from './parser.mjs';
import {parseCalActivity} from './cal-activity.mjs';
import {parseCalBilling} from './cal-billing.mjs';
export function inspectIntake(inspections){
 const cal=parseCalBilling(inspections);
 if(cal){const text=inspections[0].rows.slice(0,Math.max(1,inspections[0].rows.findIndex(r=>r.cells.some(c=>/^עסקאות לחיוב ב-/.test(String(c).trim()))))).flatMap(r=>r.cells).join(' '),ids=[...text.matchAll(/(?:מאסטרקארד|מאסטרקארד|ויזה|כרטיס)[^\d]{0,35}(\d{4})(?!\d)/g)].map(m=>m[1]);return {kind:'card',provider:'cal',identity:new Set(ids).size===1?'cal:'+ids[0]:'',report:cal};}
 const activity=parseCalActivity(inspections);if(activity)return activity;
 if(inspections.length!==1)return {kind:'sheets',sheets:inspections};
 const inspection=inspections[0],parsed=normalizeRows(inspection,{defaultCurrency:'ILS'}),dates=parsed.records.map(r=>r.date).filter(Boolean).sort();
 if(!dates.length||!parsed.records.length)throw Error('לא נמצאו תנועות מתוארכות בקובץ.');
 const text=inspection.rows.slice(0,inspection.headerIndex+1).flatMap(r=>r.cells).join(' '),provider=inspection.pdfReconciliation?.provider??(inspection.pdfReconciliation||/one\s*zero|וואן\s*זירו/i.test(text)?'one-zero':/הפועלים/.test(text)?'hapoalim':''),accounts=[...text.matchAll(/(?:מספר חשבון|מס[׳']? חשבון)[:\s]*(\d{3,16})(?!\d)/g)].map(m=>m[1]),hint=inspection.pdfReconciliation?.accountHint??(new Set(accounts).size===1?accounts[0]:'');
 return {kind:inspection.pdfReconciliation||inspection.mapping?.balance>=0?'bank':'ambiguous',provider,identity:hint?'bank:'+provider+':'+hint:'',inspection,records:parsed.records,from:inspection.pdfReconciliation?.from??dates[0],to:inspection.pdfReconciliation?.to??dates.at(-1)};
}
