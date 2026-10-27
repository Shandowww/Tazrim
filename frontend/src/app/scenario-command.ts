import {clone,previewScenario,shortestScenarioPayments,validatePlan} from '../../../src/budget.js'
import {initialPlannedItemDraft,preparePlannedItem,type PlannedItemDraft} from './planned-item-command.ts'
export interface ScenarioRow{id:string;originalId:string;enabled:boolean;draft:PlannedItemDraft}
export function initialScenarioRow(plan:any,id:string,month:string,originalId=''):ScenarioRow{const old=originalId?plan.expenses.find((item:any)=>item.id===originalId):null;if(originalId&&(!old||old.kind!=='expense'))throw Error('יש לבחור הוצאה קיימת לתכנון.');const draft=initialPlannedItemDraft(plan,originalId,month);if(old)draft.amount=String(Math.round((old.amount+old.fees)*100)/100);draft.fees='0';draft.kind='expense';return{id,originalId,enabled:true,draft}}
function normalize(plan:any,rows:ScenarioRow[]){
 if(!validatePlan(plan)||!Array.isArray(rows)||!rows.length||rows.length>12)throw Error('יש לבחור בין רכישה אחת ל־12 רכישות לתרחיש.')
 const ids=new Set<string>(),originals=new Set<string>()
 return rows.map((row,i)=>{if(!row||Object.keys(row).sort().join(',')!=='draft,enabled,id,originalId'||typeof row.id!=='string'||!row.id||row.id.length>100||ids.has(row.id)||typeof row.originalId!=='string'||typeof row.enabled!=='boolean')throw Error('מזהי התרחיש אינם תקינים.');ids.add(row.id)
 const old=row.originalId?plan.expenses.find((e:any)=>e.id===row.originalId):null
 if(row.originalId&&(!old||old.kind!=='expense'||originals.has(row.originalId)||!row.enabled)||!row.originalId&&plan.expenses.some((e:any)=>e.id===row.id))throw Error('הפריט הקיים אינו זמין להחלפה. הסרה מתבצעת בנפרד.');if(row.originalId)originals.add(row.originalId)
 if(row.draft.kind!=='expense'||row.draft.fees!=='0')throw Error('יש להזין מחיר סופי אחד הכולל עמלות, עבור הוצאה בלבד.')
 const id=row.originalId||row.id,prepared=preparePlannedItem(plan,id,{...row.draft,name:row.draft.name.trim()||'רכישה '+(i+1)},!row.originalId),item=prepared.expenses.find((e:any)=>e.id===id)
 return{...item,id:row.id,originalId:row.originalId,enabled:row.enabled}
 })
}
/** Stable IDs make an explicit uncertain-save retry acknowledge the same prepared scenario. */
export function prepareScenario(plan:any,rows:ScenarioRow[]){const drafts=normalize(plan,rows),result=previewScenario(plan,drafts);result.plan.expenses=result.plan.expenses.map((item:any)=>{if(!rows.some(row=>row.originalId===item.id))return item;const old=clone(plan.expenses.find((saved:any)=>saved.id===item.id)??{});delete old.cardId;delete old.cashAccountId;return{...old,...item}});if(!validatePlan(result.plan))throw Error('לא ניתן לאמת את התרחיש.');return result}
export function shortestScenarioSplit(plan:any,rows:ScenarioRow[],id:string,asOf:string){const drafts=normalize(plan,rows);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(asOf))throw Error('יש לבחור חודש בדיקה תקין.');return shortestScenarioPayments(plan,drafts,id,asOf)}
