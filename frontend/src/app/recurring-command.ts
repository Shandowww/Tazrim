import {clone,recurringExpenseCandidates,setRecurringExpenseDecision,validatePlan} from '../../../src/budget.js'
export interface RecurringChoice{merchant:string;method:string;status:'confirmed'|'dismissed'|'reset'}
export function prepareRecurringChoices(plan:any,asOf:string,choices:RecurringChoice[]){
 if(!validatePlan(plan)||!Array.isArray(choices)||choices.length>100)throw Error('לא ניתן לאמת את בחירות החיובים.')
 const keys=new Set<string>();let next=clone(plan)
 for(const choice of choices){if(!choice||Object.keys(choice).sort().join(',')!=='merchant,method,status'||typeof choice.merchant!=='string'||typeof choice.method!=='string')throw Error('יש לבדוק את הבחירות.');const key=JSON.stringify([choice.merchant,choice.method]);if(keys.has(key))throw Error('אין לשמור בחירות כפולות לאותו חיוב.');keys.add(key);next=setRecurringExpenseDecision(next,{...choice,asOf} as any)}
 return next
}
export function recurringReview(plan:any,asOf:string){if(!validatePlan(plan))throw Error('נתוני התקציב אינם זמינים.');const result=recurringExpenseCandidates(plan,{asOf} as any),keys=new Set(result.candidates.map((c:any)=>JSON.stringify([c.merchant,c.method])));return{...result,stale:(plan.recurringDecisions??[]).filter((d:any)=>d.status==='confirmed'&&!keys.has(JSON.stringify([d.merchant,d.method])))}}
