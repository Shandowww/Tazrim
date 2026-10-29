import {monthAt} from './budget.js';
export function newInsightScenario(plan,asOf){return{id:'',category:'',monthlyReduction:200,startMonth:plan.startMonth>asOf?plan.startMonth:monthAt(asOf,1),months:6};}
export function insightScenarioFormItem(original,values,newId=()=>crypto.randomUUID()){return {...original,id:original.id||newId(),category:values.category,monthlyReduction:Number(values.monthlyReduction),startMonth:values.startMonth,months:Number(values.months)};}
export function removeInsightScenario(plan,id){const next=JSON.parse(JSON.stringify(plan));next.insightScenarios=next.insightScenarios.filter(row=>row.id!==id);return next;}
