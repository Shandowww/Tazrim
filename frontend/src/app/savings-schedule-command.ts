import {monthlyValues,updateSavingSchedule,validatePlan} from '../../../src/budget.js'
import {moneyInputCents} from './monthly-report.ts'
export interface SavingsScheduleDraft{from:string;personalSaving:string;sharedSaving:string}
export function initialSavingsScheduleDraft(plan:any,asOf:string):SavingsScheduleDraft{return{from:plan.startMonth>asOf?plan.startMonth:asOf,personalSaving:'',sharedSaving:''}}
export function prepareSavingsSchedule(plan:any,draft:SavingsScheduleDraft){
 if(!validatePlan(plan)||!draft||Object.keys(draft).sort().join(',')!=='from,personalSaving,sharedSaving'||Object.values(draft).some(value=>typeof value!=='string'||value.length>32)||!/^\d{4}-\d{2}$/.test(draft.from))throw Error('יש לבדוק את חודש ההתחלה וסכומי ההפקדות.')
 const current=monthlyValues(plan,draft.from),amounts=Object.fromEntries(['personalSaving','sharedSaving'].map(key=>[key,draft[key as keyof SavingsScheduleDraft]===''?current[key]:moneyInputCents(draft[key as keyof SavingsScheduleDraft])/100]))
 return updateSavingSchedule(plan,draft.from,amounts)
}
