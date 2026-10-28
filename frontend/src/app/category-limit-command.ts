import {expenseCategoryOptions,setCategorySpendingLimit,removeCategorySpendingLimit,validatePlan} from '../../../src/budget.js'
import {moneyInputCents} from './monthly-report.ts'
export interface CategoryLimitDraft{category:string;amount:string;remove:boolean;confirmed:boolean}
export function prepareCategoryLimit(plan:any,draft:CategoryLimitDraft){
 if(!validatePlan(plan)||!draft||Object.keys(draft).sort().join(',')!=='amount,category,confirmed,remove'||typeof draft.category!=='string'||typeof draft.amount!=='string'||draft.amount.length>32||typeof draft.remove!=='boolean'||typeof draft.confirmed!=='boolean')throw Error('יש לבדוק את הקטגוריה והתקרה.')
 if(draft.remove){if(!draft.confirmed||!Object.hasOwn(plan.categoryGoals??{},draft.category))throw Error('יש לבחור תקרה קיימת ולאשר את ההסרה.');return removeCategorySpendingLimit(plan,draft.category)}
 if(!expenseCategoryOptions(plan).includes(draft.category)||!draft.amount.trim())throw Error('יש לבחור קטגוריה פעילה ולהזין סכום מפורש.')
 return setCategorySpendingLimit(plan,draft.category,moneyInputCents(draft.amount)/100)
}
