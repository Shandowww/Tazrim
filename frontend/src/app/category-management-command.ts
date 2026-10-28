import {adoptExistingCategories,categoryManagementOptions,expenseCategoryOptions,renameRegisteredCategory,moveRegisteredCategory,archiveRegisteredCategory,mergeRegisteredCategories,validatePlan} from '../../../src/budget.js'
export type CategoryOperation='adopt'|'rename'|'move'|'archive'|'restore'|'merge'
export interface CategoryManagementDraft {operation:CategoryOperation;source:string;target:string;name:string}
export function initialCategoryManagementDraft(plan:any):CategoryManagementDraft{return{operation:'archive',source:categoryManagementOptions(plan)[0]??'',target:categoryManagementOptions(plan)[0]??'',name:''}}
// Preview a proposal using the original operation. The editor retains this exact
// candidate (including generated identities) for explicit confirmation and retries.
export function prepareCategoryManagement(plan:any,draft:CategoryManagementDraft){
 if(!validatePlan(plan)||plan.demo||!draft||Object.keys(draft).sort().join(',')!=='name,operation,source,target'||!['adopt','rename','move','archive','restore','merge'].includes(draft.operation)||['source','target','name'].some(k=>typeof draft[k as keyof CategoryManagementDraft]!=='string'||draft[k as keyof CategoryManagementDraft].length>60))throw Error('יש לבדוק את פעולת הקטגוריה והשם.')
 const options=categoryManagementOptions(plan)
 if(draft.operation!=='adopt'&&!(draft.operation==='rename'?expenseCategoryOptions(plan):options).includes(draft.source))throw Error('יש לבחור קטגוריה קיימת ופעילה לשינוי שם.')
 if(['move','merge'].includes(draft.operation)&&!options.includes(draft.target))throw Error('יש לבחור קטגוריית יעד קיימת.')
 if(draft.operation==='rename'&&!draft.name.trim())throw Error('יש להזין שם מלא לקטגוריה, כולל נתיב האב אם קיים.')
 const next=draft.operation==='adopt'?adoptExistingCategories(plan):draft.operation==='rename'?renameRegisteredCategory(plan,draft.source,draft.name):draft.operation==='move'?moveRegisteredCategory(plan,draft.source,draft.target):draft.operation==='merge'?mergeRegisteredCategories(plan,draft.source,draft.target):archiveRegisteredCategory(plan,draft.source,draft.operation==='archive')
 if(!validatePlan(next))throw Error('לא ניתן לשמור את עדכון הקטגוריות.')
 return next
}
